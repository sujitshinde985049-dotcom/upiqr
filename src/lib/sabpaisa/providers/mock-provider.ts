import { randomBytes } from "node:crypto";
import { SabPaisaError } from "../errors";
import {
  MOCK_SABPAISA_ERROR_MAP,
  sabPaisaCreateQrResponseSchema,
  type MockSabPaisaErrorSimulation,
  type SabPaisaCreateQrResponse,
  type SabPaisaQRProvider,
  type SabPaisaQRProviderCreateInput,
} from "../qr-types";

const MOCK_QR_IMAGE_PATH = "/demo-qr.svg";
const MOCK_VPA_DOMAIN = "mahacred.invalid";
const MOCK_VPA_PREFIX = "test.mock.NOT-PAYABLE";

export interface MockSabPaisaQRProviderOptions {
  simulateError?: MockSabPaisaErrorSimulation;
}

export class MockSabPaisaQRProvider implements SabPaisaQRProvider {
  readonly mode = "mock" as const;
  private readonly simulateError?: MockSabPaisaErrorSimulation;

  constructor(options: MockSabPaisaQRProviderOptions = {}) {
    this.simulateError = options.simulateError;
  }

  async createQR(
    input: SabPaisaQRProviderCreateInput
  ): Promise<SabPaisaCreateQrResponse> {
    if (this.simulateError) {
      const mapped = MOCK_SABPAISA_ERROR_MAP[this.simulateError];
      throw new SabPaisaError({
        code: mapped.code,
        message: mapped.message,
        retryable: false,
      });
    }

    const suffix = randomBytes(6).toString("hex");
    const qrId = `mock_qr_${suffix}`;
    const identifier =
      input.qr_identifier ??
      `${input.rail_id}${suffix.slice(0, 6)}`.slice(0, input.rail_id === "hdfc" ? 10 : 15);

    const response = {
      success: true as const,
      message: "QR code created successfully",
      data: {
        qr_id: qrId,
        qr_identifier: identifier,
        vpa: `${MOCK_VPA_PREFIX}@${MOCK_VPA_DOMAIN}`,
        qr_name: input.qr_name,
        description: input.description ?? null,
        max_amount_per_transaction: input.max_amount_per_transaction ?? null,
        category: input.category ?? null,
        status: "active",
        qr_image_url: MOCK_QR_IMAGE_PATH,
        upi_string: `mahacred-test://qr/not-payable/${qrId}`,
        created_at: new Date().toISOString(),
      },
    };

    return sabPaisaCreateQrResponseSchema.parse(response);
  }
}
