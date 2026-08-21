import { z } from "zod";
import {
  sabPaisaListQrTransactionsQuerySchema,
  sabPaisaListTransactionsQuerySchema,
} from "@/lib/sabpaisa/transaction-types";

export const transactionListQuerySchema = sabPaisaListTransactionsQuerySchema
  .extend({
    clientId: z.string().trim().optional(),
    merchantId: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.from_date && Number.isNaN(Date.parse(value.from_date))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid from_date",
        path: ["from_date"],
      });
    }
    if (value.to_date && Number.isNaN(Date.parse(value.to_date))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid to_date",
        path: ["to_date"],
      });
    }
    if (
      value.from_date &&
      value.to_date &&
      !Number.isNaN(Date.parse(value.from_date)) &&
      !Number.isNaN(Date.parse(value.to_date)) &&
      new Date(value.from_date) > new Date(value.to_date)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid date range",
        path: ["to_date"],
      });
    }
  });

export const qrTransactionListQuerySchema =
  sabPaisaListQrTransactionsQuerySchema.superRefine((value, ctx) => {
    if (value.from_date && Number.isNaN(Date.parse(value.from_date))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid from_date",
        path: ["from_date"],
      });
    }
    if (value.to_date && Number.isNaN(Date.parse(value.to_date))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid to_date",
        path: ["to_date"],
      });
    }
    if (
      value.from_date &&
      value.to_date &&
      !Number.isNaN(Date.parse(value.from_date)) &&
      !Number.isNaN(Date.parse(value.to_date)) &&
      new Date(value.from_date) > new Date(value.to_date)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid date range",
        path: ["to_date"],
      });
    }
  });

export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>;
export type QrTransactionListQuery = z.infer<
  typeof qrTransactionListQuerySchema
>;

export const mockTransactionCreateSchema = z.object({
  qrId: z.string().min(1),
  amount: z.number().positive(),
  status: z.enum(["success", "pending", "failed"]),
});

export type MockTransactionCreateInput = z.infer<
  typeof mockTransactionCreateSchema
>;

const transactionDateRangeRefinement = (
  value: {
    fromDate?: string;
    toDate?: string;
  },
  ctx: z.RefinementCtx
) => {
  if (value.fromDate && Number.isNaN(Date.parse(value.fromDate))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Invalid fromDate",
      path: ["fromDate"],
    });
  }
  if (value.toDate && Number.isNaN(Date.parse(value.toDate))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Invalid toDate",
      path: ["toDate"],
    });
  }
  if (
    value.fromDate &&
    value.toDate &&
    !Number.isNaN(Date.parse(value.fromDate)) &&
    !Number.isNaN(Date.parse(value.toDate)) &&
    new Date(value.fromDate) > new Date(value.toDate)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Invalid date range",
      path: ["toDate"],
    });
  }
};

export const transactionManagementFiltersSchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(["success", "pending", "failed", "all"]).default("all"),
  clientId: z.string().trim().optional(),
  merchantId: z.string().trim().optional(),
  qrId: z.string().trim().optional(),
  providerMode: z.enum(["mock", "live", "legacy", "all"]).default("all"),
  fromDate: z.string().trim().optional(),
  toDate: z.string().trim().optional(),
  sortBy: z
    .enum(["created_at", "amount", "status", "initiated_at"])
    .default("initiated_at"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type TransactionManagementFilters = z.infer<
  typeof transactionManagementFiltersSchema
>;

export const transactionManagementQuerySchema =
  transactionManagementFiltersSchema
    .extend({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    })
    .superRefine(transactionDateRangeRefinement);

export type TransactionManagementQuery = z.infer<
  typeof transactionManagementQuerySchema
>;

export const transactionExportQuerySchema =
  transactionManagementFiltersSchema.superRefine(transactionDateRangeRefinement);

export type TransactionExportQuery = z.infer<typeof transactionExportQuerySchema>;
