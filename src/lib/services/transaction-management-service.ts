import {
  QRProviderMode,
  TransactionStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  AuthError,
  getMerchantScopeFilter,
  requireClientAccess,
  requireMerchantAccess,
} from "@/lib/auth/authorization";
import type { SessionUser } from "@/lib/auth/types";
import {
  decimalToNumber,
  mapTransaction,
  toUiTransactionStatus,
} from "@/lib/mappers";
import { getTransactionReconciliationStatus } from "@/lib/transactions/reconciliation";
import {
  buildCsvContent,
  CSV_EXPORT_MAX_ROWS,
} from "@/lib/utils/csv-export";
import { maskCustomerVpa } from "@/lib/utils/mask-vpa";
import {
  transactionExportQuerySchema,
  transactionManagementQuerySchema,
  type TransactionExportQuery,
  type TransactionManagementFilters,
  type TransactionManagementQuery,
} from "@/lib/validations/transactions";
import type {
  ManagedTransactionListResult,
  TransactionDetail,
  TransactionSummaryMetrics,
  TransactionWithRelations,
} from "@/types";
import { TransactionServiceError } from "./transaction-service";

type DbTransactionWithRelations = Prisma.TransactionGetPayload<{
  include: { client: true; merchant: true; qrCode: true };
}>;

function toPrismaProviderMode(
  mode: TransactionManagementFilters["providerMode"]
): QRProviderMode | undefined {
  if (mode === "all") return undefined;
  return mode.toUpperCase() as QRProviderMode;
}

function toPrismaStatus(
  status: TransactionManagementFilters["status"]
): TransactionStatus | undefined {
  if (status === "all") return undefined;
  return status.toUpperCase() as TransactionStatus;
}

function mapManagedTransaction(
  txn: DbTransactionWithRelations,
  options: { maskVpa?: boolean } = { maskVpa: true }
): TransactionWithRelations {
  const mapped = mapTransaction(txn);
  return {
    ...mapped,
    customerVpa: options.maskVpa
      ? maskCustomerVpa(txn.customerVpa)
      : mapped.customerVpa,
    merchantName: txn.merchant.businessName,
    merchantCode: txn.merchant.merchantCode,
    clientName: txn.client.name,
    clientCode: txn.client.clientCode,
    qrName: txn.qrCode.qrName,
    qrIdentifier: txn.qrCode.qrIdentifier,
    createdAt: txn.createdAt.toISOString(),
    reconciliationStatus: getTransactionReconciliationStatus(mapped.providerMode),
  };
}

async function authorizeManagementFilters(
  user: SessionUser,
  query: Pick<TransactionManagementFilters, "clientId" | "merchantId" | "qrId">
): Promise<void> {
  if (query.clientId) {
    requireClientAccess(user, query.clientId);
  }
  if (query.merchantId) {
    const merchant = await prisma.merchant.findUnique({
      where: { id: query.merchantId },
    });
    if (merchant) {
      await requireMerchantAccess(user, merchant.id, merchant.clientId);
    }
  }
  if (query.qrId) {
    const qr = await prisma.qRCode.findUnique({ where: { id: query.qrId } });
    if (qr) {
      await requireMerchantAccess(user, qr.merchantId, qr.clientId);
    }
  }
}

