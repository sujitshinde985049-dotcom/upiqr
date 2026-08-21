import { randomBytes } from "node:crypto";
import { SabPaisaError } from "../errors";
import {
  generateTestQrPng,
  generateTestQrSvg,
  isPayableUpiPayload,
} from "../qr-download";
import {
  MOCK_SABPAISA_ERROR_MAP,
  sabPaisaActivateQrResponseSchema,
  sabPaisaCreateQrResponseSchema,
  sabPaisaDownloadQuerySchema,
  sabPaisaListQrQuerySchema,
  sabPaisaUpdateQrRequestSchema,
  type MockSabPaisaErrorSimulation,
  type SabPaisaActivateQrResponse,
  type SabPaisaCreateQrResponse,
  type SabPaisaDownloadQuery,
  type SabPaisaDownloadResult,
  type SabPaisaGetQrResponse,
  type SabPaisaListQrQuery,
  type SabPaisaListQrResponse,
  type SabPaisaQRProvider,
  type SabPaisaQRProviderCreateInput,
  type SabPaisaQRProviderRecord,
  type SabPaisaUpdateQrRequest,
  type SabPaisaUpdateQrResponse,
} from "../qr-types";

const MOCK_QR_IMAGE_PATH = "/demo-qr.svg";
const MOCK_VPA_DOMAIN = "mahacred.invalid";
const MOCK_VPA_PREFIX = "test.mock.NOT-PAYABLE";

export interface MockSabPaisaQRProviderOptions {
  simulateError?: MockSabPaisaErrorSimulation;
}

function recordToData(record: SabPaisaQRProviderRecord) {
  return {
    qr_id: record.qr_id,
    qr_identifier: record.qr_identifier,
    vpa: record.vpa ?? `${MOCK_VPA_PREFIX}@${MOCK_VPA_DOMAIN}`,
    qr_name: record.qr_name,
    description: record.description,
    max_amount_per_transaction: record.max_amount_per_transaction,
    category: record.category,
    status: record.status,
    qr_image_url: record.qr_image_url ?? MOCK_QR_IMAGE_PATH,
    upi_string:
      record.upi_string ??
      `mahacred-test://qr/not-payable/${record.qr_id}`,
    created_at: record.created_at,
  };
}

function maybeSimulateError(options: MockSabPaisaQRProviderOptions): void {
  if (!options.simulateError) return;
  const mapped = MOCK_SABPAISA_ERROR_MAP[options.simulateError];
  throw new SabPaisaError({
    code: mapped.code,
    message: mapped.message,
    retryable: false,
  });
}

export class MockSabPaisaQRProvider implements SabPaisaQRProvider {
  readonly mode = "mock" as const;
  private readonly options: MockSabPaisaQRProviderOptions;

  constructor(options: MockSabPaisaQRProviderOptions = {}) {
    this.options = options;
  }

  async createQR(
    input: SabPaisaQRProviderCreateInput
  ): Promise<SabPaisaCreateQrResponse> {
    maybeSimulateError(this.options);

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

  async getQR(record: SabPaisaQRProviderRecord): Promise<SabPaisaGetQrResponse> {
    return {
      success: true,
      data: {
        ...recordToData(record),
        total_transactions: 0,
        total_amount: 0,
      },
    };
  }

  async listQRs(
    records: SabPaisaQRProviderRecord[],
    queryInput: SabPaisaListQrQuery
  ): Promise<SabPaisaListQrResponse> {
    const query = sabPaisaListQrQuerySchema.parse(queryInput);
    let filtered = [...records];

    if (query.status !== "all") {
      filtered = filtered.filter((record) => record.status === query.status);
    }
    if (query.category) {
      const category = query.category.toLowerCase();
      filtered = filtered.filter(
        (record) => record.category?.toLowerCase() === category
      );
    }
    if (query.search) {
      const search = query.search.toLowerCase();
      filtered = filtered.filter(
        (record) =>
          record.qr_name.toLowerCase().includes(search) ||
          record.qr_identifier.toLowerCase().includes(search) ||
          record.qr_id.toLowerCase().includes(search)
      );
    }
    if (query.from_date) {
      const from = new Date(query.from_date).getTime();
      filtered = filtered.filter(
        (record) => new Date(record.created_at).getTime() >= from
      );
    }
    if (query.to_date) {
      const to = new Date(query.to_date).getTime();
      filtered = filtered.filter(
        (record) => new Date(record.created_at).getTime() <= to
      );
    }

    filtered.sort((a, b) => {
      const direction = query.sort_order === "asc" ? 1 : -1;
      if (query.sort_by === "qr_name") {
        return a.qr_name.localeCompare(b.qr_name) * direction;
      }
      if (query.sort_by === "status") {
        return a.status.localeCompare(b.status) * direction;
      }
      return (
        (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) *
        direction
      );
    });

    const total = filtered.length;
    const start = (query.page - 1) * query.limit;
    const pageItems = filtered.slice(start, start + query.limit);

    return {
      success: true,
      data: {
        items: pageItems.map((record) => ({
          ...recordToData(record),
          total_transactions: 0,
          total_amount: 0,
        })),
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          total_pages: Math.max(1, Math.ceil(total / query.limit)),
        },
      },
    };
  }

