import { z } from "zod";

export const monitoringQuerySchema = z.object({
  dateWindow: z.enum(["today", "7days", "30days"]).default("7days"),
  providerMode: z.enum(["mock", "live", "legacy", "all"]).default("all"),
  clientId: z.string().trim().optional(),
  merchantId: z.string().trim().optional(),
  transactionStatus: z
    .enum(["all", "success", "pending", "failed"])
    .default("all"),
  eventProcessingStatus: z
    .enum(["all", "received", "processed", "duplicate", "rejected", "failed"])
    .default("all"),
});

export type MonitoringQuery = z.infer<typeof monitoringQuerySchema>;
