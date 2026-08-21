import {
  EntityStatus,
  PaymentRail,
  QRProviderMode,
  TransactionStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  AuthError,
  canCreateQR,
  canManageQR,
  getMerchantScopeFilter,
  requireMerchantAccess,
} from "@/lib/auth/authorization";
import type { SessionUser } from "@/lib/auth/types";
import { getSabPaisaQRProvider } from "@/lib/sabpaisa/providers";
import { loadSabPaisaIntegrationMode } from "@/lib/sabpaisa/mode";
import { isSabPaisaError } from "@/lib/sabpaisa/errors";
import type { SabPaisaQRProviderRecord } from "@/lib/sabpaisa/qr-types";
import { generateEntityId } from "@/lib/utils/id-generator";
import { mapQRCode } from "@/lib/mappers";
import type { QRCodeWithStats } from "@/types";
import {
  generateMerchantQRSchema,
  qrDownloadQuerySchema,
  qrListQuerySchema,
  updateMerchantQRSchema,
  type GenerateMerchantQRInput,
  type QRDownloadQuery,
  type QRListQuery,
  type UpdateMerchantQRInput,
} from "@/lib/validations/qr";

export class QRServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string = "QR_SERVICE_ERROR"
  ) {
    super(message);
    this.name = "QRServiceError";
  }
}

function toProviderRail(rail: "HDFC" | "ICICI"): "hdfc" | "icici" {
  return rail === "HDFC" ? "hdfc" : "icici";
}

function toPrismaRail(rail: "hdfc" | "icici"): PaymentRail {
  return rail === "hdfc" ? PaymentRail.HDFC : PaymentRail.ICICI;
}

async function resolveAuthorizedMerchant(merchantId: string, user: SessionUser) {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    include: { client: true },
  });

  if (!merchant) {
    throw new QRServiceError("Merchant not found", "NOT_FOUND");
  }

  if (user.role === "MERCHANT_USER") {
    if (!user.merchantId || user.merchantId !== merchant.id) {
      throw new AuthError("Access to this merchant is not permitted", "FORBIDDEN");
    }
  } else if (user.role === "CLIENT_ADMIN" || user.role === "CLIENT_OPERATOR") {
    if (!user.clientId || user.clientId !== merchant.clientId) {
      throw new AuthError("Access to this merchant is not permitted", "FORBIDDEN");
    }
  }

  await requireMerchantAccess(user, merchant.id, merchant.clientId);
  return merchant;
}

function assertMerchantAndClientActive(
  merchantStatus: EntityStatus,
  clientStatus: EntityStatus
): void {
  if (merchantStatus !== EntityStatus.ACTIVE) {
    throw new QRServiceError(
      "QR can only be generated for an active merchant",
      "MERCHANT_NOT_ACTIVE"
    );
  }
  if (clientStatus !== EntityStatus.ACTIVE) {
    throw new QRServiceError(
      "QR can only be generated while the parent client is active",
      "CLIENT_NOT_ACTIVE"
    );
  }
}

export interface CreateMerchantQRResult {
  id: string;
  qrName: string;
  merchantName: string;
  clientName: string;
  providerMode: "mock" | "live" | "legacy";
  isPayable: boolean;
  sabpaisaQrId?: string;
  vpa: string;
  rail: string;
  idempotentReplay: boolean;
}