  async updateQR(
    record: SabPaisaQRProviderRecord,
    input: SabPaisaUpdateQrRequest
  ): Promise<SabPaisaUpdateQrResponse> {
    const parsed = sabPaisaUpdateQrRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw new SabPaisaError({
        code: "QR_VALIDATION_ERROR",
        message:
          parsed.error.issues[0]?.message ?? "No valid fields to update",
        retryable: false,
      });
    }

    const updated = {
      ...recordToData(record),
      qr_name: parsed.data.reference_name ?? record.qr_name,
      description:
        parsed.data.description !== undefined
          ? parsed.data.description
          : record.description,
      category:
        parsed.data.category !== undefined ? parsed.data.category : record.category,
      status: parsed.data.status ?? record.status,
    };

    return {
      success: true,
      message: "QR code updated successfully",
      data: updated,
    };
  }

  async deactivateQR(record: SabPaisaQRProviderRecord): Promise<void> {
    if (record.has_pending_transactions) {
      throw new SabPaisaError({
        code: "QR_003",
        message: "Cannot delete QR with pending transactions",
        retryable: false,
      });
    }
    if (record.status === "inactive") {
      return;
    }
  }

  async activateQR(
    record: SabPaisaQRProviderRecord
  ): Promise<SabPaisaActivateQrResponse> {
    const response = {
      success: true as const,
      message: "QR code activated successfully",
      data: {
        qr_id: record.qr_id,
        status: "active" as const,
      },
    };
    return sabPaisaActivateQrResponseSchema.parse(response);
  }

  async downloadQR(
    record: SabPaisaQRProviderRecord,
    queryInput: SabPaisaDownloadQuery
  ): Promise<SabPaisaDownloadResult> {
    const query = sabPaisaDownloadQuerySchema.safeParse(queryInput);
    if (!query.success) {
      const issue = query.error.issues[0];
      if (issue?.path.includes("size")) {
        throw new SabPaisaError({
          code: "QR_VALIDATION_ERROR",
          message: issue.message,
          retryable: false,
        });
      }
      throw new SabPaisaError({
        code: "INVALID_FORMAT",
        message: "Invalid download format",
        retryable: false,
      });
    }

    if (query.data.format === "pdf") {
      throw new SabPaisaError({
        code: "FORMAT_NOT_SUPPORTED",
        message: "PDF format is not currently supported",
        retryable: false,
      });
    }

    const filename = `test_qr_${record.localId}.${query.data.format}`;

    if (query.data.format === "svg") {
      const svg = generateTestQrSvg(record.localId, query.data.size);
      return {
        contentType: "image/svg+xml",
        filename,
        body: Buffer.from(svg, "utf8"),
      };
    }

    const png = await generateTestQrPng(record.localId, query.data.size);
    const payload = `MAHACRED_TEST_QR:${record.localId}`;
    if (isPayableUpiPayload(payload)) {
      throw new SabPaisaError({
        code: "QR_PAYLOAD_MISSING",
        message: "Failed to download QR",
        retryable: false,
      });
    }

    return {
      contentType: "image/png",
      filename,
      body: png,
    };
  }
}
