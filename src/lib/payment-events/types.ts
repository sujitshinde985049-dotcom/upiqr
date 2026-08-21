import { z } from "zod";

export const normalizedPaymentStatusSchema = z.enum([
  "pending",
  "success",
  "failed",
]);

export const normalizedPaymentEventSchema = z.object({
  provider: z.string().min(1).default("sabpaisa"),
  providerMode: z.enum(["mock", "live", "legacy"]),
  providerEventId: z.string().min(1),
  providerTransactionId: z.string().min(1),
  providerQrId: z.string().min(1),
  amount: z.number().finite().positive(),
  status: normalizedPaymentStatusSchema,
  railId: z.enum(["HDFC", "ICICI"]).optional(),
  referenceNumber: z.string().nullable().optional(),
  bankReferenceNumber: z.string().nullable().optional(),
  customerVpa: z.string().nullable().optional(),
  customerName: z.string().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  initiatedAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable().optional(),
  receivedAt: z.coerce.date().default(() => new Date()),
});

export type NormalizedPaymentEvent = z.infer<typeof normalizedPaymentEventSchema>;
export type NormalizedPaymentStatus = z.infer<typeof normalizedPaymentStatusSchema>;

export type PaymentEventProcessingResultStatus =
  | "PROCESSED"
  | "DUPLICATE"
  | "REJECTED"
  | "FAILED";

export interface PaymentEventProcessingResult {
  processingStatus: PaymentEventProcessingResultStatus;
  paymentEventId: string;
  transactionId?: string;
  transactionStatus?: NormalizedPaymentStatus;
  failureReasonCode?: string;
  duplicate?: boolean;
}

export const PAYMENT_EVENT_FAILURE_CODES = {
  QR_MAPPING_NOT_FOUND: "QR_MAPPING_NOT_FOUND",
  TRANSACTION_QR_MISMATCH: "TRANSACTION_QR_MISMATCH",
  TRANSACTION_AMOUNT_MISMATCH: "TRANSACTION_AMOUNT_MISMATCH",
  INVALID_STATUS_TRANSITION: "INVALID_STATUS_TRANSITION",
  INVALID_AMOUNT: "INVALID_AMOUNT",
  LIVE_PROVIDER_MODE_NOT_ALLOWED: "LIVE_PROVIDER_MODE_NOT_ALLOWED",
  SABPAISA_WEBHOOK_SPEC_NOT_AVAILABLE: "SABPAISA_WEBHOOK_SPEC_NOT_AVAILABLE",
  MOCK_EVENT_INGRESS_DISABLED: "MOCK_EVENT_INGRESS_DISABLED",
  INVALID_MOCK_EVENT_ID: "INVALID_MOCK_EVENT_ID",
} as const;

export type PaymentEventFailureCode =
  (typeof PAYMENT_EVENT_FAILURE_CODES)[keyof typeof PAYMENT_EVENT_FAILURE_CODES];

export const WEBHOOK_INTEROP_BLOCKED_REASON =
  "BLOCKED — official SabPaisa webhook specification required";
