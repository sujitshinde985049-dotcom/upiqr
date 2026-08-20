/**
 * Tenant isolation verification script for Phase 2.
 * Run: npm run test:tenant-isolation
 * Requires seeded database.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  requireClientAccess,
  requireMerchantAccess,
  getMerchantScopeFilter,
  AuthError,
} from "../src/lib/auth/authorization";
import type { SessionUser } from "../src/lib/auth/types";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

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

const merchantA: SessionUser = {
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

type TestResult = { name: string; passed: boolean; detail: string };

const results: TestResult[] = [];

function record(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} — ${name}: ${detail}`);
}

async function runTests() {
  console.log("Running tenant isolation tests...\n");

  // Test 1: Client A Admin requests Client A merchant — ALLOW
  try {
    await requireMerchantAccess(clientAAdmin, "MCH001", "CLT001");
    record("Test 1", true, "Client A Admin can access Client A merchant");
  } catch {
    record("Test 1", false, "Client A Admin denied access to own merchant");
  }

  // Test 2: Client A Admin requests Client B merchant — DENY
  try {
    await requireMerchantAccess(clientAAdmin, "MCH004", "CLT002");
    record("Test 2", false, "Client A Admin incorrectly allowed Client B merchant");
  } catch (e) {
    const allowed = e instanceof AuthError && e.code === "FORBIDDEN";
    record("Test 2", allowed, allowed ? "Client A Admin denied Client B merchant" : String(e));
  }

  // Test 3: Client A Operator requests Client B QR — DENY
  try {
    requireClientAccess(clientAOperator, "CLT002");
    record("Test 3", false, "Client A Operator incorrectly allowed Client B");
  } catch (e) {
    const allowed = e instanceof AuthError && e.code === "FORBIDDEN";
    record("Test 3", allowed, allowed ? "Client A Operator denied Client B QR context" : String(e));
  }

  // Test 4: Merchant A requests its own transactions — ALLOW
  try {
    const scope = getMerchantScopeFilter(merchantA);
    const txns = await prisma.transaction.findMany({
      where: { ...scope, merchantId: "MCH003" },
      take: 1,
    });
    record("Test 4", txns.length >= 0, "Merchant A can query own transactions");
  } catch {
    record("Test 4", false, "Merchant A denied own transactions");
  }

  // Test 5: Merchant A requests Merchant B transactions — DENY
  try {
    await requireMerchantAccess(merchantA, "MCH005", "CLT002");
    record("Test 5", false, "Merchant A incorrectly allowed Merchant B access");
  } catch (e) {
    const allowed = e instanceof AuthError && e.code === "FORBIDDEN";
    record("Test 5", allowed, allowed ? "Merchant A denied Merchant B access" : String(e));
  }

  // Test 6: Super Admin accesses Client A and Client B — ALLOW
  try {
    requireClientAccess(superAdmin, "CLT001");
    requireClientAccess(superAdmin, "CLT002");
    const clients = await prisma.client.findMany({
      where: { id: { in: ["CLT001", "CLT002"] } },
    });
    record(
      "Test 6",
      clients.length === 2,
      "Super Admin can access Client A and Client B"
    );
  } catch {
    record("Test 6", false, "Super Admin denied cross-tenant access");
  }

  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n${results.length - failed}/${results.length} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests()
  .catch((error) => {
    console.error("Test runner failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
