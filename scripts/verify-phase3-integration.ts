/**
 * Phase 3 integration verification — data integrity, audit safety, navigation RBAC.
 * Run: npm run test:phase3-integration
 * Requires seeded Neon database.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  requireClientAccess,
  requireMerchantAccess,
  getMerchantScopeFilter,
  canAccessClientsList,
  canAccessUsersPage,
  canCreateUsers,
  AuthError,
} from "../src/lib/auth/authorization";
import { getNavItemsForRole } from "../src/lib/constants/navigation";
import { mapMerchant } from "../src/lib/mappers";
import { maskAccountReference } from "../src/lib/utils/mask-account-reference";
import type { SessionUser } from "../src/lib/auth/types";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type TestResult = { name: string; passed: boolean; detail: string };
const results: TestResult[] = [];

function record(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} — ${name}: ${detail}`);
}

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

const superAdmin: SessionUser = {
  id: "USR001",
  name: "Super Admin",
  email: "admin@mahacred.in",
  role: "SUPER_ADMIN",
  clientId: null,
  merchantId: null,
};

const REQUIRED_AUDIT_ACTIONS = [
  "CLIENT_CREATED",
  "CLIENT_UPDATED",
  "CLIENT_ACTIVATED",
  "CLIENT_DEACTIVATED",
  "MERCHANT_CREATED",
  "MERCHANT_UPDATED",
  "MERCHANT_ACTIVATED",
  "MERCHANT_DEACTIVATED",
  "CLIENT_USER_CREATED",
  "CLIENT_USER_STATUS_CHANGED",
  "MERCHANT_USER_CREATED",
  "MERCHANT_USER_STATUS_CHANGED",
];

async function verifyDataIntegrity() {
  const merchants = await prisma.merchant.findMany({
    select: { id: true, clientId: true },
  });
  const clients = new Set((await prisma.client.findMany({ select: { id: true } })).map((c) => c.id));
  const orphanMerchants = merchants.filter((m) => !clients.has(m.clientId));
  record(
    "Data integrity: Merchant.clientId",
    orphanMerchants.length === 0,
    orphanMerchants.length === 0
      ? "All merchants reference valid clients"
      : `Orphan merchants: ${orphanMerchants.map((m) => m.id).join(", ")}`
  );

  const users = await prisma.user.findMany({
    select: { id: true, role: true, clientId: true, merchantId: true },
  });

  const orphanClientUsers = users.filter(
    (u) => u.clientId && !clients.has(u.clientId)
  );
  record(
    "Data integrity: User.clientId",
    orphanClientUsers.length === 0,
    orphanClientUsers.length === 0
      ? "All client-scoped users reference valid clients"
      : `Invalid clientId on users: ${orphanClientUsers.map((u) => u.id).join(", ")}`
  );

  const merchantMap = new Map(merchants.map((m) => [m.id, m.clientId]));
  const badMerchantUsers = users.filter((u) => {
    if (u.role !== "MERCHANT_USER") return false;
    if (!u.merchantId || !u.clientId) return true;
    const merchantClientId = merchantMap.get(u.merchantId);
    return !merchantClientId || merchantClientId !== u.clientId;
  });
  record(
    "Data integrity: MerchantUser clientId + merchantId",
    badMerchantUsers.length === 0,
    badMerchantUsers.length === 0
      ? "All MERCHANT_USER records align with merchant.clientId"
      : `Misaligned merchant users: ${badMerchantUsers.map((u) => u.id).join(", ")}`
  );

  const qrs = await prisma.qRCode.findMany({
    select: { id: true, clientId: true, merchantId: true },
  });
  const badQrs = qrs.filter((qr) => merchantMap.get(qr.merchantId) !== qr.clientId);
  record(
    "Data integrity: QRCode.clientId + merchantId",
    badQrs.length === 0,
    badQrs.length === 0
      ? "All QR codes align with merchant tenant"
      : `Misaligned QR codes: ${badQrs.map((q) => q.id).join(", ")}`
  );

  const qrClientMap = new Map(qrs.map((q) => [q.id, q.clientId]));
  const qrMerchantMap = new Map(qrs.map((q) => [q.id, q.merchantId]));
  const txns = await prisma.transaction.findMany({
    select: { id: true, clientId: true, merchantId: true, qrId: true },
  });
  const badTxns = txns.filter(
    (t) =>
      merchantMap.get(t.merchantId) !== t.clientId ||
      qrClientMap.get(t.qrId) !== t.clientId ||
      qrMerchantMap.get(t.qrId) !== t.merchantId
  );
  record(
    "Data integrity: Transaction tenant fields",
    badTxns.length === 0,
    badTxns.length === 0
      ? "All transactions align with QR and merchant tenant"
      : `Misaligned transactions: ${badTxns.map((t) => t.id).join(", ")}`
  );
}

async function verifyTenantSecurityExtensions() {
  try {
    requireClientAccess(clientAAdmin, "CLT002");
    record("Cross-tenant: Client A Admin → Client B data", false, "Incorrectly allowed");
  } catch (e) {
    record(
      "Cross-tenant: Client A Admin → Client B data",
      e instanceof AuthError && e.code === "FORBIDDEN",
      "Denied"
    );
  }

  try {
    await requireMerchantAccess(clientAAdmin, "MCH004", "CLT002");
    record("Cross-tenant: Client A Admin → Client B merchant edit", false, "Incorrectly allowed");
  } catch (e) {
    record(
      "Cross-tenant: Client A Admin → Client B merchant edit",
      e instanceof AuthError && e.code === "FORBIDDEN",
      "Denied"
    );
  }

  try {
    requireClientAccess(clientAOperator, "CLT002");
    record("Cross-tenant: CLIENT_OPERATOR → Client B", false, "Incorrectly allowed");
  } catch (e) {
    record(
      "Cross-tenant: CLIENT_OPERATOR → Client B",
      e instanceof AuthError && e.code === "FORBIDDEN",
      "Denied"
    );
  }

  try {
    await requireMerchantAccess(merchantAUser, "MCH005", "CLT002");
    record("Cross-tenant: MERCHANT_USER A → Merchant B", false, "Incorrectly allowed");
  } catch (e) {
    record(
      "Cross-tenant: MERCHANT_USER A → Merchant B",
      e instanceof AuthError && e.code === "FORBIDDEN",
      "Denied"
    );
  }

  const scope = getMerchantScopeFilter(merchantAUser);
  const merchantBQrs = await prisma.qRCode.findMany({
    where: { ...scope, merchantId: "MCH005" },
  });
  record(
    "Cross-tenant: MERCHANT_USER A → Merchant B QR records",
    merchantBQrs.length === 0,
    merchantBQrs.length === 0 ? "No cross-merchant QR access" : "Leaked QR records"
  );

  const merchantBTxns = await prisma.transaction.findMany({
    where: { ...scope, merchantId: "MCH005" },
  });
  record(
    "Cross-tenant: MERCHANT_USER A → Merchant B transactions",
    merchantBTxns.length === 0,
    merchantBTxns.length === 0 ? "No cross-merchant transaction access" : "Leaked transactions"
  );

  record(
    "User admin: CLIENT_OPERATOR cannot create users",
    !canCreateUsers(clientAOperator),
    canCreateUsers(clientAOperator) ? "Incorrectly allowed" : "Denied"
  );

  record(
    "User admin: MERCHANT_USER cannot create users",
    !canCreateUsers(merchantAUser),
    canCreateUsers(merchantAUser) ? "Incorrectly allowed" : "Denied"
  );

  record(
    "Client management: only SUPER_ADMIN lists all clients",
    canAccessClientsList(superAdmin) && !canAccessClientsList(clientAAdmin),
    "SUPER_ADMIN allowed; CLIENT_ADMIN denied platform list"
  );

  record(
    "User admin: CLIENT_ADMIN cannot access users page scope for other tenant",
    canAccessUsersPage(clientAAdmin) && !canAccessUsersPage(clientAOperator),
    "CLIENT_ADMIN allowed; CLIENT_OPERATOR denied"
  );
}

function verifyNavigationRbac() {
  const superNav = getNavItemsForRole("SUPER_ADMIN").map((i) => i.href);
  const adminNav = getNavItemsForRole("CLIENT_ADMIN").map((i) => i.href);
  const operatorNav = getNavItemsForRole("CLIENT_OPERATOR").map((i) => i.href);
  const merchantNav = getNavItemsForRole("MERCHANT_USER").map((i) => i.href);

  record(
    "Navigation: SUPER_ADMIN sees Users & Roles",
    superNav.includes("/users"),
    superNav.includes("/users") ? "Visible" : "Hidden incorrectly"
  );

  record(
    "Navigation: CLIENT_OPERATOR hides Users & Roles",
    !operatorNav.includes("/users"),
    operatorNav.includes("/users") ? "Visible incorrectly" : "Hidden"
  );

  record(
    "Navigation: CLIENT_OPERATOR hides Settings",
    !operatorNav.includes("/settings"),
    operatorNav.includes("/settings") ? "Visible incorrectly" : "Hidden"
  );

  record(
    "Navigation: MERCHANT_USER hides admin sections",
    !merchantNav.includes("/users") &&
      !merchantNav.includes("/settings") &&
      !merchantNav.includes("/merchants") &&
      !merchantNav.includes("/clients"),
    `Nav items: ${merchantNav.join(", ")}`
  );

  record(
    "Navigation: MERCHANT_USER sees operational surfaces",
    merchantNav.includes("/reports") && merchantNav.includes("/monitoring"),
    merchantNav.includes("/reports") && merchantNav.includes("/monitoring")
      ? "Visible"
      : "Missing expected operational nav"
  );

  record(
    "Navigation: CLIENT_ADMIN sees Users & Settings",
    adminNav.includes("/users") && adminNav.includes("/settings"),
    adminNav.includes("/users") && adminNav.includes("/settings")
      ? "Visible"
      : "Missing expected admin nav"
  );
}

function verifyAccountMasking() {
  const sampleRef = "CA-SN-2024-0001";
  const masked = maskAccountReference(sampleRef);
  const mapped = mapMerchant({
    id: "MCH001",
    merchantCode: "MER000001",
    clientId: "CLT001",
    businessName: "Test",
    accountHolderName: "Test Holder",
    currentAccountReference: sampleRef,
    merchantCategory: null,
    businessType: null,
    gstNumber: null,
    pan: null,
    mobile: "9876543210",
    email: null,
    address: null,
    city: null,
    district: null,
    state: null,
    pinCode: null,
    status: "ACTIVE",
    createdAt: new Date(),
  });

  record(
    "Account masking: list/detail mapper hides full reference",
    mapped.currentAccountReference === undefined &&
      mapped.maskedCurrentAccountReference === masked &&
      !mapped.maskedCurrentAccountReference.includes(sampleRef.slice(0, -4)),
    `Masked as ${mapped.maskedCurrentAccountReference}`
  );

  const editMapped = mapMerchant(
    {
      id: "MCH001",
      merchantCode: "MER000001",
      clientId: "CLT001",
      businessName: "Test",
      accountHolderName: "Test Holder",
      currentAccountReference: sampleRef,
      merchantCategory: null,
      businessType: null,
      gstNumber: null,
      pan: null,
      mobile: "9876543210",
      email: null,
      address: null,
      city: null,
      district: null,
      state: null,
      pinCode: null,
      status: "ACTIVE",
      createdAt: new Date(),
    },
    { includeAccountReference: true }
  );
  record(
    "Account masking: edit form may include full reference",
    editMapped.currentAccountReference === sampleRef,
    editMapped.currentAccountReference === sampleRef ? "Edit-only exposure" : "Missing on edit"
  );
}

function verifyAuditActionDefinitions() {
  const actionFiles = [
    "src/lib/actions/client-actions.ts",
    "src/lib/actions/merchant-actions.ts",
    "src/lib/actions/user-actions.ts",
  ];
  const combined = actionFiles
    .map((file) => readFileSync(join(process.cwd(), file), "utf8"))
    .join("\n");

  const missing = REQUIRED_AUDIT_ACTIONS.filter(
    (action) => !combined.includes(`"${action}"`)
  );
  record(
    "Audit logging: required action constants in server actions",
    missing.length === 0,
    missing.length === 0 ? "All required actions defined" : `Missing: ${missing.join(", ")}`
  );

  const metadataPropertyPattern =
    /metadata:\s*\{[\s\S]*?\b(passwordHash|temporaryPassword|password)\s*:/i;
  const hasPasswordInMetadata = actionFiles.some((file) => {
    const content = readFileSync(join(process.cwd(), file), "utf8");
    return metadataPropertyPattern.test(content);
  });
  record(
    "Audit logging: no password fields in action audit payloads",
    !hasPasswordInMetadata,
    hasPasswordInMetadata ? "Password-like field found in metadata" : "No password metadata"
  );

  const merchantActions = readFileSync(
    join(process.cwd(), "src/lib/actions/merchant-actions.ts"),
    "utf8"
  );
  record(
    "Audit logging: merchant actions mask current account in metadata",
    merchantActions.includes("maskAccountReference") &&
      merchantActions.includes("safeAuditMetadata"),
    "safeAuditMetadata uses maskAccountReference"
  );
}

async function verifyExistingAuditLogsSafe() {
  const logs = await prisma.auditLog.findMany({
    take: 100,
    orderBy: { createdAt: "desc" },
    select: { metadata: true, action: true },
  });

  const sensitiveKeys = ["password", "passwordHash", "token", "secret", "DATABASE_URL"];
  const unsafe = logs.filter((log) => {
    const meta = JSON.stringify(log.metadata ?? {}).toLowerCase();
    return sensitiveKeys.some((key) => meta.includes(key.toLowerCase()));
  });

  record(
    "Audit logging: sampled DB metadata has no secrets",
    unsafe.length === 0,
    unsafe.length === 0
      ? `Checked ${logs.length} recent audit records`
      : `${unsafe.length} records contain sensitive keys`
  );
}

async function runTests() {
  console.log("Running Phase 3 integration tests...\n");

  await verifyDataIntegrity();
  await verifyTenantSecurityExtensions();
  verifyNavigationRbac();
  verifyAccountMasking();
  verifyAuditActionDefinitions();
  await verifyExistingAuditLogsSafe();

  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n${results.length - failed}/${results.length} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests()
  .catch((error) => {
    console.error("Integration test runner failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
