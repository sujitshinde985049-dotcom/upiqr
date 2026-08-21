import type { QRProviderMode } from "@/types";

export type ReconciliationStatus =
  | "NOT_APPLICABLE"
  | "UNVERIFIED"
  | "MATCHED"
  | "MISMATCH";

export function getTransactionReconciliationStatus(
  providerMode: QRProviderMode
): ReconciliationStatus {
  if (providerMode === "mock" || providerMode === "legacy") {
    return "NOT_APPLICABLE";
  }
  return "UNVERIFIED";
}

export function getReconciliationLabel(status: ReconciliationStatus): string {
  switch (status) {
    case "NOT_APPLICABLE":
      return "Not Applicable";
    case "UNVERIFIED":
      return "Unverified";
    case "MATCHED":
      return "Matched";
    case "MISMATCH":
      return "Mismatch";
    default:
      return status;
  }
}
