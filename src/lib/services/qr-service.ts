import {
  EntityStatus,
  PaymentRail,
  QRProviderMode,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  AuthError,
  canCreateQR,
  requireMerchantAccess,
} from "@/lib/auth/authorization";
import type { SessionUser } from "@/lib/auth/types";
import { getSabPaisaQRProvider } from "@/lib/sabpaisa/providers";
import { loadSabPaisaIntegrationMode } from "@/lib/sabpaisa/mode";
import { isSabPaisaError } from "@/lib/sabpaisa/errors";
import { generateEntityId } from "@/lib/utils/id-generator";
import {
  generateMerchantQRSchema,
  type GenerateMerchantQRInput,
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
  });

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