export async function createMerchantQR(
  user: SessionUser,
  input: unknown
): Promise<CreateMerchantQRResult> {
  if (!canCreateQR(user)) {
    throw new AuthError("Insufficient permissions to create QR codes", "FORBIDDEN");
  }

  const parsed = generateMerchantQRSchema.safeParse(input);
  if (!parsed.success) {
    throw new QRServiceError(
      parsed.error.issues[0]?.message ?? "Invalid QR input",
      "VALIDATION_ERROR"
    );
  }

  const data: GenerateMerchantQRInput = parsed.data;
  const merchant = await resolveAuthorizedMerchant(data.merchantId, user);
  assertMerchantAndClientActive(merchant.status, merchant.client.status);

  const existingByIdempotency = await prisma.qRCode.findUnique({
    where: { idempotencyKey: data.idempotencyKey },
    include: { client: true, merchant: true },
  });

  if (existingByIdempotency) {
    if (existingByIdempotency.merchantId !== merchant.id) {
      throw new AuthError("Invalid QR submission", "FORBIDDEN");
    }
    return {
      id: existingByIdempotency.id,
      qrName: existingByIdempotency.qrName,
      merchantName: existingByIdempotency.merchant.businessName,
      clientName: existingByIdempotency.client.name,
      providerMode: existingByIdempotency.providerMode.toLowerCase() as
        | "mock"
        | "live"
        | "legacy",
      isPayable: existingByIdempotency.isPayable,
      sabpaisaQrId: existingByIdempotency.sabpaisaQrId ?? undefined,
      vpa: existingByIdempotency.vpa ?? "",
      rail: existingByIdempotency.railId,
      idempotentReplay: true,
    };
  }

  const integrationMode = loadSabPaisaIntegrationMode();
  const provider = getSabPaisaQRProvider();
  const maxAmount = data.maxAmountPerTransaction
    ? Number(data.maxAmountPerTransaction)
    : undefined;

  let providerResponse;
  try {
    providerResponse = await provider.createQR({
      rail_id: toProviderRail(data.railId),
      qr_name: data.qrName,
      qr_identifier: data.qrIdentifier,
      max_amount_per_transaction: maxAmount,
      description: data.description,
      category: data.category,
      notes: data.notes,
      merchantBusinessName: merchant.businessName,
    });
  } catch (error) {
    if (isSabPaisaError(error)) {
      throw new QRServiceError(error.message, error.code);
    }
    throw error;
  }

  const providerData = providerResponse.data;
  const qrId = generateEntityId("QR");
  const providerMode =
    integrationMode === "live" ? QRProviderMode.LIVE : QRProviderMode.MOCK;
  const isPayable = false;

  const created = await prisma.$transaction(async (tx) => {
    const duplicate = await tx.qRCode.findFirst({
      where: {
        merchantId: merchant.id,
        qrIdentifier: providerData.qr_identifier,
        railId: toPrismaRail(toProviderRail(data.railId)),
      },
    });
    if (duplicate) {
      throw new QRServiceError(
        "A QR with this identifier already exists for the merchant",
        "DUPLICATE_QR"
      );
    }

    const record = await tx.qRCode.create({
      data: {
        id: qrId,
        clientId: merchant.clientId,
        merchantId: merchant.id,
        sabpaisaQrId: providerData.qr_id,
        provider: "sabpaisa",
        providerMode,
        qrName: providerData.qr_name,
        qrIdentifier: providerData.qr_identifier,
        railId: toPrismaRail(toProviderRail(data.railId)),
        vpa: providerData.vpa,
        qrImageUrl: providerData.qr_image_url,
        upiString: providerData.upi_string,
        maxAmountPerTransaction: providerData.max_amount_per_transaction,
        description: providerData.description,
        category: providerData.category,
        notes: data.notes ?? null,
        isPayable,
        providerCreatedAt: new Date(providerData.created_at),
        idempotencyKey: data.idempotencyKey,
        status: EntityStatus.ACTIVE,
      },
      include: { client: true, merchant: true },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        clientId: merchant.clientId,
        action: "QR_CREATED",
        entityType: "QRCode",
        entityId: record.id,
        metadata: {
          providerMode: providerMode,
          rail: data.railId,
          sabpaisaQrId: providerData.qr_id,
          merchantId: merchant.id,
          isPayable,
        } as Prisma.InputJsonValue,
      },
    });

    return record;
  }, { timeout: 20000 });

  return {
    id: created.id,
    qrName: created.qrName,
    merchantName: created.merchant.businessName,
    clientName: created.client.name,
    providerMode: created.providerMode.toLowerCase() as "mock" | "live" | "legacy",
    isPayable: created.isPayable,
    sabpaisaQrId: created.sabpaisaQrId ?? undefined,
    vpa: created.vpa ?? "",
    rail: created.railId,
    idempotentReplay: false,
  };
}

