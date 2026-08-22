import { z } from "zod";

const indianMobile = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, "Enter valid 10-digit Indian mobile number");

const optionalIndianMobile = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional()
  .refine((value) => value === undefined || indianMobile.safeParse(value).success, {
    message: "Enter valid 10-digit Indian mobile number",
  });

export const SECRET_SETTING_KEYS = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "SABPAISA_API_KEY",
  "SABPAISA_API_SECRET",
  "SABPAISA_ENCRYPTION_MASTER_KEY",
  "SABPAISA_ENCRYPTION_HMAC_SECRET",
  "password",
  "passwordHash",
  "webhookSecret",
  "encryptionKey",
  "hmacSecret",
  "connectionString",
  "privateToken",
] as const;

export function containsSecretLikeKeys(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  for (const key of Object.keys(input)) {
    const normalized = key.trim().toLowerCase();
    if (
      SECRET_SETTING_KEYS.some(
        (secretKey) => normalized === secretKey.toLowerCase()
      )
    ) {
      return key;
    }
  }

  return null;
}

export const updatePlatformSettingsSchema = z
  .object({
    platformName: z
      .string()
      .trim()
      .min(2, "Platform name is required")
      .max(100, "Platform name is too long"),
    supportEmail: z
      .string()
      .trim()
      .email("Enter valid support email")
      .max(255, "Support email is too long"),
    supportPhone: optionalIndianMobile,
  })
  .strict();

export const updateClientSettingsSchema = z
  .object({
    clientId: z.string().min(1, "Client ID is required").optional(),
    emailNotifications: z.boolean(),
    transactionAlerts: z.boolean(),
    weeklyReports: z.boolean(),
  })
  .strict();

export type UpdatePlatformSettingsInput = z.infer<
  typeof updatePlatformSettingsSchema
>;
export type UpdateClientSettingsInput = z.infer<
  typeof updateClientSettingsSchema
>;
