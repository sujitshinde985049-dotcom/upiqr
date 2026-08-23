"use server";

import { EntityStatus, Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  assertRoleNotEscalated,
  canCreateClientUser,
  canCreateMerchantUser,
  resolveUserClientIdForCreate,
  uiClientUserRoleToPrisma,
} from "@/lib/auth/authorization";
import { requireAuthenticatedUser } from "@/lib/auth/authorization";
import { hashPassword } from "@/lib/auth/password";
import { createAuditLog } from "@/lib/audit/audit-log";
import { generateNextUserId } from "@/lib/utils/user-id";
import {
  checkEmailDuplicate,
  canActorManageTargetUser,
  UserServiceError,
  updateOwnProfile,
  updateUserProfileByAdmin,
  changeOwnPassword,
  adminResetUserPassword,
} from "@/lib/services/user-service";
import {
  createClientUserSchema,
  createMerchantUserSchema,
  updateUserStatusInputSchema,
  updateOwnProfileSchema,
  updateUserProfileSchema,
  changeOwnPasswordSchema,
  adminResetPasswordSchema,
} from "@/lib/validations/users";
import { actionError, actionSuccess, type ActionResult } from "./types";

function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function statusChangedAuditAction(role: UserRole): string {
  return role === UserRole.MERCHANT_USER
    ? "MERCHANT_USER_STATUS_CHANGED"
    : "CLIENT_USER_STATUS_CHANGED";
}

export async function createClientUserAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireAuthenticatedUser();

    const parsed = createClientUserSchema.safeParse(input);
    if (!parsed.success) {
      return actionError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const data = parsed.data;
    const prismaRole = uiClientUserRoleToPrisma(data.role);

    if (!canCreateClientUser(actor, prismaRole)) {
      return actionError("Insufficient permissions to create this user role");
    }

    try {
      assertRoleNotEscalated(actor, prismaRole);
    } catch {
      return actionError("Cannot assign this role");
    }

    const resolved = resolveUserClientIdForCreate(actor, data.clientId);
    if ("error" in resolved) {
      return actionError(resolved.error);
    }

    const { clientId } = resolved;

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
      return actionError("Selected Bank / Patsanstha was not found");
    }

    if (await checkEmailDuplicate(data.email)) {
      return actionError("A user with this email already exists");
    }

    const passwordHash = await hashPassword(data.password);
    const userId = await generateNextUserId();
    const status =
      data.status === "active" ? EntityStatus.ACTIVE : EntityStatus.INACTIVE;

    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: userId,
          name: data.name,
          email: data.email,
          passwordHash,
          role: prismaRole,
          clientId,
          merchantId: null,
          status,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          clientId,
          action: "CLIENT_USER_CREATED",
          entityType: "User",
          entityId: userId,
          metadata: {
            name: data.name,
            email: data.email,
            role: prismaRole,
          },
        },
      });
    });

    return actionSuccess({ id: userId });
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      return actionError("A user with this email already exists");
    }
    console.error("createClientUserAction failed");
    return actionError("Unable to create user. Please try again.");
  }
}

export async function createMerchantUserAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireAuthenticatedUser();

    if (!canCreateMerchantUser(actor)) {
      return actionError("Insufficient permissions to create merchant users");
    }

    const parsed = createMerchantUserSchema.safeParse(input);
    if (!parsed.success) {
      return actionError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const data = parsed.data;

    const resolved = resolveUserClientIdForCreate(actor, data.clientId);
    if ("error" in resolved) {
      return actionError(resolved.error);
    }

    const { clientId } = resolved;

    const merchantId = data.merchantId?.trim();
    if (!merchantId) {
      return actionError("Select a Merchant");
    }

    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
    });
    if (!merchant) {
      return actionError("Selected merchant was not found");
    }

    if (merchant.clientId !== clientId) {
      return actionError(
        "Merchant does not belong to the selected Bank / Patsanstha"
      );
    }

    if (actor.role === "CLIENT_ADMIN") {
      if (!actor.clientId || actor.clientId !== merchant.clientId) {
        return actionError("Cannot create users for another client");
      }
    }

    if (await checkEmailDuplicate(data.email)) {
      return actionError("A user with this email already exists");
    }

    const passwordHash = await hashPassword(data.password);
    const userId = await generateNextUserId();
    const status =
      data.status === "active" ? EntityStatus.ACTIVE : EntityStatus.INACTIVE;

    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: userId,
          name: data.name,
          email: data.email,
          passwordHash,
          role: UserRole.MERCHANT_USER,
          clientId: merchant.clientId,
          merchantId: merchant.id,
          status,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          clientId: merchant.clientId,
          action: "MERCHANT_USER_CREATED",
          entityType: "User",
          entityId: userId,
          metadata: {
            name: data.name,
            email: data.email,
            merchantId: merchant.id,
          },
        },
      });
    });

    return actionSuccess({ id: userId });
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      return actionError("A user with this email already exists");
    }
    console.error("createMerchantUserAction failed");
    return actionError("Unable to create merchant user. Please try again.");
  }
}

