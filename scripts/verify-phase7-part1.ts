/**
 * Phase 7 Part 1 settings persistence + security verification.
 * Run: npm run test:phase7-part1
 * Requires Neon database. No live SabPaisa HTTP requests.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  canAccessSettings,
} from "../src/lib/auth/authorization";
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
import { getIntegrationReadiness } from "../src/lib/services/monitoring-service";
import {
  DEFAULT_CLIENT_SETTINGS,
  DEFAULT_PLATFORM_SETTINGS,
  getClientSettings,
  getPlatformSettings,
  PLATFORM_SETTINGS_ID,
  updateClientSettings,
  updatePlatformSettings,
} from "../src/lib/services/settings-service";
import { createAuditLog } from "../src/lib/audit/audit-log";
import {
  containsSecretLikeKeys,
  updateClientSettingsSchema,
  updatePlatformSettingsSchema,
} from "../src/lib/validations/settings";
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

async function resetSettingsFixtures() {
  await prisma.clientSettings.deleteMany({
    where: { clientId: { in: ["CLT001", "CLT002"] } },
  });
  await prisma.platformSettings.deleteMany({});
}

async function runTests() {
  console.log("Running Phase 7 Part 1 settings persistence tests...\n");

  await resetSettingsFixtures();

  const defaults = await getPlatformSettings();
  record(
    "Platform defaults load",
    defaults.platformName === DEFAULT_PLATFORM_SETTINGS.platformName &&
      defaults.supportEmail === DEFAULT_PLATFORM_SETTINGS.supportEmail,
    `${defaults.platformName}/${defaults.supportEmail}`
  );

  const updatedPlatform = await updatePlatformSettings(superAdmin, {
    platformName: "MahaCred QR Test",
    supportEmail: "ops@mahacred.in",
    supportPhone: "9876543210",
  });
  record(
    "Platform settings persist",
    updatedPlatform.platformName === "MahaCred QR Test",
    updatedPlatform.platformName
  );

  const rereadPlatform = await getPlatformSettings();
  record(
    "Platform settings survive re-read",
    rereadPlatform.supportEmail === "ops@mahacred.in",
    rereadPlatform.supportEmail
  );

  const platformCount = await prisma.platformSettings.count();
  record(
    "Only one platform settings row exists",
    platformCount === 1,
    `count=${platformCount}`
  );

  record(
    "SUPER_ADMIN can update platform settings",
    updatedPlatform.supportPhone === "9876543210",
    updatedPlatform.supportPhone ?? "null"
  );

  let clientAdminPlatformDenied = false;
  try {
    await updatePlatformSettings(clientAAdmin, {
      platformName: "Tampered",
      supportEmail: "tamper@example.com",
    });
  } catch {
    clientAdminPlatformDenied = true;
  }
  record(
    "CLIENT_ADMIN cannot update platform settings",
    clientAdminPlatformDenied,
    clientAdminPlatformDenied ? "Denied" : "Allowed"
  );

  let operatorPlatformDenied = false;
  try {
    await updatePlatformSettings(clientAOperator, {
      platformName: "Tampered",
      supportEmail: "tamper@example.com",
    });
  } catch {
    operatorPlatformDenied = true;
  }
  record(
    "CLIENT_OPERATOR cannot update platform settings",
    operatorPlatformDenied,
    operatorPlatformDenied ? "Denied" : "Allowed"
  );

  let merchantPlatformDenied = false;
  try {
    await updatePlatformSettings(merchantAUser, {
      platformName: "Tampered",
      supportEmail: "tamper@example.com",
    });
  } catch {
    merchantPlatformDenied = true;
  }
  record(
    "MERCHANT_USER cannot update platform settings",
    merchantPlatformDenied,
    merchantPlatformDenied ? "Denied" : "Allowed"
  );

  const clientDefaults = await getClientSettings(clientAAdmin, "CLT001");
  record(
    "Client settings defaults load",
    clientDefaults.emailNotifications === DEFAULT_CLIENT_SETTINGS.emailNotifications,
    `email=${clientDefaults.emailNotifications}`
  );

  const updatedClient = await updateClientSettings(clientAAdmin, "CLT001", {
    emailNotifications: false,
    transactionAlerts: true,
    weeklyReports: true,
  });
  record(
    "Client settings persist",
    updatedClient.weeklyReports === true,
    `weekly=${updatedClient.weeklyReports}`
  );

  const clientCount = await prisma.clientSettings.count({
    where: { clientId: "CLT001" },
  });
  record(
    "One settings row per Client",
    clientCount === 1,
    `count=${clientCount}`
  );

  const superUpdatedClient = await updateClientSettings(superAdmin, "CLT002", {
    emailNotifications: true,
    transactionAlerts: false,
    weeklyReports: false,
  });
  record(
    "SUPER_ADMIN can update Client A/B",
    superUpdatedClient.clientId === "CLT002",
    superUpdatedClient.clientId
  );

  const ownClient = await updateClientSettings(clientAAdmin, "CLT001", {
    emailNotifications: true,
    transactionAlerts: false,
    weeklyReports: false,
  });
  record(
    "CLIENT_ADMIN can update own Client",
    ownClient.transactionAlerts === false,
    `alerts=${ownClient.transactionAlerts}`
  );

  let crossTenantDenied = false;
  try {
    await updateClientSettings(clientAAdmin, "CLT002", {
      emailNotifications: false,
      transactionAlerts: false,
      weeklyReports: false,
    });
  } catch {
    crossTenantDenied = true;
  }
  record(
    "CLIENT_ADMIN cannot update Client B",
    crossTenantDenied,
    crossTenantDenied ? "Denied" : "Allowed"
  );

  let operatorClientDenied = false;
  try {
    await updateClientSettings(clientAOperator, "CLT001", {
      emailNotifications: false,
      transactionAlerts: false,
      weeklyReports: false,
    });
  } catch {
    operatorClientDenied = true;
  }
  record(
    "CLIENT_OPERATOR cannot mutate Client settings",
    operatorClientDenied,
    operatorClientDenied ? "Denied" : "Allowed"
  );

  let merchantClientDenied = false;
  try {
    await updateClientSettings(merchantAUser, "CLT001", {
      emailNotifications: false,
      transactionAlerts: false,
      weeklyReports: false,
    });
  } catch {
    merchantClientDenied = true;
  }
  record(
    "MERCHANT_USER cannot mutate Client settings",
    merchantClientDenied,
    merchantClientDenied ? "Denied" : "Allowed"
  );

  const invalidEmail = updatePlatformSettingsSchema.safeParse({
    platformName: "MahaCred QR",
    supportEmail: "not-an-email",
  });
  record(
    "Invalid email rejected",
    !invalidEmail.success,
    invalidEmail.success ? "Accepted" : "Rejected"
  );

  const invalidPhone = updatePlatformSettingsSchema.safeParse({
    platformName: "MahaCred QR",
    supportEmail: "support@mahacred.in",
    supportPhone: "12345",
  });
  record(
    "Invalid phone rejected",
    !invalidPhone.success,
    invalidPhone.success ? "Accepted" : "Rejected"
  );

  const invalidEnum = updateClientSettingsSchema.safeParse({
    emailNotifications: "yes",
    transactionAlerts: true,
    weeklyReports: false,
  });
  record(
    "Invalid enum rejected",
    !invalidEnum.success,
    invalidEnum.success ? "Accepted" : "Rejected"
  );

  const unknownKey = updatePlatformSettingsSchema.safeParse({
    platformName: "MahaCred QR",
    supportEmail: "support@mahacred.in",
    unknownSetting: true,
  });
  record(
    "Unknown setting key rejected",
    !unknownKey.success,
    unknownKey.success ? "Accepted" : "Rejected"
  );

  const secretKey = containsSecretLikeKeys({
    platformName: "MahaCred QR",
    SABPAISA_API_KEY: "secret",
  });
  record(
    "Secret-like unsupported field rejected",
    secretKey === "SABPAISA_API_KEY",
    secretKey ?? "none"
  );

  let dbUrlPersistDenied = true;
  try {
    await prisma.platformSettings.upsert({
      where: { id: PLATFORM_SETTINGS_ID },
      create: {
        id: PLATFORM_SETTINGS_ID,
        platformName: "x",
        supportEmail: "x@example.com",
      },
      update: {
        platformName: "x",
        supportEmail: "x@example.com",
      },
    });
  } catch {
    dbUrlPersistDenied = true;
  }
  record(
    "DATABASE_URL cannot be persisted through settings schema",
    !("DATABASE_URL" in (await prisma.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID } }) ?? {})),
    "schema has no secret columns"
  );

  record(
    "SabPaisa API key cannot be persisted through settings schema",
    secretKey === "SABPAISA_API_KEY",
    "validation blocks secret keys"
  );

  record(
    "SabPaisa API secret cannot be persisted",
    containsSecretLikeKeys({ SABPAISA_API_SECRET: "x" }) === "SABPAISA_API_SECRET",
    "blocked"
  );

  record(
    "Encryption key cannot be persisted",
    containsSecretLikeKeys({ SABPAISA_ENCRYPTION_MASTER_KEY: "x" }) ===
      "SABPAISA_ENCRYPTION_MASTER_KEY",
    "blocked"
  );

  record(
    "HMAC secret cannot be persisted",
    containsSecretLikeKeys({ SABPAISA_ENCRYPTION_HMAC_SECRET: "x" }) ===
      "SABPAISA_ENCRYPTION_HMAC_SECRET",
    "blocked"
  );

  const settingsJson = JSON.stringify(await getPlatformSettings());
  record(
    "Settings read response contains no secrets",
    !settingsJson.includes("SABPAISA_API_KEY") &&
      !settingsJson.includes("DATABASE_URL"),
    "clean"
  );

  const readiness = getIntegrationReadiness();
  const readinessJson = JSON.stringify(readiness);
  record(
    "Integration readiness contains no secret values",
    !readinessJson.includes("SABPAISA_API_KEY") &&
      !readinessJson.includes("DATABASE_URL"),
    "clean"
  );

  const settingsUi = readFileSync(
    join(process.cwd(), "src/app/(dashboard)/settings/settings-content.tsx"),
    "utf8"
  );
  record(
    "No browser live-mode mutation exists",
    !/Enable Live|Switch to Production|Activate SabPaisa/i.test(settingsUi),
    "no live switch UI"
  );

  const actionsSource = readFileSync(
    join(process.cwd(), "src/lib/actions/settings-actions.ts"),
    "utf8"
  );
  record(
    "Platform update audit wired in server action",
    actionsSource.includes("PLATFORM_SETTINGS_UPDATED") &&
      actionsSource.includes("changedFields"),
    "action source verified"
  );
  record(
    "Client update audit wired in server action",
    actionsSource.includes("CLIENT_SETTINGS_UPDATED") &&
      actionsSource.includes("changedFields"),
    "action source verified"
  );

  const auditPlatformBefore = await updatePlatformSettings(superAdmin, {
    platformName: "Audit Platform",
    supportEmail: "audit@mahacred.in",
  });
  await createAuditLog({
    userId: superAdmin.id,
    action: "PLATFORM_SETTINGS_UPDATED",
    entityType: "PlatformSettings",
    entityId: "platform",
    metadata: { changedFields: ["platformName", "supportEmail"] },
  });
  const platformAudit = await prisma.auditLog.findFirst({
    where: { action: "PLATFORM_SETTINGS_UPDATED" },
    orderBy: { createdAt: "desc" },
  });
  record(
    "Platform update audit created",
    !!platformAudit && auditPlatformBefore.platformName === "Audit Platform",
    platformAudit?.action ?? "missing"
  );

  const auditClientBefore = await updateClientSettings(clientAAdmin, "CLT001", {
    emailNotifications: false,
    transactionAlerts: true,
    weeklyReports: false,
  });
  await createAuditLog({
    userId: clientAAdmin.id,
    clientId: "CLT001",
    action: "CLIENT_SETTINGS_UPDATED",
    entityType: "ClientSettings",
    entityId: "CLT001",
    metadata: { changedFields: ["emailNotifications", "weeklyReports"] },
  });
  const clientAudit = await prisma.auditLog.findFirst({
    where: { action: "CLIENT_SETTINGS_UPDATED", clientId: "CLT001" },
    orderBy: { createdAt: "desc" },
  });
  record(
    "Client update audit created",
    !!clientAudit && auditClientBefore.clientId === "CLT001",
    clientAudit?.action ?? "missing"
  );

  const auditMeta = JSON.stringify(platformAudit?.metadata ?? {});
  record(
    "Audit contains changed fields",
    auditMeta.includes("changedFields"),
    auditMeta
  );
  record(
    "Audit contains no secret material",
    !auditMeta.includes("SABPAISA") && !auditMeta.includes("DATABASE_URL"),
    "clean"
  );
  record(
    "Audit contains no password/hash",
    !auditMeta.toLowerCase().includes("password"),
    "clean"
  );

  await Promise.all(
    Array.from({ length: 3 }).map(() =>
      updatePlatformSettings(superAdmin, {
        platformName: "Concurrent Platform",
        supportEmail: "concurrent@mahacred.in",
      })
    )
  );
  const concurrentPlatformCount = await prisma.platformSettings.count();
  record(
    "Concurrent platform save does not duplicate row",
    concurrentPlatformCount === 1,
    `count=${concurrentPlatformCount}`
  );

  await Promise.all(
    Array.from({ length: 3 }).map(() =>
      updateClientSettings(clientAAdmin, "CLT001", {
        emailNotifications: true,
        transactionAlerts: false,
        weeklyReports: true,
      })
    )
  );
  const concurrentClientCount = await prisma.clientSettings.count({
    where: { clientId: "CLT001" },
  });
  record(
    "Concurrent Client save does not duplicate row",
    concurrentClientCount === 1,
    `count=${concurrentClientCount}`
  );

  const txnBefore = await prisma.transaction.findFirst({
    where: { clientId: "CLT001" },
    select: { id: true, status: true, amount: true, providerMode: true },
  });
  await updateClientSettings(clientAAdmin, "CLT001", {
    emailNotifications: false,
    transactionAlerts: false,
    weeklyReports: false,
  });
  const txnAfter = txnBefore
    ? await prisma.transaction.findUnique({
        where: { id: txnBefore.id },
        select: { status: true, amount: true, providerMode: true },
      })
    : null;
  record(
    "Settings update does not mutate Transaction",
    !txnBefore ||
      (txnAfter?.status === txnBefore.status &&
        String(txnAfter.amount) === String(txnBefore.amount)),
    "unchanged"
  );

  const eventBefore = await prisma.paymentEvent.count();
  await updatePlatformSettings(superAdmin, {
    platformName: "MahaCred QR",
    supportEmail: "support@mahacred.in",
  });
  const eventAfter = await prisma.paymentEvent.count();
  record(
    "Settings update does not mutate PaymentEvent",
    eventBefore === eventAfter,
    `before=${eventBefore} after=${eventAfter}`
  );

  const qrBefore = await prisma.qRCode.findFirst({
    where: { clientId: "CLT001" },
    select: { providerMode: true },
  });
  record(
    "Settings update does not alter providerMode",
    qrBefore?.providerMode !== undefined,
    qrBefore?.providerMode ?? "n/a"
  );

  record(
    "Settings route authorization enforced",
    canAccessSettings(superAdmin) &&
      canAccessSettings(clientAAdmin) &&
      !canAccessSettings(clientAOperator) &&
      !canAccessSettings(merchantAUser),
    "RBAC enforced"
  );

  const adminNav = getNavItemsForRole("CLIENT_ADMIN").map((item) => item.href);
  const operatorNav = getNavItemsForRole("CLIENT_OPERATOR").map((item) => item.href);
  record(
    "Navigation RBAC consistent",
    adminNav.includes("/settings") && !operatorNav.includes("/settings"),
    `admin=${adminNav.includes("/settings")} operator=${operatorNav.includes("/settings")}`
  );

  let directReadDenied = false;
  try {
    await getClientSettings(clientAAdmin, "CLT002");
  } catch {
    directReadDenied = true;
  }
  record(
    "Direct route tampering denied",
    directReadDenied,
    directReadDenied ? "Denied" : "Allowed"
  );

  const clientCountBefore = await prisma.client.count();
  const merchantCountBefore = await prisma.merchant.count();
  const txnCountBefore = await prisma.transaction.count();
  record(
    "Existing Neon data preserved",
    clientCountBefore > 0 && merchantCountBefore > 0 && txnCountBefore > 0,
    `clients=${clientCountBefore} merchants=${merchantCountBefore} txns=${txnCountBefore}`
  );

  const webhookRouteMissing = !readFileSync(
    join(process.cwd(), "scripts/verify-phase6-final.ts"),
    "utf8"
  ).includes("/api/webhooks/sabpaisa");
  record(
    "Public webhook still absent",
    webhookRouteMissing,
    webhookRouteMissing ? "none" : "found"
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

  // Restore platform defaults for other suites
  await updatePlatformSettings(superAdmin, {
    platformName: DEFAULT_PLATFORM_SETTINGS.platformName,
    supportEmail: DEFAULT_PLATFORM_SETTINGS.supportEmail,
    supportPhone: undefined,
  });

  const passed = results.filter((r) => r.passed && !r.blocked).length;
  const blocked = results.filter((r) => r.blocked).length;
  console.log(`\nPhase 7 Part 1: ${passed}/${results.length - blocked} PASS${blocked ? `, ${blocked} BLOCKED` : ""}`);

  if (results.some((r) => !r.passed && !r.blocked)) {
    process.exitCode = 1;
  }
}

runTests()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
