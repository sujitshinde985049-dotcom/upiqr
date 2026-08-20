import {
  EntityStatus,
  TransactionStatus,
  type Prisma,
} from "@prisma/client";
import { startOfDay } from "date-fns";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/lib/auth/types";
import { isSuperAdmin } from "@/lib/auth/types";
import { getMerchantScopeFilter } from "@/lib/auth/authorization";
import { mapMerchant, decimalToNumber } from "@/lib/mappers";
import type { MerchantListQuery } from "@/lib/validations/merchants";
import type { MerchantWithStats } from "@/types";

function todayStart(): Date {
  return startOfDay(new Date());
}

function buildMerchantOrderBy(
  sort: MerchantListQuery["sort"]
): Prisma.MerchantOrderByWithRelationInput {
  switch (sort) {
    case "oldest":
      return { createdAt: "asc" };
    case "name_asc":
      return { businessName: "asc" };
    case "name_desc":
      return { businessName: "desc" };
    case "newest":
    default:
      return { createdAt: "desc" };
  }
}

function buildMerchantWhere(
  user: SessionUser,
  query: MerchantListQuery
): Prisma.MerchantWhereInput {
  const scope = getMerchantScopeFilter(user);
  const where: Prisma.MerchantWhereInput = { ...scope };

  if (query.status !== "all") {
    where.status = query.status.toUpperCase() as EntityStatus;
  }

  if (query.clientId && isSuperAdmin(user)) {
    where.clientId = query.clientId;
  }

  if (query.category) {
    where.merchantCategory = {
      equals: query.category,
      mode: "insensitive",
    };
  }

  if (query.search) {
    const q = query.search;
    where.OR = [
      { merchantCode: { contains: q, mode: "insensitive" } },
      { businessName: { contains: q, mode: "insensitive" } },
      { accountHolderName: { contains: q, mode: "insensitive" } },
      { mobile: { contains: q } },
      { pan: { contains: q, mode: "insensitive" } },
      { gstNumber: { contains: q, mode: "insensitive" } },
    ];
  }

  return where;
}

async function enrichMerchantWithStats(
  merchant: Parameters<typeof mapMerchant>[0] & {
    client: { name: string };
  }
): Promise<MerchantWithStats> {
  const [qrCount, allTxns, transactionCount] = await Promise.all([
    prisma.qRCode.count({
      where: { merchantId: merchant.id, status: EntityStatus.ACTIVE },
    }),
    prisma.transaction.findMany({ where: { merchantId: merchant.id } }),
    prisma.transaction.count({ where: { merchantId: merchant.id } }),
  ]);

  const todayCollection = allTxns
    .filter(
      (t) =>
        t.initiatedAt >= todayStart() && t.status === TransactionStatus.SUCCESS
    )
    .reduce((sum, t) => sum + decimalToNumber(t.amount), 0);

  const totalCollection = allTxns
    .filter((t) => t.status === TransactionStatus.SUCCESS)
    .reduce((sum, t) => sum + decimalToNumber(t.amount), 0);

  return {
    ...mapMerchant(merchant),
    clientName: merchant.client.name,
    qrCount,
    transactionCount,
    todayCollection,
    totalCollection,
  };
}

export interface PaginatedMerchantsResult {
  items: MerchantWithStats[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  categories: string[];
}

export async function getMerchantsPaginated(
  user: SessionUser,
  query: MerchantListQuery
): Promise<PaginatedMerchantsResult> {
  const where = buildMerchantWhere(user, query);
  const skip = (query.page - 1) * query.pageSize;

  const [total, merchants, categoryRows] = await Promise.all([
    prisma.merchant.count({ where }),
    prisma.merchant.findMany({
      where,
      include: { client: true },
      orderBy: buildMerchantOrderBy(query.sort),
      skip,
      take: query.pageSize,
    }),
    prisma.merchant.findMany({
      where: getMerchantScopeFilter(user),
      select: { merchantCategory: true },
      distinct: ["merchantCategory"],
    }),
  ]);

  const items = await Promise.all(merchants.map(enrichMerchantWithStats));

  const categories = categoryRows
    .map((r) => r.merchantCategory)
    .filter((c): c is string => Boolean(c))
    .sort();

  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    categories,
  };
}

export async function checkMerchantDuplicates(
  clientId: string,
  data: {
    currentAccountReference: string;
    businessName: string;
    mobile: string;
    pan?: string;
    gstNumber?: string;
  },
  excludeMerchantId?: string
): Promise<string | null> {
  const existingByAccount = await prisma.merchant.findFirst({
    where: {
      clientId,
      currentAccountReference: data.currentAccountReference,
      ...(excludeMerchantId ? { NOT: { id: excludeMerchantId } } : {}),
    },
  });
  if (existingByAccount) {
    return "A merchant with this current account reference already exists for this Bank/Patsanstha";
  }

  if (data.pan) {
    const existingByPan = await prisma.merchant.findFirst({
      where: {
        pan: data.pan,
        ...(excludeMerchantId ? { NOT: { id: excludeMerchantId } } : {}),
      },
    });
    if (existingByPan) {
      return "A merchant with this PAN already exists";
    }
  }

  if (data.gstNumber) {
    const existingByGst = await prisma.merchant.findFirst({
      where: {
        gstNumber: data.gstNumber,
        ...(excludeMerchantId ? { NOT: { id: excludeMerchantId } } : {}),
      },
    });
    if (existingByGst) {
      return "A merchant with this GST number already exists";
    }
  }

  const existingByMobile = await prisma.merchant.findFirst({
    where: {
      clientId,
      mobile: data.mobile,
      ...(excludeMerchantId ? { NOT: { id: excludeMerchantId } } : {}),
    },
  });
  if (existingByMobile) {
    return "A merchant with this mobile number already exists for this Bank/Patsanstha";
  }

  const existingByName = await prisma.merchant.findFirst({
    where: {
      clientId,
      businessName: { equals: data.businessName, mode: "insensitive" },
      ...(excludeMerchantId ? { NOT: { id: excludeMerchantId } } : {}),
    },
  });
  if (existingByName) {
    return "A merchant with this business name already exists for this Bank/Patsanstha";
  }

  return null;
}

export async function getMerchantAuditLogs(merchantId: string) {
  return prisma.auditLog.findMany({
    where: { entityType: "Merchant", entityId: merchantId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      user: { select: { name: true, email: true } },
    },
  });
}

export async function getMerchantCategoriesForUser(
  user: SessionUser
): Promise<string[]> {
  const scope = getMerchantScopeFilter(user);
  const rows = await prisma.merchant.findMany({
    where: scope,
    select: { merchantCategory: true },
    distinct: ["merchantCategory"],
  });
  return rows
    .map((r) => r.merchantCategory)
    .filter((c): c is string => Boolean(c))
    .sort();
}
