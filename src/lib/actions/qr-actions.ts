"use server";

import {
  requireAuthenticatedUser,
  AuthError,
} from "@/lib/auth/authorization";
import {
  createMerchantQR,
  deactivateMerchantQR,
  downloadMerchantQR,
  QRServiceError,
  reactivateMerchantQR,
  updateMerchantQR,
} from "@/lib/services/qr-service";
import { actionError, actionSuccess, type ActionResult } from "./types";

function mapServiceError(error: unknown): ActionResult<never> {
  if (error instanceof AuthError) {
    return actionError(
      error.code === "FORBIDDEN"
        ? "You are not authorized to perform this action"
        : "Authentication required"
    );
  }
  if (error instanceof QRServiceError) {
    return actionError(error.message);
  }
  console.error("QR action failed");
  return actionError("Unable to complete QR operation. Please try again.");
}

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
    return mapServiceError(error);
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

export async function updateMerchantQRAction(
  input: unknown
): Promise<ActionResult<{ id: string; qrName: string; status: string }>> {
  try {
    const user = await requireAuthenticatedUser();
    const result = await updateMerchantQR(user, input);
    return actionSuccess(result);
  } catch (error) {
    return mapServiceError(error);
  }
}

export async function deactivateQRAction(
  qrId: string
): Promise<ActionResult<{ id: string; status: string }>> {
  try {
    const user = await requireAuthenticatedUser();
    const result = await deactivateMerchantQR(user, qrId);
    return actionSuccess({ id: result.id, status: result.status });
  } catch (error) {
    return mapServiceError(error);
  }
}

export async function reactivateQRAction(
  qrId: string
): Promise<ActionResult<{ id: string; status: string }>> {
  try {
    const user = await requireAuthenticatedUser();
    const result = await reactivateMerchantQR(user, qrId);
    return actionSuccess({ id: result.id, status: result.status });
  } catch (error) {
    return mapServiceError(error);
  }
}

/** @deprecated Use deactivateQRAction / reactivateQRAction */
export async function updateQRStatusAction(
  qrId: string,
  status: "active" | "inactive"
): Promise<ActionResult<void>> {
  const result =
    status === "inactive"
      ? await deactivateQRAction(qrId)
      : await reactivateQRAction(qrId);
  if (!result.success) {
    return actionError(result.error);
  }
  return actionSuccess(undefined);
}

export async function downloadMerchantQRAction(
  qrId: string,
  input: unknown
): Promise<
  ActionResult<{
    contentType: string;
    filename: string;
    base64: string;
  }>
> {
  try {
    const user = await requireAuthenticatedUser();
    const result = await downloadMerchantQR(user, qrId, input);
    return actionSuccess({
      contentType: result.contentType,
      filename: result.filename,
      base64: result.body.toString("base64"),
    });
  } catch (error) {
    return mapServiceError(error);
  }
}
