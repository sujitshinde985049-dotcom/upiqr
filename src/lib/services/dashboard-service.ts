import {
  EntityStatus,
  QRProviderMode,
  TransactionStatus,
  type Prisma,
} from "@prisma/client";
import { endOfDay, format, startOfDay, subDays } from "date-fns";
import { prisma } from "@/lib/db/prisma";
import {
  AuthError,
  canAccessClientsList,
  getClientRecordScopeFilter,
  getMerchantScopeFilter,
} from "@/lib/auth/authorization";
import type { SessionUser } from "@/lib/auth/types";
import { decimalToNumber, mapClient, mapMerchant } from "@/lib/mappers";
import {
  buildManagedTransactionWhere,
  computeSummaryMetrics,
  listManagedTransactions,
} from "@/lib/services/transaction-management-service";
import { TransactionServiceError } from "@/lib/services/transaction-service";
import {
  dashboardQuerySchema,
  type DashboardQuery,
} from "@/lib/validations/dashboard";
import type {
  ChartDataPoint,
  ClientWithStats,
  DashboardData,
  DashboardMetrics,
  MerchantOverview,
  MerchantWithStats,
  QrOverview,
  TransactionSummaryMetrics,
  TransactionWithRelations,
} from "@/types";

function emptyMetrics(query: DashboardQuery): DashboardMetrics {
  return {
    showPlatformClients: false,
    totalClients: 0,
    totalMerchants: 0,
    activeMerchants: 0,
    pendingMerchants: 0,
    inactiveMerchants: 0,
    totalQrCodes: 0,
    activeQrCodes: 0,
    inactiveQrCodes: 0,
    mockQrCodes: 0,
    totalTransactions: 0,
    successfulTransactions: 0,
    pendingTransactions: 0,
    failedTransactions: 0,
    successfulAmount: 0,
    successfulAmountByProviderMode: { mock: 0, legacy: 0, live: 0 },
    dateWindow: query.dateWindow,
    providerMode: query.providerMode,
  };
}

export function getDashboardDateBounds(dateWindow: DashboardQuery["dateWindow"]): {
  fromDate: string;
  toDate: string;
} {
  const now = new Date();
  const to = endOfDay(now);
  const from =
    dateWindow === "today"
      ? startOfDay(now)
      : dateWindow === "7days"
        ? startOfDay(subDays(now, 6))
        : startOfDay(subDays(now, 29));

  return {
    fromDate: from.toISOString(),
    toDate: to.toISOString(),
  };
}

function toManagementFilters(
  user: SessionUser,
  query: DashboardQuery
): Parameters<typeof buildManagedTransactionWhere>[1] {
  const { fromDate, toDate } = getDashboardDateBounds(query.dateWindow);
  return {
    status: "all",
    providerMode: query.providerMode,
    clientId: query.clientId,
    merchantId: query.merchantId,
    fromDate,
    toDate,
    sortBy: "initiated_at",
    sortOrder: "desc",
  };
}

function successfulAmountForFilter(
  summary: TransactionSummaryMetrics,
  providerMode: DashboardQuery["providerMode"]
): number {
  if (providerMode === "all") {
    return summary.successfulAmount;
  }
  return summary.successfulAmountByProviderMode[providerMode];
}

function buildScopedMerchantWhere(
  scope: { clientId?: string; merchantId?: string },
  query: Pick<DashboardQuery, "clientId" | "merchantId">
): Prisma.MerchantWhereInput {
  const where: Prisma.MerchantWhereInput = {};
  const clientId = query.clientId ?? scope.clientId;
  const merchantId = query.merchantId ?? scope.merchantId;
  if (clientId) where.clientId = clientId;
  if (merchantId) where.id = merchantId;
  return where;
}

