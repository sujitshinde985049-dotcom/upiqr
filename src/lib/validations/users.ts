import { z } from "zod";

export const userPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number");

export const createClientUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name is required")
    .max(100, "Name is too long"),
  email: z.string().trim().email("Enter valid email").max(255),
  role: z.enum(["client_admin", "client_operator"]),
  clientId: z.string().trim().optional(),
  password: userPasswordSchema,
  status: z.enum(["active", "inactive"]),
});

export const createMerchantUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name is required")
    .max(100, "Name is too long"),
  email: z.string().trim().email("Enter valid email").max(255),
  clientId: z.string().trim().optional(),
  merchantId: z.string().trim().optional(),
  password: userPasswordSchema,
  status: z.enum(["active", "inactive"]),
});

export const updateUserStatusInputSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  status: z.enum(["active", "inactive"]),
});

export const updateOwnProfileSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name is required")
      .max(100, "Name is too long"),
  })
  .strict();

export const updateUserProfileSchema = z
  .object({
    userId: z.string().min(1, "User ID is required"),
    name: z
      .string()
      .trim()
      .min(2, "Name is required")
      .max(100, "Name is too long"),
    email: z.string().trim().email("Enter valid email").max(255),
  })
  .strict();

export const changeOwnPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: userPasswordSchema,
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .strict()
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const adminResetPasswordSchema = z
  .object({
    userId: z.string().min(1, "User ID is required"),
    newPassword: userPasswordSchema,
    confirmPassword: z.string().min(1, "Confirm the temporary password"),
  })
  .strict()
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const userListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().optional(),
  role: z
    .enum([
      "all",
      "super_admin",
      "client_admin",
      "client_operator",
      "merchant_user",
    ])
    .default("all"),
  status: z.enum(["all", "active", "inactive", "pending"]).default("all"),
  clientId: z.string().trim().optional(),
});

export type CreateClientUserInput = z.infer<typeof createClientUserSchema>;
export type CreateMerchantUserInput = z.infer<typeof createMerchantUserSchema>;
export type UserListQuery = z.infer<typeof userListQuerySchema>;
export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileSchema>;
export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
export type ChangeOwnPasswordInput = z.infer<typeof changeOwnPasswordSchema>;
export type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;
