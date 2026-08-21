/**
 * SabPaisa mock transaction provider contract verification — Phase 5 Part 1.
 * Run: npm run test:transaction-provider-contract
 * No live SabPaisa HTTP requests are made.
 */
import { MockSabPaisaTransactionProvider } from "../src/lib/sabpaisa/providers/mock-transaction-provider";
import {
  sabPaisaListQrTransactionsResponseSchema,
  sabPaisaListTransactionsResponseSchema,
  type SabPaisaTransactionProviderRecord,
} from "../src/lib/sabpaisa/transaction-types";

type TestResult = { name: string; passed: boolean; detail: string };
const results: TestResult[] = [];

function record(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} — ${name}: ${detail}`);
}

const sampleRecords: SabPaisaTransactionProviderRecord[] = Array.from(
  { length: 3 },
  (_, index) => ({
    localId: `local-${index + 1}`,
    transaction_id: `mock_txn_sample_${index + 1}`,
    qr_code_id: "mock_qr_001",
    qr_identifier: "shop01",
    qr_name: "Counter QR",
    rail_id: "hdfc",
    amount: 100 + index,
    status: index === 0 ? "success" : index === 1 ? "pending" : "failed",
    customer_vpa: "test-customer@mock",
    customer_name: "Test Customer",
    payment_method: "UPI",
    reference_number: "MOCK-REF-001",
    bank_reference_number: "MOCK-BANK-001",
    initiated_at: new Date().toISOString(),
    completed_at: index === 1 ? null : new Date().toISOString(),
    provider_mode: "mock",
  })
);

async function runTests() {
  console.log("Running transaction provider contract tests...\n");
  const provider = new MockSabPaisaTransactionProvider();

  const allResponse = await provider.listTransactions(sampleRecords, {
    page: 1,
    limit: 2,
    status: "all",
    sort_by: "created_at",
    sort_order: "desc",
  });

  const allParsed = sabPaisaListTransactionsResponseSchema.safeParse(allResponse);
  record(
    "All-transactions response matches documented success shape",
    allParsed.success &&
      allResponse.success === true &&
      allResponse.message === "Transactions fetched successfully",
    allParsed.success ? "Schema valid" : "Schema invalid"
  );

  record(
    "All-transactions pagination uses totalPages",
    "totalPages" in allResponse.data.pagination &&
      !("total_pages" in allResponse.data.pagination),
    JSON.stringify(allResponse.data.pagination)
  );

  record(
    "All-transactions pagination contract fields present",
    allResponse.data.pagination.total >= 0 &&
      allResponse.data.pagination.page === 1 &&
      allResponse.data.pagination.limit === 2 &&
      allResponse.data.pagination.totalPages >= 1,
    JSON.stringify(allResponse.data.pagination)
  );

  const qrResponse = await provider.listQRTransactions(sampleRecords, {
    page: 1,
    limit: 2,
  });

  const qrParsed = sabPaisaListQrTransactionsResponseSchema.safeParse(qrResponse);
  record(
    "QR-specific response matches documented success shape",
    qrParsed.success &&
      qrResponse.success === true &&
      qrResponse.message === "Transactions fetched successfully",
    qrParsed.success ? "Schema valid" : "Schema invalid"
  );

  record(
    "QR-specific pagination uses total_pages",
    "total_pages" in qrResponse.data.pagination &&
      !("totalPages" in qrResponse.data.pagination),
    JSON.stringify(qrResponse.data.pagination)
  );

  const filtered = await provider.listTransactions(sampleRecords, {
    page: 1,
    limit: 10,
    status: "success",
    sort_by: "amount",
    sort_order: "asc",
  });
  record(
    "Status filter success returns only success records",
    filtered.data.transactions.every((txn) => txn.status === "success"),
    `${filtered.data.transactions.length} records`
  );

  const failed = await provider.listTransactions(
    sampleRecords.map((record) => ({ ...record, status: "failed" as const })),
    {
      page: 1,
      limit: 10,
      status: "failed",
      sort_by: "created_at",
      sort_order: "desc",
    }
  );
  record(
    "Status filter failed returns only failed records",
    failed.data.transactions.every((txn) => txn.status === "failed"),
    `${failed.data.transactions.length} records`
  );

  const pending = await provider.listTransactions(
    sampleRecords.map((record) => ({ ...record, status: "pending" as const })),
    {
      page: 1,
      limit: 10,
      status: "pending",
      sort_by: "created_at",
      sort_order: "desc",
    }
  );
  record(
    "Status filter pending returns only pending records",
    pending.data.transactions.every((txn) => txn.status === "pending"),
    `${pending.data.transactions.length} records`
  );

  const passed = results.filter((result) => result.passed).length;
  const failedCount = results.length - passed;
  console.log(`\nTransaction provider contract: ${passed}/${results.length}`);
  process.exit(failedCount ? 1 : 0);
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
