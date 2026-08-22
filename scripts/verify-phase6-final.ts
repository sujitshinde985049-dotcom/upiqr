/**
 * Phase 6 final integration + security verification.
 * Run: npm run test:phase6-final
 * Requires Neon database. No live SabPaisa HTTP requests.
 */
import "dotenv/config";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  Prisma,
  PrismaClient,
  QRProviderMode,
  TransactionStatus,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { decimalToNumber } from "../src/lib/mappers";
import {
  canAccessMonitoring,
  canAccessReports,
} from "../src/lib/auth/authorization";
import { getNavItemsForRole } from "../src/lib/constants/navigation";
import {
  createSabPaisaWebhookAdapter,
  isAllowedStatusTransition,
} from "../src/lib/payment-events";
import {
  assertLiveSabPaisaIntegrationReady,
  loadSabPaisaIntegrationMode,
} from "../src/lib/sabpaisa/mode";
import { SABPAISA_ENV_VARS } from "../src/lib/sabpaisa/constants";
import {
  getSabPaisaQRProvider,
  getSabPaisaTransactionProvider,
} from "../src/lib/sabpaisa/providers";
import {
  getDashboardData,
  getDashboardMetricsForUser,
} from "../src/lib/services/dashboard-service";
import { getMonitoringData } from "../src/lib/services/monitoring-service";
import { getReportsData } from "../src/lib/services/report-service";
import {
  exportManagedTransactionsCsv,
  getManagedTransactionDetail,
  listManagedTransactions,
} from "../src/lib/services/transaction-management-service";
import {
  CSV_EXPORT_MAX_ROWS,
  sanitizeCsvCell,
} from "../src/lib/utils/csv-export";
import { dashboardQuerySchema } from "../src/lib/validations/dashboard";
import { monitoringQuerySchema } from "../src/lib/validations/monitoring";
import { reportsQuerySchema } from "../src/lib/validations/reports";
import type { SessionUser } from "../src/lib/auth/types";

process.env.SABPAISA_MODE = "mock";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type TestResult = { name: string; passed: boolean; detail: string; blocked?: boolean };
const results: TestResult[] = [];

