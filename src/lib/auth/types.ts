import type { UserRole as PrismaUserRole } from "@prisma/client";
import type { UserRole } from "@/types";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: PrismaUserRole;
  clientId: string | null;
  merchantId: string | null;
}

export function toUiUserRole(role: PrismaUserRole): UserRole {
  const map: Record<PrismaUserRole, UserRole> = {
    SUPER_ADMIN: "super_admin",
    CLIENT_ADMIN: "client_admin",
    CLIENT_OPERATOR: "client_operator",
    MERCHANT_USER: "merchant_user",
  };
  return map[role];
}

export function isSuperAdmin(user: SessionUser): boolean {
  return user.role === "SUPER_ADMIN";
}

export function isClientUser(user: SessionUser): boolean {
  return user.role === "CLIENT_ADMIN" || user.role === "CLIENT_OPERATOR";
}

export function isMerchantUser(user: SessionUser): boolean {
  return user.role === "MERCHANT_USER";
}
