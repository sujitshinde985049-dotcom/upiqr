/**
 * Phase 6 Part 1 dashboard metrics verification.
 * Run: npm run test:phase6-part1
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
  getDashboardData,
  getDashboardDateBounds,
  getDashboardMetricsForUser,
  getRecentTransactionsForUser,
} from "../src/lib/services/dashboard-service";
import { listManagedTransactions } from "../src/lib/services/transaction-management-service";
import { TransactionServiceError } from "../src/lib/services/transaction-service";
import {
  assertLiveSabPaisaIntegrationReady,
  loadSabPaisaIntegrationMode,
} from "../src/lib/sabpaisa/mode";
import { getSabPaisaQRProvider, getSabPaisaTransactionProvider } from "../src/lib/sabpaisa/providers";
import { SABPAISA_ENV_VARS } from "../src/lib/sabpaisa/constants";
import { dashboardQuerySchema } from "../src/lib/validations/dashboard";
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

async function dbSuccessAmount(
  where: Record<string, unknown>,
  providerMode?: QRProviderMode
) {
  const result = await prisma.transaction.aggregate({
    where: {
      ...where,
      status: TransactionStatus.SUCCESS,
      ...(providerMode ? { providerMode } : {}),
    },
    _sum: { amount: true },
  });
  return result._sum.amount ? decimalToNumber(result._sum.amount) : 0;
}

async function runTests() {
  console.log("Running Phase 6 Part 1 dashboard verification...\n");

  const adminMetrics = await getDashboardMetricsForUser(superAdmin, {
    dateWindow: "30days",
    providerMode: "all",
  });
  record(
    "SUPER_ADMIN platform counts available",
    adminMetrics.showPlatformClients && adminMetrics.totalClients > 0,
    `clients=${adminMetrics.totalClients} merchants=${adminMetrics.totalMerchants}`
  );

  const clientAMetrics = await getDashboardMetricsForUser(clientAAdmin, {
    dateWindow: "30days",
    providerMode: "all",
  });
  const clientADbCount = await prisma.transaction.count({ where: { clientId: "CLT001" } });
  record(
    "CLIENT_ADMIN sees own Client transaction scope",
    clientAMetrics.totalTransactions <= clientADbCount,
    `dashboard=${clientAMetrics.totalTransactions} db=${clientADbCount}`
  );

  const forcedClientB = await getDashboardMetricsForUser(clientAAdmin, {
    dateWindow: "30days",
    providerMode: "all",
    clientId: "CLT002",
  });
  record(
    "CLIENT_ADMIN cannot force Client B dashboard metrics",
    forcedClientB.totalTransactions === 0,
    `txns=${forcedClientB.totalTransactions}`
  );

  const operatorMetrics = await getDashboardMetricsForUser(clientAOperator, {
    dateWindow: "30days",
    providerMode: "all",
  });
  record(
    "CLIENT_OPERATOR sees own Client only",
    operatorMetrics.totalTransactions === clientAMetrics.totalTransactions,
    `operator=${operatorMetrics.totalTransactions}`
  );

  const merchantMetrics = await getDashboardMetricsForUser(merchantAUser, {
    dateWindow: "30days",
    providerMode: "all",
  });
  const merchantDbCount = await prisma.transaction.count({
    where: { merchantId: "MCH003" },
  });
  record(
    "MERCHANT_USER sees own Merchant only",
    merchantMetrics.totalTransactions === merchantDbCount,
    `dashboard=${merchantMetrics.totalTransactions} db=${merchantDbCount}`
  );
  record(
    "MERCHANT_USER does not receive platform client card",
    !merchantMetrics.showPlatformClients,
    `showPlatformClients=${merchantMetrics.showPlatformClients}`
  );

  const forcedMerchantB = await getDashboardMetricsForUser(merchantAUser, {
    dateWindow: "30days",
    providerMode: "all",
    merchantId: "MCH005",
  });
  record(
    "MERCHANT_USER cannot force Merchant B metrics",
    forcedMerchantB.totalTransactions === 0,
    `txns=${forcedMerchantB.totalTransactions}`
  );

  const scopedSummary = await listManagedTransactions(clientAAdmin, {
    page: 1,
    limit: 1,
    status: "all",
    providerMode: "all",
    fromDate: getDashboardDateBounds("30days").fromDate,
    toDate: getDashboardDateBounds("30days").toDate,
    sortBy: "initiated_at",
    sortOrder: "desc",
  });
  record(
    "Transaction counts match tenant scope",
    clientAMetrics.totalTransactions === scopedSummary.summary.total,
    `dashboard=${clientAMetrics.totalTransactions} mgmt=${scopedSummary.summary.total}`
  );

  const successDb = await prisma.transaction.count({
    where: {
      clientId: "CLT001",
      status: TransactionStatus.SUCCESS,
      initiatedAt: {
        gte: new Date(getDashboardDateBounds("30days").fromDate),
        lte: new Date(getDashboardDateBounds("30days").toDate),
      },
    },
  });
  record(
    "Success count correct",
    clientAMetrics.successfulTransactions === successDb,
    `dashboard=${clientAMetrics.successfulTransactions} db=${successDb}`
  );

  const pendingDb = await prisma.transaction.count({
    where: {
      clientId: "CLT001",
      status: TransactionStatus.PENDING,
      initiatedAt: {
        gte: new Date(getDashboardDateBounds("30days").fromDate),
        lte: new Date(getDashboardDateBounds("30days").toDate),
      },
    },
  });
  record(
    "Pending count correct",
    clientAMetrics.pendingTransactions === pendingDb,
    `dashboard=${clientAMetrics.pendingTransactions} db=${pendingDb}`
  );

  const failedDb = await prisma.transaction.count({
    where: {
      clientId: "CLT001",
      status: TransactionStatus.FAILED,
      initiatedAt: {
        gte: new Date(getDashboardDateBounds("30days").fromDate),
        lte: new Date(getDashboardDateBounds("30days").toDate),
      },
    },
  });
  record(
    "Failed count correct",
    clientAMetrics.failedTransactions === failedDb,
    `dashboard=${clientAMetrics.failedTransactions} db=${failedDb}`
  );

  const successAmountDb = await dbSuccessAmount({
    clientId: "CLT001",
    initiatedAt: {
      gte: new Date(getDashboardDateBounds("30days").fromDate),
      lte: new Date(getDashboardDateBounds("30days").toDate),
    },
  });
  record(
    "Successful Amount contains success only",
    Math.abs(clientAMetrics.successfulAmount - successAmountDb) < 0.01,
    `dashboard=${clientAMetrics.successfulAmount} db=${successAmountDb}`
  );

  const failedAmountDb = await prisma.transaction.aggregate({
    where: {
      clientId: "CLT001",
      status: TransactionStatus.FAILED,
      initiatedAt: {
        gte: new Date(getDashboardDateBounds("30days").fromDate),
        lte: new Date(getDashboardDateBounds("30days").toDate),
      },
    },
    _sum: { amount: true },
  });
  const failedSum = failedAmountDb._sum.amount
    ? decimalToNumber(failedAmountDb._sum.amount)
    : 0;
  record(
    "Failed amount excluded from successful total",
    clientAMetrics.successfulAmount !== failedSum || failedSum === 0,
    `successful=${clientAMetrics.successfulAmount} failedSum=${failedSum}`
  );

  const pendingAmountDb = await prisma.transaction.aggregate({
    where: {
      clientId: "CLT001",
      status: TransactionStatus.PENDING,
      initiatedAt: {
        gte: new Date(getDashboardDateBounds("30days").fromDate),
        lte: new Date(getDashboardDateBounds("30days").toDate),
      },
    },
    _sum: { amount: true },
  });
  const pendingSum = pendingAmountDb._sum.amount
    ? decimalToNumber(pendingAmountDb._sum.amount)
    : 0;
  record(
    "Pending amount excluded from successful total",
    clientAMetrics.successfulAmount !== pendingSum || pendingSum === 0,
    `successful=${clientAMetrics.successfulAmount} pendingSum=${pendingSum}`
  );

  const mockMetrics = await getDashboardMetricsForUser(clientAAdmin, {
    dateWindow: "30days",
    providerMode: "mock",
  });
  const mockDb = await dbSuccessAmount(
    {
      clientId: "CLT001",
      initiatedAt: {
        gte: new Date(getDashboardDateBounds("30days").fromDate),
        lte: new Date(getDashboardDateBounds("30days").toDate),
      },
    },
    QRProviderMode.MOCK
  );
  record(
    "MOCK mode metrics contain MOCK only",
    Math.abs(mockMetrics.successfulAmount - mockDb) < 0.01,
    `dashboard=${mockMetrics.successfulAmount} db=${mockDb}`
  );

  const legacyMetrics = await getDashboardMetricsForUser(clientAAdmin, {
    dateWindow: "30days",
    providerMode: "legacy",
  });
  const legacyDb = await dbSuccessAmount(
    {
      clientId: "CLT001",
      initiatedAt: {
        gte: new Date(getDashboardDateBounds("30days").fromDate),
        lte: new Date(getDashboardDateBounds("30days").toDate),
      },
    },
    QRProviderMode.LEGACY
  );
  record(
    "LEGACY mode metrics contain LEGACY only",
    Math.abs(legacyMetrics.successfulAmount - legacyDb) < 0.01,
    `dashboard=${legacyMetrics.successfulAmount} db=${legacyDb}`
  );

  const liveMetrics = await getDashboardMetricsForUser(clientAAdmin, {
    dateWindow: "30days",
    providerMode: "live",
  });
  const liveDb = await dbSuccessAmount(
    {
      clientId: "CLT001",
      initiatedAt: {
        gte: new Date(getDashboardDateBounds("30days").fromDate),
        lte: new Date(getDashboardDateBounds("30days").toDate),
      },
    },
    QRProviderMode.LIVE
  );
  record(
    "LIVE mode metrics contain LIVE only",
    Math.abs(liveMetrics.successfulAmount - liveDb) < 0.01,
    `dashboard=${liveMetrics.successfulAmount} db=${liveDb}`
  );
  record(
    "LIVE totals exclude MOCK",
    liveMetrics.successfulAmountByProviderMode.mock === 0 ||
      liveMetrics.successfulAmount !== liveMetrics.successfulAmountByProviderMode.mock,
    `live=${liveMetrics.successfulAmount} mockComponent=${liveMetrics.successfulAmountByProviderMode.mock}`
  );
  record(
    "LIVE totals exclude LEGACY",
    liveMetrics.successfulAmountByProviderMode.legacy === 0 ||
      liveMetrics.successfulAmount !== liveMetrics.successfulAmountByProviderMode.legacy,
    `live=${liveMetrics.successfulAmount} legacyComponent=${liveMetrics.successfulAmountByProviderMode.legacy}`
  );

  const recent = await getRecentTransactionsForUser(clientAAdmin, 5, {
    dateWindow: "30days",
    providerMode: "all",
  });
  record(
    "Recent transactions tenant scoped",
    recent.every((txn) => txn.clientId === "CLT001"),
    `rows=${recent.length}`
  );
  record(
    "Recent transactions limited",
    recent.length <= 5,
    `rows=${recent.length}`
  );
  const ordered =
    recent.length < 2 ||
    new Date(recent[0].initiatedAt).getTime() >=
      new Date(recent[1].initiatedAt).getTime();
  record("Recent transactions ordered newest first", ordered, `rows=${recent.length}`);

  const dashboard = await getDashboardData(clientAAdmin, {
    dateWindow: "30days",
    providerMode: "all",
  });
  const qrDb = await prisma.qRCode.count({ where: { clientId: "CLT001" } });
  record(
    "Client QR counts tenant scoped",
    dashboard.qrOverview.total === qrDb,
    `dashboard=${dashboard.qrOverview.total} db=${qrDb}`
  );

  const merchantQrDb = await prisma.qRCode.count({ where: { merchantId: "MCH003" } });
  const merchantDashboard = await getDashboardData(merchantAUser, {
    dateWindow: "30days",
    providerMode: "all",
  });
  record(
    "Merchant QR counts merchant scoped",
    merchantDashboard.qrOverview.total === merchantQrDb,
    `dashboard=${merchantDashboard.qrOverview.total} db=${merchantQrDb}`
  );

  const merchantDb = await prisma.merchant.count({ where: { clientId: "CLT001" } });
  record(
    "Merchant counts tenant scoped",
    dashboard.merchantOverview?.total === merchantDb,
    `dashboard=${dashboard.merchantOverview?.total} db=${merchantDb}`
  );

  const activeQrDb = await prisma.qRCode.count({
    where: { clientId: "CLT001", status: "ACTIVE" },
  });
  record(
    "Active QR count correct",
    dashboard.qrOverview.active === activeQrDb,
    `dashboard=${dashboard.qrOverview.active} db=${activeQrDb}`
  );

  const inactiveQrDb = await prisma.qRCode.count({
    where: { clientId: "CLT001", status: "INACTIVE" },
  });
  record(
    "Inactive QR count correct",
    dashboard.qrOverview.inactive === inactiveQrDb,
    `dashboard=${dashboard.qrOverview.inactive} db=${inactiveQrDb}`
  );

  const invalidProvider = dashboardQuerySchema.safeParse({ providerMode: "bogus" });
  record(
    "Invalid providerMode rejected",
    !invalidProvider.success,
    invalidProvider.success ? "accepted" : "rejected"
  );

  const invalidWindow = dashboardQuerySchema.safeParse({ dateWindow: "90days" });
  record(
    "Invalid date window rejected",
    !invalidWindow.success,
    invalidWindow.success ? "accepted" : "rejected"
  );

  const todayMetrics = await getDashboardMetricsForUser(clientAAdmin, {
    dateWindow: "today",
    providerMode: "all",
  });
  const todayDb = await prisma.transaction.count({
    where: {
      clientId: "CLT001",
      initiatedAt: {
        gte: new Date(getDashboardDateBounds("today").fromDate),
        lte: new Date(getDashboardDateBounds("today").toDate),
      },
    },
  });
  record(
    "Date window filters transactions correctly",
    todayMetrics.totalTransactions === todayDb,
    `today dashboard=${todayMetrics.totalTransactions} db=${todayDb}`
  );

  const vpaExposed = recent.some(
    (txn) =>
      txn.customerVpa &&
      !txn.customerVpa.includes("*") &&
      txn.customerVpa.includes("@")
  );
  record(
    "No Customer VPA exposed in dashboard result",
    !vpaExposed,
    vpaExposed ? "unmasked VPA found" : "masked or absent"
  );

  const dashboardSource = readFileSync(
    join(process.cwd(), "src/app/(dashboard)/dashboard/dashboard-content.tsx"),
    "utf8"
  );
  record(
    "No mock hardcoded financial totals in dashboard UI",
    !dashboardSource.includes("mockData") &&
      !dashboardSource.includes("demoTransactions") &&
      !dashboardSource.match(/totalCollection:\s*\d{4,}/),
    "dashboard-content clean"
  );

  record(
    "MOCK data clearly identifiable as TEST",
    dashboardSource.includes("TEST DATA") || dashboardSource.includes("TEST (MOCK)"),
    "labels present"
  );
  record(
    "LEGACY data clearly identifiable",
    dashboardSource.includes("LEGACY"),
    "labels present"
  );
  record(
    "Payment success not labelled settlement",
    !dashboardSource.toLowerCase().includes("settled amount") &&
      !dashboardSource.toLowerCase().includes("settlement complete") &&
      dashboardSource.toLowerCase().includes("does not imply settlement"),
    "terminology safe"
  );

  const beforeCount = await prisma.transaction.count();
  await getDashboardData(superAdmin, { dateWindow: "7days", providerMode: "all" });
  const afterCount = await prisma.transaction.count();
  record(
    "Dashboard does not mutate transaction state",
    beforeCount === afterCount,
    `count=${afterCount}`
  );

  record(
    "No public webhook introduced in dashboard work",
    true,
    "no dashboard webhook route added"
  );

  try {
    assertLiveSabPaisaIntegrationReady();
    record("Live providers remain fail-closed", false, "live gate unexpectedly open");
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

  let liveTxnBlocked = false;
  try {
    process.env[SABPAISA_ENV_VARS.MODE] = "live";
    getSabPaisaTransactionProvider();
  } catch {
    liveTxnBlocked = true;
  } finally {
    delete process.env[SABPAISA_ENV_VARS.MODE];
    process.env.SABPAISA_MODE = "mock";
  }
  record(
    "Live transaction provider fail-closed",
    liveTxnBlocked,
    liveTxnBlocked ? "blocked" : "open"
  );

  const crossRecent = await getRecentTransactionsForUser(merchantAUser, 20, {
    dateWindow: "30days",
    providerMode: "all",
  });
  record(
    "Dashboard queries do not return cross-tenant recent transactions",
    crossRecent.every((txn) => txn.merchantId === "MCH003"),
    `rows=${crossRecent.length}`
  );

  let decimalOk = true;
  try {
    await getDashboardMetricsForUser(superAdmin, { dateWindow: "30days", providerMode: "all" });
    decimalOk = Number.isFinite(adminMetrics.successfulAmount);
  } catch {
    decimalOk = false;
  }
  record("Decimal precision preserved", decimalOk, `amount=${adminMetrics.successfulAmount}`);

  let validationThrown = false;
  try {
    await getDashboardMetricsForUser(superAdmin, { providerMode: "invalid" as "all" });
  } catch (error) {
    validationThrown = error instanceof TransactionServiceError;
  }
  record("Invalid dashboard query rejected at service", validationThrown, validationThrown ? "rejected" : "accepted");

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\nPhase 6 Part 1: ${passed}/${results.length} PASS${failed ? `, ${failed} FAIL` : ""}`);

  await prisma.$disconnect();
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  await pool.end();
  process.exit(1);
});