function buildScopedQrWhere(
  scope: { clientId?: string; merchantId?: string },
  query: Pick<DashboardQuery, "clientId" | "merchantId">
): Prisma.QRCodeWhereInput {
  const where: Prisma.QRCodeWhereInput = {};
  const clientId = query.clientId ?? scope.clientId;
  const merchantId = query.merchantId ?? scope.merchantId;
  if (clientId) where.clientId = clientId;
  if (merchantId) where.merchantId = merchantId;
  return where;
}
async function getQrOverviewForUser(
  user: SessionUser,
  query: DashboardQuery
): Promise<QrOverview> {
  const scope = getMerchantScopeFilter(user);
  const where = buildScopedQrWhere(scope, query);

  const [total, active, inactive, mock] = await Promise.all([
    prisma.qRCode.count({ where }),
    prisma.qRCode.count({ where: { ...where, status: EntityStatus.ACTIVE } }),
    prisma.qRCode.count({ where: { ...where, status: EntityStatus.INACTIVE } }),
    prisma.qRCode.count({
      where: { ...where, providerMode: QRProviderMode.MOCK },
    }),
  ]);

  return { total, active, inactive, mock };
}

async function getMerchantOverviewForUser(
  user: SessionUser,
  query: DashboardQuery
): Promise<MerchantOverview | null> {
  if (user.role === "MERCHANT_USER") {
    return null;
  }

  const scope = getMerchantScopeFilter(user);
  const where = buildScopedMerchantWhere(scope, query);

  const [total, active, pending, inactive] = await Promise.all([
    prisma.merchant.count({ where }),
    prisma.merchant.count({ where: { ...where, status: EntityStatus.ACTIVE } }),
    prisma.merchant.count({ where: { ...where, status: EntityStatus.PENDING } }),
    prisma.merchant.count({
      where: { ...where, status: EntityStatus.INACTIVE },
    }),
  ]);

  return { total, active, pending, inactive };
}

async function sumSuccessfulCollection(
  where: Prisma.TransactionWhereInput
): Promise<number> {
  const result = await prisma.transaction.aggregate({
    where: { ...where, status: TransactionStatus.SUCCESS },
    _sum: { amount: true },
  });
  return result._sum.amount ? decimalToNumber(result._sum.amount) : 0;
}

export async function getDashboardMetricsForUser(
  user: SessionUser,
  rawQuery: Partial<DashboardQuery> = {}
): Promise<DashboardMetrics> {
  const parsed = dashboardQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    throw new TransactionServiceError(
      parsed.error.issues[0]?.message ?? "Invalid dashboard query",
      "VALIDATION_ERROR"
    );
  }
  const query = parsed.data;

  let txnWhere: Prisma.TransactionWhereInput;
  try {
    txnWhere = await buildManagedTransactionWhere(
      user,
      toManagementFilters(user, query)
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return emptyMetrics(query);
    }
    throw error;
  }

  const scope = getMerchantScopeFilter(user);
  const merchantWhere = buildScopedMerchantWhere(scope, query);
  const qrWhere = buildScopedQrWhere(scope, query);

  const showPlatformClients = canAccessClientsList(user);

  const [
    totalClients,
    totalMerchants,
    activeMerchants,
    pendingMerchants,
    inactiveMerchants,
    totalQrCodes,
    activeQrCodes,
    inactiveQrCodes,
    mockQrCodes,
    summary,
  ] = await Promise.all([
    showPlatformClients
      ? prisma.client.count({ where: { status: EntityStatus.ACTIVE } })
      : Promise.resolve(scope.clientId ? 1 : 0),
    prisma.merchant.count({ where: merchantWhere }),
    prisma.merchant.count({
      where: { ...merchantWhere, status: EntityStatus.ACTIVE },
    }),
    prisma.merchant.count({
      where: { ...merchantWhere, status: EntityStatus.PENDING },
    }),
    prisma.merchant.count({
      where: { ...merchantWhere, status: EntityStatus.INACTIVE },
    }),
    prisma.qRCode.count({ where: qrWhere }),
    prisma.qRCode.count({
      where: { ...qrWhere, status: EntityStatus.ACTIVE },
    }),
    prisma.qRCode.count({
      where: { ...qrWhere, status: EntityStatus.INACTIVE },
    }),
    prisma.qRCode.count({
      where: { ...qrWhere, providerMode: QRProviderMode.MOCK },
    }),
    computeSummaryMetrics(txnWhere),
  ]);

  return {
    showPlatformClients,
    totalClients,
    totalMerchants,
    activeMerchants,
    pendingMerchants,
    inactiveMerchants,
    totalQrCodes,
    activeQrCodes,
    inactiveQrCodes,
    mockQrCodes,
    totalTransactions: summary.total,
    successfulTransactions: summary.successful,
    pendingTransactions: summary.pending,
    failedTransactions: summary.failed,
    successfulAmount: successfulAmountForFilter(summary, query.providerMode),
    successfulAmountByProviderMode: summary.successfulAmountByProviderMode,
    dateWindow: query.dateWindow,
    providerMode: query.providerMode,
  };
}

