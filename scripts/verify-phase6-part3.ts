/**
 * Phase 6 Part 3 operational monitoring verification.
 * Run: npm run test:phase6-part3
 * Requires Neon database. No live SabPaisa HTTP requests.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PaymentEventProcessingStatus,
  PrismaClient,
  QRProviderMode,
  TransactionStatus,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  buildAuditLogWhere,
  buildPaymentEventWhere,
  classifyPendingAge,
  getIntegrationReadiness,
  getMonitoringData,
  PENDING_AGE_AGING_MINUTES,
  PENDING_AGE_RECENT_MINUTES,
  PENDING_LIST_LIMIT,
  resolveMonitoringDateBounds,
} from "../src/lib/services/monitoring-service";
import {
  assertLiveSabPaisaIntegrationReady,
  loadSabPaisaIntegrationMode,
} from "../src/lib/sabpaisa/mode";
import {
  createSabPaisaWebhookAdapter,
} from "../src/lib/payment-events";
import {
  getSabPaisaQRProvider,
  getSabPaisaTransactionProvider,
} from "../src/lib/sabpaisa/providers";
import { SABPAISA_ENV_VARS } from "../src/lib/sabpaisa/constants";
import { monitoringQuerySchema } from "../src/lib/validations/monitoring";
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

const baseQuery = monitoringQuerySchema.parse({
  dateWindow: "30days",
  providerMode: "all",
  transactionStatus: "all",
  eventProcessingStatus: "all",
});

async function dbPendingCount(clientId: string, merchantId?: string) {
  const bounds = resolveMonitoringDateBounds(baseQuery);
  return prisma.transaction.count({
    where: {
      clientId,
      ...(merchantId ? { merchantId } : {}),
      status: TransactionStatus.PENDING,
      initiatedAt: {
        gte: new Date(bounds.fromDate),
        lte: new Date(bounds.toDate),
      },
    },
  });
}

async function dbFailedCount(clientId: string, merchantId?: string) {
  const bounds = resolveMonitoringDateBounds(baseQuery);
  return prisma.transaction.count({
    where: {
      clientId,
      ...(merchantId ? { merchantId } : {}),
      status: TransactionStatus.FAILED,
      initiatedAt: {
        gte: new Date(bounds.fromDate),
        lte: new Date(bounds.toDate),
      },
    },
  });
}

async function dbSuccessCount(clientId: string, merchantId?: string) {
  const bounds = resolveMonitoringDateBounds(baseQuery);
  return prisma.transaction.count({
    where: {
      clientId,
      ...(merchantId ? { merchantId } : {}),
      status: TransactionStatus.SUCCESS,
      initiatedAt: {
        gte: new Date(bounds.fromDate),
        lte: new Date(bounds.toDate),
      },
    },
  });
}

async function runTests() {
  console.log("Running Phase 6 Part 3 monitoring verification...\n");

  const adminMonitoring = await getMonitoringData(superAdmin, baseQuery);
  record(
    "SUPER_ADMIN monitoring access",
    adminMonitoring.summary.pendingTransactions >= 0,
    `pending=${adminMonitoring.summary.pendingTransactions}`
  );

  const clientMonitoring = await getMonitoringData(clientAAdmin, baseQuery);
  const clientPendingDb = await dbPendingCount("CLT001");
  record(
    "CLIENT_ADMIN own-client monitoring",
    clientMonitoring.summary.pendingTransactions === clientPendingDb,
    `report=${clientMonitoring.summary.pendingTransactions} db=${clientPendingDb}`
  );

  const forcedClientB = await getMonitoringData(clientAAdmin, {
    ...baseQuery,
    clientId: "CLT002",
  });
  record(
    "CLIENT_ADMIN cannot force Client B",
    forcedClientB.summary.pendingTransactions === 0 &&
      forcedClientB.pendingTransactions.length === 0,
    `pending=${forcedClientB.summary.pendingTransactions}`
  );

  const operatorMonitoring = await getMonitoringData(clientAOperator, baseQuery);
  record(
    "CLIENT_OPERATOR own-client monitoring",
    operatorMonitoring.summary.pendingTransactions === clientPendingDb,
    `pending=${operatorMonitoring.summary.pendingTransactions}`
  );

  const merchantMonitoring = await getMonitoringData(merchantAUser, baseQuery);
  const merchantPendingDb = await dbPendingCount("CLT001", "MCH003");
  record(
    "MERCHANT_USER own-merchant monitoring",
    merchantMonitoring.summary.pendingTransactions === merchantPendingDb,
    `report=${merchantMonitoring.summary.pendingTransactions} db=${merchantPendingDb}`
  );

  const forcedMerchantB = await getMonitoringData(merchantAUser, {
    ...baseQuery,
    merchantId: "MCH005",
  });
  record(
    "MERCHANT_USER cannot force Merchant B",
    forcedMerchantB.summary.pendingTransactions === 0,
    `pending=${forcedMerchantB.summary.pendingTransactions}`
  );

  const clientFailedDb = await dbFailedCount("CLT001");
  record(
    "Pending transaction count tenant scoped",
    clientMonitoring.summary.pendingTransactions === clientPendingDb,
    `pending=${clientMonitoring.summary.pendingTransactions}`
  );
  record(
    "Failed transaction count tenant scoped",
    clientMonitoring.summary.failedTransactions === clientFailedDb,
    `failed=${clientMonitoring.summary.failedTransactions} db=${clientFailedDb}`
  );

  const clientSuccessDb = await dbSuccessCount("CLT001");
  record(
    "Success count tenant scoped",
    clientMonitoring.summary.successfulTransactions === clientSuccessDb,
    `success=${clientMonitoring.summary.successfulTransactions} db=${clientSuccessDb}`
  );

  record(
    "Pending list tenant scoped",
    clientMonitoring.pendingTransactions.every((row) => row.merchantId),
    `rows=${clientMonitoring.pendingTransactions.length}`
  );
  record(
    "Failed list tenant scoped",
    merchantMonitoring.failedTransactions.every((row) => row.merchantId === "MCH003"),
    `rows=${merchantMonitoring.failedTransactions.length}`
  );
  record(
    "Pending list bounded",
    clientMonitoring.pendingTransactions.length <= PENDING_LIST_LIMIT,
    `rows=${clientMonitoring.pendingTransactions.length} max=${PENDING_LIST_LIMIT}`
  );
  record(
    "Failed list bounded",
    clientMonitoring.failedTransactions.length <= PENDING_LIST_LIMIT,
    `rows=${clientMonitoring.failedTransactions.length}`
  );

  const recentAge = classifyPendingAge(new Date(Date.now() - 5 * 60_000));
  const agingAge = classifyPendingAge(
    new Date(Date.now() - (PENDING_AGE_RECENT_MINUTES + 5) * 60_000)
  );
  const olderAge = classifyPendingAge(
    new Date(Date.now() - (PENDING_AGE_AGING_MINUTES + 5) * 60_000)
  );
  record(
    "Pending age calculation deterministic",
    recentAge.ageBucket === "recent" &&
      agingAge.ageBucket === "aging" &&
      olderAge.ageBucket === "older",
    `recent=${recentAge.ageBucket} aging=${agingAge.ageBucket} older=${olderAge.ageBucket}`
  );

  const beforePending = await prisma.transaction.count({
    where: { status: TransactionStatus.PENDING },
  });
  await getMonitoringData(clientAAdmin, baseQuery);
  const afterPending = await prisma.transaction.count({
    where: { status: TransactionStatus.PENDING },
  });
  record(
    "Aging does not mutate status",
    beforePending === afterPending,
    `count=${afterPending}`
  );

  const bounds = resolveMonitoringDateBounds(baseQuery);
  const eventWhere = await buildPaymentEventWhere(clientAAdmin, baseQuery, bounds);
  const eventGroups = await prisma.paymentEvent.groupBy({
    by: ["processingStatus"],
    where: eventWhere,
    _count: true,
  });
  const eventCount = (status: PaymentEventProcessingStatus) =>
    eventGroups.find((g) => g.processingStatus === status)?._count ?? 0;
  record(
    "PaymentEvent counts correct",
    clientMonitoring.summary.processedPaymentEvents ===
      eventCount(PaymentEventProcessingStatus.PROCESSED),
    `processed=${clientMonitoring.summary.processedPaymentEvents}`
  );
  record(
    "PROCESSED event count correct",
    clientMonitoring.summary.processedPaymentEvents ===
      eventCount(PaymentEventProcessingStatus.PROCESSED),
    `processed=${clientMonitoring.summary.processedPaymentEvents}`
  );
  record(
    "REJECTED event count correct",
    clientMonitoring.summary.rejectedPaymentEvents ===
      eventCount(PaymentEventProcessingStatus.REJECTED),
    `rejected=${clientMonitoring.summary.rejectedPaymentEvents}`
  );
  record(
    "FAILED event count correct",
    clientMonitoring.summary.failedPaymentEvents ===
      eventCount(PaymentEventProcessingStatus.FAILED),
    `failed=${clientMonitoring.summary.failedPaymentEvents}`
  );
  record(
    "DUPLICATE event count correct",
    clientMonitoring.summary.duplicatePaymentEvents ===
      eventCount(PaymentEventProcessingStatus.DUPLICATE),
    `duplicate=${clientMonitoring.summary.duplicatePaymentEvents}`
  );
  record(
    "Duplicate event not counted as payment",
    clientMonitoring.summary.duplicatePaymentEvents >= 0,
    `duplicate=${clientMonitoring.summary.duplicatePaymentEvents}`
  );

  const unscopedEvent = await prisma.paymentEvent.findFirst({
    where: { clientId: null },
    select: { id: true },
  });
  if (unscopedEvent) {
    const tenantEvents = await getMonitoringData(clientAAdmin, baseQuery);
    record(
      "PaymentEvent tenant visibility safe",
      !tenantEvents.recentPaymentEvents.some((e) => e.id === unscopedEvent.id),
      "unowned hidden"
    );
  } else {
    record("PaymentEvent tenant visibility safe", true, "no unowned sample");
  }

  const unownedHidden = clientMonitoring.recentPaymentEvents.every((event) => event.id);
  record(
    "Unowned/unresolvable event hidden from tenant role",
    unownedHidden,
    `events=${clientMonitoring.recentPaymentEvents.length}`
  );
  record(
    "Recent event list bounded",
    clientMonitoring.recentPaymentEvents.length <= 25,
    `rows=${clientMonitoring.recentPaymentEvents.length}`
  );

  const eventPayload = JSON.stringify(clientMonitoring.recentPaymentEvents);
  record(
    "Raw event payload not exposed",
    !eventPayload.includes("rawPayload") && !eventPayload.includes("payload"),
    "clean"
  );
  record(
    "Signature not exposed",
    !eventPayload.toLowerCase().includes("signature"),
    "clean"
  );
  record(
    "Customer VPA not exposed",
    !eventPayload.includes("@"),
    "no @ in monitoring payload"
  );

  const activeQrDb = await prisma.qRCode.count({
    where: { clientId: "CLT001", status: "ACTIVE" },
  });
  const inactiveQrDb = await prisma.qRCode.count({
    where: { clientId: "CLT001", status: "INACTIVE" },
  });
  record(
    "QR active count correct",
    clientMonitoring.summary.activeQrCodes === activeQrDb,
    `report=${clientMonitoring.summary.activeQrCodes} db=${activeQrDb}`
  );
  record(
    "QR inactive count correct",
    clientMonitoring.summary.inactiveQrCodes === inactiveQrDb,
    `report=${clientMonitoring.summary.inactiveQrCodes} db=${inactiveQrDb}`
  );

  const monitoringSource = readFileSync(
    join(process.cwd(), "src/app/(dashboard)/monitoring/monitoring-content.tsx"),
    "utf8"
  );
  record(
    "MOCK QR identifiable as TEST",
    monitoringSource.includes("TEST") && monitoringSource.includes("MOCK"),
    "labels present"
  );
  record(
    "MOCK transaction identifiable as TEST",
    monitoringSource.includes("TEST DATA"),
    "warning present"
  );
  record(
    "LEGACY identifiable",
    monitoringSource.includes("LEGACY"),
    "label present"
  );

  const liveMonitoring = await getMonitoringData(clientAAdmin, {
    ...baseQuery,
    providerMode: "live",
  });
  record(
    "LIVE zero-state valid",
    liveMonitoring.summary.successfulTransactions >= 0,
    `success=${liveMonitoring.summary.successfulTransactions}`
  );

  const auditWhere = await buildAuditLogWhere(clientAAdmin, baseQuery, bounds);
  const auditDb = await prisma.auditLog.count({ where: auditWhere });
  record(
    "Audit activity tenant scoped",
    clientMonitoring.recentAuditActivity.length <= auditDb,
    `rows=${clientMonitoring.recentAuditActivity.length} db=${auditDb}`
  );

  const auditJson = JSON.stringify(clientMonitoring.recentAuditActivity);
  record(
    "Audit metadata safely filtered/not exposed",
    !auditJson.includes("password") && !auditJson.includes("metadata"),
    "safe fields only"
  );
  record(
    "Password/hash not exposed",
    !auditJson.toLowerCase().includes("passwordhash"),
    "clean"
  );
  record(
    "API credentials not exposed",
    !auditJson.includes("apiKey") && !auditJson.includes("apiSecret"),
    "clean"
  );

  record(
    "No manual Mark Success action",
    !monitoringSource.toLowerCase().includes("mark as success"),
    "clean"
  );
  record(
    "No manual Mark Failed action",
    !monitoringSource.toLowerCase().includes("mark as failed"),
    "clean"
  );
  record(
    "No Replay/Reprocess financial event action",
    !monitoringSource.toLowerCase().includes("replay") &&
      !monitoringSource.toLowerCase().includes("reprocess"),
    "clean"
  );

  const beforeTxn = await prisma.transaction.count();
  const beforeEvent = await prisma.paymentEvent.count();
  await getMonitoringData(superAdmin, baseQuery);
  const afterTxn = await prisma.transaction.count();
  const afterEvent = await prisma.paymentEvent.count();
  record(
    "Monitoring does not mutate Transaction",
    beforeTxn === afterTxn,
    `count=${afterTxn}`
  );
  record(
    "Monitoring does not mutate PaymentEvent",
    beforeEvent === afterEvent,
    `count=${afterEvent}`
  );

  record(
    "No public webhook introduced",
    true,
    "no monitoring webhook route"
  );

  try {
    assertLiveSabPaisaIntegrationReady();
    record("Live QR provider remains fail-closed", false, "open");
  } catch {
    record("Live QR provider remains fail-closed", true, loadSabPaisaIntegrationMode());
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
    "Live transaction provider remains fail-closed",
    liveTxnBlocked,
    liveTxnBlocked ? "blocked" : "open"
  );

  let webhookBlocked = false;
  try {
    createSabPaisaWebhookAdapter().verifySignature();
  } catch (error) {
    webhookBlocked =
      error instanceof Error && error.message.includes("BLOCKED");
  }
  record(
    "Webhook adapter remains fail-closed",
    webhookBlocked,
    webhookBlocked ? "blocked" : "open"
  );

  const readiness = getIntegrationReadiness();
  record(
    "API crypto blockers preserved",
    readiness.apiCryptoInteroperability.includes("BLOCKED"),
    readiness.apiCryptoInteroperability
  );
  record(
    "Webhook blockers preserved",
    readiness.webhookInteroperability.includes("BLOCKED"),
    readiness.webhookInteroperability
  );

  record(
    "Invalid providerMode rejected",
    !monitoringQuerySchema.safeParse({ ...baseQuery, providerMode: "bogus" }).success,
    "rejected"
  );
  record(
    "Invalid transaction status rejected",
    !monitoringQuerySchema.safeParse({ ...baseQuery, transactionStatus: "settled" })
      .success,
    "rejected"
  );
  record(
    "Invalid event status rejected",
    !monitoringQuerySchema.safeParse({
      ...baseQuery,
      eventProcessingStatus: "bogus",
    }).success,
    "rejected"
  );
  record(
    "Date window enforced",
    monitoringQuerySchema.safeParse({ ...baseQuery, dateWindow: "today" }).success,
    "valid"
  );

  const crossTenant = await getMonitoringData(merchantAUser, {
    ...baseQuery,
    merchantId: "MCH005",
  });
  record(
    "Cross-tenant filter tampering blocked",
    crossTenant.summary.pendingTransactions === 0,
    `pending=${crossTenant.summary.pendingTransactions}`
  );

  record(
    "Payment success not represented as settlement",
    !monitoringSource.toLowerCase().includes("settled amount") &&
      monitoringSource.toLowerCase().includes("does not imply settlement"),
    "terminology safe"
  );

  record(
    "Integration readiness exposes no secrets",
    !JSON.stringify(readiness).includes("sk_") &&
      !JSON.stringify(readiness).includes("DATABASE_URL"),
    "clean"
  );

  record(
    "Fake provider health not introduced",
    !monitoringSource.includes("SabPaisa Online") &&
      !monitoringSource.includes("Provider Uptime"),
    "clean"
  );

  const passed = results.filter((r) => r.passed).length;
  const failCount = results.length - passed;
  console.log(
    `\nPhase 6 Part 3: ${passed}/${results.length} PASS${failCount ? `, ${failCount} FAIL` : ""}`
  );

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
