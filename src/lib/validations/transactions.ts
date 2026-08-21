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
