import {
  EntityStatus,
  PaymentEventProcessingStatus,
  QRProviderMode,
  TransactionStatus,
  type Prisma,
} from "@prisma/client";
import {
  AuthError,
  getMerchantScopeFilter,
  requireClientAccess,
  requireMerchantAccess,
} from "@/lib/auth/authorization";
import type { SessionUser } from "@/lib/auth/types";
import { isSuperAdmin } from "@/lib/auth/types";
import { prisma } from "@/lib/db/prisma";
import { decimalToNumber } from "@/lib/mappers";
import { getDashboardDateBounds } from "@/lib/services/dashboard-service";
import { buildManagedTransactionWhere } from "@/lib/services/transaction-management-service";
import { TransactionServiceError } from "@/lib/services/transaction-service";
import {
  loadSabPaisaIntegrationMode,
} from "@/lib/sabpaisa/mode";
import { SABPAISA_ENV_VARS } from "@/lib/sabpaisa/constants";
import {
  getSabPaisaQRProvider,
  getSabPaisaTransactionProvider,
} from "@/lib/sabpaisa/providers";
import {
  monitoringQuerySchema,
  type MonitoringQuery,
} from "@/lib/validations/monitoring";
import type { TransactionManagementFilters } from "@/lib/validations/transactions";
import type {
  AuditActivityRow,
  FailedTransactionRow,
  IntegrationReadiness,
  MonitoringData,
  MonitoringSummary,
  PaymentEventRow,
  PendingAgeBucket,
  PendingTransactionRow,
  QrOperationalRow,
} from "@/types";

export const PENDING_LIST_LIMIT = 25;
export const FAILED_LIST_LIMIT = 25;
export const EVENT_LIST_LIMIT = 25;
export const AUDIT_LIST_LIMIT = 25;
export const QR_OVERVIEW_LIMIT = 25;

/** Pending age thresholds (minutes). Operational indicators only — not payment truth. */
export const PENDING_AGE_RECENT_MINUTES = 15;
export const PENDING_AGE_AGING_MINUTES = 60;

const EMPTY_SUMMARY: MonitoringSummary = {
  activeQrCodes: 0,
  inactiveQrCodes: 0,
  mockQrCodes: 0,
  pendingTransactions: 0,
  failedTransactions: 0,
  successfulTransactions: 0,
  receivedPaymentEvents: 0,
  processedPaymentEvents: 0,
  rejectedPaymentEvents: 0,
  failedPaymentEvents: 0,
  duplicatePaymentEvents: 0,
};

function toPrismaProviderMode(
  mode: MonitoringQuery["providerMode"]
): QRProviderMode | undefined {
  if (mode === "all") return undefined;
  return mode.toUpperCase() as QRProviderMode;
}

function toPrismaEventStatus(
  status: MonitoringQuery["eventProcessingStatus"]
): PaymentEventProcessingStatus | undefined {
  if (status === "all") return undefined;
  return status.toUpperCase() as PaymentEventProcessingStatus;
}

function toUiProviderMode(
  mode: QRProviderMode
): "mock" | "legacy" | "live" {
  return mode.toLowerCase() as "mock" | "legacy" | "live";
}

function toUiEntityStatus(
  status: EntityStatus
): "active" | "inactive" | "pending" {
  return status.toLowerCase() as "active" | "inactive" | "pending";
}

export function resolveMonitoringDateBounds(query: MonitoringQuery): {
  fromDate: string;
  toDate: string;
} {
  return getDashboardDateBounds(query.dateWindow);
}

export function classifyPendingAge(
  initiatedAt: Date,
  now: Date = new Date()
): { ageMinutes: number; ageBucket: PendingAgeBucket } {
  const ageMs = Math.max(0, now.getTime() - initiatedAt.getTime());
  const ageMinutes = Math.floor(ageMs / 60_000);

  let ageBucket: PendingAgeBucket = "recent";
  if (ageMinutes >= PENDING_AGE_AGING_MINUTES) {
    ageBucket = "older";
  } else if (ageMinutes >= PENDING_AGE_RECENT_MINUTES) {
    ageBucket = "aging";
  }

  return { ageMinutes, ageBucket };
}

