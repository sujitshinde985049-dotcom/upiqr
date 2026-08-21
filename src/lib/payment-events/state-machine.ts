import type { NormalizedPaymentStatus } from "./types";

export type TransactionState = NormalizedPaymentStatus | "new";

const ALLOWED_TRANSITIONS: Record<TransactionState, NormalizedPaymentStatus[]> = {
  new: ["pending", "success", "failed"],
  pending: ["success", "failed"],
  success: ["success"],
  failed: ["failed"],
};

export function isAllowedStatusTransition(
  current: TransactionState,
  next: NormalizedPaymentStatus
): boolean {
  return ALLOWED_TRANSITIONS[current].includes(next);
}

export function assertAllowedStatusTransition(
  current: TransactionState,
  next: NormalizedPaymentStatus
): void {
  if (!isAllowedStatusTransition(current, next)) {
    throw new Error(`INVALID_STATUS_TRANSITION:${current}->${next}`);
  }
}
