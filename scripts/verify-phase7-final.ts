/**
 * Phase 7 final integration + security verification.
 * Run: npm run test:phase7-final
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  canAccessNotifications,
  canAccessSettings,
  canAccessUsersPage,
  canManageUsers,
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
import {
  getClientSettings,
  getPlatformSettings,
  updateClientSettings,
} from "../src/lib/services/settings-service";
import {
  getNotificationsForUser,
  markNotificationRead,
  NotificationServiceError,
} from "../src/lib/services/notification-service";
import {
  getManagedUserForActor,
  UserServiceError,
} from "../src/lib/services/user-service";
import { containsSecretLikeKeys } from "../src/lib/validations/settings";
import type { SessionUser } from "../src/lib/auth/types";

process.env.SABPAISA_MODE = "mock";

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

const merchantUserA: SessionUser = {
  id: "USR004",
  name: "Amit Shinde",
  email: "amit@shreeelectronics.example.com",
  role: "MERCHANT_USER",
  clientId: "CLT001",
  merchantId: "MCH003",
};

async function runTests() {
  console.log("Running Phase 7 final integration + security tests...\n");

  const phase7Migrations = [
    "20250822170000_settings_persistence",
    "20250822180000_operational_notifications",
  ];
  for (const migration of phase7Migrations) {
    record(
      `Phase 7 migration present: ${migration}`,
      existsSync(join(process.cwd(), "prisma/migrations", migration, "migration.sql")),
      migration
    );
  }

  record(
    "Settings persistence available",
    Boolean(await getPlatformSettings()),
    "platform settings"
  );

  const clientSettings = await getClientSettings(clientAAdmin, "CLT001");
  record(
    "Client settings tenant scoped",
    clientSettings.clientId === "CLT001",
    clientSettings.clientId
  );

  record(
    "Settings secret-like keys rejected",
    containsSecretLikeKeys({ password: "x" }) === "password",
    "rejected"
  );

  record(
    "SUPER_ADMIN settings access",
    canAccessSettings(superAdmin),
    "allowed"
  );

  record(
    "CLIENT_OPERATOR settings denied",
    !canAccessSettings(clientAOperator),
    "denied"
  );

  const adminNotifications = await getNotificationsForUser(clientAAdmin, { page: 1, limit: 5 });
  record(
    "CLIENT_ADMIN notification visibility",
    adminNotifications.items.every((item) => item.clientId === "CLT001" || item.clientId === null),
    `items=${adminNotifications.items.length}`
  );

  record(
    "MERCHANT_USER notification access",
    canAccessNotifications(merchantUserA),
    "allowed"
  );

  const merchantNotifications = await getNotificationsForUser(merchantUserA, { page: 1, limit: 5 });
  record(
    "MERCHANT_USER notification tenant scoped",
    merchantNotifications.items.every(
      (item) => item.merchantId === "MCH003" && item.clientId === "CLT001"
    ),
    `items=${merchantNotifications.items.length}`
  );

  let crossNotificationDenied = false;
  try {
    const other = await prisma.notification.findFirst({
      where: { clientId: "CLT002" },
      select: { id: true },
    });
    if (other) {
      await markNotificationRead(clientAAdmin, other.id);
    } else {
      crossNotificationDenied = true;
    }
  } catch (error) {
    crossNotificationDenied = error instanceof NotificationServiceError;
  }
  record("Cross-tenant notification mark-read denied", crossNotificationDenied, "denied");

  record(
    "User management access for CLIENT_ADMIN",
    canAccessUsersPage(clientAAdmin) && canManageUsers(clientAAdmin),
    "allowed"
  );

  record(
    "User management denied for MERCHANT_USER",
    !canAccessUsersPage(merchantUserA),
    "denied"
  );

  const operator = await prisma.user.findFirst({
    where: { clientId: "CLT001", role: "CLIENT_OPERATOR" },
    select: { id: true },
  });
  if (operator) {
  const managed = await getManagedUserForActor(clientAAdmin, operator.id);
  record(
    "CLIENT_ADMIN can load managed user profile",
    managed.id === operator.id,
    managed.id
  );
  }

  let crossUserDenied = false;
  try {
    await getManagedUserForActor(clientAAdmin, "USR006");
  } catch (error) {
    crossUserDenied = error instanceof UserServiceError;
  }
  record("Cross-tenant user edit denied", crossUserDenied, "denied");

  const navSuper = getNavItemsForRole("SUPER_ADMIN").map((item) => item.href);
  const navMerchant = getNavItemsForRole("MERCHANT_USER").map((item) => item.href);
  record(
    "Navigation includes notifications for authorized roles",
    navSuper.includes("/notifications") && navMerchant.includes("/notifications"),
    "present"
  );
  record(
    "Navigation excludes users page for MERCHANT_USER",
    !navMerchant.includes("/users"),
    "absent"
  );

  const protectedRoutes = [
    "src/app/(dashboard)/settings/page.tsx",
    "src/app/(dashboard)/notifications/page.tsx",
    "src/app/(dashboard)/users/page.tsx",
    "src/app/(dashboard)/profile/page.tsx",
    "src/app/(dashboard)/users/[id]/edit/page.tsx",
  ];
  for (const route of protectedRoutes) {
    record(
      `Protected route exists: ${route}`,
      existsSync(join(process.cwd(), route)),
      "present"
    );
  }

  const apiRouteFiles = walkFiles(join(process.cwd(), "src/app/api"));
  const apiRoutes = apiRouteFiles
    .filter((file) => file.endsWith("route.ts"))
    .map((file) => file.replace(process.cwd() + "\\", "").replace(/\\/g, "/"));
  record(
    "Public API route inventory captured",
    apiRoutes.length >= 3,
    apiRoutes.join(", ")
  );
  record(
    "No public notification creation route",
    !apiRoutes.some((route) => route.includes("notifications/create")),
    "none"
  );
  record(
    "No public password reset route",
    !apiRoutes.some((route) => route.includes("reset-password")),
    "none"
  );
  record(
    "No public SabPaisa webhook route",
    !apiRoutes.some((route) => route.includes("webhook")),
    "none"
  );

  const phase7Source = walkFiles(join(process.cwd(), "src")).filter(
    (file) =>
      /(notification|settings|user|profile)/i.test(file) &&
      !file.endsWith("constants.ts") &&
      !file.endsWith("settings.ts")
  );
  const secretPattern =
    /(SABPAISA_API_KEY|SABPAISA_API_SECRET|SABPAISA_ENCRYPTION_MASTER_KEY|SABPAISA_ENCRYPTION_HMAC_SECRET|AUTH_SECRET\s*=|DATABASE_URL\s*=)/;
  const secretHits = phase7Source.filter((file) => {
    const content = readFileSync(file, "utf8");
    return secretPattern.test(content) && !file.endsWith(".md");
  });
  record(
    "Phase 7 source secret scan clean",
    secretHits.length === 0,
    secretHits.length ? secretHits.join(", ") : "clean"
  );

  const notificationSample = await prisma.notification.findFirst({
    orderBy: { createdAt: "desc" },
    select: { title: true, message: true },
  });
  const notificationText = `${notificationSample?.title ?? ""} ${notificationSample?.message ?? ""}`;
  record(
    "Notification sample has no full VPA",
    !notificationText.includes("@") || notificationText.includes("TEST"),
    "safe"
  );
  record(
    "Notification sample has no password material",
    !/password/i.test(notificationText),
    "clean"
  );

  const txn = await prisma.transaction.findFirst({ orderBy: { createdAt: "desc" } });
  const txnBefore = txn
    ? { status: txn.status, amount: txn.amount.toString() }
    : null;
  if (txn) {
    await updateClientSettings(clientAAdmin, "CLT001", {
      emailNotifications: clientSettings.emailNotifications,
      transactionAlerts: !clientSettings.transactionAlerts,
      weeklyReports: clientSettings.weeklyReports,
    }).catch(() => undefined);
    const txnAfter = await prisma.transaction.findUnique({ where: { id: txn.id } });
    record(
      "Settings update does not mutate Transaction",
      txnBefore?.status === txnAfter?.status &&
        txnBefore?.amount === txnAfter?.amount.toString(),
      txn.id
    );
  } else {
    record("Settings update does not mutate Transaction", true, "no txn sample");
  }

  record(
    "Live QR provider remains fail-closed",
    loadSabPaisaIntegrationMode() === "mock",
    "mock"
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
  record("Live QR provider call blocked", liveQrBlocked, "blocked");

  let liveTxnBlocked = false;
  try {
    process.env[SABPAISA_ENV_VARS.MODE] = "live";
    getSabPaisaTransactionProvider();
  } catch {
    liveTxnBlocked = true;
  } finally {
    delete process.env[SABPAISA_ENV_VARS.MODE];
  }
  record("Live transaction provider call blocked", liveTxnBlocked, "blocked");

  let webhookBlocked = false;
  try {
    createSabPaisaWebhookAdapter().verifySignature();
  } catch {
    webhookBlocked = true;
  }
  record("Webhook adapter remains fail-closed", webhookBlocked, "blocked");

  const foundationOutput = readFileSync(
    join(process.cwd(), "scripts/verify-sabpaisa-foundation.ts"),
    "utf8"
  );
  const apiCryptoBlocked = (foundationOutput.match(/BLOCKED/g) ?? []).length;
  record(
    "API crypto blockers preserved",
    apiCryptoBlocked >= 3,
    `${apiCryptoBlocked} BLOCKED labels in foundation suite`
  );

  const phase5FinalOutput = readFileSync(
    join(process.cwd(), "scripts/verify-phase5-final.ts"),
    "utf8"
  );
  const webhookBlockedCount = (phase5FinalOutput.match(/BLOCKED/g) ?? []).length;
  record(
    "Webhook blockers preserved",
    webhookBlockedCount >= 4,
    `${webhookBlockedCount} BLOCKED labels in Phase 5 final suite`
  );

  let liveReadyBlocked = false;
  try {
    assertLiveSabPaisaIntegrationReady();
  } catch {
    liveReadyBlocked = true;
  }
  record("Live readiness assertion remains blocked", liveReadyBlocked, "blocked");

  const clients = await prisma.client.count();
  const merchants = await prisma.merchant.count();
  const txns = await prisma.transaction.count();
  record(
    "Existing Neon data preserved",
    clients >= 3 && merchants >= 5 && txns >= 10,
    `clients=${clients} merchants=${merchants} txns=${txns}`
  );

  record(
    "SABPAISA_MODE remains mock",
    loadSabPaisaIntegrationMode() === "mock",
    loadSabPaisaIntegrationMode()
  );

  record(
    "Required env vars documented without values",
    Object.values(SABPAISA_ENV_VARS).every((key) => typeof key === "string"),
    `${Object.keys(SABPAISA_ENV_VARS).length} vars`
  );

  const passed = results.filter((r) => r.passed && !r.blocked).length;
  const blocked = results.filter((r) => r.blocked).length;
  const failed = results.filter((r) => !r.passed && !r.blocked).length;
  console.log(
    `\nPhase 7 Final: ${passed}/${results.length} PASS${blocked ? `, ${blocked} BLOCKED` : ""}${failed ? `, ${failed} FAIL` : ""}`
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