async function authorizeMonitoringFilters(
  user: SessionUser,
  query: Pick<MonitoringQuery, "clientId" | "merchantId">
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
}

function toManagementFilters(
  query: MonitoringQuery,
  bounds: { fromDate: string; toDate: string }
): TransactionManagementFilters {
  return {
    clientId: query.clientId,
    merchantId: query.merchantId,
    providerMode: query.providerMode,
    status: query.transactionStatus,
    fromDate: bounds.fromDate,
    toDate: bounds.toDate,
    sortBy: "initiated_at",
    sortOrder: "desc",
  };
}

async function buildQrWhere(
  user: SessionUser,
  query: MonitoringQuery
): Promise<Prisma.QRCodeWhereInput> {
  await authorizeMonitoringFilters(user, query);

  const where: Prisma.QRCodeWhereInput = {
    ...getMerchantScopeFilter(user),
  };

  if (query.clientId) where.clientId = query.clientId;
  if (query.merchantId) where.merchantId = query.merchantId;

  const providerMode = toPrismaProviderMode(query.providerMode);
  if (providerMode) where.providerMode = providerMode;

  return where;
}

export async function buildPaymentEventWhere(
  user: SessionUser,
  query: MonitoringQuery,
  bounds: { fromDate: string; toDate: string }
): Promise<Prisma.PaymentEventWhereInput> {
  await authorizeMonitoringFilters(user, query);

  const where: Prisma.PaymentEventWhereInput = {
    receivedAt: {
      gte: new Date(bounds.fromDate),
      lte: new Date(bounds.toDate),
    },
  };

  const providerMode = toPrismaProviderMode(query.providerMode);
  if (providerMode) where.providerMode = providerMode;

  const eventStatus = toPrismaEventStatus(query.eventProcessingStatus);
  if (eventStatus) where.processingStatus = eventStatus;

  if (isSuperAdmin(user)) {
    if (query.clientId) where.clientId = query.clientId;
    if (query.merchantId) where.merchantId = query.merchantId;
    return where;
  }

  const scope = getMerchantScopeFilter(user);
  if (!scope.clientId) {
    return { id: "__none__" };
  }

  if (query.clientId && query.clientId !== scope.clientId) {
    return { id: "__none__" };
  }

  where.clientId = scope.clientId;
  if (scope.merchantId) {
    where.merchantId = scope.merchantId;
  } else if (query.merchantId) {
    where.merchantId = query.merchantId;
  }

  return where;
}

async function buildMerchantAuditScope(
  merchantId: string
): Promise<Prisma.AuditLogWhereInput[]> {
  const qrIds = await prisma.qRCode.findMany({
    where: { merchantId },
    select: { id: true },
  });

  return [
    { entityType: "Merchant", entityId: merchantId },
    { entityType: "QRCode", entityId: { in: qrIds.map((qr) => qr.id) } },
    {
      entityType: "PaymentEvent",
      metadata: { path: ["merchantId"], equals: merchantId },
    },
    {
      entityType: "Transaction",
      metadata: { path: ["merchantId"], equals: merchantId },
    },
  ];
}