export async function getChartDataForUser(
  user: SessionUser,
  rawQuery: Partial<DashboardQuery> = {}
): Promise<ChartDataPoint[]> {
  const parsed = dashboardQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    throw new TransactionServiceError(
      parsed.error.issues[0]?.message ?? "Invalid dashboard query",
      "VALIDATION_ERROR"
    );
  }
  const query = parsed.data;

  let txnWhere: Prisma.TransactionWhereInput;
  try {
    txnWhere = await buildManagedTransactionWhere(
      user,
      toManagementFilters(user, query)
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return [];
    }
    throw error;
  }

  const days =
    query.dateWindow === "today" ? 1 : query.dateWindow === "7days" ? 7 : 30;
  const data: ChartDataPoint[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = subDays(new Date(), i);
    const dateStr = format(date, "yyyy-MM-dd");
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    const dayWhere: Prisma.TransactionWhereInput = {
      ...txnWhere,
      status: TransactionStatus.SUCCESS,
      initiatedAt: { gte: dayStart, lte: dayEnd },
    };

    const aggregate = await prisma.transaction.aggregate({
      where: dayWhere,
      _sum: { amount: true },
      _count: true,
    });

    data.push({
      date: dateStr,
      label:
        query.dateWindow === "today"
          ? format(date, "dd MMM")
          : format(date, "dd MMM"),
      amount: aggregate._sum.amount
        ? decimalToNumber(aggregate._sum.amount)
        : 0,
      count: aggregate._count,
    });
  }

  return data;
}

export async function getRecentTransactionsForUser(
  user: SessionUser,
  limit = 10,
  rawQuery: Partial<DashboardQuery> = {}
): Promise<TransactionWithRelations[]> {
  const parsed = dashboardQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    throw new TransactionServiceError(
      parsed.error.issues[0]?.message ?? "Invalid dashboard query",
      "VALIDATION_ERROR"
    );
  }
  const query = parsed.data;
  const filters = toManagementFilters(user, query);

  try {
    const result = await listManagedTransactions(user, {
      ...filters,
      page: 1,
      limit,
    });
    return result.items;
  } catch (error) {
    if (error instanceof TransactionServiceError && error.code === "VALIDATION_ERROR") {
      throw error;
    }
    return [];
  }
}

async function getClientStatsForUser(clientId: string, user: SessionUser) {
  const { fromDate, toDate } = getDashboardDateBounds("30days");
  const where = await buildManagedTransactionWhere(user, {
    clientId,
    status: "all",
    providerMode: "all",
    fromDate,
    toDate,
    sortBy: "initiated_at",
    sortOrder: "desc",
  });

  const [totalMerchants, activeQrs, todayCollection, totalCollection] =
    await Promise.all([
      prisma.merchant.count({ where: { clientId } }),
      prisma.qRCode.count({
        where: { clientId, status: EntityStatus.ACTIVE },
      }),
      sumSuccessfulCollection({
        clientId,
        initiatedAt: { gte: startOfDay(new Date()) },
        status: TransactionStatus.SUCCESS,
      }),
      prisma.transaction.aggregate({
        where: { ...where, status: TransactionStatus.SUCCESS },
        _sum: { amount: true },
      }),
    ]);

  return {
    totalMerchants,
    activeQrs,
    todayCollection,
    totalCollection: totalCollection._sum.amount
      ? decimalToNumber(totalCollection._sum.amount)
      : 0,
  };
}

