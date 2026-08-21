/**
 * Development/test-only mock payment event ingress.
 * NOT a production payment webhook endpoint.
 */
import {
  PAYMENT_EVENT_FAILURE_CODES,
  PaymentEventProcessingError,
  processNormalizedPaymentEvent,
  toMockNormalizedPaymentEvent,
  type MockPaymentEventInput,
  type PaymentEventProcessingResult,
} from "@/lib/payment-events";

export function assertMockPaymentEventIngressAllowed(): void {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_MOCK_PAYMENT_EVENTS !== "true"
  ) {
    throw new PaymentEventProcessingError(
      "Mock payment event ingress is disabled in production",
      PAYMENT_EVENT_FAILURE_CODES.MOCK_EVENT_INGRESS_DISABLED
    );
  }
}

export async function ingestMockPaymentEvent(
  input: MockPaymentEventInput
): Promise<PaymentEventProcessingResult> {
  assertMockPaymentEventIngressAllowed();

  const normalized = toMockNormalizedPaymentEvent(input);
  return processNormalizedPaymentEvent(normalized);
}
