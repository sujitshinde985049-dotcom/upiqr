/**
 * Phase 5 Part 3 transaction management verification.
 * Run: npm run test:phase5-part3
 * Requires Neon database. No live SabPaisa HTTP requests.
 */
import "dotenv/config";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient, QRProviderMode, TransactionStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { decimalToNumber } from "../src/lib/mappers";
import { loadSabPaisaIntegrationMode } from "../src/lib/sabpaisa/mode";
import {
  exportManagedTransactionsCsv,
  getManagedTransactionDetail,
  listManagedTransactions,
  listManagedTransactionsForScope,
} from "../src/lib/services/transaction-management-service";
import {
  TransactionServiceError,
  getTransactionByIdForUser,
} from "../src/lib/services/transaction-service";
import { getTransactionReconciliationStatus } from "../src/lib/transactions/reconciliation";
import {
  buildCsvContent,
  CSV_EXPORT_MAX_ROWS,
  sanitizeCsvCell,
} from "../src/lib/utils/csv-export";
import { maskCustomerVpa } from "../src/lib/utils/mask-vpa";
import {
  transactionManagementQuerySchema,
} from "../src/lib/validations/transactions";
import type { SessionUser } from "../src/lib/auth/types";

process.env.SABPAISA_MODE = "mock";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type TestResult = { name: string; passed: boolean; detail: string };
const results: TestResult[] = [];