async function buildManagedTransactionWhere(
  user: SessionUser,
  query: TransactionManagementFilters
): Promise<Prisma.TransactionWhereInput> {
  await authorizeManagementFilters(user, query);

  const where: Prisma.TransactionWhereInput = {
    ...getMerchantScopeFilter(user),
  };

  if (query.clientId) where.clientId = query.clientId;
  if (query.merchantId) where.merchantId = query.merchantId;
  if (query.qrId) where.qrId = query.qrId;

  const providerMode = toPrismaProviderMode(query.providerMode);
  if (providerMode) where.providerMode = providerMode;

  const status = toPrismaStatus(query.status);
  if (status) where.status = status;

  if (query.fromDate || query.toDate) {
    where.initiatedAt = {};
    if (query.fromDate) {
      where.initiatedAt.gte = new Date(query.fromDate);
    }
    if (query.toDate) {
      where.initiatedAt.lte = new Date(query.toDate);
    }
  }

  if (query.search) {
    const q = query.search;
    where.OR = [
      { transactionId: { contains: q, mode: "insensitive" } },
      { providerTransactionId: { contains: q, mode: "insensitive" } },
      { referenceNumber: { contains: q, mode: "insensitive" } },
      { bankReferenceNumber: { contains: q, mode: "insensitive" } },
      { merchant: { businessName: { contains: q, mode: "insensitive" } } },
      { merchant: { merchantCode: { contains: q, mode: "insensitive" } } },
      { qrCode: { qrIdentifier: { contains: q, mode: "insensitive" } } },
      { qrCode: { qrName: { contains: q, mode: "insensitive" } } },
    ];
  }

  return where;
}

function buildOrderBy(
  query: Pick<TransactionManagementQuery, "sortBy" | "sortOrder">
): Prisma.TransactionOrderByWithRelationInput {
  const direction = query.sortOrder;
  switch (query.sortBy) {
    case "amount":
      return { amount: direction };
    case "status":
      return { status: direction };
    case "created_at":
      return { createdAt: direction };
    case "initiated_at":
    default:
      return { initiatedAt: direction };
  }
}

async function computeSummaryMetrics(
  where: Prisma.TransactionWhereInput
): Promise<TransactionSummaryMetrics> {
  const [statusGroups, successByMode] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["status"],
      where,
      _count: true,
    }),
    prisma.transaction.groupBy({
      by: ["providerMode"],
      where: { ...where, status: TransactionStatus.SUCCESS },
      _sum: { amount: true },
    }),
  ]);

  const countFor = (status: TransactionStatus) =>
    statusGroups.find((group) => group.status === status)?._count ?? 0;

  const amountForMode = (mode: QRProviderMode) => {
    const row = successByMode.find((group) => group.providerMode === mode);
    return row?._sum.amount ? decimalToNumber(row._sum.amount) : 0;
  };

  const successful = countFor(TransactionStatus.SUCCESS);
  const pending = countFor(TransactionStatus.PENDING);
  const failed = countFor(TransactionStatus.FAILED);

  return {
    total: successful + pending + failed,
    successful,
    pending,
    failed,
    successfulAmount: amountForMode(QRProviderMode.MOCK) +
      amountForMode(QRProviderMode.LEGACY) +
      amountForMode(QRProviderMode.LIVE),
    successfulAmountByProviderMode: {
      mock: amountForMode(QRProviderMode.MOCK),
      legacy: amountForMode(QRProviderMode.LEGACY),
      live: amountForMode(QRProviderMode.LIVE),
    },
  };
}

export async function listManagedTransactions(
  user: SessionUser,
  rawQuery: Partial<TransactionManagementQuery> = {}
): Promise<ManagedTransactionListResult> {
  const parsed = transactionManagementQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    throw new TransactionServiceError(
      parsed.error.issues[0]?.message ?? "Invalid transaction query",
      "VALIDATION_ERROR"
    );
  }

  const query = parsed.data;
  let where: Prisma.TransactionWhereInput;
  try {
    where = await buildManagedTransactionWhere(user, query);
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        items: [],
        pagination: {
          total: 0,
          page: query.page,
          limit: query.limit,
          totalPages: 0,
        },
        summary: {
          total: 0,
          successful: 0,
          pending: 0,
          failed: 0,
          successfulAmount: 0,
          successfulAmountByProviderMode: {
            mock: 0,
            legacy: 0,
            live: 0,
          },
        },
      };
    }
    throw error;
  }

  const [total, rows, summary] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      include: { client: true, merchant: true, qrCode: true },
      orderBy: buildOrderBy(query),
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    computeSummaryMetrics(where),
  ]);

  const totalPages = query.limit > 0 ? Math.ceil(total / query.limit) : 0;

  return {
    items: rows.map((row) => mapManagedTransaction(row)),
    pagination: {
      total,
      page: query.page,
      limit: query.limit,
      totalPages,
    },
    summary,
  };
}