export async function buildAuditLogWhere(
  user: SessionUser,
  query: MonitoringQuery,
  bounds: { fromDate: string; toDate: string }
): Promise<Prisma.AuditLogWhereInput> {
  await authorizeMonitoringFilters(user, query);

  const where: Prisma.AuditLogWhereInput = {
    createdAt: {
      gte: new Date(bounds.fromDate),
      lte: new Date(bounds.toDate),
    },
  };

  if (isSuperAdmin(user)) {
    if (query.clientId) where.clientId = query.clientId;
    if (query.merchantId) {
      where.OR = await buildMerchantAuditScope(query.merchantId);
    }
    return where;
  }

  const scope = getMerchantScopeFilter(user);
  if (!scope.clientId) {
    return { id: "__none__" };
  }

  if (query.clientId && query.clientId !== scope.clientId) {
    return { id: "__none__" };
  }

  where.clientId = scope.clientId;

  if (user.role === "MERCHANT_USER") {
    if (!user.merchantId) {
      return { id: "__none__" };
    }
    where.OR = await buildMerchantAuditScope(user.merchantId);
    return where;
  }

  if (query.merchantId) {
    where.OR = await buildMerchantAuditScope(query.merchantId);
  }

  return where;
}

async function getQrSummary(
  qrWhere: Prisma.QRCodeWhereInput
): Promise<Pick<MonitoringSummary, "activeQrCodes" | "inactiveQrCodes" | "mockQrCodes">> {
  const [statusGroups, mockCount] = await Promise.all([
    prisma.qRCode.groupBy({
      by: ["status"],
      where: qrWhere,
      _count: true,
    }),
    prisma.qRCode.count({
      where: { ...qrWhere, providerMode: QRProviderMode.MOCK },
    }),
  ]);

  const countFor = (status: EntityStatus) =>
    statusGroups.find((group) => group.status === status)?._count ?? 0;

  return {
    activeQrCodes: countFor(EntityStatus.ACTIVE),
    inactiveQrCodes: countFor(EntityStatus.INACTIVE),
    mockQrCodes: mockCount,
  };
}

async function getTransactionStatusCounts(
  txnWhere: Prisma.TransactionWhereInput
): Promise<
  Pick<
    MonitoringSummary,
    "pendingTransactions" | "failedTransactions" | "successfulTransactions"
  >
> {
  const groups = await prisma.transaction.groupBy({
    by: ["status"],
    where: txnWhere,
    _count: true,
  });

  const countFor = (status: TransactionStatus) =>
    groups.find((group) => group.status === status)?._count ?? 0;

  return {
    pendingTransactions: countFor(TransactionStatus.PENDING),
    failedTransactions: countFor(TransactionStatus.FAILED),
    successfulTransactions: countFor(TransactionStatus.SUCCESS),
  };
}

async function getPaymentEventCounts(
  eventWhere: Prisma.PaymentEventWhereInput
): Promise<
  Pick<
    MonitoringSummary,
    | "receivedPaymentEvents"
    | "processedPaymentEvents"
    | "rejectedPaymentEvents"
    | "failedPaymentEvents"
    | "duplicatePaymentEvents"
  >
> {
  const groups = await prisma.paymentEvent.groupBy({
    by: ["processingStatus"],
    where: eventWhere,
    _count: true,
  });

  const countFor = (status: PaymentEventProcessingStatus) =>
    groups.find((group) => group.processingStatus === status)?._count ?? 0;

  return {
    receivedPaymentEvents: countFor(PaymentEventProcessingStatus.RECEIVED),
    processedPaymentEvents: countFor(PaymentEventProcessingStatus.PROCESSED),
    rejectedPaymentEvents: countFor(PaymentEventProcessingStatus.REJECTED),
    failedPaymentEvents: countFor(PaymentEventProcessingStatus.FAILED),
    duplicatePaymentEvents: countFor(PaymentEventProcessingStatus.DUPLICATE),
  };
}