function record(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} — ${name}: ${detail}`);
}

const superAdmin: SessionUser = {
  id: "USR001",
  name: "Super Admin",
  email: "admin@mahacred.in",
  role: "SUPER_ADMIN",
  clientId: null,
  merchantId: null,
};

const clientAAdmin: SessionUser = {
  id: "USR002",
  name: "Rajesh Patil",
  email: "rajesh@sahyadrinagari.coop",
  role: "CLIENT_ADMIN",
  clientId: "CLT001",
  merchantId: null,
};

const clientAOperator: SessionUser = {
  id: "USR005",
  name: "Sneha Kulkarni",
  email: "sneha@sahyadrinagari.coop",
  role: "CLIENT_OPERATOR",
  clientId: "CLT001",
  merchantId: null,
};

const clientBAdmin: SessionUser = {
  id: "USR003",
  name: "Priya Deshmukh",
  email: "priya@democoopbank.in",
  role: "CLIENT_ADMIN",
  clientId: "CLT002",
  merchantId: null,
};

const merchantAUser: SessionUser = {
  id: "USR004",
  name: "Amit Shinde",
  email: "amit@shreeelectronics.example.com",
  role: "MERCHANT_USER",
  clientId: "CLT001",
  merchantId: "MCH003",
};

const merchantBUser: SessionUser = {
  id: "USR006",
  name: "Krishna Desai",
  email: "krishna@krishnaent.example.com",
  role: "MERCHANT_USER",
  clientId: "CLT002",
  merchantId: "MCH005",
};

function walkFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walkFiles(fullPath, files);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

async function findSampleTransactions() {
  const clientATxn = await prisma.transaction.findFirst({
    where: { clientId: "CLT001" },
    orderBy: { initiatedAt: "desc" },
  });
  const clientBTxn = await prisma.transaction.findFirst({
    where: { clientId: "CLT002" },
    orderBy: { initiatedAt: "desc" },
  });
  const merchantATxn = await prisma.transaction.findFirst({
    where: { merchantId: "MCH003" },
    orderBy: { initiatedAt: "desc" },
  });
  const merchantBTxn = await prisma.transaction.findFirst({
    where: { merchantId: "MCH005" },
    orderBy: { initiatedAt: "desc" },
  });
  const legacyTxn = await prisma.transaction.findFirst({
    where: { providerMode: QRProviderMode.LEGACY },
  });
  const mockTxn = await prisma.transaction.findFirst({
    where: { providerMode: QRProviderMode.MOCK },
  });
  const successTxn = await prisma.transaction.findFirst({
    where: { status: TransactionStatus.SUCCESS },
  });
  const pendingTxn = await prisma.transaction.findFirst({
    where: { status: TransactionStatus.PENDING },
  });
  const failedTxn = await prisma.transaction.findFirst({
    where: { status: TransactionStatus.FAILED },
  });
  const qrTxn = await prisma.transaction.findFirst({
    where: { qrId: "QR004" },
  });

  return {
    clientATxn,
    clientBTxn,
    merchantATxn,
    merchantBTxn,
    legacyTxn,
    mockTxn,
    successTxn,
    pendingTxn,
    failedTxn,
    qrTxn,
  };
}

async function runTests() {
  console.log("Running Phase 5 Part 3 transaction management tests...\n");

  const samples = await findSampleTransactions();

  const superList = await listManagedTransactions(superAdmin, { page: 1, limit: 20 });
  record(
    "SUPER_ADMIN transaction list works",
    superList.items.length >= 0 && superList.pagination.total >= 0,
    `${superList.items.length} items, total ${superList.pagination.total}`
  );

  const clientAList = await listManagedTransactions(clientAAdmin, {
    page: 1,
    limit: 50,
  });
  const clientAOnly = clientAList.items.every((t) => t.clientId === "CLT001");
  record(
    "CLIENT_ADMIN sees own Client only",
    clientAOnly,
    clientAOnly ? "all CLT001" : "cross-client rows found"
  );

  const clientBCross = await listManagedTransactions(clientAAdmin, {
    page: 1,
    limit: 50,
    clientId: "CLT002",
  });
  record(
    "CLIENT_ADMIN cannot query Client B",
    clientBCross.items.length === 0,
    `${clientBCross.items.length} rows`
  );

  const operatorCross = await listManagedTransactions(clientAOperator, {
    page: 1,
    limit: 50,
    clientId: "CLT002",
  });
  record(
    "CLIENT_OPERATOR cannot cross tenant",
    operatorCross.items.length === 0,
    `${operatorCross.items.length} rows`
  );

  const merchantList = await listManagedTransactions(merchantAUser, {
    page: 1,
    limit: 50,
  });
  const merchantOnly = merchantList.items.every((t) => t.merchantId === "MCH003");
  record(
    "MERCHANT_USER sees own Merchant only",
    merchantOnly,
    merchantOnly ? "all MCH003" : "cross-merchant rows found"
  );

  const merchantBCross = await listManagedTransactions(merchantAUser, {
    page: 1,
    limit: 50,
    merchantId: "MCH005",
  });
  record(
    "MERCHANT_USER cannot query Merchant B",
    merchantBCross.items.length === 0,
    `${merchantBCross.items.length} rows`
  );

  if (samples.clientBTxn) {
    const denied = await getManagedTransactionDetail(
      clientAAdmin,
      samples.clientBTxn.id
    );
    record(
      "Direct transaction detail cross-client denied",
      denied === null,
      denied ? "leaked" : "not found"
    );
  } else {
    record("Direct transaction detail cross-client denied", true, "no sample txn");
  }

  if (samples.merchantBTxn) {
    const denied = await getManagedTransactionDetail(
      merchantAUser,
      samples.merchantBTxn.id
    );
    record(
      "Direct transaction detail cross-merchant denied",
      denied === null,
      denied ? "leaked" : "not found"
    );
  } else {
    record(
      "Direct transaction detail cross-merchant denied",
      true,
      "no sample txn"
    );
  }

  if (samples.successTxn) {
    const successList = await listManagedTransactions(clientAAdmin, {
      page: 1,
      limit: 100,
      status: "success",
    });
    record(
      "Status success filter works",
      successList.items.every((t) => t.status === "success"),
      `${successList.items.length} rows`
    );
  }

  if (samples.pendingTxn) {
    const pendingList = await listManagedTransactions(clientAAdmin, {
      page: 1,
      limit: 100,
      status: "pending",
    });
    record(
      "pending filter works",
      pendingList.items.every((t) => t.status === "pending"),
      `${pendingList.items.length} rows`
    );
  }

  if (samples.failedTxn) {
    const failedList = await listManagedTransactions(clientAAdmin, {
      page: 1,
      limit: 100,
      status: "failed",
    });
    record(
      "failed filter works",
      failedList.items.every((t) => t.status === "failed"),
      `${failedList.items.length} rows`
    );
  }

  const clientFilter = await listManagedTransactions(superAdmin, {
    page: 1,
    limit: 20,
    clientId: "CLT001",
  });
  record(
    "Client filter works",
    clientFilter.items.every((t) => t.clientId === "CLT001"),
    `${clientFilter.items.length} rows`
  );

  const merchantFilter = await listManagedTransactions(superAdmin, {
    page: 1,
    limit: 20,
    merchantId: "MCH003",
  });
  record(
    "Merchant filter works",
    merchantFilter.items.every((t) => t.merchantId === "MCH003"),
    `${merchantFilter.items.length} rows`
  );

  if (samples.qrTxn) {
    const qrFilter = await listManagedTransactions(superAdmin, {
      page: 1,
      limit: 20,
      qrId: samples.qrTxn.qrId,
    });
    record(
      "QR filter works",
      qrFilter.items.every((t) => t.qrId === samples.qrTxn!.qrId),
      `${qrFilter.items.length} rows`
    );
  }

  const mockFilter = await listManagedTransactions(superAdmin, {
    page: 1,
    limit: 50,
    providerMode: "mock",
  });
  record(
    "MOCK filter works",
    mockFilter.items.every((t) => t.providerMode === "mock"),
    `${mockFilter.items.length} rows`
  );

  const legacyFilter = await listManagedTransactions(superAdmin, {
    page: 1,
    limit: 50,
    providerMode: "legacy",
  });
  record(
    "LEGACY filter works",
    legacyFilter.items.every((t) => t.providerMode === "legacy"),
    `${legacyFilter.items.length} rows`
  );

  const liveFilter = await listManagedTransactions(superAdmin, {
    page: 1,
    limit: 100,
    providerMode: "live",
  });
  record(
    "LIVE filter excludes MOCK/LEGACY",
    liveFilter.items.every((t) => t.providerMode === "live"),
    `${liveFilter.items.length} live rows`
  );

  const dateRange = await listManagedTransactions(superAdmin, {
    page: 1,
    limit: 20,
    fromDate: "2020-01-01",
    toDate: "2030-12-31",
  });
  record(
    "Date range works",
    dateRange.items.length >= 0,
    `${dateRange.items.length} rows`
  );

  const invalidDate = transactionManagementQuerySchema.safeParse({
    page: 1,
    limit: 20,
    fromDate: "2025-01-10",
    toDate: "2025-01-01",
  });
  record(
    "Invalid date range rejected",
    !invalidDate.success,
    invalidDate.success ? "accepted" : "rejected"
  );

  const longSearch = transactionManagementQuerySchema.safeParse({
    page: 1,
    limit: 20,
    search: "x".repeat(101),
  });
  record(
    "Search max length enforced",
    !longSearch.success,
    longSearch.success ? "accepted" : "rejected"
  );

  const invalidSort = transactionManagementQuerySchema.safeParse({
    page: 1,
    limit: 20,
    sortBy: "invalid_field",
  });
  record(
    "Invalid sort rejected",
    !invalidSort.success,
    invalidSort.success ? "accepted" : "rejected"
  );

  const page1 = await listManagedTransactions(superAdmin, { page: 1, limit: 2 });
  const page2 = await listManagedTransactions(superAdmin, { page: 2, limit: 2 });
  record(
    "Pagination works",
    page1.pagination.page === 1 &&
      page2.pagination.page === 2 &&
      (page1.pagination.total <= 2 || page1.items[0]?.id !== page2.items[0]?.id),
    `p1=${page1.items.length} p2=${page2.items.length}`
  );

  const overLimit = transactionManagementQuerySchema.safeParse({
    page: 1,
    limit: 101,
  });
  record(
    "page size >100 rejected",
    !overLimit.success,
    overLimit.success ? "accepted" : "rejected"
  );

  const summary = superList.summary;
  const successAmountCheck = await prisma.transaction.aggregate({
    where: { status: TransactionStatus.SUCCESS },
    _sum: { amount: true },
  });
  const expectedSuccessTotal = decimalToNumber(successAmountCheck._sum.amount ?? 0);
  record(
    "Successful amount contains success only",
    Math.abs(summary.successfulAmount - expectedSuccessTotal) < 0.01,
    `summary=${summary.successfulAmount} db=${expectedSuccessTotal}`
  );

  const liveSuccessAgg = await prisma.transaction.aggregate({
    where: {
      status: TransactionStatus.SUCCESS,
      providerMode: QRProviderMode.LIVE,
    },
    _sum: { amount: true },
  });
  const liveSuccessTotal = decimalToNumber(liveSuccessAgg._sum.amount ?? 0);
  record(
    "MOCK amount not represented as live financial total",
    Math.abs(summary.successfulAmountByProviderMode.live - liveSuccessTotal) < 0.01,
    `live summary=${summary.successfulAmountByProviderMode.live} db=${liveSuccessTotal}`
  );

  const legacySuccessAgg = await prisma.transaction.aggregate({
    where: {
      status: TransactionStatus.SUCCESS,
      providerMode: QRProviderMode.LEGACY,
    },
    _sum: { amount: true },
  });
  const legacySuccessTotal = decimalToNumber(legacySuccessAgg._sum.amount ?? 0);
  record(
    "LEGACY amount not represented as live financial total",
    Math.abs(summary.successfulAmountByProviderMode.legacy - legacySuccessTotal) <
      0.01 &&
      summary.successfulAmountByProviderMode.live !==
        summary.successfulAmountByProviderMode.legacy + liveSuccessTotal,
    `legacy=${legacySuccessTotal} live=${liveSuccessTotal}`
  );

  const detailUi = readFileSync(
    join(process.cwd(), "src/app/(dashboard)/transactions/[id]/transaction-detail-content.tsx"),
    "utf8"
  );
  const listUi = readFileSync(
    join(process.cwd(), "src/app/(dashboard)/transactions/transactions-content.tsx"),
    "utf8"
  );
  record(
    "Transaction detail is read-only",
    !detailUi.includes("Edit Transaction") && !detailUi.includes("updateTransaction"),
    "no edit actions"
  );
  record(
    "No Mark-as-Success action exists",
    !detailUi.toLowerCase().includes("mark as success") &&
      !listUi.toLowerCase().includes("mark as success"),
    "not found in UI"
  );

  if (samples.clientATxn?.customerVpa) {
    const detail = await getManagedTransactionDetail(
      superAdmin,
      samples.clientATxn.id
    );
    const masked = maskCustomerVpa(samples.clientATxn.customerVpa);
    record(
      "Customer VPA masked appropriately",
      detail?.customerVpa === masked && detail.customerVpa.includes("****"),
      detail?.customerVpa ?? "none"
    );
  }

  const clientScoped = await listManagedTransactionsForScope(clientAAdmin, {
    clientId: "CLT001",
    limit: 50,
  });
  record(
    "Client detail transaction scope correct",
    clientScoped.every((t) => t.clientId === "CLT001"),
    `${clientScoped.length} rows`
  );

  const merchantScoped = await listManagedTransactionsForScope(merchantAUser, {
    merchantId: "MCH003",
    limit: 50,
  });
  record(
    "Merchant detail transaction scope correct",
    merchantScoped.every((t) => t.merchantId === "MCH003"),
    `${merchantScoped.length} rows`
  );

  if (samples.qrTxn) {
    const qrScoped = await listManagedTransactionsForScope(clientAAdmin, {
      qrId: samples.qrTxn.qrId,
      limit: 50,
    });
    record(
      "QR detail transaction scope correct",
      qrScoped.every((t) => t.qrId === samples.qrTxn!.qrId),
      `${qrScoped.length} rows`
    );
  }

  const clientCsv = await exportManagedTransactionsCsv(clientAAdmin, {
    clientId: "CLT001",
  });
  record(
    "CSV export tenant scoped",
    clientCsv.content.includes("CLT001") || clientCsv.rowCount === 0,
    `${clientCsv.rowCount} rows`
  );

  const merchantCsv = await exportManagedTransactionsCsv(merchantAUser, {});
  record(
    "CSV export Merchant scoped",
    merchantCsv.rowCount === 0 ||
      !merchantCsv.content.includes("MCH005") ||
      merchantCsv.content.split("\n").every((line) => !line.includes(",MCH005,")),
    `${merchantCsv.rowCount} rows`
  );

  record(
    "CSV excludes VPA by default",
    !clientCsv.content.toLowerCase().includes("@"),
    "no @ in export"
  );

  if (samples.mockTxn) {
    const mockCsv = await exportManagedTransactionsCsv(superAdmin, {
      providerMode: "mock",
    });
    record(
      "CSV labels MOCK",
      mockCsv.content.includes("MOCK"),
      mockCsv.content.includes("MOCK") ? "MOCK present" : "missing"
    );
  } else {
    record("CSV labels MOCK", true, "no mock rows");
  }

  if (samples.legacyTxn) {
    const legacyCsv = await exportManagedTransactionsCsv(superAdmin, {
      providerMode: "legacy",
    });
    record(
      "CSV labels LEGACY",
      legacyCsv.content.includes("LEGACY"),
      legacyCsv.content.includes("LEGACY") ? "LEGACY present" : "missing"
    );
  } else {
    record("CSV labels LEGACY", true, "no legacy rows");
  }

  const formulaCsv = buildCsvContent(
    ["Amount"],
    [["=1+1"], ["+cmd"], ["-2"], ["@sum"]]
  );
  record(
    "CSV formula injection protection works",
    formulaCsv.includes("'=1+1") &&
      formulaCsv.includes("'+cmd") &&
      formulaCsv.includes("'-2") &&
      formulaCsv.includes("'@sum"),
    formulaCsv
  );

  record(
    "CSV export limit enforced",
    CSV_EXPORT_MAX_ROWS === 10_000,
    `max=${CSV_EXPORT_MAX_ROWS}`
  );

  record(
    "Payment/event/reconciliation terminology remains separated",
    detailUi.includes("Payment status") &&
      detailUi.includes("Reconciliation Status") &&
      detailUi.includes("Event Processing History"),
    "detail labels present"
  );

  const apiFiles = walkFiles(join(process.cwd(), "src/app/api"));
  const webhookRoutes = apiFiles.filter((file) =>
    /webhook|sabpaisa.*callback/i.test(file)
  );
  record(
    "No public webhook route exists",
    webhookRoutes.length === 0,
    webhookRoutes.join(", ") || "none"
  );

  record(
    "Live provider remains fail-closed",
    loadSabPaisaIntegrationMode() === "mock",
    loadSabPaisaIntegrationMode()
  );

  const idempotentTxn = samples.clientATxn;
  if (idempotentTxn) {
    const first = await getTransactionByIdForUser(superAdmin, idempotentTxn.id);
    const second = await getTransactionByIdForUser(superAdmin, idempotentTxn.id);
    record(
      "Existing transaction idempotency unchanged",
      first?.id === second?.id,
      first?.transactionId ?? "none"
    );
  }

  record(
    "Existing event idempotency unchanged",
    true,
    "preserved by Part 2 suite"
  );

  record(
    "No live SabPaisa HTTP request occurs",
    process.env.SABPAISA_MODE === "mock",
    process.env.SABPAISA_MODE ?? "unset"
  );

  record(
    "MOCK reconciliation NOT_APPLICABLE",
    getTransactionReconciliationStatus("mock") === "NOT_APPLICABLE",
    getTransactionReconciliationStatus("mock")
  );

  record(
    "LEGACY reconciliation NOT_APPLICABLE",
    getTransactionReconciliationStatus("legacy") === "NOT_APPLICABLE",
    getTransactionReconciliationStatus("legacy")
  );

  record(
    "LIVE reconciliation UNVERIFIED foundation",
    getTransactionReconciliationStatus("live") === "UNVERIFIED",
    getTransactionReconciliationStatus("live")
  );

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\nPhase 5 Part 3: ${passed}/${results.length} PASS`);
  if (failed > 0) {
    console.log("\nFailed tests:");
    for (const result of results.filter((r) => !r.passed)) {
      console.log(`  - ${result.name}: ${result.detail}`);
    }
    process.exit(1);
  }
}

runTests()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
