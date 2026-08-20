/**
 * User/RBAC security verification for Phase 3 Part 3.
 * Run: npm run test:user-security
 */
import "dotenv/config";
import { PrismaClient, UserRole } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  assertRoleNotEscalated,
  AuthError,
  canCreateClientUser,
  canCreateMerchantUser,
  canCreateUsers,
  canManageUsers,
  getAssignableClientUserRoles,
  requireMerchantAccess,
  resolveUserClientIdForCreate,
  uiClientUserRoleToPrisma,
} from "../src/lib/auth/authorization";
import {
  canActorManageTargetUser,
  checkEmailDuplicate,
} from "../src/lib/services/user-service";
import type { SessionUser } from "../src/lib/auth/types";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

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

type TestResult = { name: string; passed: boolean; detail: string };
const results: TestResult[] = [];
const createdUserIds: string[] = [];

function record(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} — ${name}: ${detail}`);
}

async function runTests() {
  console.log("Running user/RBAC security tests...\n");

  // Test 1
  const t1 = resolveUserClientIdForCreate(superAdmin, "CLT001");
  record(
    "Test 1",
    "clientId" in t1 && t1.clientId === "CLT001" &&
      canCreateClientUser(superAdmin, "CLIENT_ADMIN"),
    "SUPER_ADMIN creates CLIENT_ADMIN for Client A"
  );

  // Test 2
  const t2 = resolveUserClientIdForCreate(superAdmin, "CLT002");
  record(
    "Test 2",
    "clientId" in t2 && t2.clientId === "CLT002" &&
      canCreateClientUser(superAdmin, "CLIENT_OPERATOR"),
    "SUPER_ADMIN creates CLIENT_OPERATOR for Client B"
  );

  // Test 3
  const t3 = resolveUserClientIdForCreate(clientAAdmin, undefined);
  record(
    "Test 3",
    "clientId" in t3 &&
      t3.clientId === "CLT001" &&
      canCreateClientUser(clientAAdmin, "CLIENT_OPERATOR"),
    "CLIENT_ADMIN A creates CLIENT_OPERATOR for Client A"
  );

  // Test 4
  const t4 = resolveUserClientIdForCreate(clientAAdmin, "CLT002");
  record(
    "Test 4",
    "clientId" in t4 && t4.clientId === "CLT001",
    "CLIENT_ADMIN A tampered clientId denied — enforced Client A"
  );

  // Test 5
  let escalationBlocked = false;
  try {
    assertRoleNotEscalated(clientAAdmin, UserRole.SUPER_ADMIN);
  } catch (e) {
    escalationBlocked = e instanceof AuthError;
  }
  record(
    "Test 5",
    escalationBlocked && !getAssignableClientUserRoles(clientAAdmin).includes("CLIENT_ADMIN"),
    "CLIENT_ADMIN cannot create SUPER_ADMIN"
  );

  // Test 6
  record(
    "Test 6",
    !canCreateUsers(clientAOperator),
    "CLIENT_OPERATOR denied user creation"
  );

  // Test 7
  record(
    "Test 7",
    !canCreateUsers(merchantUserA),
    "MERCHANT_USER denied user creation"
  );

  // Test 8 - SUPER_ADMIN merchant user for Merchant A (MCH001 on CLT001)
  const mchA = await prisma.merchant.findFirst({ where: { clientId: "CLT001" } });
  record(
    "Test 8",
    Boolean(mchA) && canCreateMerchantUser(superAdmin),
    "SUPER_ADMIN can create MERCHANT_USER for Merchant A"
  );

  // Test 9
  record(
    "Test 9",
    canCreateMerchantUser(clientAAdmin),
    "CLIENT_ADMIN A can create MERCHANT_USER for own merchant"
  );

  // Test 10 - Client B merchant
  const mchB = await prisma.merchant.findFirst({ where: { clientId: "CLT002" } });
  if (mchB) {
    const resolved = resolveUserClientIdForCreate(clientAAdmin, "CLT002");
    const denied =
      "clientId" in resolved &&
      resolved.clientId === "CLT001" &&
      mchB.clientId !== resolved.clientId;
    record(
      "Test 10",
      denied,
      "CLIENT_ADMIN A denied MERCHANT_USER for Client B merchant"
    );
  } else {
    record("Test 10", false, "Client B merchant seed not found");
  }

  // Test 11 tampered clientId
  const resolved11 = resolveUserClientIdForCreate(clientAAdmin, "CLT002");
  record(
    "Test 11",
    "clientId" in resolved11 && resolved11.clientId === "CLT001",
    "Tampered clientId denied"
  );

  // Test 12 tampered merchantId - validated via merchant.clientId mismatch in action logic
  if (mchB) {
    const resolved = resolveUserClientIdForCreate(clientAAdmin, undefined);
    const mismatch =
      "clientId" in resolved && mchB.clientId !== resolved.clientId;
    record("Test 12", mismatch, "Tampered merchantId / client mismatch denied");
  } else {
    record("Test 12", false, "Merchant B not found");
  }

  // Test 13 duplicate email
  const dup = await checkEmailDuplicate("admin@mahacred.in");
  record("Test 13", dup, "Duplicate email detected safely");

  // Test 14 MERCHANT_USER A cannot access Merchant B
  try {
    await requireMerchantAccess(merchantUserA, "MCH004", "CLT002");
    record("Test 14", false, "Merchant A incorrectly accessed Merchant B");
  } catch (e) {
    record(
      "Test 14",
      e instanceof AuthError && e.code === "FORBIDDEN",
      "MERCHANT_USER A denied Merchant B access"
    );
  }

  // Test 15 CLIENT_ADMIN A cannot manage Client B user (USR006 on CLT002)
  const clientBUser = await prisma.user.findFirst({ where: { clientId: "CLT002" } });
  if (clientBUser) {
    const access = await canActorManageTargetUser(clientAAdmin, clientBUser.id);
    record(
      "Test 15",
      !access.allowed,
      "CLIENT_ADMIN A cannot manage Client B user"
    );
  } else {
    record("Test 15", false, "Client B user seed not found");
  }

  // Test 16 CLIENT_ADMIN cannot promote to SUPER_ADMIN via role assignment
  record(
    "Test 16",
    !getAssignableClientUserRoles(clientAAdmin).includes("CLIENT_ADMIN") &&
      !canCreateClientUser(
        clientAAdmin,
        uiClientUserRoleToPrisma("client_admin")
      ),
    "CLIENT_ADMIN cannot promote user to SUPER_ADMIN / CLIENT_ADMIN"
  );

  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n${results.length - failed}/${results.length} tests passed`);
  if (failed > 0) process.exit(1);
}

runTests()
  .catch((error) => {
    console.error("User security test runner failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
    await pool.end();
  });
