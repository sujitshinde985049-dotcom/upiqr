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
