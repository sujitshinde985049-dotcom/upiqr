/**
 * SabPaisa mock QR provider contract verification.
 * Run: npm run test:qr-provider-contract
 * No live SabPaisa HTTP requests are made.
 */
import { MockSabPaisaQRProvider } from "../src/lib/sabpaisa/providers/mock-provider";
import {
  MOCK_SABPAISA_ERROR_MAP,
  sabPaisaCreateQrResponseSchema,
} from "../src/lib/sabpaisa/qr-types";
import { isSabPaisaError } from "../src/lib/sabpaisa/errors";
import { parseSabPaisaErrorResponse } from "../src/lib/sabpaisa/errors";

type TestResult = { name: string; passed: boolean; detail: string };
const results: TestResult[] = [];

function record(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} — ${name}: ${detail}`);
}

async function runTests() {
  console.log("Running QR provider contract tests...\n");

  const provider = new MockSabPaisaQRProvider();
  const response = await provider.createQR({
    rail_id: "hdfc",
    qr_name: "Counter QR",
    qr_identifier: "shop01",
    max_amount_per_transaction: 5000,
    description: "Test counter",
    category: "Retail",
    merchantBusinessName: "Sai Traders",
  });

  const parsed = sabPaisaCreateQrResponseSchema.safeParse(response);
  record(
    "Mock create response matches documented success shape",
    parsed.success &&
      response.success === true &&
      response.message === "QR code created successfully",
    parsed.success ? "Schema valid" : "Schema invalid"
  );

  const data = response.data;
  record(
    "Response data contains required contract fields",
    Boolean(
      data.qr_id &&
        data.qr_identifier &&
        data.vpa &&
        data.qr_name &&
        data.status &&
        data.qr_image_url &&
        data.upi_string &&
        data.created_at
    ),
    `qr_id=${data.qr_id}`
  );

  record(
    "Mock provider ID uses mock prefix",
    data.qr_id.startsWith("mock_qr_"),
    data.qr_id
  );

  record(
    "Mock VPA is clearly synthetic",
    data.vpa.includes("NOT-PAYABLE") && data.vpa.endsWith(".invalid"),
    data.vpa
  );

  record(
    "Mock UPI string is not a live payment destination",
    data.upi_string.startsWith("mahacred-test://") &&
      !data.upi_string.startsWith("upi://pay"),
    data.upi_string
  );

  for (const [simulation, expected] of Object.entries(MOCK_SABPAISA_ERROR_MAP)) {
    const errorProvider = new MockSabPaisaQRProvider({
      simulateError: simulation as keyof typeof MOCK_SABPAISA_ERROR_MAP,
    });
    try {
      await errorProvider.createQR({
        rail_id: "icici",
        qr_name: "Test",
        merchantBusinessName: "Test Merchant",
      });
      record(`Error simulation ${simulation}`, false, "Did not throw");
    } catch (error) {
      record(
        `Error simulation ${simulation}`,
        isSabPaisaError(error) && error.code === expected.code,
        isSabPaisaError(error) ? error.code : String(error)
      );
    }
  }

  const normalized = parseSabPaisaErrorResponse(400, {
    error: {
      code: "QR_VALIDATION_ERROR",
      message: "Validation failed",
      request_id: "req_contract_001",
    },
  });
  record(
    "Documented error normalization preserves request_id",
    normalized.requestId === "req_contract_001" &&
      normalized.code === "QR_VALIDATION_ERROR",
    `requestId=${normalized.requestId}`
  );

  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n${results.length - failed}/${results.length} tests passed`);
  if (failed > 0) process.exit(1);
}

runTests().catch((error) => {
  console.error("Provider contract tests failed:", error);
  process.exit(1);
});
