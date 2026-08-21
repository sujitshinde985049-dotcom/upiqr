import {
  PaymentRail,
  QRProviderMode,
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
import { getSabPaisaTransactionProvider } from "@/lib/sabpaisa/providers";
import type {
  SabPaisaListQrTransactionsQuery,
  SabPaisaListTransactionsQuery,
  SabPaisaTransactionProviderRecord,
} from "@/lib/sabpaisa/transaction-types";
import { maskCustomerVpa } from "@/lib/utils/mask-vpa";
import { getTransactionReconciliationStatus } from "@/lib/transactions/reconciliation";
import {
  qrTransactionListQuerySchema,
  transactionListQuerySchema,
  type QrTransactionListQuery,
  type TransactionListQuery,
} from "@/lib/validations/transactions";
import type {
  TransactionStatus as UiTransactionStatus,
  TransactionWithRelations,
} from "@/types";

export class TransactionServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string = "TRANSACTION_SERVICE_ERROR"
  ) {
    super(message);
    this.name = "TransactionServiceError";
  }
}

export interface TransactionListResult {
  items: TransactionWithRelations[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

type DbTransactionWithRelations = Prisma.TransactionGetPayload<{
  include: { client: true; merchant: true; qrCode: true };
}>;

function toProviderMode(
  mode: QRProviderMode
): SabPaisaTransactionProviderRecord["provider_mode"] {
  return mode.toLowerCase() as SabPaisaTransactionProviderRecord["provider_mode"];
}

function toProviderRail(rail: PaymentRail | null): "hdfc" | "icici" {
  return (rail ?? PaymentRail.HDFC).toLowerCase() as "hdfc" | "icici";
}

export function mapDbTransactionToProviderRecord(
  txn: DbTransactionWithRelations
): SabPaisaTransactionProviderRecord {
  return {
    localId: txn.id,
    transaction_id:
      txn.providerTransactionId ?? txn.transactionId,
    qr_code_id: txn.qrCode.sabpaisaQrId ?? txn.qrId,
    qr_identifier: txn.qrCode.qrIdentifier,
    qr_name: txn.qrCode.qrName,
    rail_id: toProviderRail(txn.railId ?? txn.qrCode.railId),
    amount: decimalToNumber(txn.amount),
    status: toUiTransactionStatus(txn.status),
    customer_vpa: txn.customerVpa,
    customer_name: txn.customerName,
    payment_method: txn.paymentMethod,
    reference_number: txn.referenceNumber,
    bank_reference_number: txn.bankReferenceNumber,
    initiated_at: txn.initiatedAt.toISOString(),
    completed_at: txn.completedAt?.toISOString() ?? null,
    provider_mode: toProviderMode(txn.providerMode),
  };
}

function mapToTransactionWithRelations(
  txn: DbTransactionWithRelations,
  options: { maskVpa?: boolean } = {}
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

async function loadScopedTransactions(
  user: SessionUser,
  filters?: {
    clientId?: string;
    merchantId?: string;
    qrId?: string;
  }
): Promise<DbTransactionWithRelations[]> {
  const scope = getMerchantScopeFilter(user);
  const where: Prisma.TransactionWhereInput = { ...scope };

  if (filters?.clientId) {
    requireClientAccess(user, filters.clientId);
    where.clientId = filters.clientId;
  }
  if (filters?.merchantId) {
    const merchant = await prisma.merchant.findUnique({
      where: { id: filters.merchantId },
    });
    if (merchant) {
      await requireMerchantAccess(user, merchant.id, merchant.clientId);
    }
    where.merchantId = filters.merchantId;
  }
  if (filters?.qrId) {
    where.qrId = filters.qrId;
  }

  return prisma.transaction.findMany({
    where,
    include: { client: true, merchant: true, qrCode: true },
    orderBy: { initiatedAt: "desc" },
  });
}

function buildProviderQuery(
  query: TransactionListQuery
): SabPaisaListTransactionsQuery {
  return {
    page: query.page,
    limit: query.limit,
    qr_id: query.qr_id,
    status: query.status,
    from_date: query.from_date,
    to_date: query.to_date,
    search: query.search,
    sort_by: query.sort_by,
    sort_order: query.sort_order,
  };
}

function buildQrProviderQuery(
  query: QrTransactionListQuery
): SabPaisaListQrTransactionsQuery {
  return {
    page: query.page,
    limit: query.limit,
    status: query.status,
    from_date: query.from_date,
    to_date: query.to_date,
  };
}

function resolvePagedItems(
  records: DbTransactionWithRelations[],
  providerLocalIds: string[],
  options: { maskVpa?: boolean } = {}
): TransactionWithRelations[] {
  const byId = new Map(records.map((record) => [record.id, record]));
  return providerLocalIds
    .map((id) => byId.get(id))
    .filter((record): record is DbTransactionWithRelations => Boolean(record))
    .map((record) => mapToTransactionWithRelations(record, options));
}

export async function listTransactionsForUser(
  user: SessionUser,
  rawQuery: Partial<TransactionListQuery> = {}
): Promise<TransactionListResult> {
  const parsed = transactionListQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    throw new TransactionServiceError(
      parsed.error.issues[0]?.message ?? "Invalid transaction query",
      "VALIDATION_ERROR"
    );
  }

  const query = parsed.data;
  if (query.clientId) requireClientAccess(user, query.clientId);
  if (query.merchantId) {
    const merchant = await prisma.merchant.findUnique({
      where: { id: query.merchantId },
    });
    if (merchant) {
      await requireMerchantAccess(user, merchant.id, merchant.clientId);
    }
  }
  if (query.qr_id) {
    const qr = await prisma.qRCode.findUnique({ where: { id: query.qr_id } });
    if (qr) {
      await requireMerchantAccess(user, qr.merchantId, qr.clientId);
    }
  }

  const records = await loadScopedTransactions(user, {
    clientId: query.clientId,
    merchantId: query.merchantId,
    qrId: query.qr_id,
  });
  const providerRecords = records.map(mapDbTransactionToProviderRecord);
  const provider = getSabPaisaTransactionProvider();
  const providerQuery = buildProviderQuery(query);
  if (query.qr_id) {
    providerQuery.qr_id = undefined;
  }
  const response = await provider.listTransactions(
    providerRecords,
    providerQuery
  );

  return {
    items: resolvePagedItems(records, response.data.transactions.map((t) => t.id), {
      maskVpa: true,
    }),
    pagination: {
      total: response.data.pagination.total,
      page: response.data.pagination.page,
      limit: response.data.pagination.limit,
      totalPages: response.data.pagination.totalPages,
    },
  };
}

export async function listQRTransactionsForUser(
  user: SessionUser,
  qrId: string,
  rawQuery: Partial<QrTransactionListQuery> = {}
): Promise<TransactionListResult> {
  const parsed = qrTransactionListQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    throw new TransactionServiceError(
      parsed.error.issues[0]?.message ?? "Invalid transaction query",
      "VALIDATION_ERROR"
    );
  }

  const qr = await prisma.qRCode.findUnique({
    where: { id: qrId },
    include: { merchant: true },
  });
  if (!qr) {
    throw new TransactionServiceError("QR code not found", "NOT_FOUND");
  }

  await requireMerchantAccess(user, qr.merchantId, qr.clientId);

  const records = await loadScopedTransactions(user, { qrId });
  const providerRecords = records.map(mapDbTransactionToProviderRecord);
  const provider = getSabPaisaTransactionProvider();
  const response = await provider.listQRTransactions(
    providerRecords,
    buildQrProviderQuery(parsed.data)
  );

  return {
    items: resolvePagedItems(records, response.data.transactions.map((t) => t.id), {
      maskVpa: true,
    }),
    pagination: {
      total: response.data.pagination.total,
      page: response.data.pagination.page,
      limit: response.data.pagination.limit,
      totalPages: response.data.pagination.total_pages,
    },
  };
}

export async function getTransactionByIdForUser(
  user: SessionUser,
  transactionId: string
): Promise<TransactionWithRelations | null> {
  const txn = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { client: true, merchant: true, qrCode: true },
  });
  if (!txn) return null;

  await requireMerchantAccess(user, txn.merchantId, txn.clientId);
  return mapToTransactionWithRelations(txn, { maskVpa: false });
}