export async function getManagedTransactionDetail(
  user: SessionUser,
  transactionId: string
): Promise<TransactionDetail | null> {
  const txn = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { client: true, merchant: true, qrCode: true },
  });
  if (!txn) return null;

  try {
    await requireMerchantAccess(user, txn.merchantId, txn.clientId);
  } catch (error) {
    if (error instanceof AuthError) return null;
    throw error;
  }

  const paymentEvents = await prisma.paymentEvent.findMany({
    where: { transactionId: txn.id },
    select: {
      id: true,
      receivedAt: true,
      processedAt: true,
      processingStatus: true,
      failureReasonCode: true,
    },
    orderBy: { receivedAt: "desc" },
  });

  return {
    ...mapManagedTransaction(txn, { maskVpa: true }),
    paymentEvents: paymentEvents.map((event) => ({
      id: event.id,
      receivedAt: event.receivedAt.toISOString(),
      processedAt: event.processedAt?.toISOString(),
      processingStatus: event.processingStatus,
      failureReasonCode: event.failureReasonCode ?? undefined,
    })),
  };
}

export async function exportManagedTransactionsCsv(
  user: SessionUser,
  rawQuery: Partial<TransactionExportQuery> = {}
): Promise<{ filename: string; content: string; rowCount: number }> {
  const parsed = transactionExportQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    throw new TransactionServiceError(
      parsed.error.issues[0]?.message ?? "Invalid export query",
      "VALIDATION_ERROR"
    );
  }

  let where: Prisma.TransactionWhereInput;
  try {
    where = await buildManagedTransactionWhere(user, parsed.data);
  } catch (error) {
    if (error instanceof AuthError) {
      throw new TransactionServiceError(
        "Export not permitted for the requested scope",
        "FORBIDDEN"
      );
    }
    throw error;
  }

  const total = await prisma.transaction.count({ where });
  if (total > CSV_EXPORT_MAX_ROWS) {
    throw new TransactionServiceError(
      `Export exceeds maximum of ${CSV_EXPORT_MAX_ROWS} rows (${total} matched). Narrow your filters.`,
      "EXPORT_LIMIT_EXCEEDED"
    );
  }

  const rows = await prisma.transaction.findMany({
    where,
    include: { client: true, merchant: true, qrCode: true },
    orderBy: { initiatedAt: "desc" },
    take: CSV_EXPORT_MAX_ROWS,
  });

  const headers = [
    "Transaction ID",
    "Provider Transaction ID",
    "Client Code",
    "Merchant Code",
    "QR Identifier",
    "Amount",
    "Status",
    "Payment Method",
    "Reference Number",
    "Bank Reference Number",
    "Provider Mode",
    "Initiated At",
    "Completed At",
  ];

  const csvRows = rows.map((row) => [
    row.transactionId,
    row.providerTransactionId ?? "",
    row.client.clientCode,
    row.merchant.merchantCode,
    row.qrCode.qrIdentifier,
    row.amount.toFixed(2),
    toUiTransactionStatus(row.status),
    row.paymentMethod ?? "",
    row.referenceNumber ?? "",
    row.bankReferenceNumber ?? "",
    row.providerMode,
    row.initiatedAt.toISOString(),
    row.completedAt?.toISOString() ?? "",
  ]);

  return {
    filename: `mahacred-transactions-${new Date().toISOString().slice(0, 10)}.csv`,
    content: buildCsvContent(headers, csvRows),
    rowCount: rows.length,
  };
}

export async function listManagedTransactionsForScope(
  user: SessionUser,
  scope: {
    clientId?: string;
    merchantId?: string;
    qrId?: string;
    limit?: number;
  }
): Promise<TransactionWithRelations[]> {
  const result = await listManagedTransactions(user, {
    page: 1,
    limit: scope.limit ?? 50,
    clientId: scope.clientId,
    merchantId: scope.merchantId,
    qrId: scope.qrId,
    status: "all",
    providerMode: "all",
    sortBy: "initiated_at",
    sortOrder: "desc",
  });
  return result.items;
}
