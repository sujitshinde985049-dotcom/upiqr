import {
  QRProviderMode,
  TransactionStatus,
  type Prisma,
} from "@prisma/client";
import {
  AuthError,
  canAccessClientsList,
  getClientRecordScopeFilter,
} from "@/lib/auth/authorization";
import type { SessionUser } from "@/lib/auth/types";
import { decimalToNumber } from "@/lib/mappers";
import { getChartDataForUser, getDashboardDateBounds } from "@/lib/services/dashboard-service";
import {
  buildManagedTransactionWhere,
  computeSummaryMetrics,
  listManagedTransactions,
} from "@/lib/services/transaction-management-service";
import { TransactionServiceError } from "@/lib/services/transaction-service";
import {
  reportsQuerySchema,
  type ReportsQuery,
} from "@/lib/validations/reports";
import type { TransactionManagementFilters } from "@/lib/validations/transactions";
import type {
  ChartDataPoint,
  ClientReportRow,
  ManagedTransactionListResult,
  MerchantReportRow,
  ProviderModeBreakdownRow,
  QrReportRow,
  ReportsData,
  TransactionSummaryMetrics,
} from "@/types";
import { endOfDay, startOfDay } from "date-fns";
import { prisma } from "@/lib/db/prisma";

export const MERCHANT_REPORT_LIMIT = 50;
export const QR_REPORT_LIMIT = 50;

const EMPTY_SUMMARY: TransactionSummaryMetrics = {
  total: 0,
  successful: 0,
  pending: 0,
  failed: 0,
  successfulAmount: 0,
  successfulAmountByProviderMode: { mock: 0, legacy: 0, live: 0 },
};

export function resolveReportsDateBounds(query: ReportsQuery): {
  fromDate: string;
  toDate: string;
} {
  if (query.dateWindow === "custom") {
    if (!query.fromDate || !query.toDate) {
      throw new TransactionServiceError(
        "Custom date range requires fromDate and toDate",
        "VALIDATION_ERROR"
      );
    }
    return {
      fromDate: startOfDay(new Date(query.fromDate)).toISOString(),
      toDate: endOfDay(new Date(query.toDate)).toISOString(),
    };
  }

  return getDashboardDateBounds(query.dateWindow);
}

export function toReportsManagementFilters(
  query: ReportsQuery
): TransactionManagementFilters {
  const { fromDate, toDate } = resolveReportsDateBounds(query);
  return {
    search: query.search,
    status: query.status,
    clientId: query.clientId,
    merchantId: query.merchantId,
    qrId: query.qrId,
    providerMode: query.providerMode,
    fromDate,
    toDate,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  };
}

function toDashboardChartQuery(query: ReportsQuery) {
  const dateWindow =
    query.dateWindow === "custom" ? ("30days" as const) : query.dateWindow;
  return {
    dateWindow,
    providerMode: query.providerMode,
    clientId: query.clientId,
    merchantId: query.merchantId,
  };
}

async function getProviderModeBreakdown(
  where: Prisma.TransactionWhereInput
): Promise<ProviderModeBreakdownRow[]> {
  const [statusGroups, successGroups] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["providerMode", "status"],
      where,
      _count: true,
    }),
    prisma.transaction.groupBy({
      by: ["providerMode"],
      where: { ...where, status: TransactionStatus.SUCCESS },
      _sum: { amount: true },
    }),
  ]);

  const modes: QRProviderMode[] = [
    QRProviderMode.MOCK,
    QRProviderMode.LEGACY,
    QRProviderMode.LIVE,
  ];

  return modes.map((mode) => {
    const total = statusGroups
      .filter((row) => row.providerMode === mode)
      .reduce((sum, row) => sum + row._count, 0);
    const successful =
      statusGroups.find(
        (row) =>
          row.providerMode === mode && row.status === TransactionStatus.SUCCESS
      )?._count ?? 0;
    const pending =
      statusGroups.find(
        (row) =>
          row.providerMode === mode && row.status === TransactionStatus.PENDING
      )?._count ?? 0;
    const failed =
      statusGroups.find(
        (row) =>
          row.providerMode === mode && row.status === TransactionStatus.FAILED
      )?._count ?? 0;
    const successRow = successGroups.find((row) => row.providerMode === mode);

    return {
      providerMode: mode.toLowerCase() as "mock" | "legacy" | "live",
      total,
      successful,
      pending,
      failed,
      successfulAmount: successRow?._sum.amount
        ? decimalToNumber(successRow._sum.amount)
        : 0,
    };
  });
}

