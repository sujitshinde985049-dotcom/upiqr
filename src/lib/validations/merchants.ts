import { z } from "zod";

const indianMobile = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, "Enter valid 10-digit Indian mobile number");

const pinCode = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter valid 6-digit PIN code");

const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const optionalEmail = z
  .string()
  .trim()
  .email("Enter valid email")
  .max(255)
  .optional()
  .or(z.literal(""));

const optionalPan = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v.toUpperCase()))
  .optional()
  .refine((v) => v === undefined || panRegex.test(v), {
    message: "Enter valid PAN format (e.g. ABCDE1234F)",
  });

const optionalGst = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v.toUpperCase()))
  .optional()
  .refine((v) => v === undefined || gstRegex.test(v), {
    message: "Enter valid GST format",
  });

export const merchantFormSchema = z.object({
  currentAccountReference: z
    .string()
    .trim()
    .min(4, "Current account reference is required")
    .max(50, "Current account reference is too long")
    .regex(
      /^[A-Za-z0-9\-\/]+$/,
      "Account reference may only contain letters, numbers, hyphens, and slashes"
    ),
  accountHolderName: z
    .string()
    .trim()
    .min(2, "Account holder name is required")
    .max(150, "Account holder name is too long"),
  businessName: z
    .string()
    .trim()
    .min(2, "Business name is required")
    .max(200, "Business name is too long"),
  merchantCategory: z
    .string()
    .trim()
    .min(1, "Merchant category is required")
    .max(100, "Merchant category is too long"),
  businessType: z
    .string()
    .trim()
    .min(1, "Business type is required")
    .max(100, "Business type is too long"),
  gstNumber: optionalGst,
  pan: optionalPan,
  mobile: indianMobile,
  email: optionalEmail,
  address: z.string().trim().min(5, "Address is required").max(500),
  city: z.string().trim().min(2, "City is required").max(100),
  district: z.string().trim().min(2, "District is required").max(100),
  state: z.string().trim().min(1, "State is required").max(100),
  pinCode: pinCode,
});

export type MerchantFormInput = z.infer<typeof merchantFormSchema>;

export const createMerchantInputSchema = merchantFormSchema.extend({
  clientId: z.string().trim().optional(),
});

export const updateMerchantSchema = merchantFormSchema.extend({
  merchantId: z.string().min(1, "Merchant ID is required"),
});

export const updateMerchantStatusSchema = z.object({
  merchantId: z.string().min(1, "Merchant ID is required"),
  action: z.enum(["activate", "deactivate"]),
});

export const merchantListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().optional(),
  status: z.enum(["all", "active", "inactive", "pending"]).default("all"),
  clientId: z.string().trim().optional(),
  category: z.string().trim().optional(),
  sort: z
    .enum(["newest", "oldest", "name_asc", "name_desc"])
    .default("newest"),
});

export type MerchantListQuery = z.infer<typeof merchantListQuerySchema>;
