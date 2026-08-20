import { z } from "zod";

const indianMobile = z
  .string()
  .regex(/^[6-9]\d{9}$/, "Enter valid 10-digit Indian mobile number");

const pinCode = z
  .string()
  .regex(/^\d{6}$/, "Enter valid 6-digit PIN code");

export const clientFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Institution name is required")
    .max(200, "Institution name is too long"),
  type: z.enum(["bank", "patsanstha"]),
  registrationNumber: z
    .string()
    .trim()
    .min(1, "Registration number is required")
    .max(100, "Registration number is too long"),
  contactPerson: z
    .string()
    .trim()
    .min(2, "Contact person is required")
    .max(100, "Contact person name is too long"),
  mobile: indianMobile,
  email: z.string().trim().email("Enter valid email").max(255),
  address: z.string().trim().min(5, "Address is required").max(500),
  city: z.string().trim().min(2, "City is required").max(100),
  district: z.string().trim().min(2, "District is required").max(100),
  state: z.string().trim().min(1, "State is required").max(100),
  pinCode: pinCode,
});

export type ClientFormInput = z.infer<typeof clientFormSchema>;

export const clientListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().optional(),
  type: z.enum(["all", "bank", "patsanstha"]).default("all"),
  status: z.enum(["all", "active", "inactive", "pending"]).default("all"),
});

export type ClientListQuery = z.infer<typeof clientListQuerySchema>;
