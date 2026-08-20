"use server";

import { EntityStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  requireAuthenticatedUser,
  requireMerchantAccess,
  resolveMerchantClientIdForCreate,
  canEditMerchant,
  canManageMerchantStatus,
} from "@/lib/auth/authorization";
import { createAuditLog } from "@/lib/audit/audit-log";
import { generateNextMerchantCode } from "@/lib/utils/merchant-code";
import { maskAccountReference } from "@/lib/utils/mask-account-reference";
import { checkMerchantDuplicates } from "@/lib/services/merchant-service";
import {
  createMerchantInputSchema,
  updateMerchantSchema,
  updateMerchantStatusSchema,
} from "@/lib/validations/entities";
import { actionError, actionSuccess, type ActionResult } from "./types";

const MAX_CODE_RETRIES = 5;

function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function safeAuditMetadata(
  data: Record<string, string | undefined>
): Prisma.InputJsonValue {
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (key === "currentAccountReference") {
      safe[key] = maskAccountReference(value);
    } else {
      safe[key] = value;
    }
  }
  return safe;
}

export async function createMerchantAction(
  input: unknown
): Promise<ActionResult<{ id: string; merchantCode: string }>> {
  try {
    const user = await requireAuthenticatedUser();

    const parsed = createMerchantInputSchema.safeParse(input);
    if (!parsed.success) {
      return actionError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const resolved = resolveMerchantClientIdForCreate(
      user,
      parsed.data.clientId
    );
    if ("error" in resolved) {
      return actionError(resolved.error);
    }

    const { clientId } = resolved;
    const { clientId: _ignored, ...formData } = parsed.data;

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
      return actionError("Selected Bank / Patsanstha was not found");
    }

    const duplicateError = await checkMerchantDuplicates(clientId, formData);
    if (duplicateError) {
      return actionError(duplicateError);
    }

    for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
      const merchantCode = await generateNextMerchantCode();

      try {
        const merchant = await prisma.$transaction(async (tx) => {
          const created = await tx.merchant.create({
            data: {
              id: merchantCode,
              merchantCode,
              clientId,
              businessName: formData.businessName,
              accountHolderName: formData.accountHolderName,
              currentAccountReference: formData.currentAccountReference,
              merchantCategory: formData.merchantCategory,
              businessType: formData.businessType,
              gstNumber: formData.gstNumber ?? null,
              pan: formData.pan ?? null,
              mobile: formData.mobile,
              email: formData.email || null,
              address: formData.address,
              city: formData.city,
              district: formData.district,
              state: formData.state,
              pinCode: formData.pinCode,
              status: EntityStatus.PENDING,
            },
          });

          await tx.auditLog.create({
            data: {
              userId: user.id,
              clientId,
              action: "MERCHANT_CREATED",
              entityType: "Merchant",
              entityId: created.id,
              metadata: safeAuditMetadata({
                businessName: formData.businessName,
                merchantCode: created.merchantCode,
                currentAccountReference: formData.currentAccountReference,
              }),
            },
          });

          return created;
        });

        return actionSuccess({
          id: merchant.id,
          merchantCode: merchant.merchantCode,
        });
      } catch (error) {
        if (isPrismaUniqueViolation(error) && attempt < MAX_CODE_RETRIES - 1) {
          continue;
        }
        if (isPrismaUniqueViolation(error)) {
          return actionError(
            "A merchant with this current account reference already exists for this Bank/Patsanstha"
          );
        }
        throw error;
      }
    }

    return actionError("Unable to generate a unique merchant code. Please try again.");
  } catch (error) {
    console.error("createMerchantAction failed");
    return actionError("Unable to create merchant. Please try again.");
  }
}

export async function updateMerchantAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAuthenticatedUser();
    if (!canEditMerchant(user)) {
      return actionError("Insufficient permissions to edit merchants");
    }

    const parsed = updateMerchantSchema.safeParse(input);
    if (!parsed.success) {
      return actionError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { merchantId, ...formData } = parsed.data;

    const existing = await prisma.merchant.findUnique({
      where: { id: merchantId },
    });
    if (!existing) {
      return actionError("Merchant not found");
    }

    await requireMerchantAccess(user, existing.id, existing.clientId);

    const duplicateError = await checkMerchantDuplicates(
      existing.clientId,
      formData,
      merchantId
    );
    if (duplicateError) {
      return actionError(duplicateError);
    }

    await prisma.$transaction(async (tx) => {
      await tx.merchant.update({
        where: { id: merchantId },
        data: {
          businessName: formData.businessName,
          accountHolderName: formData.accountHolderName,
          currentAccountReference: formData.currentAccountReference,
          merchantCategory: formData.merchantCategory,
          businessType: formData.businessType,
          gstNumber: formData.gstNumber ?? null,
          pan: formData.pan ?? null,
          mobile: formData.mobile,
          email: formData.email || null,
          address: formData.address,
          city: formData.city,
          district: formData.district,
          state: formData.state,
          pinCode: formData.pinCode,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          clientId: existing.clientId,
          action: "MERCHANT_UPDATED",
          entityType: "Merchant",
          entityId: merchantId,
          metadata: safeAuditMetadata({
            businessName: formData.businessName,
            currentAccountReference: formData.currentAccountReference,
          }),
        },
      });
    });

    return actionSuccess({ id: merchantId });
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      return actionError(
        "A merchant with this current account reference already exists for this Bank/Patsanstha"
      );
    }
    console.error("updateMerchantAction failed");
    return actionError("Unable to update merchant. Please try again.");
  }
}

export async function updateMerchantStatusAction(
  input: unknown
): Promise<ActionResult<{ id: string; status: string }>> {
  try {
    const user = await requireAuthenticatedUser();
    if (!canManageMerchantStatus(user)) {
      return actionError("Insufficient permissions to change merchant status");
    }

    const parsed = updateMerchantStatusSchema.safeParse(input);
    if (!parsed.success) {
      return actionError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { merchantId, action } = parsed.data;

    const existing = await prisma.merchant.findUnique({
      where: { id: merchantId },
    });
    if (!existing) {
      return actionError("Merchant not found");
    }

    await requireMerchantAccess(user, existing.id, existing.clientId);

    let newStatus: EntityStatus;
    let auditAction: string;

    if (action === "activate") {
      if (existing.status === EntityStatus.ACTIVE) {
        return actionError("Merchant is already active");
      }
      newStatus = EntityStatus.ACTIVE;
      auditAction = "MERCHANT_ACTIVATED";
    } else {
      if (existing.status !== EntityStatus.ACTIVE) {
        return actionError("Only active merchants can be deactivated");
      }
      newStatus = EntityStatus.INACTIVE;
      auditAction = "MERCHANT_DEACTIVATED";
    }

    await prisma.$transaction(async (tx) => {
      await tx.merchant.update({
        where: { id: merchantId },
        data: { status: newStatus },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          clientId: existing.clientId,
          action: auditAction,
          entityType: "Merchant",
          entityId: merchantId,
          metadata: {
            businessName: existing.businessName,
            previousStatus: existing.status,
            newStatus,
          },
        },
      });
    });

    return actionSuccess({
      id: merchantId,
      status: newStatus.toLowerCase(),
    });
  } catch (error) {
    console.error("updateMerchantStatusAction failed");
    return actionError("Unable to update merchant status. Please try again.");
  }
}