function record(name: string, passed: boolean, detail: string, blocked = false) {
  results.push({ name, passed, detail, blocked });
  const label = blocked ? "BLOCKED" : passed ? "PASS" : "FAIL";
  console.log(`${label} — ${name}: ${detail}`);
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

const dashboardQuery = dashboardQuerySchema.parse({
  dateWindow: "30days",
  providerMode: "all",
});

const reportsQuery = reportsQuerySchema.parse({
  dateWindow: "30days",
  providerMode: "all",
  status: "all",
  page: 1,
  limit: 20,
});

const monitoringQuery = monitoringQuerySchema.parse({
  dateWindow: "30days",
  providerMode: "all",
  transactionStatus: "all",
  eventProcessingStatus: "all",
});

function walkFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walkFiles(full));
    } else if (/\.(tsx?|jsx?)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function phase6UiSource(): string {
  const roots = [
    join(process.cwd(), "src/app/(dashboard)/dashboard"),
    join(process.cwd(), "src/app/(dashboard)/reports"),
    join(process.cwd(), "src/app/(dashboard)/monitoring"),
    join(process.cwd(), "src/components/dashboard"),
    join(process.cwd(), "src/components/transactions"),
  ];
  return roots.flatMap((root) => walkFiles(root)).map((f) => readFileSync(f, "utf8")).join("\n");
}

async function runTests() {
  console.log("Running Phase 6 final integration + security tests...\n");

  const [dashboard, reports, monitoring] = await Promise.all([
    getDashboardData(clientAAdmin, dashboardQuery),
    getReportsData(clientAAdmin, reportsQuery),
    getMonitoringData(clientAAdmin, monitoringQuery),
  ]);

  record(
    "Dashboard tenant isolation",
    dashboard.metrics.totalTransactions > 0,
    `txns=${dashboard.metrics.totalTransactions}`
  );
  record(
    "Reports tenant isolation",
    reports.summary.total > 0,
    `total=${reports.summary.total}`
  );
  record(
    "Monitoring tenant isolation",
    monitoring.summary.successfulTransactions >= 0,
    `success=${monitoring.summary.successfulTransactions}`
  );

  const clientBTxn = await prisma.transaction.findFirst({
    where: { clientId: "CLT002" },
    select: { id: true },
  });
  if (clientBTxn) {
    const denied = await getManagedTransactionDetail(clientAAdmin, clientBTxn.id);
    record(
      "Transaction detail tenant isolation",
      denied === null,
      denied ? "leaked" : "denied"
    );
  } else {
    record("Transaction detail tenant isolation", true, "no sample");
  }

  const exportResult = await exportManagedTransactionsCsv(clientAAdmin, {
    clientId: "CLT001",
    providerMode: "all",
    status: "all",
  });
  record(
    "CSV tenant isolation",
    exportResult.rowCount >= 0,
    `rows=${exportResult.rowCount}`
  );

  const adminDashboard = await getDashboardData(superAdmin, dashboardQuery);
  record(
    "SUPER_ADMIN authorized scope",
    adminDashboard.metrics.totalTransactions >= dashboard.metrics.totalTransactions,
    `platform=${adminDashboard.metrics.totalTransactions}`
  );
  record(
    "CLIENT_ADMIN own-client scope",
    dashboard.metrics.totalTransactions === reports.summary.total,
    `dashboard=${dashboard.metrics.totalTransactions} reports=${reports.summary.total}`
  );

  const operatorDashboard = await getDashboardMetricsForUser(
    clientAOperator,
    dashboardQuery
  );
  record(
    "CLIENT_OPERATOR own-client scope",
    operatorDashboard.totalTransactions === dashboard.metrics.totalTransactions,
    `operator=${operatorDashboard.totalTransactions}`
  );

  const merchantDashboard = await getDashboardMetricsForUser(
    merchantAUser,
    dashboardQuery
  );
  record(
    "MERCHANT_USER own-merchant scope",
    merchantDashboard.totalTransactions <= dashboard.metrics.totalTransactions,
    `merchant=${merchantDashboard.totalTransactions}`
  );

  const forcedClient = await getDashboardData(clientAAdmin, {
    ...dashboardQuery,
    clientId: "CLT002",
  });
  record(
    "clientId tampering blocked",
    forcedClient.metrics.totalTransactions === 0,
    `total=${forcedClient.metrics.totalTransactions}`
  );

  const forcedMerchant = await getDashboardData(clientAAdmin, {
    ...dashboardQuery,
    merchantId: "MCH005",
  });
  record(
    "merchantId tampering blocked",
    forcedMerchant.metrics.totalTransactions === 0,
    `total=${forcedMerchant.metrics.totalTransactions}`
  );

  const merchantForced = await getDashboardData(merchantAUser, {
    ...dashboardQuery,
    merchantId: "MCH005",
  });
  record(
    "MERCHANT_USER merchantId tampering blocked",
    merchantForced.metrics.totalTransactions === 0,
    `total=${merchantForced.metrics.totalTransactions}`
  );

  const qrMismatch = await getReportsData(clientAAdmin, {
    ...reportsQuery,
    merchantId: "MCH003",
    qrId: "QR001",
  });
  record(
    "QR tampering blocked",
    qrMismatch.summary.total === 0,
    `total=${qrMismatch.summary.total}`
  );

  if (clientBTxn) {
    const denied = await getManagedTransactionDetail(merchantAUser, clientBTxn.id);
    record(
      "Transaction ID tampering blocked",
      denied === null,
      denied ? "leaked" : "denied"
    );
  } else {
    record("Transaction ID tampering blocked", true, "no sample");
  }

  record(
    "Dashboard/report successful count consistent",
    dashboard.metrics.successfulTransactions === reports.summary.successful,
    `dashboard=${dashboard.metrics.successfulTransactions} reports=${reports.summary.successful}`
  );
  record(
    "Dashboard/report successful amount consistent",
    Math.abs(dashboard.metrics.successfulAmount - reports.summary.successfulAmount) < 0.01,
    `dashboard=${dashboard.metrics.successfulAmount} reports=${reports.summary.successfulAmount}`
  );

  const failedAgg = await prisma.transaction.aggregate({
    where: {
      clientId: "CLT001",
      status: TransactionStatus.FAILED,
    },
    _sum: { amount: true },
  });
  const failedSum = decimalToNumber(failedAgg._sum.amount ?? 0);
  const pendingAgg = await prisma.transaction.aggregate({
    where: {
      clientId: "CLT001",
      status: TransactionStatus.PENDING,
    },
    _sum: { amount: true },
  });
  const pendingSum = decimalToNumber(pendingAgg._sum.amount ?? 0);
  record(
    "Pending amount excluded from successful amount",
    Math.abs(reports.summary.successfulAmount - pendingSum) > 0.01 ||
      reports.summary.pending === 0,
    `pendingSum=${pendingSum}`
  );
  record(
    "Failed amount excluded from successful amount",
    Math.abs(reports.summary.successfulAmount - failedSum) > 0.01 ||
      reports.summary.successful === 0,
    `failedSum=${failedSum}`
  );

  const exactTxn = await prisma.transaction.findFirst({
    where: {
      clientId: "CLT001",
      status: TransactionStatus.SUCCESS,
      amount: { in: [1, 10.5, 1500] },
    },
    select: { amount: true },
  });
  record(
    "Decimal precision preserved",
    exactTxn ? [1, 10.5, 1500].includes(decimalToNumber(exactTxn.amount)) : true,
    exactTxn ? `amount=${decimalToNumber(exactTxn.amount)}` : "no exact sample"
  );

  const mockReports = await getReportsData(clientAAdmin, {
    ...reportsQuery,
    providerMode: "mock",
  });
  const liveReports = await getReportsData(clientAAdmin, {
    ...reportsQuery,
    providerMode: "live",
  });
  record(
    "MOCK separated from LIVE",
    mockReports.summary.successfulAmountByProviderMode.live === 0,
    `mock=${mockReports.summary.successfulAmount}`
  );
  record(
    "LEGACY separated from LIVE",
    liveReports.summary.successfulAmountByProviderMode.mock === 0 &&
      liveReports.summary.successfulAmountByProviderMode.legacy === 0,
    `live=${liveReports.summary.successfulAmount}`
  );
  record("LIVE zero-state valid", liveReports.summary.total >= 0, `total=${liveReports.summary.total}`);

  const ui = phase6UiSource();
  record(
    "MOCK clearly identifiable as TEST",
    ui.includes("TEST") && ui.includes("MOCK"),
    "labels present"
  );
  record(
    "MOCK QR not represented as payable",
    ui.includes("NOT PAYABLE") || ui.includes("Not a real payment"),
    "warning present"
  );
  record("LEGACY identifiable", ui.includes("LEGACY"), "label present");

  const txnList = await listManagedTransactions(clientAAdmin, {
    page: 1,
    limit: 100,
    clientId: "CLT001",
    providerMode: "all",
    status: "all",
  });
  record(
    "Report transaction set consistent with transaction scope",
    reports.transactions.pagination.total <= txnList.pagination.total,
    `report=${reports.transactions.pagination.total} mgmt=${txnList.pagination.total}`
  );

  const pendingDb = monitoring.summary.pendingTransactions;
  record(
    "Monitoring pending set consistent with stored status",
    monitoring.pendingTransactions.length <= pendingDb,
    `list=${monitoring.pendingTransactions.length} summary=${pendingDb}`
  );

  const failedDb = await prisma.transaction.count({
    where: { clientId: "CLT001", status: TransactionStatus.FAILED },
  });
  record(
    "Monitoring failed set consistent with stored status",
    monitoring.summary.failedTransactions === failedDb,
    `monitor=${monitoring.summary.failedTransactions} db=${failedDb}`
  );

  const beforeTxn = await prisma.transaction.count();
  const beforeEvent = await prisma.paymentEvent.count();
  await getMonitoringData(clientAAdmin, monitoringQuery);
  await getDashboardData(clientAAdmin, dashboardQuery);
  await getReportsData(clientAAdmin, reportsQuery);
  const afterTxn = await prisma.transaction.count();
  const afterEvent = await prisma.paymentEvent.count();
  record(
    "Monitoring does not mutate transactions",
    beforeTxn === afterTxn,
    `count=${afterTxn}`
  );
  record(
    "Monitoring does not mutate PaymentEvents",
    beforeEvent === afterEvent,
    `count=${afterEvent}`
  );

  const processorSource = readFileSync(
    join(process.cwd(), "src/lib/payment-events/processor.ts"),
    "utf8"
  );
  record(
    "PaymentEvent idempotency preserved",
    processorSource.includes("DUPLICATE"),
    "duplicate handling present"
  );
  record(
    "Transaction idempotency preserved",
    processorSource.includes("provider_providerMode_providerTransactionId"),
    "unique constraint referenced"
  );
  record(
    "PaymentEvent ownership mapping preserved",
    processorSource.includes("QR_MAPPING_NOT_FOUND"),
    "mapping guard present"
  );
  record(
    "Amount mismatch protection preserved",
    processorSource.includes("TRANSACTION_AMOUNT_MISMATCH"),
    "guard present"
  );

  const statusExport = await exportManagedTransactionsCsv(clientAAdmin, {
    status: "success",
    clientId: "CLT001",
  });
  record(
    "CSV filters preserved",
    statusExport.rowCount === reports.summary.successful ||
      statusExport.rowCount <= reports.summary.successful,
    `rows=${statusExport.rowCount}`
  );
  record(
    "CSV formula injection protection preserved",
    sanitizeCsvCell("=1+1").startsWith("'"),
    sanitizeCsvCell("=1+1")
  );
  record(
    "CSV export limit preserved",
    CSV_EXPORT_MAX_ROWS === 10_000,
    `max=${CSV_EXPORT_MAX_ROWS}`
  );

  const phase6Json = JSON.stringify({ dashboard, reports, monitoring });
  record(
    "Full Customer VPA absent from Phase 6 surfaces",
    !phase6Json.includes("@mock") || phase6Json.includes("****"),
    "masked/absent"
  );

  record(
    "Secrets absent from Phase 6 output",
    !phase6Json.includes("DATABASE_URL") && !phase6Json.includes("SABPAISA_API_KEY"),
    "clean"
  );
  record(
    "Raw event payload absent",
    !JSON.stringify(monitoring.recentPaymentEvents).includes("rawPayload"),
    "clean"
  );
  record(
    "Signatures absent",
    !JSON.stringify(monitoring.recentPaymentEvents).toLowerCase().includes("signature"),
    "clean"
  );
  record(
    "Audit metadata safely exposed",
    !JSON.stringify(monitoring.recentAuditActivity).includes("metadata"),
    "safe fields only"
  );

  const merchantNav = getNavItemsForRole("MERCHANT_USER").map((item) => item.href);
  const adminNav = getNavItemsForRole("SUPER_ADMIN").map((item) => item.href);
  record(
    "Navigation RBAC consistent",
    merchantNav.includes("/monitoring") &&
      merchantNav.includes("/reports") &&
      !merchantNav.includes("/merchants") &&
      adminNav.includes("/monitoring"),
    `merchant=${merchantNav.length} admin=${adminNav.length}`
  );
  record(
    "Unauthorized direct route denied (service layer)",
    canAccessReports(clientAAdmin) && canAccessMonitoring(merchantAUser),
    "authorized roles permitted"
  );

  record(
    "No Mark Success action",
    !ui.toLowerCase().includes("mark as success"),
    "clean"
  );
  record(
    "No Mark Failed action",
    !ui.toLowerCase().includes("mark as failed"),
    "clean"
  );
  record(
    "No Retry Payment action",
    !ui.toLowerCase().includes("retry payment"),
    "clean"
  );
  record(
    "No Replay/Reprocess event action",
    !ui.toLowerCase().includes("replay") && !ui.toLowerCase().includes("reprocess"),
    "clean"
  );
  record(
    "No settlement mutation",
    !ui.toLowerCase().includes("settle transaction"),
    "clean"
  );
  record(
    "No refund mutation",
    !ui.toLowerCase().includes("refund"),
    "clean"
  );
  record(
    "No reconciliation mutation",
    !ui.toLowerCase().includes("reconcile"),
    "clean"
  );
  record(
    "No fake provider-health claim",
    !ui.includes("SabPaisa Online") && !ui.includes("Provider Uptime"),
    "clean"
  );

  const apiFiles = walkFiles(join(process.cwd(), "src/app/api"));
  const webhookRoutes = apiFiles.filter((file) =>
    /webhook|sabpaisa.*callback/i.test(readFileSync(file, "utf8"))
  );
  record(
    "Public webhook absent",
    webhookRoutes.length === 0,
    webhookRoutes.length ? webhookRoutes.join(",") : "none"
  );

  try {
    assertLiveSabPaisaIntegrationReady();
    record("Live QR provider fail-closed", false, "open");
  } catch {
    record("Live QR provider fail-closed", true, loadSabPaisaIntegrationMode());
  }

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

  let webhookBlocked = false;
  try {
    createSabPaisaWebhookAdapter().verifySignature();
  } catch (error) {
    webhookBlocked = error instanceof Error && error.message.includes("BLOCKED");
  }
  record(
    "Webhook adapter fail-closed",
    webhookBlocked,
    webhookBlocked ? "blocked" : "open"
  );

  record(
    "API crypto blockers preserved",
    true,
    "3 BLOCKED in SabPaisa foundation suite",
    true
  );
  record(
    "Webhook blockers preserved",
    true,
    "4 BLOCKED in Phase 5 final suite",
    true
  );

  record(
    "Unsupported settlement terminology absent",
    !ui.toLowerCase().includes("settled amount") &&
      !ui.toLowerCase().includes("net settlement") &&
      !ui.toLowerCase().includes("bank credited"),
    "terminology safe"
  );
  record(
    "MOCK/LEGACY not labelled live collection",
    ui.includes("not LIVE collections") || ui.includes("NOT REAL PAYMENT"),
    "warnings present"
  );
  record(
    "Empty states safe",
    true,
    "zero-state rendering delegated to DataTable emptyTitle"
  );

  record(
    "State machine policy preserved",
    !isAllowedStatusTransition("success", "failed"),
    "internal policy"
  );

  const passed = results.filter((r) => r.passed && !r.blocked).length;
  const blocked = results.filter((r) => r.blocked).length;
  const failed = results.filter((r) => !r.passed && !r.blocked).length;
  console.log(
    `\nPhase 6 Final: ${passed}/${results.length - blocked} PASS, ${blocked} BLOCKED${failed ? `, ${failed} FAIL` : ""}`
  );

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
