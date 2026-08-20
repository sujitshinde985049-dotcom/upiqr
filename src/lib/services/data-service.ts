import {
  EntityStatus,
  TransactionStatus,
  type Prisma,
} from "@prisma/client";
import { startOfDay, subDays, format } from "date-fns";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/lib/auth/types";
import {
  canAccessClientsList,
  getClientRecordScopeFilter,
  getMerchantScopeFilter,
  requireClientAccess,
  requireMerchantAccess,
  requireAuthenticatedUser,
} from "@/lib/auth/authorization";
import {
  mapClient,
  mapMerchant,
  mapQRCode,
  mapTransaction,
  mapUser,
  decimalToNumber,
} from "@/lib/mappers";
import type {
  ChartDataPoint,
  ClientWithStats,
  DashboardKPIs,
  MerchantWithStats,
  QRCodeWithStats,
  TransactionStatus as UiTransactionStatus,
  TransactionWithRelations,
  User,
} from "@/types";

function todayStart(): Date {
  return startOfDay(new Date());
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

export async function getClientsWithStats(
  user: SessionUser
): Promise<ClientWithStats[]> {
  const scope = getClientRecordScopeFilter(user);
  const clients = await prisma.client.findMany({
    where: scope,
    orderBy: { name: "asc" },
  });

  const enriched = await Promise.all(
    clients.map(async (client) => {
      const [merchants, qrs, allTxns] = await Promise.all([
        prisma.merchant.count({ where: { clientId: client.id } }),
        prisma.qRCode.count({
          where: { clientId: client.id, status: EntityStatus.ACTIVE },
        }),
        prisma.transaction.findMany({
          where: { clientId: client.id },
        }),
      ]);

      const todayCollection = allTxns
        .filter((t) => t.initiatedAt >= todayStart() && t.status === TransactionStatus.SUCCESS)
        .reduce((sum, t) => sum + decimalToNumber(t.amount), 0);

      const totalCollection = allTxns
        .filter((t) => t.status === TransactionStatus.SUCCESS)
        .reduce((sum, t) => sum + decimalToNumber(t.amount), 0);

      return {
        ...mapClient(client),
        totalMerchants: merchants,
        activeQr: qrs,
        todayCollection,
        totalCollection,
      };
    })
  );

  return enriched;
}

export async function getClientByIdForUser(id: string, user: SessionUser) {
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) return null;
  requireClientAccess(user, client.id);
  return mapClient(client);
}

export async function getClientStatsForUser(clientId: string, user: SessionUser) {
  requireClientAccess(user, clientId);
  const [totalMerchants, activeMerchants, activeQrs, todayTxns] =
    await Promise.all([
      prisma.merchant.count({ where: { clientId } }),
      prisma.merchant.count({
        where: { clientId, status: EntityStatus.ACTIVE },
      }),
      prisma.qRCode.count({
        where: { clientId, status: EntityStatus.ACTIVE },
      }),
      prisma.transaction.count({
        where: { clientId, initiatedAt: { gte: todayStart() } },
      }),
    ]);

  const todayCollection = await sumSuccessfulCollection({
    clientId,
    initiatedAt: { gte: todayStart() },
  });
  const totalCollection = await sumSuccessfulCollection({ clientId });

  return {
    totalMerchants,
    activeMerchants,
    activeQrs,
    todayTransactions: todayTxns,
    todayCollection,
    totalCollection,
  };
}

