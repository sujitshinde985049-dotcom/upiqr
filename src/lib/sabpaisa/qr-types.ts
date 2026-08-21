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

export const sabPaisaUpdateQrRequestSchema = z
  .object({
    reference_name: z
      .string()
      .trim()
      .min(3, "QR name must be at least 3 characters")
      .max(100, "QR name must be at most 100 characters")
      .optional(),
    description: z
      .string()
      .trim()
      .max(500, "Description must be at most 500 characters")
      .optional(),
    category: z.string().trim().max(100).optional(),
    notes: z.string().trim().max(500).optional(),
    status: z.enum(["active", "inactive"]).optional(),
  })
  .refine(
    (data) =>
      data.reference_name !== undefined ||
      data.description !== undefined ||
      data.category !== undefined ||
      data.notes !== undefined ||
      data.status !== undefined,
    { message: "No valid fields to update" }
  );

export const sabPaisaListQrQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["active", "inactive", "all"]).default("all"),
  category: z.string().trim().optional(),
  search: z.string().trim().optional(),
  from_date: z.string().trim().optional(),
  to_date: z.string().trim().optional(),
  sort_by: z.enum(["created_at", "qr_name", "status"]).default("created_at"),
  sort_order: z.enum(["asc", "desc"]).default("desc"),
});

export const sabPaisaDownloadQuerySchema = z.object({
  format: z.enum(["png", "svg", "pdf"]).default("png"),
  size: z.coerce.number().int().min(128).max(2048).default(512),
});

export const sabPaisaActivateQrResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().min(1),
  data: z.object({
    qr_id: z.string().min(1),
    status: z.literal("active"),
  }),
});

export type SabPaisaUpdateQrRequest = z.infer<typeof sabPaisaUpdateQrRequestSchema>;
export type SabPaisaListQrQuery = z.infer<typeof sabPaisaListQrQuerySchema>;
export type SabPaisaDownloadQuery = z.infer<typeof sabPaisaDownloadQuerySchema>;
export type SabPaisaActivateQrResponse = z.infer<
  typeof sabPaisaActivateQrResponseSchema
>;

export interface SabPaisaQRProviderRecord {
  localId: string;
  qr_id: string;
  qr_identifier: string;
  qr_name: string;
  vpa: string | null;
  rail_id: string;
  category: string | null;
  description: string | null;
  notes: string | null;
  max_amount_per_transaction: number | null;
  status: "active" | "inactive";
  qr_image_url: string | null;
  upi_string: string | null;
  created_at: string;
  provider_mode: "mock" | "live" | "legacy";
  is_payable: boolean;
  has_pending_transactions: boolean;
}

export interface SabPaisaListQrItem extends SabPaisaQrData {
  total_transactions?: number;
  total_amount?: number;
}

export interface SabPaisaListQrResponse {
  success: true;
  data: {
    items: SabPaisaListQrItem[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      total_pages: number;
    };
  };
}

export interface SabPaisaGetQrResponse {
  success: true;
  data: SabPaisaListQrItem;
}

export interface SabPaisaUpdateQrResponse {
  success: true;
  message: string;
  data: SabPaisaQrData;
}

export interface SabPaisaDownloadResult {
  contentType: "image/png" | "image/svg+xml";
  filename: string;
  body: Buffer;
}

export interface SabPaisaQRProvider {
  readonly mode: "mock" | "live";
  createQR(input: SabPaisaQRProviderCreateInput): Promise<SabPaisaCreateQrResponse>;
  getQR(record: SabPaisaQRProviderRecord): Promise<SabPaisaGetQrResponse>;
  listQRs(
    records: SabPaisaQRProviderRecord[],
    query: SabPaisaListQrQuery
  ): Promise<SabPaisaListQrResponse>;
  updateQR(
    record: SabPaisaQRProviderRecord,
    input: SabPaisaUpdateQrRequest
  ): Promise<SabPaisaUpdateQrResponse>;
  deactivateQR(record: SabPaisaQRProviderRecord): Promise<void>;
  activateQR(record: SabPaisaQRProviderRecord): Promise<SabPaisaActivateQrResponse>;
  downloadQR(
    record: SabPaisaQRProviderRecord,
    query: SabPaisaDownloadQuery
  ): Promise<SabPaisaDownloadResult>;
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
