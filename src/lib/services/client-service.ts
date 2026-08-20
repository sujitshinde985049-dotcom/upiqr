import { ClientType, EntityStatus, TransactionStatus, type Prisma } from "@prisma/client";
import { startOfDay } from "date-fns";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/lib/auth/types";
import { canAccessClientsList, getClientRecordScopeFilter } from "@/lib/auth/authorization";
import { mapClient, decimalToNumber } from "@/lib/mappers";
import type { ClientListQuery } from "@/lib/validations/clients";
import type { ClientWithStats } from "@/types";

function todayStart(): Date {
  return startOfDay(new Date());
}

function buildClientWhere(
  user: SessionUser,
  query: ClientListQuery
): Prisma.ClientWhereInput {
  const scope = getClientRecordScopeFilter(user);
  const where: Prisma.ClientWhereInput = { ...scope };

  if (query.type !== "all") {
    where.type = query.type === "bank" ? ClientType.BANK : ClientType.PATSANSTHA;
  }

  if (query.status !== "all") {
    where.status = query.status.toUpperCase() as EntityStatus;
  }

  if (query.search) {
    const q = query.search;
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { clientCode: { contains: q, mode: "insensitive" } },
      { contactPerson: { contains: q, mode: "insensitive" } },
      { registrationNumber: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { mobile: { contains: q } },
    ];
  }

  return where;
}

async function enrichClientWithStats(
  client: Parameters<typeof mapClient>[0]
): Promise<ClientWithStats> {
  const [totalMerchants, activeQr, allTxns] = await Promise.all([
    prisma.merchant.count({ where: { clientId: client.id } }),
    prisma.qRCode.count({
      where: { clientId: client.id, status: EntityStatus.ACTIVE },
    }),
    prisma.transaction.findMany({ where: { clientId: client.id } }),
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
    ...mapClient(client),
    totalMerchants,
    activeQr,
    todayCollection,
    totalCollection,
  };
}

export interface PaginatedClientsResult {
  items: ClientWithStats[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function getClientsPaginated(
  user: SessionUser,
  query: ClientListQuery
): Promise<PaginatedClientsResult> {
  if (!canAccessClientsList(user)) {
    return {
      items: [],
      total: 0,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: 0,
    };
  }

  const where = buildClientWhere(user, query);
  const skip = (query.page - 1) * query.pageSize;

  const [total, clients] = await Promise.all([
    prisma.client.count({ where }),
    prisma.client.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: query.pageSize,
    }),
  ]);

  const items = await Promise.all(clients.map(enrichClientWithStats));

  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function checkClientDuplicates(
  data: {
    name: string;
    type: "bank" | "patsanstha";
    registrationNumber: string;
  },
  excludeClientId?: string
): Promise<string | null> {
  const prismaType = data.type === "bank" ? ClientType.BANK : ClientType.PATSANSTHA;

  const existingByReg = await prisma.client.findFirst({
    where: {
      registrationNumber: data.registrationNumber,
      ...(excludeClientId ? { NOT: { id: excludeClientId } } : {}),
    },
  });
  if (existingByReg) {
    return "A client with this registration number already exists";
  }

  const existingByName = await prisma.client.findFirst({
    where: {
      name: { equals: data.name, mode: "insensitive" },
      type: prismaType,
      ...(excludeClientId ? { NOT: { id: excludeClientId } } : {}),
    },
  });
  if (existingByName) {
    return "A client with this institution name and type already exists";
  }

  return null;
}
