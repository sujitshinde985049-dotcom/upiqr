import { SabPaisaError } from "../errors";
import type {
  SabPaisaCreateQrResponse,
  SabPaisaQRProvider,
  SabPaisaQRProviderCreateInput,
} from "../qr-types";

export class LiveSabPaisaQRProvider implements SabPaisaQRProvider {
  readonly mode = "live" as const;

  async createQR(
    _input: SabPaisaQRProviderCreateInput
  ): Promise<SabPaisaCreateQrResponse> {
    throw new SabPaisaError({
      code: "LIVE_INTEGRATION_NOT_READY",
      message:
        "Live SabPaisa QR integration is not ready. Credentials and encryption interoperability are required.",
      retryable: false,
    });
  }
}