type QRWithRelations = Prisma.QRCodeGetPayload<{
  include: { client: true; merchant: true };
}>;

function decimalToNumber(value: Prisma.Decimal | null | undefined): number {
  if (!value) return 0;
  return Number(value.toString());
}

function toEntityStatus(status: "active" | "inactive"): EntityStatus {
  return status === "active" ? EntityStatus.ACTIVE : EntityStatus.INACTIVE;
}

function toProviderStatus(status: EntityStatus): "active" | "inactive" {
  return status === EntityStatus.ACTIVE ? "active" : "inactive";
}

async function hasPendingTransactions(qrId: string): Promise<boolean> {
  const count = await prisma.transaction.count({
    where: { qrId, status: TransactionStatus.PENDING },
  });
  return count > 0;
}

async function toProviderRecord(qr: QRWithRelations): Promise<SabPaisaQRProviderRecord> {
  return {
    localId: qr.id,
    qr_id: qr.sabpaisaQrId ?? qr.id,
    qr_identifier: qr.qrIdentifier,
    qr_name: qr.qrName,
    vpa: qr.vpa,
    rail_id: qr.railId.toLowerCase(),
    category: qr.category,
    description: qr.description,
    notes: qr.notes,
    max_amount_per_transaction: decimalToNumber(qr.maxAmountPerTransaction),
    status: toProviderStatus(qr.status),
    qr_image_url: qr.qrImageUrl,
    upi_string: qr.upiString,
    created_at: (qr.providerCreatedAt ?? qr.createdAt).toISOString(),
    provider_mode: qr.providerMode.toLowerCase() as "mock" | "live" | "legacy",
    is_payable: qr.isPayable,
    has_pending_transactions: await hasPendingTransactions(qr.id),
  };
}

async function resolveAuthorizedQR(
  qrId: string,
  user: SessionUser,
  requireManage = false
): Promise<QRWithRelations> {
  if (requireManage && !canManageQR(user)) {
    throw new AuthError("Insufficient permissions to manage QR codes", "FORBIDDEN");
  }

  const qr = await prisma.qRCode.findUnique({
    where: { id: qrId },
    include: { client: true, merchant: true },
  });

  if (!qr) {
    throw new QRServiceError("QR code not found", "QR_NOT_FOUND");
  }

  await requireMerchantAccess(user, qr.merchantId, qr.clientId);
  return qr;
}

function mapSabPaisaError(error: unknown): never {
  if (isSabPaisaError(error)) {
    throw new QRServiceError(error.message, error.code);
  }
  throw error;
}

function buildQRWhere(user: SessionUser, query: QRListQuery): Prisma.QRCodeWhereInput {
  const scope = getMerchantScopeFilter(user);
  const where: Prisma.QRCodeWhereInput = { ...scope };

  if (query.status !== "all") {
    where.status =
      query.status === "active" ? EntityStatus.ACTIVE : EntityStatus.INACTIVE;
  }
  if (query.railId !== "all") {
    where.railId = query.railId;
  }
  if (query.category) {
    where.category = { equals: query.category, mode: "insensitive" };
  }
  if (query.search) {
    where.OR = [
      { qrName: { contains: query.search, mode: "insensitive" } },
      { qrIdentifier: { contains: query.search, mode: "insensitive" } },
      { id: { contains: query.search, mode: "insensitive" } },
    ];
  }
  if (query.fromDate) {
    where.createdAt = {
      ...(where.createdAt as Prisma.DateTimeFilter | undefined),
      gte: new Date(query.fromDate),
    };
  }
  if (query.toDate) {
    where.createdAt = {
      ...(where.createdAt as Prisma.DateTimeFilter | undefined),
      lte: new Date(query.toDate),
    };
  }

  return where;
}

