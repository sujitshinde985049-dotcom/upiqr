import type { SabPaisaPaymentRail } from "./types";

const HDFC_IDENTIFIER = /^[a-z0-9]{4,10}$/;
const ICICI_IDENTIFIER = /^[a-zA-Z0-9]{1,15}$/;

export function validateHdfcQrIdentifier(qrIdentifier: string): boolean {
  if (!HDFC_IDENTIFIER.test(qrIdentifier)) {
    return false;
  }
  return /[a-z]/.test(qrIdentifier) && /\d/.test(qrIdentifier);
}

export function validateIciciQrIdentifier(qrIdentifier: string): boolean {
  return ICICI_IDENTIFIER.test(qrIdentifier);
}

export function validateSabPaisaQrIdentifier(
  rail: SabPaisaPaymentRail,
  qrIdentifier: string
): boolean {
  switch (rail) {
    case "hdfc":
      return validateHdfcQrIdentifier(qrIdentifier);
    case "icici":
      return validateIciciQrIdentifier(qrIdentifier);
    default:
      return false;
  }
}

/**
 * SabPaisa builds the full VPA — never generate a local full VPA in MahaCred.
 */
export function buildLocalVpaPreview(): never {
  throw new Error(
    "Local VPA generation is not supported. SabPaisa builds the full VPA."
  );
}

export function normalizeSabPaisaPaymentRail(
  rail: string
): SabPaisaPaymentRail | null {
  const normalized = rail.trim().toLowerCase();
  if (normalized === "hdfc" || normalized === "icici") {
    return normalized;
  }
  return null;
}