export async function getTransactionsWithRelationsForUser(
  user: SessionUser,
  filters?: {
    clientId?: string;
    merchantId?: string;
    qrId?: string;
    status?: UiTransactionStatus;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  }
): Promise<TransactionWithRelations[]> {
  const result = await listTransactionsForUser(user, {
    page: 1,
    limit: 100,
    clientId: filters?.clientId,
    merchantId: filters?.merchantId,
    qr_id: filters?.qrId,
    status: filters?.status ?? "all",
    search: filters?.search,
    from_date: filters?.dateFrom,
    to_date: filters?.dateTo,
    sort_by: "created_at",
    sort_order: "desc",
  });
  return result.items;
}

export async function getTransactionsByQRIdForUser(
  qrId: string,
  user: SessionUser
): Promise<TransactionWithRelations[]> {
  try {
    const result = await listQRTransactionsForUser(user, qrId, {
      page: 1,
      limit: 100,
    });
    return result.items;
  } catch (error) {
    if (error instanceof AuthError && error.code === "FORBIDDEN") {
      return [];
    }
    if (error instanceof TransactionServiceError && error.code === "NOT_FOUND") {
      return [];
    }
    throw error;
  }
}

export function assertTransactionRelationshipIntegrity(input: {
  clientId: string;
  merchantId: string;
  qrId: string;
  qrClientId: string;
  qrMerchantId: string;
  merchantClientId: string;
}): void {
  if (input.clientId !== input.qrClientId) {
    throw new TransactionServiceError(
      "Transaction client does not match QR client",
      "RELATIONSHIP_MISMATCH"
    );
  }
  if (input.clientId !== input.merchantClientId) {
    throw new TransactionServiceError(
      "Transaction client does not match merchant client",
      "RELATIONSHIP_MISMATCH"
    );
  }
  if (input.merchantId !== input.qrMerchantId) {
    throw new TransactionServiceError(
      "Transaction merchant does not match QR merchant",
      "RELATIONSHIP_MISMATCH"
    );
  }
}
