import { differenceInCalendarDays, endOfDay, startOfDay } from "date-fns";
import { z } from "zod";
import { transactionManagementFiltersSchema } from "./transactions";

export const MAX_CUSTOM_REPORT_DAYS = 365;

export const reportsQuerySchema = transactionManagementFiltersSchema
  .extend({
    dateWindow: z
      .enum(["today", "7days", "30days", "custom"])
      .default("30days"),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .superRefine((value, ctx) => {
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

    if (value.dateWindow === "custom") {
      if (!value.fromDate || !value.toDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Custom date range requires fromDate and toDate",
          path: ["fromDate"],
        });
        return;
      }

      const days =
        differenceInCalendarDays(
          endOfDay(new Date(value.toDate)),
          startOfDay(new Date(value.fromDate))
        ) + 1;
      if (days > MAX_CUSTOM_REPORT_DAYS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Custom date range cannot exceed ${MAX_CUSTOM_REPORT_DAYS} days`,
          path: ["toDate"],
        });
      }
    }
  });

export type ReportsQuery = z.infer<typeof reportsQuerySchema>;
