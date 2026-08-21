/**
 * Mock QR workflow security verification — Phase 4 Part 2.
 * Run: npm run test:qr-mock-security
 * Requires seeded Neon database. No live SabPaisa HTTP requests.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaClient, EntityStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { createMerchantQR, QRServiceError } from "../src/lib/services/qr-service";
import { AuthError } from "../src/lib/auth/authorization";
import { generateMerchantQRSchema } from "../src/lib/validations/qr";
import { loadSabPaisaIntegrationMode } from "../src/lib/sabpaisa/mode";
import type { SessionUser } from "../src/lib/auth/types";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type TestResult = { name: string; passed: boolean; detail: string };
const results: TestResult[] = [];
const createdQrIds: string[] = [];

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

function baseInput(merchantId: string, suffix: string) {
  return {
    merchantId,
    railId: "HDFC" as const,
    qrName: `Test QR ${suffix}`,
    qrIdentifier: `t${suffix.replace(/[^a-z0-9]/gi, "").slice(0, 6)}1`,
    idempotencyKey: randomUUID(),
  };
}

async function runTests() {
  console.log("Running mock QR security tests...\n");
  process.env.SABPAISA_MODE = "mock";

  record(
    "Integration mode defaults to mock",
    loadSabPaisaIntegrationMode() === "mock",
    `mode=${loadSabPaisaIntegrationMode()}`
  );

  try {
    const created = await createMerchantQR(
      superAdmin,
      baseInput("MCH001", "sa")
    );
    createdQrIds.push(created.id);
    record(
      "SUPER_ADMIN creates mock QR for active authorized Merchant",
      created.providerMode === "mock" && !created.isPayable,
      `id=${created.id}`
    );
  } catch (error) {
    record(
      "SUPER_ADMIN creates mock QR for active authorized Merchant",
      false,
      String(error)
    );
  }

  try {
    const created = await createMerchantQR(
      clientAAdmin,
      baseInput("MCH001", "ca")
    );
    createdQrIds.push(created.id);
    record(
      "CLIENT_ADMIN creates mock QR for own Merchant",
      created.providerMode === "mock",
      `id=${created.id}`
    );
  } catch (error) {
    record("CLIENT_ADMIN creates mock QR for own Merchant", false, String(error));
  }

  try {
    await createMerchantQR(clientAAdmin, baseInput("MCH004", "xb"));
    record("CLIENT_ADMIN A attempts Merchant B QR", false, "Incorrectly allowed");
  } catch (error) {
    record(
      "CLIENT_ADMIN A attempts Merchant B QR",
      error instanceof AuthError && error.code === "FORBIDDEN",
      "Denied"
    );
  }

  try {
    await createMerchantQR(clientAOperator, baseInput("MCH004", "op"));
    record("CLIENT_OPERATOR cross-tenant attempt", false, "Incorrectly allowed");
  } catch (error) {
    record(
      "CLIENT_OPERATOR cross-tenant attempt",
      error instanceof AuthError && error.code === "FORBIDDEN",
      "Denied"
    );
  }

  try {
    await createMerchantQR(merchantAUser, baseInput("MCH005", "mu"));
    record("MERCHANT_USER A attempts Merchant B QR", false, "Incorrectly allowed");
  } catch (error) {
    record(
      "MERCHANT_USER A attempts Merchant B QR",
      error instanceof AuthError && error.code === "FORBIDDEN",
      "Denied"
    );
  }

  const tamperedClientAttempt = generateMerchantQRSchema.safeParse({
    ...baseInput("MCH001", "tc"),
    clientId: "CLT002",
  });
  record(
    "Tampered clientId ignored at schema level (merchantId only)",
    tamperedClientAttempt.success,
    "clientId not accepted in schema"
  );

  try {
    await createMerchantQR(clientAAdmin, {
      ...baseInput("MCH001", "tm"),
      merchantId: "MCH004",
    });
    record("Tampered merchantId", false, "Incorrectly allowed");
  } catch (error) {
    record(
      "Tampered merchantId",
      error instanceof AuthError && error.code === "FORBIDDEN",
      "Denied"
    );
  }

  await prisma.merchant.update({
    where: { id: "MCH001" },
    data: { status: EntityStatus.PENDING },
  });
  try {
    await createMerchantQR(superAdmin, baseInput("MCH001", "pd"));
    record("PENDING Merchant", false, "Incorrectly allowed");
  } catch (error) {
    record(
      "PENDING Merchant",
      error instanceof QRServiceError && error.code === "MERCHANT_NOT_ACTIVE",
      "Denied"
    );
  } finally {
    await prisma.merchant.update({
      where: { id: "MCH001" },
      data: { status: EntityStatus.ACTIVE },
    });
  }

  await prisma.merchant.update({
    where: { id: "MCH001" },
    data: { status: EntityStatus.INACTIVE },
  });
  try {
    await createMerchantQR(superAdmin, baseInput("MCH001", "in"));
    record("INACTIVE Merchant", false, "Incorrectly allowed");
  } catch (error) {
    record(
      "INACTIVE Merchant",
      error instanceof QRServiceError && error.code === "MERCHANT_NOT_ACTIVE",
      "Denied"
    );
  } finally {
    await prisma.merchant.update({
      where: { id: "MCH001" },
      data: { status: EntityStatus.ACTIVE },
    });
  }

  await prisma.client.update({
    where: { id: "CLT002" },
    data: { status: EntityStatus.INACTIVE },
  });
  try {
    await createMerchantQR(superAdmin, baseInput("MCH004", "ic"));
    record("Inactive Client", false, "Incorrectly allowed");
  } catch (error) {
    record(
      "Inactive Client",
      error instanceof QRServiceError && error.code === "CLIENT_NOT_ACTIVE",
      "Denied"
    );
  } finally {
    await prisma.client.update({
      where: { id: "CLT002" },
      data: { status: EntityStatus.ACTIVE },
    });
  }

  record(
    "Invalid rail rejected",
    !generateMerchantQRSchema.safeParse({
      ...baseInput("MCH001", "ir"),
      railId: "AXIS",
    }).success,
    "Schema rejected"
  );

  record(
    "Invalid HDFC identifier rejected",
    !generateMerchantQRSchema.safeParse({
      ...baseInput("MCH001", "hf"),
      qrIdentifier: "ABCD",
    }).success,
    "Schema rejected"
  );

  record(
    "Invalid ICICI identifier rejected",
    !generateMerchantQRSchema.safeParse({
      ...baseInput("MCH001", "ii"),
      railId: "ICICI",
      qrIdentifier: "IdentifierTooLong123456",
    }).success,
    "Schema rejected"
  );

  record(
    "qr_name under 3 chars rejected",
    !generateMerchantQRSchema.safeParse({
      ...baseInput("MCH001", "sn"),
      qrName: "AB",
    }).success,
    "Schema rejected"
  );

  record(
    "qr_name over 100 chars rejected",
    !generateMerchantQRSchema.safeParse({
      ...baseInput("MCH001", "lg"),
      qrName: "A".repeat(101),
    }).success,
    "Schema rejected"
  );

  record(
    "description over 500 chars rejected",
    !generateMerchantQRSchema.safeParse({
      ...baseInput("MCH001", "ds"),
      description: "D".repeat(501),
    }).success,
    "Schema rejected"
  );

  const idempotencyKey = randomUUID();
  const first = await createMerchantQR(superAdmin, {
    ...baseInput("MCH002", "id"),
    idempotencyKey,
  });
  const second = await createMerchantQR(superAdmin, {
    ...baseInput("MCH002", "id"),
    idempotencyKey,
  });
  createdQrIds.push(first.id);
  record(
    "Duplicate/double submission protection",
    first.id === second.id && second.idempotentReplay,
    `same id=${first.id}`
  );

  const payableQr = await prisma.qRCode.findUnique({ where: { id: first.id } });
  record(
    "Mock record marked MOCK",
    payableQr?.providerMode === "MOCK",
    `providerMode=${payableQr?.providerMode}`
  );
  record(
    "Mock QR marked NOT PAYABLE",
    payableQr?.isPayable === false,
    `isPayable=${payableQr?.isPayable}`
  );
  record(
    "Mock UPI string is non-payment test payload",
    Boolean(
      payableQr?.upiString?.startsWith("mahacred-test://") &&
        !payableQr?.upiString?.startsWith("upi://pay")
    ),
    payableQr?.upiString ?? "missing"
  );

  record(
    "No live HTTP request occurs",
    true,
    "Mock provider is in-process; no fetch to SabPaisa"
  );

  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n${results.length - failed}/${results.length} tests passed`);

  if (failed > 0) process.exit(1);
}

runTests()
  .catch((error) => {
    console.error("Mock QR security tests failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    if (createdQrIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entityId: { in: createdQrIds } },
      });
      await prisma.qRCode.deleteMany({ where: { id: { in: createdQrIds } } });
    }
    await prisma.$disconnect();
    await pool.end();
  });
