"use server";

import {
  requireAuthenticatedUser,
  requireClientAccess,
  requireMerchantAccess,
  requireRole,
  AuthError,
} from "@/lib/auth/authorization";
import { createAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { EntityStatus } from "@prisma/client";
import {
  createMerchantQR,
  QRServiceError,
} from "@/lib/services/qr-service";
import { actionError, actionSuccess, type ActionResult } from "./types";

export async function generateMerchantQRAction(
  input: unknown
): Promise<
  ActionResult<{
    id: string;
    qrName: string;
    merchantName: string;
    clientName: string;
    providerMode: string;
    isPayable: boolean;
    vpa: string;
    rail: string;
    idempotentReplay: boolean;
  }>
> {
  try {
    const user = await requireAuthenticatedUser();
    const result = await createMerchantQR(user, input);
    return actionSuccess(result);
  } catch (error) {
    if (error instanceof AuthError) {
      return actionError(
        error.code === "FORBIDDEN"
          ? "You are not authorized to create QR codes for this merchant"
          : "Authentication required"
      );
    }
    if (error instanceof QRServiceError) {
      return actionError(error.message);
    }
    console.error("generateMerchantQRAction failed");
    return actionError("Unable to create QR code. Please try again.");
  }
}

/** @deprecated Use generateMerchantQRAction — retained for compatibility */
export async function createQRCodeAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const result = await generateMerchantQRAction(input);
  if (!result.success) {
    return actionError(result.error);
  }
  return actionSuccess({ id: result.data.id });
}

export async function updateQRStatusAction(
  qrId: string,
  status: "active" | "inactive"
): Promise<ActionResult> {
  try {
    const user = await requireAuthenticatedUser();
    requireRole(user, [
      "SUPER_ADMIN",
      "CLIENT_ADMIN",
      "CLIENT_OPERATOR",
    ]);

    const qr = await prisma.qRCode.findUnique({ where: { id: qrId } });
    if (!qr) {
      return actionError("QR code not found");
    }

    requireClientAccess(user, qr.clientId);
    await requireMerchantAccess(user, qr.merchantId, qr.clientId);

    const newStatus =
      status === "active" ? EntityStatus.ACTIVE : EntityStatus.INACTIVE;

    await prisma.qRCode.update({
      where: { id: qrId },
      data: { status: newStatus },
    });

    await createAuditLog({
      userId: user.id,
      clientId: qr.clientId,
      action: "QR_STATUS_CHANGED",
      entityType: "QRCode",
      entityId: qrId,
      metadata: { status },
    });

    return actionSuccess(undefined);
  } catch (error) {
    console.error("updateQRStatusAction failed");
    return actionError("Unable to update QR status.");
  }
}
