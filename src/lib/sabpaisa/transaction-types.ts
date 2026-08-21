import { z } from "zod";
import { sabPaisaRailIdSchema } from "./qr-types";

export const sabPaisaTransactionStatusSchema = z.enum([
  "success",
  "pending",
  "failed",
]);

export const sabPaisaTransactionFilterStatusSchema = z.enum([
  "success",
  "pending",
  "failed",
  "all",
]);

export const sabPaisaTransactionSchema = z.object({
  id: z.string().min(1),
  transaction_id: z.string().min(1),
  qr_code_id: z.string().min(1).optional(),
  qr_identifier: z.string().optional(),
  qr_name: z.string().optional(),
  rail_id: sabPaisaRailIdSchema.optional(),
  amount: z.number(),
  status: sabPaisaTransactionStatusSchema,
  customer_vpa: z.string().nullable().optional(),
  customer_name: z.string().nullable().optional(),
  payment_method: z.string().nullable().optional(),
  reference_number: z.string().nullable().optional(),
  bank_reference_number: z.string().nullable().optional(),
  initiated_at: z.string().min(1),
  completed_at: z.string().nullable().optional(),
});

export const sabPaisaListTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  qr_id: z.string().trim().optional(),
  status: sabPaisaTransactionFilterStatusSchema.default("all"),
  from_date: z.string().trim().optional(),
  to_date: z.string().trim().optional(),
  search: z.string().trim().max(100).optional(),
  sort_by: z.enum(["created_at", "amount", "status"]).default("created_at"),
  sort_order: z.enum(["asc", "desc"]).default("desc"),
});

export const sabPaisaListQrTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["success", "pending", "failed"]).optional(),
  from_date: z.string().trim().optional(),
  to_date: z.string().trim().optional(),
});

export const sabPaisaListTransactionsResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().min(1),
  data: z.object({
    transactions: z.array(sabPaisaTransactionSchema),
    pagination: z.object({
      total: z.number().int().nonnegative(),
      page: z.number().int().positive(),
      limit: z.number().int().positive(),
      totalPages: z.number().int().nonnegative(),
    }),
  }),
});

export const sabPaisaListQrTransactionsResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().min(1),
  data: z.object({
    transactions: z.array(sabPaisaTransactionSchema),
    pagination: z.object({
      total: z.number().int().nonnegative(),
      page: z.number().int().positive(),
      limit: z.number().int().positive(),
      total_pages: z.number().int().nonnegative(),
    }),
  }),
});

export type SabPaisaTransaction = z.infer<typeof sabPaisaTransactionSchema>;
export type SabPaisaListTransactionsQuery = z.infer<
  typeof sabPaisaListTransactionsQuerySchema
>;
export type SabPaisaListQrTransactionsQuery = z.infer<
  typeof sabPaisaListQrTransactionsQuerySchema
>;
export type SabPaisaListTransactionsResponse = z.infer<
  typeof sabPaisaListTransactionsResponseSchema
>;
export type SabPaisaListQrTransactionsResponse = z.infer<
  typeof sabPaisaListQrTransactionsResponseSchema
>;

export interface SabPaisaTransactionProviderRecord {
  localId: string;
  transaction_id: string;
  qr_code_id: string;
  qr_identifier: string;
  qr_name: string;
  rail_id: "hdfc" | "icici";
  amount: number;
  status: "success" | "pending" | "failed";
  customer_vpa: string | null;
  customer_name: string | null;
  payment_method: string | null;
  reference_number: string | null;
  bank_reference_number: string | null;
  initiated_at: string;
  completed_at: string | null;
  provider_mode: "mock" | "live" | "legacy";
}

export interface SabPaisaTransactionProvider {
  readonly mode: "mock" | "live";
  listTransactions(
    records: SabPaisaTransactionProviderRecord[],
    query: SabPaisaListTransactionsQuery
  ): Promise<SabPaisaListTransactionsResponse>;
  listQRTransactions(
    records: SabPaisaTransactionProviderRecord[],
    query: SabPaisaListQrTransactionsQuery
  ): Promise<SabPaisaListQrTransactionsResponse>;
}