function buildQROrderBy(query: QRListQuery): Prisma.QRCodeOrderByWithRelationInput {
  const direction = query.sortOrder;
  if (query.sortBy === "qr_name") {
    return { qrName: direction };
  }
  if (query.sortBy === "status") {
    return { status: direction };
  }
  return { createdAt: direction };
}

export interface PaginatedQRCodesResult {
  items: QRCodeWithStats[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function listMerchantQRs(
  user: SessionUser,
  input: unknown
): Promise<PaginatedQRCodesResult> {
  if (!canManageQR(user)) {
    throw new AuthError("Insufficient permissions to view QR codes", "FORBIDDEN");
  }

  const parsed = qrListQuerySchema.safeParse(input);
  if (!parsed.success) {
    throw new QRServiceError(
      parsed.error.issues[0]?.message ?? "Invalid list query",
      "VALIDATION_ERROR"
    );
  }

  const query = parsed.data;
  const where = buildQRWhere(user, query);
  const skip = (query.page - 1) * query.limit;

  const [total, qrs] = await Promise.all([
    prisma.qRCode.count({ where }),
    prisma.qRCode.findMany({
      where,
      include: { client: true, merchant: true },
      orderBy: buildQROrderBy(query),
      skip,
      take: query.limit,
    }),
  ]);

  const items = await Promise.all(
    qrs.map(async (qr) => {
      const [transactionCount, collectionAgg] = await Promise.all([
        prisma.transaction.count({ where: { qrId: qr.id } }),
        prisma.transaction.aggregate({
          where: { qrId: qr.id, status: TransactionStatus.SUCCESS },
          _sum: { amount: true },
        }),
      ]);

      return {
        ...mapQRCode(qr),
        merchantName: qr.merchant.businessName,
        clientName: qr.client.name,
        transactionCount,
        collection: decimalToNumber(collectionAgg._sum.amount),
      };
    })
  );

  return {
    items,
    total,
    page: query.page,
    limit: query.limit,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

export async function getMerchantQRById(user: SessionUser, qrId: string) {
  const qr = await resolveAuthorizedQR(qrId, user);
  const provider = getSabPaisaQRProvider();
  const record = await toProviderRecord(qr);

  try {
    await provider.getQR(record);
  } catch (error) {
    mapSabPaisaError(error);
  }

  return {
    ...mapQRCode(qr),
    merchantName: qr.merchant.businessName,
    clientName: qr.client.name,
  };
}

export async function updateMerchantQR(user: SessionUser, input: unknown) {
  const parsed = updateMerchantQRSchema.safeParse(input);
  if (!parsed.success) {
    throw new QRServiceError(
      parsed.error.issues[0]?.message ?? "Invalid QR update input",
      parsed.error.issues[0]?.message === "No valid fields to update"
        ? "QR_VALIDATION_ERROR"
        : "VALIDATION_ERROR"
    );
  }

  const data: UpdateMerchantQRInput = parsed.data;
  const qr = await resolveAuthorizedQR(data.qrId, user, true);
  const provider = getSabPaisaQRProvider();
  const record = await toProviderRecord(qr);

  let providerResponse;
  try {
    providerResponse = await provider.updateQR(record, {
      reference_name: data.referenceName,
      description: data.description,
      category: data.category,
      notes: data.notes,
      status: data.status,
    });
  } catch (error) {
    mapSabPaisaError(error);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.qRCode.update({
      where: { id: qr.id },
      data: {
        qrName: providerResponse.data.qr_name,
        description: providerResponse.data.description,
        category: providerResponse.data.category,
        notes: data.notes !== undefined ? data.notes : qr.notes,
        status: toEntityStatus(
          providerResponse.data.status as "active" | "inactive"
        ),
      },
      include: { client: true, merchant: true },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        clientId: qr.clientId,
        action: "QR_UPDATED",
        entityType: "QRCode",
        entityId: qr.id,
        metadata: {
          providerMode: qr.providerMode,
          sabpaisaQrId: qr.sabpaisaQrId,
          merchantId: qr.merchantId,
        } as Prisma.InputJsonValue,
      },
    });

    return next;
  }, { timeout: 20000 });

  return {
    id: updated.id,
    qrName: updated.qrName,
    status: updated.status === EntityStatus.ACTIVE ? "active" : "inactive",
  };
}

export async function deactivateMerchantQR(user: SessionUser, qrId: string) {
  const qr = await resolveAuthorizedQR(qrId, user, true);
  const provider = getSabPaisaQRProvider();
  const record = await toProviderRecord(qr);

  try {
    await provider.deactivateQR(record);
  } catch (error) {
    mapSabPaisaError(error);
  }

  if (qr.status === EntityStatus.INACTIVE) {
    return { id: qr.id, status: "inactive" as const, alreadyInactive: true };
  }

  await prisma.$transaction(async (tx) => {
    await tx.qRCode.update({
      where: { id: qr.id },
      data: { status: EntityStatus.INACTIVE },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        clientId: qr.clientId,
        action: "QR_DEACTIVATED",
        entityType: "QRCode",
        entityId: qr.id,
        metadata: {
          providerMode: qr.providerMode,
          sabpaisaQrId: qr.sabpaisaQrId,
          merchantId: qr.merchantId,
        } as Prisma.InputJsonValue,
      },
    });
  }, { timeout: 20000 });

  return { id: qr.id, status: "inactive" as const, alreadyInactive: false };
}

export async function reactivateMerchantQR(user: SessionUser, qrId: string) {
  const qr = await resolveAuthorizedQR(qrId, user, true);
  const provider = getSabPaisaQRProvider();
  const record = await toProviderRecord(qr);

  try {
    await provider.activateQR(record);
  } catch (error) {
    mapSabPaisaError(error);
  }

  if (qr.status === EntityStatus.ACTIVE) {
    return { id: qr.id, status: "active" as const, alreadyActive: true };
  }

  await prisma.$transaction(async (tx) => {
    await tx.qRCode.update({
      where: { id: qr.id },
      data: { status: EntityStatus.ACTIVE },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        clientId: qr.clientId,
        action: "QR_REACTIVATED",
        entityType: "QRCode",
        entityId: qr.id,
        metadata: {
          providerMode: qr.providerMode,
          sabpaisaQrId: qr.sabpaisaQrId,
          merchantId: qr.merchantId,
        } as Prisma.InputJsonValue,
      },
    });
  }, { timeout: 20000 });

