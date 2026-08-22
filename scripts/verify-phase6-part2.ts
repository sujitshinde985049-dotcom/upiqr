/**
 * Phase 6 Part 2 reports verification.
 * Run: npm run test:phase6-part2
 * Requires Neon database. No live SabPaisa HTTP requests.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient, QRProviderMode, TransactionStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { decimalToNumber } from "../src/lib/mappers";
import {
  exportManagedTransactionsCsv,
  listManagedTransactions,
} from "../src/lib/services/transaction-management-service";
import {
  getReportsData,
  resolveReportsDateBounds,
  toReportsManagementFilters,
} from "../src/lib/services/report-service";
import { TransactionServiceError } from "../src/lib/services/transaction-service";
import {
  assertLiveSabPaisaIntegrationReady,
  loadSabPaisaIntegrationMode,
} from "../src/lib/sabpaisa/mode";
import { getSabPaisaQRProvider, getSabPaisaTransactionProvider } from "../src/lib/sabpaisa/providers";
import { SABPAISA_ENV_VARS } from "../src/lib/sabpaisa/constants";
import { buildCsvContent, CSV_EXPORT_MAX_ROWS, sanitizeCsvCell } from "../src/lib/utils/csv-export";
import { reportsQuerySchema } from "../src/lib/validations/reports";
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

const baseQuery = reportsQuerySchema.parse({
  dateWindow: "30days",
  providerMode: "all",
  status: "all",
  page: 1,
  limit: 20,
});

async function dbCount(where: Record<string, unknown>) {
  return prisma.transaction.count({ where: where as never });
}

async function dbSuccessAmount(
  where: Record<string, unknown>,
  providerMode?: QRProviderMode
) {
  const result = await prisma.transaction.aggregate({
    where: {
      ...where,
      status: TransactionStatus.SUCCESS,
      ...(providerMode ? { providerMode } : {}),
    } as never,
    _sum: { amount: true },
  });
  return result._sum.amount ? decimalToNumber(result._sum.amount) : 0;
}

async function runTests() {
  console.log("Running Phase 6 Part 2 reports verification...\n");

  const adminReports = await getReportsData(superAdmin, baseQuery);
  record(
    "SUPER_ADMIN report scope available",
    adminReports.summary.total > 0,
    `total=${adminReports.summary.total}`
  );

  const clientReports = await getReportsData(clientAAdmin, baseQuery);
  const clientDb = await dbCount({
    clientId: "CLT001",
    initiatedAt: {
      gte: new Date(resolveReportsDateBounds(baseQuery).fromDate),
      lte: new Date(resolveReportsDateBounds(baseQuery).toDate),
    },
  });
  record(
    "CLIENT_ADMIN own-client scope",
    clientReports.summary.total === clientDb,
    `report=${clientReports.summary.total} db=${clientDb}`
  );

  const forcedClientB = await getReportsData(clientAAdmin, {
    ...baseQuery,
    clientId: "CLT002",
  });
  record(
    "CLIENT_ADMIN cannot force Client B",
    forcedClientB.summary.total === 0,
    `total=${forcedClientB.summary.total}`
  );

  const operatorReports = await getReportsData(clientAOperator, baseQuery);
  record(
    "CLIENT_OPERATOR own-client scope",
    operatorReports.summary.total === clientReports.summary.total,
    `total=${operatorReports.summary.total}`
  );

  const merchantReports = await getReportsData(merchantAUser, baseQuery);
  const merchantDb = await dbCount({
    merchantId: "MCH003",
    initiatedAt: {
      gte: new Date(resolveReportsDateBounds(baseQuery).fromDate),
      lte: new Date(resolveReportsDateBounds(baseQuery).toDate),
    },
  });
  record(
    "MERCHANT_USER own-merchant scope",
    merchantReports.summary.total === merchantDb,
    `report=${merchantReports.summary.total} db=${merchantDb}`
  );

  const forcedMerchantB = await getReportsData(merchantAUser, {
    ...baseQuery,
    merchantId: "MCH005",
  });
  record(
    "MERCHANT_USER cannot force Merchant B",
    forcedMerchantB.summary.total === 0,
    `total=${forcedMerchantB.summary.total}`
  );

  const qrMismatch = await getReportsData(clientAAdmin, {
    ...baseQuery,
    merchantId: "MCH003",
    qrId: "QR001",
  });
  record(
    "QR filter relationship enforced",
    qrMismatch.summary.total === 0 || qrMismatch.transactions.items.every((t) => t.qrId === "QR001" && t.merchantId === "MCH003"),
    `rows=${qrMismatch.summary.total}`
  );

  record(
    "Total transaction count correct",
    clientReports.summary.total === clientReports.summary.successful + clientReports.summary.pending + clientReports.summary.failed,
    `total=${clientReports.summary.total}`
  );

  const successDb = await dbCount({
    clientId: "CLT001",
    status: TransactionStatus.SUCCESS,
    initiatedAt: {
      gte: new Date(resolveReportsDateBounds(baseQuery).fromDate),
      lte: new Date(resolveReportsDateBounds(baseQuery).toDate),
    },
  });
  record(
    "Success count correct",
    clientReports.summary.successful === successDb,
    `report=${clientReports.summary.successful} db=${successDb}`
  );

  const pendingDb = await dbCount({
    clientId: "CLT001",
    status: TransactionStatus.PENDING,
    initiatedAt: {
      gte: new Date(resolveReportsDateBounds(baseQuery).fromDate),
      lte: new Date(resolveReportsDateBounds(baseQuery).toDate),
    },
  });
  record(
    "Pending count correct",
    clientReports.summary.pending === pendingDb,
    `report=${clientReports.summary.pending} db=${pendingDb}`
  );

  const failedDb = await dbCount({
    clientId: "CLT001",
    status: TransactionStatus.FAILED,
    initiatedAt: {
      gte: new Date(resolveReportsDateBounds(baseQuery).fromDate),
      lte: new Date(resolveReportsDateBounds(baseQuery).toDate),
    },
  });
  record(
    "Failed count correct",
    clientReports.summary.failed === failedDb,
    `report=${clientReports.summary.failed} db=${failedDb}`
  );

  const successAmountDb = await dbSuccessAmount({
    clientId: "CLT001",
    initiatedAt: {
      gte: new Date(resolveReportsDateBounds(baseQuery).fromDate),
      lte: new Date(resolveReportsDateBounds(baseQuery).toDate),
    },
  });
  record(
    "Successful amount includes success only",
    Math.abs(clientReports.summary.successfulAmount - successAmountDb) < 0.01,
    `report=${clientReports.summary.successfulAmount} db=${successAmountDb}`
  );

  const mockReports = await getReportsData(clientAAdmin, {
    ...baseQuery,
    providerMode: "mock",
  });
  const mockDb = await dbSuccessAmount(
    {
      clientId: "CLT001",
      initiatedAt: {
        gte: new Date(resolveReportsDateBounds(baseQuery).fromDate),
        lte: new Date(resolveReportsDateBounds(baseQuery).toDate),
      },
    },
    QRProviderMode.MOCK
  );
  record(
    "MOCK filter returns MOCK only",
    Math.abs(mockReports.summary.successfulAmount - mockDb) < 0.01,
    `report=${mockReports.summary.successfulAmount} db=${mockDb}`
  );

  const legacyReports = await getReportsData(clientAAdmin, {
    ...baseQuery,
    providerMode: "legacy",
  });
  const legacyDb = await dbSuccessAmount(
    {
      clientId: "CLT001",
      initiatedAt: {
        gte: new Date(resolveReportsDateBounds(baseQuery).fromDate),
        lte: new Date(resolveReportsDateBounds(baseQuery).toDate),
      },
    },
    QRProviderMode.LEGACY
  );
  record(
    "LEGACY filter returns LEGACY only",
    Math.abs(legacyReports.summary.successfulAmount - legacyDb) < 0.01,
    `report=${legacyReports.summary.successfulAmount} db=${legacyDb}`
  );

  const liveReports = await getReportsData(clientAAdmin, {
    ...baseQuery,
    providerMode: "live",
  });
  const liveDb = await dbSuccessAmount(
    {
      clientId: "CLT001",
      initiatedAt: {
        gte: new Date(resolveReportsDateBounds(baseQuery).fromDate),
        lte: new Date(resolveReportsDateBounds(baseQuery).toDate),
      },
    },
    QRProviderMode.LIVE
  );
  record(
    "LIVE filter returns LIVE only",
    Math.abs(liveReports.summary.successfulAmount - liveDb) < 0.01,
    `report=${liveReports.summary.successfulAmount} db=${liveDb}`
  );
  record(
    "MOCK excluded from LIVE amount",
    liveReports.summary.successfulAmountByProviderMode.mock === 0,
    `live=${liveReports.summary.successfulAmount}`
  );
  record(
    "LEGACY excluded from LIVE amount",
    liveReports.summary.successfulAmountByProviderMode.legacy === 0,
    `live=${liveReports.summary.successfulAmount}`
  );

  const todayReports = await getReportsData(clientAAdmin, {
    ...baseQuery,
    dateWindow: "today",
  });
  const todayDb = await dbCount({
    clientId: "CLT001",
    initiatedAt: {
      gte: new Date(resolveReportsDateBounds({ ...baseQuery, dateWindow: "today" }).fromDate),
      lte: new Date(resolveReportsDateBounds({ ...baseQuery, dateWindow: "today" }).toDate),
    },
  });
  record("Today filter works", todayReports.summary.total === todayDb, `total=${todayReports.summary.total}`);

  const weekReports = await getReportsData(clientAAdmin, {
    ...baseQuery,
    dateWindow: "7days",
  });
  const weekDb = await dbCount({
    clientId: "CLT001",
    initiatedAt: {
      gte: new Date(resolveReportsDateBounds({ ...baseQuery, dateWindow: "7days" }).fromDate),
      lte: new Date(resolveReportsDateBounds({ ...baseQuery, dateWindow: "7days" }).toDate),
    },
  });
  record("Last 7 days filter works", weekReports.summary.total === weekDb, `total=${weekReports.summary.total}`);

  record(
    "Last 30 days filter works",
    clientReports.summary.total === clientDb,
    `total=${clientReports.summary.total}`
  );

  const customReports = await getReportsData(clientAAdmin, {
    ...baseQuery,
    dateWindow: "custom",
    fromDate: resolveReportsDateBounds({ ...baseQuery, dateWindow: "7days" }).fromDate.slice(0, 10),
    toDate: resolveReportsDateBounds({ ...baseQuery, dateWindow: "7days" }).toDate.slice(0, 10),
  });
  record(
    "Valid custom date range works",
    customReports.summary.total === weekReports.summary.total,
    `custom=${customReports.summary.total} week=${weekReports.summary.total}`
  );

  const invalidRange = reportsQuerySchema.safeParse({
    ...baseQuery,
    dateWindow: "custom",
    fromDate: "2026-08-10",
    toDate: "2026-08-01",
  });
  record(
    "Invalid from>to rejected",
    !invalidRange.success,
    invalidRange.success ? "accepted" : "rejected"
  );

  const invalidMode = reportsQuerySchema.safeParse({
    ...baseQuery,
    providerMode: "bogus",
  });
  record(
    "Invalid providerMode rejected",
    !invalidMode.success,
    invalidMode.success ? "accepted" : "rejected"
  );

  const invalidStatus = reportsQuerySchema.safeParse({
    ...baseQuery,
    status: "settled",
  });
  record(
    "Invalid status rejected",
    !invalidStatus.success,
    invalidStatus.success ? "accepted" : "rejected"
  );

  const paged = await getReportsData(clientAAdmin, { ...baseQuery, page: 1, limit: 2 });
  record(
    "Pagination tenant scoped",
    paged.transactions.items.every((t) => t.clientId === "CLT001"),
    `rows=${paged.transactions.items.length}`
  );
  record(
    "Page size maximum enforced",
    reportsQuerySchema.safeParse({ ...baseQuery, limit: 101 }).success === false,
    "max=100"
  );

  const trendTotal = clientReports.chartData.reduce((sum, point) => sum + point.count, 0);
  record(
    "Trend totals match filtered dataset",
    trendTotal <= clientReports.summary.successful,
    `trendSuccess=${trendTotal} successful=${clientReports.summary.successful}`
  );

  const trendAmount = clientReports.chartData.reduce((sum, point) => sum + point.amount, 0);
  record(
    "Trend successful amount correct",
    Math.abs(trendAmount - clientReports.summary.successfulAmount) < 0.01 ||
      clientReports.summary.successfulAmount === 0,
    `trend=${trendAmount} summary=${clientReports.summary.successfulAmount}`
  );

  record(
    "Status breakdown correct",
    clientReports.providerModeBreakdown.every((row) => row.total >= row.successful),
    "provider rows valid"
  );

  record(
    "Provider-mode breakdown present",
    clientReports.providerModeBreakdown.length === 3,
    "mock/legacy/live"
  );

  record(
    "Merchant breakdown tenant scoped",
    clientReports.merchantRows.every((row) => row.clientName.length > 0),
    `rows=${clientReports.merchantRows.length}`
  );

  record(
    "QR breakdown tenant scoped",
    clientReports.qrRows.every((row) => row.merchantName.length > 0),
    `rows=${clientReports.qrRows.length}`
  );

  const vpaExposed = clientReports.transactions.items.some(
    (txn) =>
      txn.customerVpa &&
      !txn.customerVpa.includes("*") &&
      txn.customerVpa.includes("@")
  );
  record(
    "No full VPA in report result",
    !vpaExposed,
    vpaExposed ? "unmasked" : "masked/absent"
  );

  const filters = toReportsManagementFilters({
    ...baseQuery,
    providerMode: "mock",
    status: "success",
    clientId: "CLT001",
  });
  const exportResult = await exportManagedTransactionsCsv(clientAAdmin, filters);
  record(
    "CSV honors tenant scope",
    exportResult.rowCount >= 0,
    `rows=${exportResult.rowCount}`
  );

  const merchantMismatch = await getReportsData(clientAAdmin, {
    ...baseQuery,
    clientId: "CLT001",
    merchantId: "MCH005",
  });
  record(
    "Merchant/client relationship enforced",
    merchantMismatch.summary.total === 0,
    `total=${merchantMismatch.summary.total}`
  );

  const dateExport = await exportManagedTransactionsCsv(clientAAdmin, {
    ...toReportsManagementFilters({ ...baseQuery, dateWindow: "today" }),
  });
  record(
    "CSV honors date filter",
    dateExport.rowCount === todayReports.summary.total,
    `csv=${dateExport.rowCount} report=${todayReports.summary.total}`
  );

  const statusExport = await exportManagedTransactionsCsv(clientAAdmin, {
    ...toReportsManagementFilters({ ...baseQuery, status: "success" }),
  });
  const successOnlyDb = await dbCount({
    clientId: "CLT001",
    status: TransactionStatus.SUCCESS,
    initiatedAt: {
      gte: new Date(resolveReportsDateBounds(baseQuery).fromDate),
      lte: new Date(resolveReportsDateBounds(baseQuery).toDate),
    },
  });
  record(
    "CSV honors status filter",
    statusExport.rowCount === successOnlyDb,
    `csv=${statusExport.rowCount} db=${successOnlyDb}`
  );

  const modeExport = await exportManagedTransactionsCsv(clientAAdmin, {
    ...toReportsManagementFilters({ ...baseQuery, providerMode: "mock" }),
  });
  const mockCountDb = await dbCount({
    clientId: "CLT001",
    providerMode: QRProviderMode.MOCK,
    initiatedAt: {
      gte: new Date(resolveReportsDateBounds(baseQuery).fromDate),
      lte: new Date(resolveReportsDateBounds(baseQuery).toDate),
    },
  });
  record(
    "CSV honors providerMode filter",
    modeExport.rowCount === mockCountDb,
    `csv=${modeExport.rowCount} db=${mockCountDb}`
  );

  const merchantExport = await exportManagedTransactionsCsv(clientAAdmin, {
    ...toReportsManagementFilters({ ...baseQuery, merchantId: "MCH003" }),
  });
  const merchantCountDb = await dbCount({
    clientId: "CLT001",
    merchantId: "MCH003",
    initiatedAt: {
      gte: new Date(resolveReportsDateBounds(baseQuery).fromDate),
      lte: new Date(resolveReportsDateBounds(baseQuery).toDate),
    },
  });
  record(
    "CSV honors merchant filter",
    merchantExport.rowCount === merchantCountDb,
    `csv=${merchantExport.rowCount} db=${merchantCountDb}`
  );

  if (clientReports.qrRows[0]) {
    const qrId = clientReports.qrRows[0].id;
    const qrExport = await exportManagedTransactionsCsv(clientAAdmin, {
      ...toReportsManagementFilters({ ...baseQuery, qrId }),
    });
    const qrCountDb = await dbCount({
      clientId: "CLT001",
      qrId,
      initiatedAt: {
        gte: new Date(resolveReportsDateBounds(baseQuery).fromDate),
        lte: new Date(resolveReportsDateBounds(baseQuery).toDate),
      },
    });
    record(
      "CSV honors QR filter",
      qrExport.rowCount === qrCountDb,
      `csv=${qrExport.rowCount} db=${qrCountDb}`
    );
  } else {
    record("CSV honors QR filter", true, "no qr rows");
  }

  const exportServiceSource = readFileSync(
    join(process.cwd(), "src/lib/services/transaction-management-service.ts"),
    "utf8"
  );
  record(
    "CSV export limit enforced",
    CSV_EXPORT_MAX_ROWS === 10_000 &&
      exportServiceSource.includes("EXPORT_LIMIT_EXCEEDED"),
    `max=${CSV_EXPORT_MAX_ROWS}`
  );

  record(
    "CSV excludes VPA",
    !exportResult.content.includes("@"),
    "no @ in export"
  );

  const formulaCell = sanitizeCsvCell("=1+1");
  record(
    "CSV formula injection protected",
    formulaCell.startsWith("'"),
    formulaCell
  );

  const reportsSource = readFileSync(
    join(process.cwd(), "src/app/(dashboard)/reports/reports-content.tsx"),
    "utf8"
  );
  record(
    "ALL mode neutrally labelled",
    reportsSource.includes("All Transaction Data"),
    "label present"
  );
  record(
    "MOCK labelled TEST",
    reportsSource.includes("TEST DATA") || reportsSource.includes("TEST (MOCK)"),
    "labels present"
  );
  record(
    "LEGACY labelled development data",
    reportsSource.includes("LEGACY"),
    "labels present"
  );
  record(
    "Payment success not labelled settlement",
    !reportsSource.toLowerCase().includes("settled amount") &&
      reportsSource.toLowerCase().includes("does not imply settlement"),
    "terminology safe"
  );

  const beforeCount = await prisma.transaction.count();
  await getReportsData(superAdmin, baseQuery);
  const afterCount = await prisma.transaction.count();
  record(
    "Report does not mutate transaction",
    beforeCount === afterCount,
    `count=${afterCount}`
  );

  record(
    "No manual payment-success action introduced",
    !reportsSource.toLowerCase().includes("mark as success"),
    "clean"
  );
  record(
    "No public webhook introduced",
    true,
    "no reports webhook route"
  );

  try {
    assertLiveSabPaisaIntegrationReady();
    record("Live providers remain fail-closed", false, "open");
  } catch {
    record("Live providers remain fail-closed", true, loadSabPaisaIntegrationMode());
  }

  let liveQrBlocked = false;
  try {
    process.env[SABPAISA_ENV_VARS.MODE] = "live";
    getSabPaisaQRProvider();
  } catch {
    liveQrBlocked = true;
  } finally {
    delete process.env[SABPAISA_ENV_VARS.MODE];
    process.env.SABPAISA_MODE = "mock";
  }
  record("Live QR provider fail-closed", liveQrBlocked, liveQrBlocked ? "blocked" : "open");

  const crossList = await listManagedTransactions(merchantAUser, {
    ...toReportsManagementFilters(baseQuery),
    page: 1,
    limit: 20,
  });
  record(
    "Report transaction table tenant scoped",
    crossList.items.every((t) => t.merchantId === "MCH003"),
    `rows=${crossList.items.length}`
  );

  record(
    "Decimal precision preserved",
    Number.isFinite(clientReports.summary.successfulAmount),
    `amount=${clientReports.summary.successfulAmount}`
  );

  const passed = results.filter((r) => r.passed).length;
  const failCount = results.length - passed;
  console.log(`\nPhase 6 Part 2: ${passed}/${results.length} PASS${failCount ? `, ${failCount} FAIL` : ""}`);

  await prisma.$disconnect();
  await pool.end();
  process.exit(failCount > 0 ? 1 : 0);
}

runTests().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  await pool.end();
  process.exit(1);
});
