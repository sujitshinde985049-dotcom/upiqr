import { z } from "zod";
import {
  validateHdfcQrIdentifier,
  validateIciciQrIdentifier,
} from "@/lib/sabpaisa/validation";

export const generateMerchantQRSchema = z
  .object({
    merchantId: z.string().min(1, "Merchant is required"),
    railId: z.enum(["HDFC", "ICICI"]),
    qrName: z
      .string()
      .trim()
      .min(3, "QR name must be at least 3 characters")
      .max(100, "QR name must be at most 100 characters"),
    qrIdentifier: z.string().trim().optional(),
    maxAmountPerTransaction: z
      .string()
      .trim()
      .optional()
      .refine(
        (value) => !value || (!Number.isNaN(Number(value)) && Number(value) > 0),
        "Max amount must be a positive number"
      ),
    description: z
      .string()
      .trim()
      .max(500, "Description must be at most 500 characters")
      .optional(),
    category: z.string().trim().max(100).optional(),
    notes: z.string().trim().max(500).optional(),
    idempotencyKey: z.string().uuid("Invalid submission token"),
  })
  .superRefine((data, ctx) => {
    if (!data.qrIdentifier) return;
    const valid =
      data.railId === "HDFC"
        ? validateHdfcQrIdentifier(data.qrIdentifier)
        : validateIciciQrIdentifier(data.qrIdentifier);
    if (!valid) {
      ctx.addIssue({
        code: "custom",
        message: "Invalid QR identifier for the selected payment rail",
        path: ["qrIdentifier"],
      });
    }
  });

export type GenerateMerchantQRInput = z.infer<typeof generateMerchantQRSchema>;

export const updateMerchantQRSchema = z
  .object({
    qrId: z.string().min(1, "QR ID is required"),
    referenceName: z
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
  .strict()
  .refine(
    (data) =>
      data.referenceName !== undefined ||
      data.description !== undefined ||
      data.category !== undefined ||
      data.notes !== undefined ||
      data.status !== undefined,
    { message: "No valid fields to update" }
  );

export const qrListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["active", "inactive", "all"]).default("all"),
  category: z.string().trim().optional(),
  search: z.string().trim().optional(),
  fromDate: z.string().trim().optional(),
  toDate: z.string().trim().optional(),
  sortBy: z.enum(["created_at", "qr_name", "status"]).default("created_at"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  railId: z.enum(["HDFC", "ICICI", "all"]).default("all"),
});

export const qrDownloadQuerySchema = z.object({
  format: z.enum(["png", "svg", "pdf"]).default("png"),
  size: z.coerce.number().int().min(128).max(2048).default(512),
});

export type UpdateMerchantQRInput = z.infer<typeof updateMerchantQRSchema>;
export type QRListQuery = z.infer<typeof qrListQuerySchema>;
export type QRDownloadQuery = z.infer<typeof qrDownloadQuerySchema>;