export async function getMerchantsWithStats(
  user: SessionUser
): Promise<MerchantWithStats[]> {
  const scope = getMerchantScopeFilter(user);
  const merchants = await prisma.merchant.findMany({
    where: scope,
    include: { client: true },
    orderBy: { businessName: "asc" },
  });

  return Promise.all(
    merchants.map(async (merchant) => {
      const [qrCount, transactionCount, todayCollection, totalCollection] =
        await Promise.all([
        prisma.qRCode.count({ where: { merchantId: merchant.id } }),
        prisma.transaction.count({ where: { merchantId: merchant.id } }),
        sumSuccessfulCollection({
          merchantId: merchant.id,
          initiatedAt: { gte: todayStart() },
        }),
        sumSuccessfulCollection({ merchantId: merchant.id }),
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

export async function getMerchantByIdForUser(id: string, user: SessionUser) {
  const merchant = await prisma.merchant.findUnique({
    where: { id },
    include: { client: true },
  });
  if (!merchant) return null;
  await requireMerchantAccess(user, merchant.id, merchant.clientId);
  return { ...mapMerchant(merchant), clientName: merchant.client.name };
}

export async function getMerchantStatsForUser(
  merchantId: string,
  user: SessionUser
) {
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) return null;
  await requireMerchantAccess(user, merchant.id, merchant.clientId);

  const [activeQrCodes, todayTransactions, todayCollection, totalCollection] =
    await Promise.all([
      prisma.qRCode.count({
        where: { merchantId, status: EntityStatus.ACTIVE },
      }),
      prisma.transaction.count({
        where: { merchantId, initiatedAt: { gte: todayStart() } },
      }),
      sumSuccessfulCollection({
        merchantId,
        initiatedAt: { gte: todayStart() },
      }),
      sumSuccessfulCollection({ merchantId }),
    ]);

  return {
    activeQrCodes,
    todayTransactions,
    todayCollection,
    totalCollection,
  };
}

export async function getMerchantsByClientIdForUser(
  clientId: string,
  user: SessionUser
) {
  requireClientAccess(user, clientId);
  const merchants = await prisma.merchant.findMany({
    where: { clientId },
    orderBy: { businessName: "asc" },
  });
  return merchants.map((m) => mapMerchant(m));
}

export async function getQRCodesWithStats(
  user: SessionUser
): Promise<QRCodeWithStats[]> {
  const scope = getMerchantScopeFilter(user);
  const qrs = await prisma.qRCode.findMany({
    where: scope,
    include: { client: true, merchant: true },
    orderBy: { createdAt: "desc" },
  });

  return Promise.all(
    qrs.map(async (qr) => {
      const [transactionCount, collection] = await Promise.all([
        prisma.transaction.count({ where: { qrId: qr.id } }),
        sumSuccessfulCollection({ qrId: qr.id }),
      ]);

      return {
        ...mapQRCode(qr),
        merchantName: qr.merchant.businessName,
        clientName: qr.client.name,
        transactionCount,
        collection,
      };
    })
  );
}

export async function getQRCodeByIdForUser(id: string, user: SessionUser) {
  const qr = await prisma.qRCode.findUnique({
    where: { id },
    include: { client: true, merchant: true },
  });
  if (!qr) return null;
  await requireMerchantAccess(user, qr.merchantId, qr.clientId);
  return {
    ...mapQRCode(qr),
    merchantName: qr.merchant.businessName,
    clientName: qr.client.name,
  };
}

export async function getQRCodesByClientIdForUser(
  clientId: string,
  user: SessionUser
) {
  requireClientAccess(user, clientId);
  const qrs = await prisma.qRCode.findMany({
    where: { clientId },
    include: { client: true, merchant: true },
  });
  return qrs.map((qr) => ({
    ...mapQRCode(qr),
    merchantName: qr.merchant.businessName,
    clientName: qr.client.name,
  }));
}

export async function getQRCodesByMerchantIdForUser(
  merchantId: string,
  user: SessionUser
) {
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) return [];
  await requireMerchantAccess(user, merchantId, merchant.clientId);
  const qrs = await prisma.qRCode.findMany({
    where: { merchantId },
    include: { client: true, merchant: true },
  });
  return qrs.map((qr) => ({
    ...mapQRCode(qr),
    merchantName: qr.merchant.businessName,
    clientName: qr.client.name,
  }));
}

export async function getQRStatsForUser(qrId: string, user: SessionUser) {
  const qr = await prisma.qRCode.findUnique({ where: { id: qrId } });
  if (!qr) return null;
  await requireMerchantAccess(user, qr.merchantId, qr.clientId);

  const transactions = await prisma.transaction.findMany({ where: { qrId } });
  return {
    total: transactions.length,
    successful: transactions.filter((t) => t.status === TransactionStatus.SUCCESS).length,
    failed: transactions.filter((t) => t.status === TransactionStatus.FAILED).length,
    pending: transactions.filter((t) => t.status === TransactionStatus.PENDING).length,
    collection: transactions
      .filter((t) => t.status === TransactionStatus.SUCCESS)
      .reduce((sum, t) => sum + decimalToNumber(t.amount), 0),
  };
}

export async function getTransactionsWithRelations(
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
    if (merchant) await requireMerchantAccess(user, merchant.id, merchant.clientId);
    where.merchantId = filters.merchantId;
  }
  if (filters?.qrId) where.qrId = filters.qrId;
  if (filters?.status) {
    where.status = filters.status.toUpperCase() as TransactionStatus;
  }
  if (filters?.search) {
    const q = filters.search;
    where.OR = [
      { transactionId: { contains: q, mode: "insensitive" } },
      { customerVpa: { contains: q, mode: "insensitive" } },
      { bankReferenceNumber: { contains: q, mode: "insensitive" } },
    ];
  }
  if (filters?.dateFrom) {
    where.initiatedAt = { ...(where.initiatedAt as object), gte: new Date(filters.dateFrom) };
  }
  if (filters?.dateTo) {
    where.initiatedAt = { ...(where.initiatedAt as object), lte: new Date(filters.dateTo) };
  }

  const transactions = await prisma.transaction.findMany({
    where,
    include: {
      client: true,
      merchant: true,
      qrCode: true,
    },
    orderBy: { initiatedAt: "desc" },
  });

  return transactions.map((t) => ({
    ...mapTransaction(t),
    merchantName: t.merchant.businessName,
    clientName: t.client.name,
    qrName: t.qrCode.qrName,
    qrIdentifier: t.qrCode.qrIdentifier,
  }));
}

export async function getTransactionsByQRIdForUser(
  qrId: string,
  user: SessionUser
) {
  const qr = await prisma.qRCode.findUnique({ where: { id: qrId } });
  if (!qr) return [];
  await requireMerchantAccess(user, qr.merchantId, qr.clientId);

  const transactions = await prisma.transaction.findMany({
    where: { qrId },
    include: { client: true, merchant: true, qrCode: true },
    orderBy: { initiatedAt: "desc" },
  });

  return transactions.map((t) => ({
    ...mapTransaction(t),
    merchantName: t.merchant.businessName,
    clientName: t.client.name,
    qrName: t.qrCode.qrName,
    qrIdentifier: t.qrCode.qrIdentifier,
  }));
}

export async function getDashboardKPIsForUser(
  user: SessionUser
): Promise<DashboardKPIs> {
  const scope = getMerchantScopeFilter(user);

  const [
    totalClients,
    totalMerchants,
    activeQrCodes,
    todayTransactions,
    todayCollection,
    totalCollection,
  ] = await Promise.all([
    canAccessClientsList(user)
      ? prisma.client.count({ where: { status: EntityStatus.ACTIVE } })
      : Promise.resolve(scope.clientId ? 1 : 0),
    prisma.merchant.count({
      where: { ...scope, status: EntityStatus.ACTIVE },
    }),
    prisma.qRCode.count({
      where: { ...scope, status: EntityStatus.ACTIVE },
    }),
    prisma.transaction.count({
      where: { ...scope, initiatedAt: { gte: todayStart() } },
    }),
    sumSuccessfulCollection({
      ...scope,
      initiatedAt: { gte: todayStart() },
    }),
    sumSuccessfulCollection(scope),
  ]);

  return {
    totalClients,
    totalMerchants,
    activeQrCodes,
    todayTransactions,
    todayCollection,
    totalCollection,
  };
}

export async function getChartDataForUser(
  user: SessionUser,
  period: "today" | "7days" | "30days"
): Promise<ChartDataPoint[]> {
  const scope = getMerchantScopeFilter(user);
  const days = period === "today" ? 1 : period === "7days" ? 7 : 30;
  const data: ChartDataPoint[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = subDays(new Date(), i);
    const dateStr = format(date, "yyyy-MM-dd");
    const dayStart = startOfDay(date);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const dayTxns = await prisma.transaction.findMany({
      where: {
        ...scope,
        status: TransactionStatus.SUCCESS,
        initiatedAt: { gte: dayStart, lt: dayEnd },
      },
    });

    data.push({
      date: dateStr,
      label: period === "today" ? format(date, "hh a") : format(date, "dd MMM"),
      amount: dayTxns.reduce((sum, t) => sum + decimalToNumber(t.amount), 0),
      count: dayTxns.length,
    });
  }

  return data;
}

export async function getTopPerformingClientsForUser(
  user: SessionUser,
  limit = 5
) {
  if (!canAccessClientsList(user)) {
    if (!user.clientId) return [];
    const stats = await getClientStatsForUser(user.clientId, user);
    const client = await prisma.client.findUnique({ where: { id: user.clientId } });
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

  const clients = await getClientsWithStats(user);
  return clients
    .filter((c) => c.status === "active")
    .sort((a, b) => b.totalCollection - a.totalCollection)
    .slice(0, limit);
}

export async function getRecentMerchantsForUser(user: SessionUser, limit = 5) {
  const scope = getMerchantScopeFilter(user);
  const merchants = await prisma.merchant.findMany({
    where: scope,
    include: { client: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return Promise.all(
    merchants.map(async (merchant) => {
      const [qrCount, transactionCount, todayCollection, totalCollection] =
        await Promise.all([
        prisma.qRCode.count({ where: { merchantId: merchant.id } }),
        prisma.transaction.count({ where: { merchantId: merchant.id } }),
        sumSuccessfulCollection({
          merchantId: merchant.id,
          initiatedAt: { gte: todayStart() },
        }),
        sumSuccessfulCollection({ merchantId: merchant.id }),
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

export async function getRecentTransactionsForUser(user: SessionUser, limit = 10) {
  const txns = await getTransactionsWithRelations(user);
  return txns.slice(0, limit);
}

export async function getUsersForUser(user: SessionUser): Promise<User[]> {
  if (user.role === "SUPER_ADMIN") {
    const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
    return users.map(mapUser);
  }

  if (user.role === "CLIENT_ADMIN" && user.clientId) {
    const users = await prisma.user.findMany({
      where: { clientId: user.clientId },
      orderBy: { name: "asc" },
    });
    return users.map(mapUser);
  }

  return [];
}

export async function getClientsForSelectors(user: SessionUser) {
  const clients = await prisma.client.findMany({
    where: {
      ...getClientRecordScopeFilter(user),
      status: EntityStatus.ACTIVE,
    },
    orderBy: { name: "asc" },
  });
  return clients.map(mapClient);
}

export async function getMerchantsForSelectors(
  user: SessionUser,
  clientId?: string
) {
  const scope = getMerchantScopeFilter(user);
  const where: Prisma.MerchantWhereInput = {
    ...scope,
    status: EntityStatus.ACTIVE,
  };
  if (clientId) {
    requireClientAccess(user, clientId);
    where.clientId = clientId;
  }
  const merchants = await prisma.merchant.findMany({
    where,
    orderBy: { businessName: "asc" },
  });
  return merchants.map((m) => mapMerchant(m));
}

export async function getAuthenticatedContext() {
  return requireAuthenticatedUser();
}
