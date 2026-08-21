import { z } from "zod";
import {
  PAYMENT_EVENT_FAILURE_CODES,
  normalizedPaymentEventSchema,
  type NormalizedPaymentEvent,
} from "../types";
import { PaymentEventProcessingError } from "../errors";

export const mockPaymentEventInputSchema = z.object({
  providerEventId: z.string().min(1),
  providerTransactionId: z.string().min(1),
  providerQrId: z.string().min(1),
  amount: z.number().finite().positive(),
  status: z.enum(["pending", "success", "failed"]),
  railId: z.enum(["HDFC", "ICICI"]).optional(),
  referenceNumber: z.string().nullable().optional(),
  bankReferenceNumber: z.string().nullable().optional(),
  customerVpa: z.string().nullable().optional(),
  customerName: z.string().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  initiatedAt: z.coerce.date().optional(),
  completedAt: z.coerce.date().nullable().optional(),
});

export type MockPaymentEventInput = z.infer<typeof mockPaymentEventInputSchema>;

export function toMockNormalizedPaymentEvent(
  input: MockPaymentEventInput
): NormalizedPaymentEvent {
  const parsed = mockPaymentEventInputSchema.parse(input);

  if (!parsed.providerEventId.startsWith("mock_evt_")) {
    throw new PaymentEventProcessingError(
      "Mock payment events must use synthetic providerEventId prefix mock_evt_",
      PAYMENT_EVENT_FAILURE_CODES.INVALID_MOCK_EVENT_ID
    );
  }

  if (!parsed.providerTransactionId.startsWith("mock_txn_")) {
    throw new PaymentEventProcessingError(
      "Mock payment events must use synthetic providerTransactionId prefix mock_txn_",
      PAYMENT_EVENT_FAILURE_CODES.INVALID_MOCK_EVENT_ID
    );
  }

  const now = new Date();
  return normalizedPaymentEventSchema.parse({
    provider: "sabpaisa",
    providerMode: "mock",
    providerEventId: parsed.providerEventId,
    providerTransactionId: parsed.providerTransactionId,
    providerQrId: parsed.providerQrId,
    amount: parsed.amount,
    status: parsed.status,
    railId: parsed.railId,
    referenceNumber: parsed.referenceNumber,
    bankReferenceNumber: parsed.bankReferenceNumber,
    customerVpa: parsed.customerVpa ?? "test-customer@mock",
    customerName: parsed.customerName ?? "Test Customer",
    paymentMethod: parsed.paymentMethod ?? "UPI",
    initiatedAt: parsed.initiatedAt ?? now,
    completedAt:
      parsed.status === "pending"
        ? null
        : parsed.completedAt ?? new Date(now.getTime() + 1000),
    receivedAt: now,
  });
}
