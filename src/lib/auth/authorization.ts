import { auth } from "@/auth";
import type { SessionUser } from "@/lib/auth/types";
import { isSuperAdmin } from "@/lib/auth/types";
import type { UserRole as PrismaUserRole } from "@prisma/client";

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND"
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export async function requireAuthenticatedUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AuthError("Authentication required", "UNAUTHORIZED");
  }

  return {
    id: session.user.id,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
    role: session.user.role,
    clientId: session.user.clientId ?? null,
    merchantId: session.user.merchantId ?? null,
  };
}

export function requireRole(
  user: SessionUser,
  allowedRoles: SessionUser["role"][]
): void {
  if (!allowedRoles.includes(user.role)) {
    throw new AuthError("Insufficient permissions", "FORBIDDEN");
  }
}

export function requireClientAccess(
  user: SessionUser,
  clientId: string
): void {
  if (isSuperAdmin(user)) return;

  if (!user.clientId || user.clientId !== clientId) {
    throw new AuthError("Access to this client is not permitted", "FORBIDDEN");
  }
}

export async function requireMerchantAccess(
  user: SessionUser,
  merchantId: string,
  merchantClientId?: string
): Promise<void> {
  if (isSuperAdmin(user)) return;

  if (user.role === "MERCHANT_USER") {
    if (!user.merchantId || user.merchantId !== merchantId) {
      throw new AuthError("Access to this merchant is not permitted", "FORBIDDEN");
    }
    return;
  }

  if (user.role === "CLIENT_ADMIN" || user.role === "CLIENT_OPERATOR") {
    if (!user.clientId) {
      throw new AuthError("Client context required", "FORBIDDEN");
    }
    if (merchantClientId && merchantClientId !== user.clientId) {
      throw new AuthError("Access to this merchant is not permitted", "FORBIDDEN");
    }
    return;
  }

  throw new AuthError("Insufficient permissions", "FORBIDDEN");
}

export function getClientScopeFilter(user: SessionUser): { clientId: string } | Record<string, never> {
  if (isSuperAdmin(user)) return {};
  if (!user.clientId) {
    throw new AuthError("Client context required", "FORBIDDEN");
  }
  return { clientId: user.clientId };
}

export function getClientRecordScopeFilter(
  user: SessionUser
): { id: string } | Record<string, never> {
  if (isSuperAdmin(user)) return {};
  if (!user.clientId) {
    throw new AuthError("Client context required", "FORBIDDEN");
  }
  return { id: user.clientId };
}

export function getMerchantScopeFilter(
  user: SessionUser
): { clientId?: string; merchantId?: string } {
  if (isSuperAdmin(user)) return {};

  if (user.role === "MERCHANT_USER") {
    if (!user.clientId || !user.merchantId) {
      throw new AuthError("Merchant context required", "FORBIDDEN");
    }
    return { clientId: user.clientId, merchantId: user.merchantId };
  }

  if (!user.clientId) {
    throw new AuthError("Client context required", "FORBIDDEN");
  }
  return { clientId: user.clientId };
}

export function canManageUsers(user: SessionUser): boolean {
  return user.role === "SUPER_ADMIN" || user.role === "CLIENT_ADMIN";
}

export function canAccessClientsList(user: SessionUser): boolean {
  return user.role === "SUPER_ADMIN";
}

export function canAccessReports(user: SessionUser): boolean {
  return user.role !== "MERCHANT_USER";
}

export function canAccessUsersPage(user: SessionUser): boolean {
  return user.role === "SUPER_ADMIN" || user.role === "CLIENT_ADMIN";
}

export function canAccessSettings(user: SessionUser): boolean {
  return user.role === "SUPER_ADMIN" || user.role === "CLIENT_ADMIN";
}

export function canCreateMerchant(user: SessionUser): boolean {
  return (
    user.role === "SUPER_ADMIN" ||
    user.role === "CLIENT_ADMIN" ||
    user.role === "CLIENT_OPERATOR"
  );
}

export function canEditMerchant(user: SessionUser): boolean {
  return user.role === "SUPER_ADMIN" || user.role === "CLIENT_ADMIN";
}

export function canManageMerchantStatus(user: SessionUser): boolean {
  return user.role === "SUPER_ADMIN" || user.role === "CLIENT_ADMIN";
}

/**
 * Resolves the tenant clientId for merchant creation.
 * Non-super-admin users always use session clientId — never trust browser input.
 */
export function resolveMerchantClientIdForCreate(
  user: SessionUser,
  submittedClientId?: string | null
): { clientId: string } | { error: string } {
  if (!canCreateMerchant(user)) {
    return { error: "Insufficient permissions to create merchants" };
  }

  if (isSuperAdmin(user)) {
    const clientId = submittedClientId?.trim();
    if (!clientId) {
      return { error: "Select Bank / Patsanstha" };
    }
    return { clientId };
  }

  if (!user.clientId) {
    return { error: "Client context required" };
  }

  return { clientId: user.clientId };
}

export type AssignableClientUserRole = "CLIENT_ADMIN" | "CLIENT_OPERATOR";

export function canCreateUsers(user: SessionUser): boolean {
  return user.role === "SUPER_ADMIN" || user.role === "CLIENT_ADMIN";
}

export function getAssignableClientUserRoles(
  user: SessionUser
): AssignableClientUserRole[] {
  if (user.role === "SUPER_ADMIN") {
    return ["CLIENT_ADMIN", "CLIENT_OPERATOR"];
  }
  if (user.role === "CLIENT_ADMIN") {
    return ["CLIENT_OPERATOR"];
  }
  return [];
}

export function canCreateClientUser(
  user: SessionUser,
  targetRole: AssignableClientUserRole
): boolean {
  return getAssignableClientUserRoles(user).includes(targetRole);
}

export function canCreateMerchantUser(user: SessionUser): boolean {
  return user.role === "SUPER_ADMIN" || user.role === "CLIENT_ADMIN";
}

export function resolveUserClientIdForCreate(
  user: SessionUser,
  submittedClientId?: string | null
): { clientId: string } | { error: string } {
  if (!canCreateUsers(user)) {
    return { error: "Insufficient permissions to create users" };
  }

  if (isSuperAdmin(user)) {
    const clientId = submittedClientId?.trim();
    if (!clientId) {
      return { error: "Select Bank / Patsanstha" };
    }
    return { clientId };
  }

  if (!user.clientId) {
    return { error: "Client context required" };
  }

  return { clientId: user.clientId };
}

export function uiClientUserRoleToPrisma(
  role: "client_admin" | "client_operator"
): AssignableClientUserRole {
  return role === "client_admin" ? "CLIENT_ADMIN" : "CLIENT_OPERATOR";
}

export function assertRoleNotEscalated(
  actor: SessionUser,
  targetRole: PrismaUserRole
): void {
  if (targetRole === "SUPER_ADMIN" && !isSuperAdmin(actor)) {
    throw new AuthError("Cannot assign Super Admin role", "FORBIDDEN");
  }
  if (targetRole === "CLIENT_ADMIN" && actor.role === "CLIENT_ADMIN") {
    throw new AuthError("Cannot assign Client Admin role", "FORBIDDEN");
  }
}
