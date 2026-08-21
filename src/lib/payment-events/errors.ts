import type { PaymentEventFailureCode } from "./types";

export class PaymentEventProcessingError extends Error {
  constructor(
    message: string,
    public readonly code: PaymentEventFailureCode | string
  ) {
    super(message);
    this.name = "PaymentEventProcessingError";
  }
}

export function isPaymentEventProcessingError(
  error: unknown
): error is PaymentEventProcessingError {
  return error instanceof PaymentEventProcessingError;
}
