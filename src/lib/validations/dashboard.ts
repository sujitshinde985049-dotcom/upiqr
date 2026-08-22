import { z } from "zod";

export const dashboardQuerySchema = z.object({
  dateWindow: z.enum(["today", "7days", "30days"]).default("7days"),
  providerMode: z.enum(["mock", "live", "legacy", "all"]).default("all"),
  clientId: z.string().trim().optional(),
  merchantId: z.string().trim().optional(),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