async function getMerchantReportRows(
  user: SessionUser,
  filters: TransactionManagementFilters
): Promise<MerchantReportRow[]> {
  if (user.role === "MERCHANT_USER") {
    return [];
  }

  let where: Prisma.TransactionWhereInput;
  try {
    where = await buildManagedTransactionWhere(user, filters);
  } catch (error) {
    if (error instanceof AuthError) return [];
    throw error;
  }

  const [statusGroups, successGroups] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["merchantId", "status"],
      where,
      _count: true,
    }),
    prisma.transaction.groupBy({
      by: ["merchantId"],
      where: { ...where, status: TransactionStatus.SUCCESS },
      _sum: { amount: true },
    }),
  ]);

  const merchantIds = [
    ...new Set(statusGroups.map((row) => row.merchantId)),
  ].slice(0, MERCHANT_REPORT_LIMIT);

  if (merchantIds.length === 0) return [];

  const merchants = await prisma.merchant.findMany({
    where: { id: { in: merchantIds } },
    include: { client: true },
  });

  return merchants
    .map((merchant) => {
      const total = statusGroups
        .filter((row) => row.merchantId === merchant.id)
        .reduce((sum, row) => sum + row._count, 0);
      const successful =
        statusGroups.find(
          (row) =>
            row.merchantId === merchant.id &&
            row.status === TransactionStatus.SUCCESS
        )?._count ?? 0;
      const pending =
        statusGroups.find(
          (row) =>
            row.merchantId === merchant.id &&
            row.status === TransactionStatus.PENDING
        )?._count ?? 0;
      const failed =
        statusGroups.find(
          (row) =>
            row.merchantId === merchant.id &&
            row.status === TransactionStatus.FAILED
        )?._count ?? 0;
      const successRow = successGroups.find(
        (row) => row.merchantId === merchant.id
      );

      return {
        id: merchant.id,
        merchantId: merchant.id,
        merchantName: merchant.businessName,
        merchantCode: merchant.merchantCode,
        clientName: merchant.client.name,
        total,
        successful,
        pending,
        failed,
        successfulAmount: successRow?._sum.amount
          ? decimalToNumber(successRow._sum.amount)
          : 0,
      };
    })
    .sort((a, b) => b.successfulAmount - a.successfulAmount);
}

async function getQrReportRows(
  user: SessionUser,
  filters: TransactionManagementFilters
): Promise<QrReportRow[]> {
  let where: Prisma.TransactionWhereInput;
  try {
    where = await buildManagedTransactionWhere(user, filters);
  } catch (error) {
    if (error instanceof AuthError) return [];
    throw error;
  }

  const [statusGroups, successGroups] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["qrId", "status"],
      where,
      _count: true,
    }),
    prisma.transaction.groupBy({
      by: ["qrId"],
      where: { ...where, status: TransactionStatus.SUCCESS },
      _sum: { amount: true },
    }),
  ]);

  const qrIds = [...new Set(statusGroups.map((row) => row.qrId))].slice(
    0,
    QR_REPORT_LIMIT
  );
  if (qrIds.length === 0) return [];

  const qrCodes = await prisma.qRCode.findMany({
    where: { id: { in: qrIds } },
    include: { merchant: true },
  });

  return qrCodes
    .map((qr) => {
      const total = statusGroups
        .filter((row) => row.qrId === qr.id)
        .reduce((sum, row) => sum + row._count, 0);
      const successful =
        statusGroups.find(
          (row) =>
            row.qrId === qr.id && row.status === TransactionStatus.SUCCESS
        )?._count ?? 0;
      const successRow = successGroups.find((row) => row.qrId === qr.id);

      return {
        id: qr.id,
        qrId: qr.id,
        qrName: qr.qrName,
        qrIdentifier: qr.qrIdentifier,
        merchantName: qr.merchant.businessName,
        providerMode: qr.providerMode.toLowerCase() as "mock" | "legacy" | "live",
        total,
        successful,
        successfulAmount: successRow?._sum.amount
          ? decimalToNumber(successRow._sum.amount)
          : 0,
      };
    })
    .sort((a, b) => b.successfulAmount - a.successfulAmount);
}

