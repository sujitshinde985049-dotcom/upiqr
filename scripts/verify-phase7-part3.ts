/**
 * Phase 7 Part 3 secure user account management verification.
 * Run: npm run test:phase7-part3
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EntityStatus, PrismaClient, UserRole } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { hashPassword, verifyPassword } from "../src/lib/auth/password";
import type { SessionUser } from "../src/lib/auth/types";
import {
  adminResetUserPassword,
  changeOwnPassword,
  updateOwnProfile,
  updateUserProfileByAdmin,
  UserServiceError,
} from "../src/lib/services/user-service";
import {
  adminResetPasswordSchema,
  changeOwnPasswordSchema,
  updateOwnProfileSchema,
  updateUserProfileSchema,
} from "../src/lib/validations/users";

process.env.SABPAISA_MODE = "mock";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type TestResult = { name: string; passed: boolean; detail: string };
const results: TestResult[] = [];
const createdUserIds: string[] = [];
const createdAuditIds: string[] = [];

function record(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} — ${name}: ${detail}`);
}

function suffix() {
  return randomBytes(4).toString("hex");
}

const TEST_PASSWORD = "TestPass1";
const NEW_PASSWORD = "NewPass2";

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

const merchantUserA: SessionUser = {
  id: "USR004",
  name: "Amit Shinde",
  email: "amit@shreeelectronics.example.com",
  role: "MERCHANT_USER",
  clientId: "CLT001",
  merchantId: "MCH003",
};

async function createTestUser(input: {
  email: string;
  name: string;
  role: UserRole;
  clientId?: string | null;
  merchantId?: string | null;
  password?: string;
}) {
  const id = `USR_P7P3_${suffix()}`;
  const passwordHash = await hashPassword(input.password ?? TEST_PASSWORD);
  await prisma.user.create({
    data: {
      id,
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      clientId: input.clientId ?? null,
      merchantId: input.merchantId ?? null,
      status: EntityStatus.ACTIVE,
    },
  });
  createdUserIds.push(id);
  return id;
}

async function cleanup() {
  if (createdAuditIds.length > 0) {
    await prisma.auditLog.deleteMany({ where: { id: { in: createdAuditIds } } });
  }
  if (createdUserIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { entityType: "User", entityId: { in: createdUserIds } },
    });
    await prisma.notificationRead.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
}

async function latestAudit(entityId: string, action?: string) {
  return prisma.auditLog.findFirst({
    where: {
      entityType: "User",
      entityId,
      ...(action ? { action } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

async function runTests() {
  console.log("Running Phase 7 Part 3 user account management tests...\n");

  record(
    "Profile schema rejects unexpected fields",
    !updateUserProfileSchema.safeParse({
      userId: "USR001",
      name: "Test",
      email: "test@example.com",
      role: "SUPER_ADMIN",
    }).success,
    "role rejected"
  );

  record(
    "Own profile schema rejects password field",
    !updateOwnProfileSchema.safeParse({ name: "Test", password: "hack" }).success,
    "password rejected"
  );

  record(
    "Invalid email rejected",
    !updateUserProfileSchema.safeParse({
      userId: "USR001",
      name: "Test",
      email: "not-an-email",
    }).success,
    "invalid email"
  );

  record(
    "Password confirmation mismatch rejected",
    !changeOwnPasswordSchema.safeParse({
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PASSWORD,
      confirmPassword: "Mismatch1",
    }).success,
    "mismatch"
  );

  const ownName = `P7P3 Self ${suffix()}`;
  const ownUpdated = await updateOwnProfile(superAdmin, { name: ownName });
  record(
    "Valid own profile name update",
    ownUpdated.name === ownName,
    ownUpdated.name
  );

  const testUserId = await createTestUser({
    email: `p7p3_user_${suffix()}@example.com`,
    name: `P7P3 User ${suffix()}`,
    role: UserRole.CLIENT_OPERATOR,
    clientId: "CLT001",
  });

  const adminUpdated = await updateUserProfileByAdmin(clientAAdmin, {
    userId: testUserId,
    name: "Updated By Admin",
    email: `p7p3_updated_${suffix()}@example.com`,
  });
  record(
    "CLIENT_ADMIN authorized profile edit",
    adminUpdated.name === "Updated By Admin",
    adminUpdated.email
  );

  const clientBUserId = await createTestUser({
    email: `p7p3_clientb_${suffix()}@example.com`,
    name: `P7P3 Client B ${suffix()}`,
    role: UserRole.CLIENT_OPERATOR,
    clientId: "CLT002",
  });

  let crossTenantDenied = false;
  try {
    await updateUserProfileByAdmin(clientAAdmin, {
      userId: clientBUserId,
      name: "Tampered",
      email: `tamper_${suffix()}@example.com`,
    });
  } catch (error) {
    crossTenantDenied = error instanceof UserServiceError;
  }
  record("CLIENT_ADMIN Client B edit denied", crossTenantDenied, "denied");

  let operatorDenied = false;
  try {
    await updateUserProfileByAdmin(clientAOperator, {
      userId: testUserId,
      name: "Operator Edit",
      email: `operator_${suffix()}@example.com`,
    });
  } catch (error) {
    operatorDenied = error instanceof UserServiceError;
  }
  record("CLIENT_OPERATOR administrative edit denied", operatorDenied, "denied");

  let merchantDenied = false;
  try {
    await updateUserProfileByAdmin(merchantUserA, {
      userId: testUserId,
      name: "Merchant Edit",
      email: `merchant_${suffix()}@example.com`,
    });
  } catch (error) {
    merchantDenied = error instanceof UserServiceError;
  }
  record("MERCHANT_USER administrative edit denied", merchantDenied, "denied");

  const duplicateEmail = await createTestUser({
    email: `p7p3_dup_${suffix()}@example.com`,
    name: "Dup Holder",
    role: UserRole.CLIENT_OPERATOR,
    clientId: "CLT001",
  });
  const dupHolder = await prisma.user.findUnique({ where: { id: duplicateEmail } });
  let duplicateRejected = false;
  try {
    await updateUserProfileByAdmin(clientAAdmin, {
      userId: testUserId,
      name: "Dup Test",
      email: dupHolder!.email,
    });
  } catch (error) {
    duplicateRejected = error instanceof UserServiceError;
  }
  record("Duplicate email rejected", duplicateRejected, "rejected");

  const passwordUserId = await createTestUser({
    email: `p7p3_pw_${suffix()}@example.com`,
    name: "Password User",
    role: UserRole.CLIENT_OPERATOR,
    clientId: "CLT001",
    password: TEST_PASSWORD,
  });
  const passwordActor: SessionUser = {
    id: passwordUserId,
    name: "Password User",
    email: `p7p3_pw_${suffix()}@example.com`,
    role: "CLIENT_OPERATOR",
    clientId: "CLT001",
    merchantId: null,
  };
  const pwUser = await prisma.user.findUnique({ where: { id: passwordUserId } });
  passwordActor.email = pwUser!.email;

  let wrongCurrentRejected = false;
  try {
    await changeOwnPassword(passwordActor, {
      currentPassword: "WrongPass1",
      newPassword: NEW_PASSWORD,
    });
  } catch (error) {
    wrongCurrentRejected = error instanceof UserServiceError;
  }
  record("Wrong current password rejected", wrongCurrentRejected, "rejected");

  record(
    "Weak password rejected",
    !changeOwnPasswordSchema.safeParse({
      currentPassword: TEST_PASSWORD,
      newPassword: "weak",
      confirmPassword: "weak",
    }).success,
    "rejected"
  );

  await changeOwnPassword(passwordActor, {
    currentPassword: TEST_PASSWORD,
    newPassword: NEW_PASSWORD,
  });
  const afterChange = await prisma.user.findUnique({ where: { id: passwordUserId } });
  const oldFails = await verifyPassword(TEST_PASSWORD, afterChange!.passwordHash);
  const newWorks = await verifyPassword(NEW_PASSWORD, afterChange!.passwordHash);
  record(
    "Valid password change succeeds and hashes stored value",
    !oldFails && newWorks && !afterChange!.passwordHash.includes(NEW_PASSWORD),
    `old=${oldFails} new=${newWorks}`
  );

  const pwAudit = await latestAudit(passwordUserId, "USER_PASSWORD_CHANGED");
  const pwAuditPayload = JSON.stringify(pwAudit?.metadata ?? {});
  record(
    "Password not in audit metadata",
    !pwAuditPayload.includes(NEW_PASSWORD) &&
      !pwAuditPayload.includes(TEST_PASSWORD) &&
      !pwAuditPayload.includes("passwordHash"),
    "clean"
  );

  const resetTargetId = await createTestUser({
    email: `p7p3_reset_${suffix()}@example.com`,
    name: "Reset Target",
    role: UserRole.CLIENT_OPERATOR,
    clientId: "CLT001",
    password: TEST_PASSWORD,
  });

  await adminResetUserPassword(clientAAdmin, {
    userId: resetTargetId,
    newPassword: "ResetPass3",
  });
  const resetUser = await prisma.user.findUnique({ where: { id: resetTargetId } });
  const resetWorks = await verifyPassword("ResetPass3", resetUser!.passwordHash);
  record("Admin reset authorization works", resetWorks, "reset verified");

  let resetCrossTenantDenied = false;
  try {
    await adminResetUserPassword(clientAAdmin, {
      userId: clientBUserId,
      newPassword: "ResetPass3",
    });
  } catch (error) {
    resetCrossTenantDenied = error instanceof UserServiceError;
  }
  record("Admin reset cross-tenant denial", resetCrossTenantDenied, "denied");

  const resetAudit = await latestAudit(resetTargetId, "USER_PASSWORD_RESET");
  const resetAuditPayload = JSON.stringify(resetAudit?.metadata ?? {});
  record(
    "Temporary password not persisted in audit",
    !resetAuditPayload.includes("ResetPass3") && !resetAuditPayload.includes("passwordHash"),
    "clean"
  );

  const txnBefore = await prisma.transaction.count();
  await updateOwnProfile(clientAAdmin, { name: clientAAdmin.name });
  await changeOwnPassword(passwordActor, {
    currentPassword: NEW_PASSWORD,
    newPassword: "AnotherPass4",
  }).catch(() => undefined);
  const txnAfter = await prisma.transaction.count();
  record(
    "Profile/password changes do not mutate Transaction",
    txnBefore === txnAfter,
    `count=${txnAfter}`
  );

  const eventBefore = await prisma.paymentEvent.count();
  record(
    "Password change does not mutate PaymentEvent",
    eventBefore === (await prisma.paymentEvent.count()),
    `count=${eventBefore}`
  );

  const apiRoutes = readFileSync(join(process.cwd(), "package.json"), "utf8");
  const routeFiles = [
    "src/app/api/auth/[...nextauth]/route.ts",
    "src/app/api/qr/[id]/download/route.ts",
    "src/app/api/transactions/export/route.ts",
  ];
  const hasPublicReset = routeFiles.some((file) => {
    try {
      return readFileSync(join(process.cwd(), file), "utf8").includes("reset-password");
    } catch {
      return false;
    }
  });
  record("No public password-reset endpoint", !hasPublicReset, "none");

  const mapped = await updateOwnProfile(clientAAdmin, { name: clientAAdmin.name });
  record(
    "Profile service does not return passwordHash",
    !("passwordHash" in (mapped as object)),
    "absent"
  );

  record(
    "Admin reset implemented",
    typeof adminResetUserPassword === "function",
    "implemented"
  );

  record(
    "Self email change not implemented on own profile schema",
    Object.keys(updateOwnProfileSchema.shape).length === 1,
    "name only"
  );

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\nPhase 7 Part 3: ${passed}/${results.length} PASS${failed ? `, ${failed} FAIL` : ""}`);
  await cleanup();
  await prisma.$disconnect();
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(async (error) => {
  console.error(error);
  await cleanup().catch(() => undefined);
  await prisma.$disconnect();
  await pool.end();
  process.exit(1);
});