export async function updateUserStatusAction(
  input: unknown
): Promise<ActionResult> {
  try {
    const actor = await requireAuthenticatedUser();

    const parsed = updateUserStatusInputSchema.safeParse(input);
    if (!parsed.success) {
      return actionError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { userId, status } = parsed.data;

    const access = await canActorManageTargetUser(actor, userId);
    if (!access.allowed || !access.target) {
      return actionError(access.error ?? "Insufficient permissions");
    }

    const target = access.target;
    const newStatus =
      status === "active" ? EntityStatus.ACTIVE : EntityStatus.INACTIVE;

    if (target.status === newStatus) {
      return actionError(
        `User is already ${status === "active" ? "active" : "inactive"}`
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { status: newStatus },
      });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          clientId: target.clientId,
          action: statusChangedAuditAction(target.role),
          entityType: "User",
          entityId: userId,
          metadata: {
            email: target.email,
            previousStatus: target.status,
            newStatus,
          },
        },
      });
    });

    return actionSuccess(undefined);
  } catch (error) {
    console.error("updateUserStatusAction failed");
    return actionError("Unable to update user status.");
  }
}

// Backward-compatible wrapper for existing UI calls
export async function updateUserStatusActionLegacy(
  userId: string,
  status: "active" | "inactive"
): Promise<ActionResult> {
  return updateUserStatusAction({ userId, status });
}

function mapUserServiceError(error: unknown): ActionResult<never> {
  if (error instanceof UserServiceError) {
    return actionError(error.message);
  }
  return actionError("Unable to complete request. Please try again.");
}

export async function updateOwnProfileAction(
  input: unknown
): Promise<ActionResult<{ name: string }>> {
  try {
    const actor = await requireAuthenticatedUser();
    const parsed = updateOwnProfileSchema.safeParse(input);
    if (!parsed.success) {
      return actionError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const updated = await updateOwnProfile(actor, parsed.data);
    return actionSuccess({ name: updated.name });
  } catch (error) {
    console.error("updateOwnProfileAction failed");
    return mapUserServiceError(error);
  }
}

export async function updateUserProfileAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireAuthenticatedUser();
    const parsed = updateUserProfileSchema.safeParse(input);
    if (!parsed.success) {
      return actionError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const updated = await updateUserProfileByAdmin(actor, parsed.data);
    return actionSuccess({ id: updated.id });
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      return actionError("A user with this email already exists");
    }
    console.error("updateUserProfileAction failed");
    return mapUserServiceError(error);
  }
}

export async function changeOwnPasswordAction(
  input: unknown
): Promise<ActionResult> {
  try {
    const actor = await requireAuthenticatedUser();
    const parsed = changeOwnPasswordSchema.safeParse(input);
    if (!parsed.success) {
      return actionError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    await changeOwnPassword(actor, {
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
    });
    return actionSuccess(undefined);
  } catch (error) {
    console.error("changeOwnPasswordAction failed");
    return mapUserServiceError(error);
  }
}

export async function adminResetUserPasswordAction(
  input: unknown
): Promise<ActionResult> {
  try {
    const actor = await requireAuthenticatedUser();
    const parsed = adminResetPasswordSchema.safeParse(input);
    if (!parsed.success) {
      return actionError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    await adminResetUserPassword(actor, {
      userId: parsed.data.userId,
      newPassword: parsed.data.newPassword,
    });
    return actionSuccess(undefined);
  } catch (error) {
    console.error("adminResetUserPasswordAction failed");
    return mapUserServiceError(error);
  }
}
