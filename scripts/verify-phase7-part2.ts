/**
 * Phase 7 Part 2 operational notifications verification.
 * Run: npm run test:phase7-part2
 * Requires Neon database. No live SabPaisa HTTP requests.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  NotificationSeverity,
  NotificationType,
  PrismaClient,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { canAccessNotifications } from "../src/lib/auth/authorization";
import type { SessionUser } from "../src/lib/auth/types";
import { getNavItemsForRole } from "../src/lib/constants/navigation";
import {
  createSabPaisaWebhookAdapter,
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
  createOperationalNotification,
  getNotificationsForUser,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATION_SOURCE_TYPES,
  NotificationServiceError,
} from "../src/lib/services/notification-service";
import { ingestMockPaymentEvent } from "../src/lib/test-fixtures/mock-payment-event-fixture";

process.env.SABPAISA_MODE = "mock";
process.env.ALLOW_MOCK_PAYMENT_EVENTS = "true";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type TestResult = { name: string; passed: boolean; detail: string; blocked?: boolean };
const results: TestResult[] = [];
const createdNotificationIds: string[] = [];
const createdEventIds: string[] = [];
const createdTransactionIds: string[] = [];

function record(name: string, passed: boolean, detail: string, blocked = false) {
  results.push({ name, passed, detail, blocked });
  const label = blocked ? "BLOCKED" : passed ? "PASS" : "FAIL";
  console.log(`${label} — ${name}: ${detail}`);
}

function suffix() {
  return randomBytes(4).toString("hex");
}

function mockIds(label = suffix()) {
  return {
    providerEventId: `mock_evt_${label}`,
    providerTransactionId: `mock_txn_${label}`,
  };
}

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
  id: "USR006",
  name: "Client B Admin",
  email: "admin@clientb.example.com",
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

async function trackNotification(id: string) {
  createdNotificationIds.push(id);
}

async function trackPaymentResult(result: {
  paymentEventId: string;
  transactionId?: string;
}) {
  createdEventIds.push(result.paymentEventId);
  if (result.transactionId) createdTransactionIds.push(result.transactionId);
}

async function cleanup() {
  if (createdNotificationIds.length > 0) {
    await prisma.notificationRead.deleteMany({
      where: { notificationId: { in: createdNotificationIds } },
    });
    await prisma.notification.deleteMany({
      where: { id: { in: createdNotificationIds } },
    });
  }
  if (createdEventIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: {
        entityType: "PaymentEvent",
        entityId: { in: createdEventIds },
      },
    });
    await prisma.paymentEvent.deleteMany({
      where: { id: { in: createdEventIds } },
    });
  }
  if (createdTransactionIds.length > 0) {
    await prisma.transaction.deleteMany({
      where: { id: { in: createdTransactionIds } },
    });
  }
}

async function createTestNotification(input: {
  type?: NotificationType;
  severity?: NotificationSeverity;
  title: string;
  message: string;
  clientId?: string | null;
  merchantId?: string | null;
  sourceId?: string;
}) {
  const sourceId = input.sourceId ?? `test_src_${suffix()}`;
  const result = await createOperationalNotification({
    type: input.type ?? NotificationType.MERCHANT_ACTIVATED,
    severity: input.severity ?? NotificationSeverity.INFO,
    title: input.title,
    message: input.message,
    clientId: input.clientId ?? null,
    merchantId: input.merchantId ?? null,
    sourceType: NOTIFICATION_SOURCE_TYPES.MERCHANT,
    sourceId,
  });
  await trackNotification(result.id);
  return { ...result, sourceId };
}

async function runTests() {
  console.log("Running Phase 7 Part 2 operational notifications tests...\n");

  const schemaSource = readFileSync(
    join(process.cwd(), "prisma/schema.prisma"),
    "utf8"
  );
  record(
    "Notification model defined in schema",
    schemaSource.includes("model Notification") &&
      schemaSource.includes("model NotificationRead"),
    "Notification + NotificationRead models present"
  );

  const expectedTypes = [
    "PAYMENT_SUCCESS",
    "PAYMENT_FAILED",
    "PAYMENT_PENDING",
    "QR_CREATED",
    "QR_ACTIVATED",
    "QR_DEACTIVATED",
    "MERCHANT_ACTIVATED",
    "MERCHANT_DEACTIVATED",
    "CLIENT_ACTIVATED",
    "CLIENT_DEACTIVATED",
  ];
  const typeValues = Object.values(NotificationType);
  record(
    "NotificationType enum complete",
    expectedTypes.every((value) => typeValues.includes(value as NotificationType)),
    `${typeValues.length} values`
  );

  const expectedSeverities = ["INFO", "SUCCESS", "WARNING", "ERROR"];
  const severityValues = Object.values(NotificationSeverity);
  record(
    "NotificationSeverity enum complete",
    expectedSeverities.every((value) =>
      severityValues.includes(value as NotificationSeverity)
    ),
    `${severityValues.length} values`
  );

  record(
    "Notification unique source constraint in schema",
    schemaSource.includes("@@unique([sourceType, sourceId, type])"),
    "sourceType_sourceId_type unique"
  );

  const firstCreate = await createTestNotification({
    title: "Idempotency test",
    message: "First create",
    clientId: "CLT001",
    merchantId: "MCH003",
    sourceId: `idem_${suffix()}`,
  });
  const secondCreate = await createOperationalNotification({
    type: NotificationType.MERCHANT_ACTIVATED,
    severity: NotificationSeverity.INFO,
    title: "Idempotency test duplicate",
    message: "Second create",
    clientId: "CLT001",
    merchantId: "MCH003",
    sourceType: NOTIFICATION_SOURCE_TYPES.MERCHANT,
    sourceId: firstCreate.sourceId,
  });
  record(
    "createOperationalNotification idempotent",
    firstCreate.created && !secondCreate.created && firstCreate.id === secondCreate.id,
    `${firstCreate.id} created=${firstCreate.created} dup=${secondCreate.created}`
  );

  const merchantANotification = await createTestNotification({
    title: "Merchant A alert",
    message: "Scoped to MCH003",
    clientId: "CLT001",
    merchantId: "MCH003",
    sourceId: `mch003_${suffix()}`,
  });
  const merchantOtherNotification = await createTestNotification({
    title: "Merchant other alert",
    message: "Scoped to MCH001",
    clientId: "CLT001",
    merchantId: "MCH001",
    sourceId: `mch001_${suffix()}`,
  });
  const clientBNotification = await createTestNotification({
    title: "Client B alert",
    message: "Scoped to CLT002",
    clientId: "CLT002",
    merchantId: "MCH005",
    sourceId: `clt002_${suffix()}`,
  });

  const superList = await getNotificationsForUser(superAdmin, { page: 1, limit: 50 });
  record(
    "SUPER_ADMIN sees cross-tenant notifications",
    superList.items.some((item) => item.id === clientBNotification.id),
    `found=${superList.items.some((item) => item.id === clientBNotification.id)}`
  );

  const clientAList = await getNotificationsForUser(clientAAdmin, { page: 1, limit: 50 });
  record(
    "CLIENT_ADMIN sees own Client notifications",
    clientAList.items.some((item) => item.id === merchantANotification.id) &&
      !clientAList.items.some((item) => item.id === clientBNotification.id),
    `clientA=${clientAList.items.length}`
  );

  const operatorList = await getNotificationsForUser(clientAOperator, {
    page: 1,
    limit: 50,
  });
  record(
    "CLIENT_OPERATOR sees own Client notifications",
    operatorList.items.some((item) => item.id === merchantOtherNotification.id) &&
      !operatorList.items.some((item) => item.id === clientBNotification.id),
    `operator=${operatorList.items.length}`
  );

  const merchantList = await getNotificationsForUser(merchantAUser, {
    page: 1,
    limit: 50,
  });
  record(
    "MERCHANT_USER sees own merchant notifications only",
    merchantList.items.some((item) => item.id === merchantANotification.id) &&
      !merchantList.items.some((item) => item.id === merchantOtherNotification.id) &&
      !merchantList.items.some((item) => item.id === clientBNotification.id),
    `merchant=${merchantList.items.length}`
  );

  let clientBCrossTenantDenied = false;
  try {
    await markNotificationRead(clientAAdmin, clientBNotification.id);
  } catch (error) {
    clientBCrossTenantDenied =
      error instanceof NotificationServiceError && error.code === "FORBIDDEN";
  }
  record(
    "Cross-tenant Client B access denied",
    clientBCrossTenantDenied,
    clientBCrossTenantDenied ? "Denied" : "Allowed"
  );

  let merchantBCrossTenantDenied = false;
  try {
    await markNotificationRead(merchantAUser, clientBNotification.id);
  } catch (error) {
    merchantBCrossTenantDenied =
      error instanceof NotificationServiceError && error.code === "FORBIDDEN";
  }
  record(
    "Cross-tenant Merchant B access denied",
    merchantBCrossTenantDenied,
    merchantBCrossTenantDenied ? "Denied" : "Allowed"
  );

  const unreadBeforeMark = await getUnreadNotificationCount(clientAAdmin);
  await markNotificationRead(clientAAdmin, merchantANotification.id);
  const operatorUnreadAfterAdminRead = await getUnreadNotificationCount(
    clientAOperator
  );
  const adminUnreadAfterRead = await getUnreadNotificationCount(clientAAdmin);
  record(
    "Per-user NotificationRead isolation",
    operatorUnreadAfterAdminRead >= unreadBeforeMark &&
      adminUnreadAfterRead < unreadBeforeMark,
    `adminUnread=${adminUnreadAfterRead} operatorUnread=${operatorUnreadAfterAdminRead}`
  );

  const marked = await markNotificationRead(clientAOperator, merchantOtherNotification.id);
  record(
    "markNotificationRead sets isRead",
    marked.isRead && marked.id === merchantOtherNotification.id,
    `isRead=${marked.isRead}`
  );

  const unreadBeforeAll = await getUnreadNotificationCount(clientAOperator);
  const markAllResult = await markAllNotificationsRead(clientAOperator);
  const unreadAfterAll = await getUnreadNotificationCount(clientAOperator);
  record(
    "markAllNotificationsRead clears unread for user",
    markAllResult.marked >= 0 && unreadAfterAll === 0 && unreadBeforeAll >= markAllResult.marked,
    `marked=${markAllResult.marked} unread=${unreadAfterAll}`
  );

  record(
    "getUnreadNotificationCount reflects read state",
    (await getUnreadNotificationCount(clientAOperator)) === 0,
    `count=${await getUnreadNotificationCount(clientAOperator)}`
  );

  const qr = await prisma.qRCode.findUnique({
    where: { id: "QR004" },
    include: { merchant: true },
  });
  record("Seed QR004 available", Boolean(qr), qr?.id ?? "missing");
  if (!qr) {
    throw new Error("QR004 required for payment notification tests");
  }

  await prisma.clientSettings.upsert({
    where: { clientId: "CLT001" },
    create: {
      clientId: "CLT001",
      emailNotifications: true,
      transactionAlerts: true,
      weeklyReports: false,
    },
    update: {
      transactionAlerts: true,
    },
  });

  const providerQrId = qr.sabpaisaQrId ?? qr.id;
  const paymentIds = mockIds(`p7-notif-${suffix()}`);
  const paymentResult = await ingestMockPaymentEvent({
    ...paymentIds,
    providerQrId,
    amount: 199,
    status: "success",
    customerVpa: "secret-customer@mock",
  });
  await trackPaymentResult(paymentResult);

  const paymentNotification = await prisma.notification.findFirst({
    where: {
      sourceType: NOTIFICATION_SOURCE_TYPES.PAYMENT_EVENT,
      sourceId: paymentResult.paymentEventId,
    },
  });
  if (paymentNotification) {
    await trackNotification(paymentNotification.id);
  }
  record(
    "Payment event creates operational notification",
    paymentResult.processingStatus === "PROCESSED" && Boolean(paymentNotification),
    paymentNotification?.type ?? "missing"
  );

  const duplicatePayment = await ingestMockPaymentEvent({
    ...paymentIds,
    providerQrId,
    amount: 199,
    status: "success",
    customerVpa: "secret-customer@mock",
  });
  const paymentNotificationCount = await prisma.notification.count({
    where: {
      sourceType: NOTIFICATION_SOURCE_TYPES.PAYMENT_EVENT,
      sourceId: paymentResult.paymentEventId,
    },
  });
  record(
    "Duplicate payment event does not duplicate notification",
    duplicatePayment.processingStatus === "DUPLICATE" && paymentNotificationCount === 1,
    `${duplicatePayment.processingStatus} count=${paymentNotificationCount}`
  );

  record(
    "MOCK payment notification title includes TEST",
    Boolean(paymentNotification?.title.includes("TEST")),
    paymentNotification?.title ?? "missing"
  );

  const notificationPayload = JSON.stringify({
    title: paymentNotification?.title,
    message: paymentNotification?.message,
  });
  const qrVpa = qr.vpa ?? "";
  record(
    "Notification content has no customer VPA",
    !notificationPayload.includes("@mock") && !notificationPayload.includes("@mahacred"),
    "no VPA in title/message"
  );
  record(
    "Notification content has no secret-like keys",
    !notificationPayload.includes("SABPAISA_API_KEY") &&
      !notificationPayload.includes("password") &&
      !notificationPayload.includes("DATABASE_URL"),
    "clean"
  );

  const txnBefore = paymentResult.transactionId
    ? await prisma.transaction.findUnique({
        where: { id: paymentResult.transactionId },
        select: { status: true, amount: true, providerMode: true },
      })
    : null;
  const eventBefore = await prisma.paymentEvent.findUnique({
    where: { id: paymentResult.paymentEventId },
    select: { processingStatus: true, eventType: true },
  });

  if (paymentNotification) {
    await markNotificationRead(clientAAdmin, paymentNotification.id);
  }

  const txnAfter = paymentResult.transactionId
    ? await prisma.transaction.findUnique({
        where: { id: paymentResult.transactionId },
        select: { status: true, amount: true, providerMode: true },
      })
    : null;
  const eventAfter = await prisma.paymentEvent.findUnique({
    where: { id: paymentResult.paymentEventId },
    select: { processingStatus: true, eventType: true },
  });
  record(
    "Notification read does not mutate Transaction",
    !txnBefore ||
      (txnAfter?.status === txnBefore.status &&
        String(txnAfter.amount) === String(txnBefore.amount) &&
        txnAfter.providerMode === txnBefore.providerMode),
    "unchanged"
  );
  record(
    "Notification read does not mutate PaymentEvent",
    eventBefore?.processingStatus === eventAfter?.processingStatus &&
      eventBefore?.eventType === eventAfter?.eventType,
    `${eventBefore?.processingStatus} → ${eventAfter?.processingStatus}`
  );

  const apiDir = join(process.cwd(), "src/app/api");
  const apiFiles = walkFiles(apiDir);
  const publicCreateRoute = apiFiles.some((file) => {
    const content = readFileSync(file, "utf8");
    return (
      /notifications\/create/i.test(file) ||
      (/\/notifications/i.test(file) &&
        /export\s+(async\s+)?function\s+(POST|PUT|PATCH)/.test(content) &&
        /createOperationalNotification/.test(content))
    );
  });
  record(
    "No public /api/notifications/create route",
    !publicCreateRoute,
    publicCreateRoute ? "route found" : "none"
  );

  const settingsUi = readFileSync(
    join(process.cwd(), "src/app/(dashboard)/settings/settings-content.tsx"),
    "utf8"
  );
  record(
    "No live switch UI in settings",
    !/Enable Live|Switch to Production|Activate SabPaisa/i.test(settingsUi),
    "no live switch UI"
  );

  const actionsSource = readFileSync(
    join(process.cwd(), "src/lib/actions/notification-actions.ts"),
    "utf8"
  );
  record(
    "Notification actions enforce canAccessNotifications",
    actionsSource.includes("canAccessNotifications") &&
      (actionsSource.match(/canAccessNotifications/g) ?? []).length >= 5,
    "action source verified"
  );
  record(
    "Notification actions use service layer",
    actionsSource.includes("getNotificationsForUser") &&
      actionsSource.includes("markNotificationRead") &&
      actionsSource.includes("markAllNotificationsRead"),
    "service imports verified"
  );

  const foundation = readFileSync(
    join(process.cwd(), "scripts/verify-sabpaisa-foundation.ts"),
    "utf8"
  );
  const blockedCrypto = (foundation.match(/BLOCKED/g) ?? []).length;
  record(
    "API crypto blockers preserved",
    blockedCrypto >= 3,
    `${blockedCrypto} BLOCKED labels in foundation suite`
  );

  const phase5Final = readFileSync(
    join(process.cwd(), "scripts/verify-phase5-final.ts"),
    "utf8"
  );
  const blockedWebhook = (phase5Final.match(/BLOCKED/g) ?? []).length;
  record(
    "Webhook blockers preserved",
    blockedWebhook >= 4,
    `${blockedWebhook} BLOCKED labels in Phase 5 final suite`
  );

  let liveQrBlocked = false;
  try {
    process.env[SABPAISA_ENV_VARS.MODE] = "live";
    getSabPaisaQRProvider();
  } catch {
    liveQrBlocked = true;
  } finally {
    delete process.env[SABPAISA_ENV_VARS.MODE];
  }
  record(
    "Live QR provider remains fail-closed",
    liveQrBlocked,
    liveQrBlocked ? "blocked" : "enabled"
  );

  let liveTxnBlocked = false;
  try {
    process.env[SABPAISA_ENV_VARS.MODE] = "live";
    getSabPaisaTransactionProvider();
  } catch {
    liveTxnBlocked = true;
  } finally {
    delete process.env[SABPAISA_ENV_VARS.MODE];
  }
  record(
    "Live transaction provider remains fail-closed",
    liveTxnBlocked,
    liveTxnBlocked ? "blocked" : "enabled"
  );

  let webhookBlocked = false;
  try {
    createSabPaisaWebhookAdapter().verifySignature();
  } catch {
    webhookBlocked = true;
  }
  record(
    "Webhook adapter fail-closed",
    webhookBlocked,
    webhookBlocked ? "blocked" : "enabled"
  );

  const clientCountBefore = await prisma.client.count();
  const merchantCountBefore = await prisma.merchant.count();
  const txnCountBefore = await prisma.transaction.count();
  record(
    "Existing Neon data preserved",
    clientCountBefore > 0 && merchantCountBefore > 0 && txnCountBefore > 0,
    `clients=${clientCountBefore} merchants=${merchantCountBefore} txns=${txnCountBefore}`
  );

  record(
    "canAccessNotifications authorization enforced",
    canAccessNotifications(superAdmin) &&
      canAccessNotifications(clientAAdmin) &&
      canAccessNotifications(clientAOperator) &&
      canAccessNotifications(merchantAUser) &&
      canAccessNotifications(clientBAdmin),
    "authorized roles permitted"
  );

  const superNav = getNavItemsForRole("SUPER_ADMIN").map((item) => item.href);
  const adminNav = getNavItemsForRole("CLIENT_ADMIN").map((item) => item.href);
  const operatorNav = getNavItemsForRole("CLIENT_OPERATOR").map((item) => item.href);
  const merchantNav = getNavItemsForRole("MERCHANT_USER").map((item) => item.href);
  record(
    "Navigation includes /notifications for authorized roles",
    superNav.includes("/notifications") &&
      adminNav.includes("/notifications") &&
      operatorNav.includes("/notifications") &&
      merchantNav.includes("/notifications"),
    `super=${superNav.includes("/notifications")} admin=${adminNav.includes("/notifications")}`
  );

  const clientBList = await getNotificationsForUser(clientBAdmin, { page: 1, limit: 50 });
  record(
    "Client B admin sees Client B notifications",
    clientBList.items.some((item) => item.id === clientBNotification.id),
    `items=${clientBList.items.length}`
  );

  record(
    "Live SabPaisa integration disabled",
    loadSabPaisaIntegrationMode() === "mock",
    loadSabPaisaIntegrationMode()
  );

  let liveReadyBlocked = false;
  try {
    assertLiveSabPaisaIntegrationReady();
  } catch {
    liveReadyBlocked = true;
  }
  record(
    "Live readiness assertion remains blocked",
    liveReadyBlocked,
    liveReadyBlocked ? "blocked" : "enabled"
  );

  const passed = results.filter((r) => r.passed && !r.blocked).length;
  const blocked = results.filter((r) => r.blocked).length;
  const failed = results.filter((r) => !r.passed && !r.blocked).length;
  console.log(
    `\nPhase 7 Part 2: ${passed}/${results.length - blocked} PASS${blocked ? `, ${blocked} BLOCKED` : ""}${failed ? `, ${failed} FAIL` : ""}`
  );

  await cleanup();

  if (failed > 0) {
    process.exitCode = 1;
  }
}

runTests()
  .catch(async (error) => {
    console.error(error);
    await cleanup().catch(() => undefined);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