async function getPendingTransactions(
  txnWhere: Prisma.TransactionWhereInput
): Promise<PendingTransactionRow[]> {
  const rows = await prisma.transaction.findMany({
    where: { ...txnWhere, status: TransactionStatus.PENDING },
    orderBy: { initiatedAt: "asc" },
    take: PENDING_LIST_LIMIT,
    select: {
      id: true,
      transactionId: true,
      merchantId: true,
      qrId: true,
      amount: true,
      providerMode: true,
      initiatedAt: true,
      merchant: { select: { businessName: true } },
      qrCode: { select: { qrName: true } },
    },
  });

  const now = new Date();

  return rows.map((row) => {
    const { ageMinutes, ageBucket } = classifyPendingAge(row.initiatedAt, now);
    return {
      id: row.id,
      transactionId: row.transactionId,
      merchantName: row.merchant.businessName,
      merchantId: row.merchantId,
      qrName: row.qrCode.qrName,
      qrId: row.qrId,
      amount: decimalToNumber(row.amount),
      providerMode: toUiProviderMode(row.providerMode),
      initiatedAt: row.initiatedAt.toISOString(),
      ageMinutes,
      ageBucket,
    };
  });
}

async function getFailedTransactions(
  txnWhere: Prisma.TransactionWhereInput
): Promise<FailedTransactionRow[]> {
  const rows = await prisma.transaction.findMany({
    where: { ...txnWhere, status: TransactionStatus.FAILED },
    orderBy: { initiatedAt: "desc" },
    take: FAILED_LIST_LIMIT,
    select: {
      id: true,
      transactionId: true,
      merchantId: true,
      qrId: true,
      amount: true,
      providerMode: true,
      initiatedAt: true,
      referenceNumber: true,
      merchant: { select: { businessName: true } },
      qrCode: { select: { qrName: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    transactionId: row.transactionId,
    merchantName: row.merchant.businessName,
    merchantId: row.merchantId,
    qrName: row.qrCode.qrName,
    qrId: row.qrId,
    amount: decimalToNumber(row.amount),
    providerMode: toUiProviderMode(row.providerMode),
    initiatedAt: row.initiatedAt.toISOString(),
    referenceNumber: row.referenceNumber ?? undefined,
  }));
}

async function getRecentPaymentEvents(
  eventWhere: Prisma.PaymentEventWhereInput
): Promise<PaymentEventRow[]> {
  const rows = await prisma.paymentEvent.findMany({
    where: eventWhere,
    orderBy: { receivedAt: "desc" },
    take: EVENT_LIST_LIMIT,
    select: {
      id: true,
      provider: true,
      providerMode: true,
      processingStatus: true,
      receivedAt: true,
      processedAt: true,
      failureReasonCode: true,
      transactionId: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    providerMode: toUiProviderMode(row.providerMode),
    processingStatus: row.processingStatus,
    receivedAt: row.receivedAt.toISOString(),
    processedAt: row.processedAt?.toISOString(),
    failureReasonCode: row.failureReasonCode ?? undefined,
    transactionId: row.transactionId ?? undefined,
  }));
}

async function getQrOperationalOverview(
  qrWhere: Prisma.QRCodeWhereInput,
  bounds: { fromDate: string; toDate: string }
): Promise<QrOperationalRow[]> {
  const qrs = await prisma.qRCode.findMany({
    where: qrWhere,
    orderBy: { updatedAt: "desc" },
    take: QR_OVERVIEW_LIMIT,
    select: {
      id: true,
      qrName: true,
      qrIdentifier: true,
      providerMode: true,
      status: true,
      isPayable: true,
      merchant: { select: { businessName: true } },
    },
  });

  if (qrs.length === 0) return [];

  const counts = await prisma.transaction.groupBy({
    by: ["qrId"],
    where: {
      qrId: { in: qrs.map((qr) => qr.id) },
      initiatedAt: {
        gte: new Date(bounds.fromDate),
        lte: new Date(bounds.toDate),
      },
    },
    _count: true,
  });

  const countByQr = new Map(counts.map((row) => [row.qrId, row._count]));

  return qrs.map((qr) => ({
    id: qr.id,
    qrName: qr.qrName,
    qrIdentifier: qr.qrIdentifier,
    merchantName: qr.merchant.businessName,
    providerMode: toUiProviderMode(qr.providerMode),
    status: toUiEntityStatus(qr.status),
    isPayable: qr.isPayable,
    recentTransactionCount: countByQr.get(qr.id) ?? 0,
  }));
}

async function getRecentAuditActivity(
  auditWhere: Prisma.AuditLogWhereInput
): Promise<AuditActivityRow[]> {
  const rows = await prisma.auditLog.findMany({
    where: auditWhere,
    orderBy: { createdAt: "desc" },
    take: AUDIT_LIST_LIMIT,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      createdAt: true,
      user: { select: { name: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    actorName: row.user?.name ?? undefined,
    entityType: row.entityType,
    entityId: row.entityId ?? undefined,
    createdAt: row.createdAt.toISOString(),
  }));
}

export function getIntegrationReadiness(): IntegrationReadiness {
  const integrationMode = loadSabPaisaIntegrationMode().toUpperCase();

  let liveQrProvider = "Disabled";
  try {
    process.env[SABPAISA_ENV_VARS.MODE] = "live";
    getSabPaisaQRProvider();
    liveQrProvider = "Enabled";
  } catch {
    liveQrProvider = "Disabled";
  } finally {
    delete process.env[SABPAISA_ENV_VARS.MODE];
  }

  let liveTransactionProvider = "Disabled";
  try {
    process.env[SABPAISA_ENV_VARS.MODE] = "live";
    getSabPaisaTransactionProvider();
    liveTransactionProvider = "Enabled";
  } catch {
    liveTransactionProvider = "Disabled";
  } finally {
    delete process.env[SABPAISA_ENV_VARS.MODE];
  }

  return {
    integrationMode,
    liveQrProvider,
    liveTransactionProvider,
    publicWebhook: "Not enabled",
    apiCryptoInteroperability: "BLOCKED (3 items)",
    webhookInteroperability: "BLOCKED (4 items)",
  };
}

export async function getMonitoringData(
  user: SessionUser,
  rawQuery: Partial<MonitoringQuery> = {}
): Promise<MonitoringData> {
  const parsed = monitoringQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    throw new TransactionServiceError(
      parsed.error.issues[0]?.message ?? "Invalid monitoring query",
      "VALIDATION_ERROR"
    );
  }

  const query = parsed.data;
  const bounds = resolveMonitoringDateBounds(query);
  const managementFilters = toManagementFilters(query, bounds);

  let txnWhere: Prisma.TransactionWhereInput;
  try {
    txnWhere = await buildManagedTransactionWhere(user, managementFilters);
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        summary: EMPTY_SUMMARY,
        pendingTransactions: [],
        failedTransactions: [],
        recentPaymentEvents: [],
        qrOverview: [],
        recentAuditActivity: [],
        integrationReadiness: getIntegrationReadiness(),
        query,
      };
    }
    throw error;
  }

  const [qrWhere, eventWhere, auditWhere] = await Promise.all([
    buildQrWhere(user, query),
    buildPaymentEventWhere(user, query, bounds),
    buildAuditLogWhere(user, query, bounds),
  ]);

  const [
    qrSummary,
    txnCounts,
    eventCounts,
    pendingTransactions,
    failedTransactions,
    recentPaymentEvents,
    qrOverview,
    recentAuditActivity,
  ] = await Promise.all([
    getQrSummary(qrWhere),
    getTransactionStatusCounts(txnWhere),
    getPaymentEventCounts(eventWhere),
    getPendingTransactions(txnWhere),
    getFailedTransactions(txnWhere),
    getRecentPaymentEvents(eventWhere),
    getQrOperationalOverview(qrWhere, bounds),
    getRecentAuditActivity(auditWhere),
  ]);

  return {
    summary: {
      ...qrSummary,
      ...txnCounts,
      ...eventCounts,
    },
    pendingTransactions,
    failedTransactions,
    recentPaymentEvents,
    qrOverview,
    recentAuditActivity,
    integrationReadiness: getIntegrationReadiness(),
    query,
  };
}
