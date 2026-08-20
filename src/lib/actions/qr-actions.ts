"use server";

import { EntityStatus, PaymentRail } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  requireAuthenticatedUser,
  requireClientAccess,
  requireMerchantAccess,
  requireRole,
} from "@/lib/auth/authorization";
import { createAuditLog } from "@/lib/audit/audit-log";
import { generateEntityId } from "@/lib/utils/id-generator";
import { createQRSchema } from "@/lib/validations/entities";
import { actionError, actionSuccess, type ActionResult } from "./types";

export async function createQRCodeAction(
  input: unknown
): Promise<
  ActionResult<{
    id: string;
    vpa: string;
    qrName: string;
    merchantName: string;
    clientName: string;
    rail: string;
  }>
> {
  try {
    const user = await requireAuthenticatedUser();
    requireRole(user, [
      "SUPER_ADMIN",
      "CLIENT_ADMIN",
      "CLIENT_OPERATOR",
      "MERCHANT_USER",
    ]);

    const parsed = createQRSchema.safeParse(input);
    if (!parsed.success) {
      return actionError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const data = parsed.data;
    requireClientAccess(user, data.clientId);

    const merchant = await prisma.merchant.findUnique({
      where: { id: data.merchantId },
      include: { client: true },
    });

    if (!merchant || merchant.clientId !== data.clientId) {
      return actionError("Merchant does not belong to the selected client");
    }

    await requireMerchantAccess(user, merchant.id, merchant.clientId);

    const id = generateEntityId("QR");
    const vpa = `${data.qrIdentifier.toLowerCase().replace(/[^a-z0-9]/g, "")}@mahacred`;
    const maxAmount = data.maxAmountPerTransaction
      ? parseFloat(data.maxAmountPerTransaction)
      : null;

    await prisma.qRCode.create({
      data: {
        id,
        clientId: data.clientId,
        merchantId: data.merchantId,
        qrName: data.qrName,
        qrIdentifier: data.qrIdentifier,
        railId: data.railId as PaymentRail,
        vpa,
        maxAmountPerTransaction: maxAmount,
        description: data.description || null,
        category: data.category || null,
        status: EntityStatus.ACTIVE,
      },
    });

    await createAuditLog({
      userId: user.id,
      clientId: data.clientId,
      action: "QR_CREATED",
      entityType: "QRCode",
      entityId: id,
      metadata: { qrName: data.qrName, merchantId: data.merchantId },
    });

    return actionSuccess({
      id,
      vpa,
      qrName: data.qrName,
      merchantName: merchant.businessName,
      clientName: merchant.client.name,
      rail: data.railId,
    });
  } catch (error) {
    console.error("createQRCodeAction:", error);
    return actionError("Unable to create QR code. Please try again.");
  }
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
    console.error("updateQRStatusAction:", error);
    return actionError("Unable to update QR status.");
  }
}
