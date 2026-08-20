import { z } from "zod";
import { clientFormSchema } from "./clients";

export { clientFormSchema as createClientSchema } from "./clients";

export const updateClientSchema = clientFormSchema.extend({
  clientId: z.string().min(1, "Client ID is required"),
});

export const updateClientStatusSchema = z.object({
  clientId: z.string().min(1, "Client ID is required"),
  action: z.enum(["activate", "deactivate"]),
});

export {
  merchantFormSchema as createMerchantSchema,
  createMerchantInputSchema,
  updateMerchantSchema,
  updateMerchantStatusSchema,
  merchantListQuerySchema,
} from "./merchants";

export const createQRSchema = z.object({
  clientId: z.string().min(1, "Select Bank / Patsanstha"),
  merchantId: z.string().min(1, "Select Merchant"),
  qrName: z.string().min(2, "QR Name is required"),
  qrIdentifier: z.string().min(2, "QR Identifier is required"),
  railId: z.enum(["HDFC", "ICICI"]),
  maxAmountPerTransaction: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
});