  return { id: qr.id, status: "active" as const, alreadyActive: false };
}

export async function downloadMerchantQR(
  user: SessionUser,
  qrId: string,
  input: unknown
) {
  const parsed = qrDownloadQuerySchema.safeParse(input ?? {});
  if (!parsed.success) {
    throw new QRServiceError(
      parsed.error.issues[0]?.message ?? "Invalid download query",
      parsed.error.issues.some((issue) => issue.path.includes("format"))
        ? "INVALID_FORMAT"
        : "VALIDATION_ERROR"
    );
  }

  const query: QRDownloadQuery = parsed.data;
  const qr = await resolveAuthorizedQR(qrId, user, true);
  const provider = getSabPaisaQRProvider();
  const record = await toProviderRecord(qr);

  let download;
  try {
    download = await provider.downloadQR(record, query);
  } catch (error) {
    mapSabPaisaError(error);
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      clientId: qr.clientId,
      action: "QR_DOWNLOADED",
      entityType: "QRCode",
      entityId: qr.id,
      metadata: {
        providerMode: qr.providerMode,
        sabpaisaQrId: qr.sabpaisaQrId,
        merchantId: qr.merchantId,
        format: query.format,
        size: query.size,
      } as Prisma.InputJsonValue,
    },
  });

  return download;
}
