import { SabPaisaError } from "../errors";
import type {
  SabPaisaActivateQrResponse,
  SabPaisaCreateQrResponse,
  SabPaisaDownloadQuery,
  SabPaisaDownloadResult,
  SabPaisaGetQrResponse,
  SabPaisaListQrQuery,
  SabPaisaListQrResponse,
  SabPaisaQRProvider,
  SabPaisaQRProviderCreateInput,
  SabPaisaQRProviderRecord,
  SabPaisaUpdateQrRequest,
  SabPaisaUpdateQrResponse,
} from "../qr-types";

function notReady(): never {
  throw new SabPaisaError({
    code: "LIVE_INTEGRATION_NOT_READY",
    message:
      "Live SabPaisa QR integration is not ready. Credentials and encryption interoperability are required.",
    retryable: false,
  });
}

export class LiveSabPaisaQRProvider implements SabPaisaQRProvider {
  readonly mode = "live" as const;

  async createQR(
    _input: SabPaisaQRProviderCreateInput
  ): Promise<SabPaisaCreateQrResponse> {
    notReady();
  }

  async getQR(_record: SabPaisaQRProviderRecord): Promise<SabPaisaGetQrResponse> {
    notReady();
  }

  async listQRs(
    _records: SabPaisaQRProviderRecord[],
    _query: SabPaisaListQrQuery
  ): Promise<SabPaisaListQrResponse> {
    notReady();
  }

  async updateQR(
    _record: SabPaisaQRProviderRecord,
    _input: SabPaisaUpdateQrRequest
  ): Promise<SabPaisaUpdateQrResponse> {
    notReady();
  }

  async deactivateQR(_record: SabPaisaQRProviderRecord): Promise<void> {
    notReady();
  }

  async activateQR(
    _record: SabPaisaQRProviderRecord
  ): Promise<SabPaisaActivateQrResponse> {
    notReady();
  }

  async downloadQR(
    _record: SabPaisaQRProviderRecord,
    _query: SabPaisaDownloadQuery
  ): Promise<SabPaisaDownloadResult> {
    notReady();
  }
}