async function getClientReportRows(
  user: SessionUser,
  filters: TransactionManagementFilters
): Promise<ClientReportRow[]> {
  if (!canAccessClientsList(user) && !user.clientId) {
    return [];
  }

  let where: Prisma.TransactionWhereInput;
  try {
    where = await buildManagedTransactionWhere(user, filters);
  } catch (error) {
    if (error instanceof AuthError) return [];
    throw error;
  }

  const [statusGroups, successGroups] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["clientId", "status"],
      where,
      _count: true,
    }),
    prisma.transaction.groupBy({
      by: ["clientId"],
      where: { ...where, status: TransactionStatus.SUCCESS },
      _sum: { amount: true },
    }),
  ]);

  const clientScope = getClientRecordScopeFilter(user);
  const clients = await prisma.client.findMany({
    where: clientScope,
    orderBy: { name: "asc" },
  });

  return clients
    .map((client) => {
      const total = statusGroups
        .filter((row) => row.clientId === client.id)
        .reduce((sum, row) => sum + row._count, 0);
      const successful =
        statusGroups.find(
          (row) =>
            row.clientId === client.id &&
            row.status === TransactionStatus.SUCCESS
        )?._count ?? 0;
      const pending =
        statusGroups.find(
          (row) =>
            row.clientId === client.id &&
            row.status === TransactionStatus.PENDING
        )?._count ?? 0;
      const failed =
        statusGroups.find(
          (row) =>
            row.clientId === client.id && row.status === TransactionStatus.FAILED
        )?._count ?? 0;
      const successRow = successGroups.find((row) => row.clientId === client.id);

      return {
        id: client.id,
        clientId: client.id,
        clientName: client.name,
        clientCode: client.clientCode,
        total,
        successful,
        pending,
        failed,
        successfulAmount: successRow?._sum.amount
          ? decimalToNumber(successRow._sum.amount)
          : 0,
      };
    })
    .filter((row) => row.total > 0 || canAccessClientsList(user))
    .sort((a, b) => b.successfulAmount - a.successfulAmount);
}

async function getReportsChartData(
  user: SessionUser,
  query: ReportsQuery
): Promise<ChartDataPoint[]> {
  if (query.dateWindow === "custom") {
    const filters = toReportsManagementFilters(query);
    let where: Prisma.TransactionWhereInput;
    try {
      where = await buildManagedTransactionWhere(user, filters);
    } catch (error) {
      if (error instanceof AuthError) return [];
      throw error;
    }

    const from = startOfDay(new Date(filters.fromDate!));
    const to = endOfDay(new Date(filters.toDate!));
    const days =
      Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    const cappedDays = Math.min(days, 90);
    const data: ChartDataPoint[] = [];

    for (let i = 0; i < cappedDays; i++) {
      const dayStart = new Date(from);
      dayStart.setDate(dayStart.getDate() + i);
      const dayEnd = endOfDay(dayStart);
      if (dayStart > to) break;

      const aggregate = await prisma.transaction.aggregate({
        where: {
          ...where,
          status: TransactionStatus.SUCCESS,
          initiatedAt: { gte: startOfDay(dayStart), lte: dayEnd },
        },
        _sum: { amount: true },
        _count: true,
      });

      data.push({
        date: dayStart.toISOString().slice(0, 10),
        label: dayStart.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
        }),
        amount: aggregate._sum.amount
          ? decimalToNumber(aggregate._sum.amount)
          : 0,
        count: aggregate._count,
      });
    }

    return data;
  }

  return getChartDataForUser(user, toDashboardChartQuery(query));
}

export async function getReportsData(
  user: SessionUser,
  rawQuery: Partial<ReportsQuery> = {}
): Promise<ReportsData> {
  const parsed = reportsQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    throw new TransactionServiceError(
      parsed.error.issues[0]?.message ?? "Invalid reports query",
      "VALIDATION_ERROR"
    );
  }

  const query = parsed.data;
  const filters = toReportsManagementFilters(query);

  let summary: TransactionSummaryMetrics = EMPTY_SUMMARY;
  let transactions: ManagedTransactionListResult = {
    items: [],
    pagination: { total: 0, page: query.page, limit: query.limit, totalPages: 0 },
    summary: EMPTY_SUMMARY,
  };

  try {
    const where = await buildManagedTransactionWhere(user, filters);
    summary = await computeSummaryMetrics(where);
    transactions = await listManagedTransactions(user, {
      ...filters,
      page: query.page,
      limit: query.limit,
    });
  } catch (error) {
    if (!(error instanceof AuthError)) {
      throw error;
    }
  }

  const [chartData, providerModeBreakdown, merchantRows, qrRows, clientRows] =
    await Promise.all([
      getReportsChartData(user, query),
      buildManagedTransactionWhere(user, filters)
        .then((where) => getProviderModeBreakdown(where))
        .catch((error) => {
          if (error instanceof AuthError) return [];
          throw error;
        }),
      getMerchantReportRows(user, filters),
      getQrReportRows(user, filters),
      getClientReportRows(user, filters),
    ]);

  return {
    summary,
    chartData,
    providerModeBreakdown,
    merchantRows,
    qrRows,
    clientRows,
    transactions,
    query,
  };
}
