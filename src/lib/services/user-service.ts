import { EntityStatus, UserRole, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/lib/auth/types";
import { isSuperAdmin } from "@/lib/auth/types";
import {
  canManageUsers,
  getClientScopeFilter,
  requireClientAccess,
} from "@/lib/auth/authorization";
import { mapUser } from "@/lib/mappers";
import type { UserListQuery } from "@/lib/validations/users";
import type { User } from "@/types";

function uiRoleToPrisma(
  role: UserListQuery["role"]
): UserRole | undefined {
  if (role === "all") return undefined;
  const map: Record<string, UserRole> = {
    super_admin: UserRole.SUPER_ADMIN,
    client_admin: UserRole.CLIENT_ADMIN,
    client_operator: UserRole.CLIENT_OPERATOR,
    merchant_user: UserRole.MERCHANT_USER,
  };
  return map[role];
}

function buildUserWhere(
  actor: SessionUser,
  query: UserListQuery
): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};

  if (!isSuperAdmin(actor)) {
    if (!actor.clientId) {
      return { id: "__none__" };
    }
    where.clientId = actor.clientId;
  } else if (query.clientId) {
    where.clientId = query.clientId;
  }

  if (query.role !== "all") {
    const prismaRole = uiRoleToPrisma(query.role);
    if (prismaRole) where.role = prismaRole;
  }

  if (query.status !== "all") {
    where.status = query.status.toUpperCase() as EntityStatus;
  }

  if (query.search) {
    const q = query.search;
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { id: { contains: q, mode: "insensitive" } },
    ];
  }

  return where;
}

export interface PaginatedUsersResult {
  items: User[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function getUsersPaginated(
  actor: SessionUser,
  query: UserListQuery
): Promise<PaginatedUsersResult> {
  if (!canManageUsers(actor)) {
    return {
      items: [],
      total: 0,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: 0,
    };
  }

  const where = buildUserWhere(actor, query);
  const skip = (query.page - 1) * query.pageSize;

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { name: "asc" },
      skip,
      take: query.pageSize,
    }),
  ]);

  return {
    items: users.map(mapUser),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getUsersByClientIdForUser(
  clientId: string,
  actor: SessionUser
): Promise<User[]> {
  requireClientAccess(actor, clientId);
  const users = await prisma.user.findMany({
    where: { clientId },
    orderBy: { name: "asc" },
  });
  return users.map(mapUser);
}

export async function getUsersByMerchantIdForUser(
  merchantId: string,
  actor: SessionUser
): Promise<User[]> {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
  });
  if (!merchant) return [];

  requireClientAccess(actor, merchant.clientId);

  const users = await prisma.user.findMany({
    where: { merchantId, role: UserRole.MERCHANT_USER },
    orderBy: { name: "asc" },
  });
  return users.map(mapUser);
}

export async function checkEmailDuplicate(
  email: string,
  excludeUserId?: string
): Promise<boolean> {
  const existing = await prisma.user.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
    },
  });
  return Boolean(existing);
}

export async function canActorManageTargetUser(
  actor: SessionUser,
  targetId: string
): Promise<{ allowed: boolean; error?: string; target?: Awaited<ReturnType<typeof prisma.user.findUnique>> }> {
  if (!canManageUsers(actor)) {
    return { allowed: false, error: "Insufficient permissions" };
  }

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) {
    return { allowed: false, error: "User not found" };
  }

  if (target.id === actor.id) {
    return { allowed: false, error: "You cannot manage your own account" };
  }

  if (actor.role === "CLIENT_ADMIN") {
    if (target.role === UserRole.SUPER_ADMIN) {
      return { allowed: false, error: "Cannot manage platform administrators" };
    }
    if (!target.clientId) {
      return { allowed: false, error: "Cannot manage platform users" };
    }
    if (!actor.clientId || target.clientId !== actor.clientId) {
      return { allowed: false, error: "Cannot manage users outside your client" };
    }
    if (target.role === UserRole.CLIENT_ADMIN && target.id !== actor.id) {
      // CLIENT_ADMIN can manage other CLIENT_ADMIN in same client? Spec says manage CLIENT_OPERATOR - allow status change for same client users except super admin
      // Allow managing client_operator and merchant_user; for other client_admin - allow deactivate? Spec: "can manage permitted users only inside own Client" - allow
    }
  }

  return { allowed: true, target };
}

export async function getUserScopeForList(actor: SessionUser) {
  return getClientScopeFilter(actor);
}
