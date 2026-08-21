import { z } from "zod";
import {
  validateHdfcQrIdentifier,
  validateIciciQrIdentifier,
} from "./validation";

export const sabPaisaRailIdSchema = z.enum(["hdfc", "icici"]);

export const sabPaisaCreateQrRequestSchema = z
  .object({
    rail_id: sabPaisaRailIdSchema,
    qr_name: z
      .string()
      .trim()
      .min(3, "QR name must be at least 3 characters")
      .max(100, "QR name must be at most 100 characters"),
    qr_identifier: z.string().trim().optional(),
    max_amount_per_transaction: z.number().positive().optional(),
    description: z
      .string()
      .trim()
      .max(500, "Description must be at most 500 characters")
      .optional(),
    category: z.string().trim().max(100).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.qr_identifier) return;
    const valid =
      data.rail_id === "hdfc"
        ? validateHdfcQrIdentifier(data.qr_identifier)
        : validateIciciQrIdentifier(data.qr_identifier);
    if (!valid) {
      ctx.addIssue({
        code: "custom",
        message: "Invalid QR identifier for the selected payment rail",
        path: ["qr_identifier"],
      });
    }
  });

export const sabPaisaQrDataSchema = z.object({
  qr_id: z.string().min(1),
  qr_identifier: z.string().min(1),
  vpa: z.string().min(1),
  qr_name: z.string().min(1),
  description: z.string().nullable().optional(),
  max_amount_per_transaction: z.number().nullable().optional(),
  category: z.string().nullable().optional(),
  status: z.string().min(1),
  qr_image_url: z.string().min(1),
  upi_string: z.string().min(1),
  created_at: z.string().min(1),
});

export const sabPaisaCreateQrResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().min(1),
  data: sabPaisaQrDataSchema,
});

export type SabPaisaCreateQrRequest = z.infer<typeof sabPaisaCreateQrRequestSchema>;
export type SabPaisaQrData = z.infer<typeof sabPaisaQrDataSchema>;
export type SabPaisaCreateQrResponse = z.infer<typeof sabPaisaCreateQrResponseSchema>;

export interface SabPaisaQRProviderCreateInput extends SabPaisaCreateQrRequest {
  merchantBusinessName: string;
}

export interface SabPaisaQRProvider {
  readonly mode: "mock" | "live";
  createQR(input: SabPaisaQRProviderCreateInput): Promise<SabPaisaCreateQrResponse>;
}

export type MockSabPaisaErrorSimulation =
  | "VALIDATION_FAILED"
  | "RAIL_NOT_LIVE"
  | "RAIL_NOT_AVAILABLE"
  | "QR_VALIDATION_ERROR"
  | "QR_004"
  | "ICICI_ONBOARDING_FAILED"
  | "QR_002"
  | "QR_RAIL_UNAVAILABLE"
  | "ICICI_ONBOARDING_ERROR"
  | "MERCHANT_IDENTIFICATION_FAILED";

export const MOCK_SABPAISA_ERROR_MAP: Record<
  MockSabPaisaErrorSimulation,
  { code: string; message: string }
> = {
  VALIDATION_FAILED: { code: "QR_VALIDATION_ERROR", message: "Validation failed" },
  RAIL_NOT_LIVE: { code: "RAIL_NOT_LIVE", message: "Payment rail is not live" },
  RAIL_NOT_AVAILABLE: {
    code: "RAIL_NOT_AVAILABLE",
    message: "Payment rail is not available",
  },
  QR_VALIDATION_ERROR: {
    code: "QR_VALIDATION_ERROR",
    message: "QR validation error",
  },
  QR_004: { code: "QR_004", message: "QR validation error (QR_004)" },
  ICICI_ONBOARDING_FAILED: {
    code: "ICICI_ONBOARDING_FAILED",
    message: "ICICI onboarding failed",
  },
  QR_002: { code: "QR_002", message: "Merchant identification failed (QR_002)" },
  QR_RAIL_UNAVAILABLE: {
    code: "QR_RAIL_UNAVAILABLE",
    message: "QR rail unavailable",
  },
  ICICI_ONBOARDING_ERROR: {
    code: "ICICI_ONBOARDING_ERROR",
    message: "ICICI onboarding error",
  },
  MERCHANT_IDENTIFICATION_FAILED: {
    code: "QR_002",
    message: "Merchant identification failed",
  },
};