export async function getTopPerformingClientsForUser(
  user: SessionUser,
  limit = 5,
  _rawQuery: Partial<DashboardQuery> = {}
): Promise<ClientWithStats[]> {
  if (!canAccessClientsList(user)) {
    if (!user.clientId) return [];
    const stats = await getClientStatsForUser(user.clientId, user);
    const client = await prisma.client.findUnique({
      where: { id: user.clientId },
    });
    if (!client) return [];
    return [
      {
        ...mapClient(client),
        totalMerchants: stats.totalMerchants,
        activeQr: stats.activeQrs,
        todayCollection: stats.todayCollection,
        totalCollection: stats.totalCollection,
      },
    ];
  }

  const scope = getClientRecordScopeFilter(user);
  const clients = await prisma.client.findMany({
    where: scope,
    orderBy: { name: "asc" },
  });

  const enriched = await Promise.all(
    clients.map(async (client) => {
      const stats = await getClientStatsForUser(client.id, user);
      return {
        ...mapClient(client),
        totalMerchants: stats.totalMerchants,
        activeQr: stats.activeQrs,
        todayCollection: stats.todayCollection,
        totalCollection: stats.totalCollection,
      };
    })
  );

  return enriched
    .filter((client) => client.status === "active")
    .sort((a, b) => b.totalCollection - a.totalCollection)
    .slice(0, limit);
}

export async function getRecentMerchantsForUser(
  user: SessionUser,
  limit = 5,
  rawQuery: Partial<DashboardQuery> = {}
): Promise<MerchantWithStats[]> {
  const parsed = dashboardQuerySchema.safeParse(rawQuery);
  const query = parsed.success ? parsed.data : dashboardQuerySchema.parse({});

  const scope = getMerchantScopeFilter(user);
  const where = buildScopedMerchantWhere(scope, query);

  const merchants = await prisma.merchant.findMany({
    where,
    include: { client: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const { fromDate, toDate } = getDashboardDateBounds(query.dateWindow);

  return Promise.all(
    merchants.map(async (merchant) => {
      const [qrCount, transactionCount, todayCollection, totalCollection] =
        await Promise.all([
          prisma.qRCode.count({ where: { merchantId: merchant.id } }),
          prisma.transaction.count({ where: { merchantId: merchant.id } }),
          sumSuccessfulCollection({
            merchantId: merchant.id,
            initiatedAt: { gte: startOfDay(new Date()) },
            status: TransactionStatus.SUCCESS,
          }),
          sumSuccessfulCollection({
            merchantId: merchant.id,
            initiatedAt: { gte: new Date(fromDate), lte: new Date(toDate) },
          }),
        ]);

      return {
        ...mapMerchant(merchant),
        clientName: merchant.client.name,
        qrCount,
        transactionCount,
        todayCollection,
        totalCollection,
      };
    })
  );
}

export async function getDashboardData(
  user: SessionUser,
  rawQuery: Partial<DashboardQuery> = {}
): Promise<DashboardData> {
  const parsed = dashboardQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    throw new TransactionServiceError(
      parsed.error.issues[0]?.message ?? "Invalid dashboard query",
      "VALIDATION_ERROR"
    );
  }
  const query = parsed.data;

  const [
    metrics,
    chartData,
    recentTransactions,
    topClients,
    recentMerchants,
    qrOverview,
    merchantOverview,
  ] = await Promise.all([
    getDashboardMetricsForUser(user, query),
    getChartDataForUser(user, query),
    getRecentTransactionsForUser(user, 10, query),
    canAccessClientsList(user)
      ? getTopPerformingClientsForUser(user, 5, query)
      : Promise.resolve([]),
    user.role === "MERCHANT_USER"
      ? Promise.resolve([])
      : getRecentMerchantsForUser(user, 5, query),
    getQrOverviewForUser(user, query),
    getMerchantOverviewForUser(user, query),
  ]);

  return {
    metrics,
    chartData,
    recentTransactions,
    topClients,
    recentMerchants,
    qrOverview,
    merchantOverview,
    query,
  };
}

/** @deprecated Use getDashboardMetricsForUser — kept for reports compatibility */
export async function getDashboardKPIsForUser(user: SessionUser) {
  const metrics = await getDashboardMetricsForUser(user, {
    dateWindow: "today",
    providerMode: "all",
  });
  return {
    totalClients: metrics.totalClients,
    totalMerchants: metrics.totalMerchants,
    activeQrCodes: metrics.activeQrCodes,
    todayTransactions: metrics.totalTransactions,
    todayCollection: metrics.successfulAmount,
    totalCollection: metrics.successfulAmountByProviderMode.mock +
      metrics.successfulAmountByProviderMode.legacy +
      metrics.successfulAmountByProviderMode.live,
  };
}
