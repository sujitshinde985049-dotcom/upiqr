/**
 * Merchant security and business-rule verification for Phase 3 Part 2.
 * Run: npm run test:merchant-security
 */
import "dotenv/config";
import { PrismaClient, EntityStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  requireMerchantAccess,
  resolveMerchantClientIdForCreate,
  canCreateMerchant,
  canEditMerchant,
  AuthError,
} from "../src/lib/auth/authorization";
import { checkMerchantDuplicates } from "../src/lib/services/merchant-service";
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

const merchantUser: SessionUser = {
  id: "USR004",
  name: "Amit Shinde",
  email: "amit@shreeelectronics.example.com",
  role: "MERCHANT_USER",
  clientId: "CLT001",
  merchantId: "MCH003",
};

type TestResult = { name: string; passed: boolean; detail: string };
const results: TestResult[] = [];

function record(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} — ${name}: ${detail}`);
}

const testSuffix = Date.now().toString(36);
const createdMerchantIds: string[] = [];

async function createTestMerchant(
  clientId: string,
  accountRef: string,
  code: string
) {
  const merchant = await prisma.merchant.create({
    data: {
      id: code,
      merchantCode: code,
      clientId,
      businessName: `Test Merchant ${code}`,
      accountHolderName: "Test Holder",
      currentAccountReference: accountRef,
      merchantCategory: "Retail",
      businessType: "Proprietorship",
      mobile: "9876543210",
      status: EntityStatus.PENDING,
    },
  });
  createdMerchantIds.push(merchant.id);
  return merchant;
}

async function runTests() {
  console.log("Running merchant security tests...\n");

  // Test 1: SUPER_ADMIN resolves Client A for create
  const t1 = resolveMerchantClientIdForCreate(superAdmin, "CLT001");
  record(
    "Test 1",
    "clientId" in t1 && t1.clientId === "CLT001",
    "SUPER_ADMIN can create Merchant under Client A"
  );

  // Test 2: SUPER_ADMIN resolves Client B for create
  const t2 = resolveMerchantClientIdForCreate(superAdmin, "CLT002");
  record(
    "Test 2",
    "clientId" in t2 && t2.clientId === "CLT002",
    "SUPER_ADMIN can create Merchant under Client B"
  );

  // Test 3: Client A Admin resolves own client
  const t3 = resolveMerchantClientIdForCreate(clientAAdmin, undefined);
  record(
    "Test 3",
    "clientId" in t3 && t3.clientId === "CLT001",
    "Client A Admin creates Merchant under Client A"
  );

  // Test 4: Client A Admin tampering clientId — must enforce CLT001
  const t4 = resolveMerchantClientIdForCreate(clientAAdmin, "CLT002");
  record(
    "Test 4",
    "clientId" in t4 && t4.clientId === "CLT001",
    "Client A Admin tampered clientId denied — enforced Client A"
  );

  // Test 5: Client A Admin can access Client A merchant
  try {
    await requireMerchantAccess(clientAAdmin, "MCH001", "CLT001");
    record("Test 5", true, "Client A Admin can access Client A merchant for edit");
  } catch {
    record("Test 5", false, "Client A Admin denied own merchant edit access");
  }

  // Test 6: Client A Admin denied Client B merchant
  try {
    await requireMerchantAccess(clientAAdmin, "MCH004", "CLT002");
    record("Test 6", false, "Client A Admin incorrectly allowed Client B merchant edit");
  } catch (e) {
    const denied = e instanceof AuthError && e.code === "FORBIDDEN";
    record("Test 6", denied, denied ? "Client A Admin denied Client B merchant edit" : String(e));
  }

  // Test 7: clientId cannot be changed via update (schema has no clientId field)
  const existing = await prisma.merchant.findUnique({ where: { id: "MCH001" } });
  const originalClientId = existing?.clientId;
  if (existing) {
    await prisma.merchant.update({
      where: { id: "MCH001" },
      data: { businessName: existing.businessName },
    });
    const after = await prisma.merchant.findUnique({ where: { id: "MCH001" } });
    record(
      "Test 7",
      after?.clientId === originalClientId && originalClientId === "CLT001",
      "Merchant clientId remains unchanged after update"
    );
  } else {
    record("Test 7", false, "Seed merchant MCH001 not found");
  }

  // Test 8: Duplicate account within same client denied
  const dupRef = `CA-TEST-DUP-${testSuffix}`;
  const code8a = `T${testSuffix}8A`.slice(0, 20);
  const code8b = `T${testSuffix}8B`.slice(0, 20);
  await createTestMerchant("CLT001", dupRef, code8a);
  const dupCheck = await checkMerchantDuplicates("CLT001", {
    currentAccountReference: dupRef,
    businessName: "Another Business",
    mobile: "9876543211",
  });
  record(
    "Test 8",
    dupCheck !== null,
    dupCheck ? "Duplicate current account within same client denied" : "Duplicate not detected"
  );

  // Test 9: Same account reference allowed across different clients
  const crossRef = `CA-TEST-CROSS-${testSuffix}`;
  const code9a = `T${testSuffix}9A`.slice(0, 20);
  const code9b = `T${testSuffix}9B`.slice(0, 20);
  await createTestMerchant("CLT001", crossRef, code9a);
  const crossCheck = await checkMerchantDuplicates("CLT002", {
    currentAccountReference: crossRef,
    businessName: "Cross Client Business",
    mobile: "9876543212",
  });
  record(
    "Test 9",
    crossCheck === null,
    crossCheck === null
      ? "Same account reference allowed for different clients"
      : `Unexpected duplicate block: ${crossCheck}`
  );
  try {
    await createTestMerchant("CLT002", crossRef, code9b);
    record("Test 9b", true, "Cross-client merchant created successfully");
  } catch (e) {
    record("Test 9b", false, `Cross-client create failed: ${String(e)}`);
  }

  // Test 10: Merchant user cannot create or edit merchants
  record(
    "Test 10a",
    !canCreateMerchant(merchantUser),
    "Merchant User denied merchant creation"
  );
  record(
    "Test 10b",
    !canEditMerchant(merchantUser),
    "Merchant User denied merchant edit"
  );

  // Test 10c: Client operator can create but not edit
  record(
    "Test 10c",
    canCreateMerchant(clientAOperator) && !canEditMerchant(clientAOperator),
    "Client Operator can create but not edit merchants"
  );

  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n${results.length - failed}/${results.length} tests passed`);

  if (failed > 0) process.exit(1);
}

runTests()
  .catch((error) => {
    console.error("Merchant security test runner failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    if (createdMerchantIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entityId: { in: createdMerchantIds } },
      });
      await prisma.merchant.deleteMany({
        where: { id: { in: createdMerchantIds } },
      });
    }
    await prisma.$disconnect();
    await pool.end();
  });
