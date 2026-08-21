/**
 * Phase 4 end-to-end mock workflow verification.
 * Run: npm run test:phase4-e2e-mock
 * Requires Neon database. No live SabPaisa HTTP requests.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  PrismaClient,
  ClientType,
  EntityStatus,
  QRProviderMode,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import type { SessionUser } from "../src/lib/auth/types";
import { generateNextClientCode } from "../src/lib/utils/client-code";
import { generateNextMerchantCode } from "../src/lib/utils/merchant-code";
import {
  createMerchantQR,
  deactivateMerchantQR,
  downloadMerchantQR,
  getMerchantQRById,
  listMerchantQRs,
  reactivateMerchantQR,
  updateMerchantQR,
} from "../src/lib/services/qr-service";
import { buildTestQrPayload, isPayableUpiPayload } from "../src/lib/sabpaisa/qr-download";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type TestResult = { name: string; passed: boolean; detail: string };
const results: TestResult[] = [];

const testClientIds: string[] = [];
const testMerchantIds: string[] = [];
const testQrIds: string[] = [];

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

async function cleanup() {
  if (testQrIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: testQrIds }, entityType: "QRCode" },
    });
    await prisma.qRCode.deleteMany({ where: { id: { in: testQrIds } } });
  }
  if (testMerchantIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: testMerchantIds }, entityType: "Merchant" },
    });
    await prisma.merchant.deleteMany({ where: { id: { in: testMerchantIds } } });
  }
  if (testClientIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: testClientIds }, entityType: "Client" },
    });
    await prisma.client.deleteMany({ where: { id: { in: testClientIds } } });
  }
}

async function runTests() {
  console.log("Running Phase 4 end-to-end mock workflow tests...\n");
  process.env.SABPAISA_MODE = "mock";

  const suffix = Date.now().toString(36);
  let clientId = "";
  let merchantId = "";
  let qrId = "";
  let providerRef = "";

  try {
    clientId = await generateNextClientCode();
    await prisma.client.create({
      data: {
        id: clientId,
        clientCode: clientId,
        name: `E2E Test Client ${suffix}`,
        type: ClientType.PATSANSTHA,
        registrationNumber: `E2E-REG-${suffix}`,
        contactPerson: "E2E Contact",
        mobile: "9876543210",
        email: `e2e.client.${suffix}@example.com`,
        status: EntityStatus.PENDING,
      },
    });
    testClientIds.push(clientId);
    record("Create Bank/Patsanstha", true, `clientId=${clientId}`);

    await prisma.client.update({
      where: { id: clientId },
      data: { status: EntityStatus.ACTIVE },
    });
    record("Activate Client", true, "status=ACTIVE");

    merchantId = await generateNextMerchantCode();
    await prisma.merchant.create({
      data: {
        id: merchantId,
        merchantCode: merchantId,
        clientId,
        businessName: `E2E Merchant ${suffix}`,
        accountHolderName: "E2E Holder",
        currentAccountReference: `E2E-CA-${suffix}`,
        merchantCategory: "Retail",
        businessType: "Proprietorship",
        mobile: "9876543211",
        email: `e2e.merchant.${suffix}@example.com`,
        address: "Test Address",
        city: "Pune",
        district: "Pune",
        state: "Maharashtra",
        pinCode: "411001",
        status: EntityStatus.PENDING,
      },
    });
    testMerchantIds.push(merchantId);
    record("Create Merchant", true, `merchantId=${merchantId}`);

    await prisma.merchant.update({
      where: { id: merchantId },
      data: { status: EntityStatus.ACTIVE },
    });
    record("Activate Merchant", true, "status=ACTIVE");

    const created = await createMerchantQR(superAdmin, {
      merchantId,
      railId: "HDFC",
      qrName: `E2E QR ${suffix}`,
      qrIdentifier: `e2e${suffix.slice(0, 4)}1`,
      idempotencyKey: randomUUID(),
    });
    qrId = created.id;
    providerRef = created.sabpaisaQrId ?? "";
    testQrIds.push(qrId);
    record(
      "Generate TEST QR",
      created.providerMode === "mock" && !created.isPayable,
      `id=${qrId}`
    );

    const saved = await prisma.qRCode.findUnique({ where: { id: qrId } });
    record(
      "Save QR in Neon",
      saved?.providerMode === QRProviderMode.MOCK && saved.isPayable === false,
      `providerMode=${saved?.providerMode}`
    );

    const list = await listMerchantQRs(superAdmin, {
      page: 1,
      limit: 50,
      search: qrId,
    });
    record(
      "List QR",
      list.items.some((item) => item.id === qrId),
      `found=${list.items.some((item) => item.id === qrId)}`
    );

    const detail = await getMerchantQRById(superAdmin, qrId);
    record("View QR", detail.id === qrId, detail.qrName);

    await updateMerchantQR(superAdmin, {
      qrId,
      referenceName: `E2E Updated ${suffix}`,
      description: "E2E update",
    });
    const updated = await prisma.qRCode.findUnique({ where: { id: qrId } });
    record(
      "Update QR",
      updated?.qrName === `E2E Updated ${suffix}`,
      updated?.qrName ?? "missing"
    );

    const download = await downloadMerchantQR(superAdmin, qrId, {
      format: "png",
      size: 512,
    });
    const payload = buildTestQrPayload(qrId);
    record(
      "Download TEST QR",
      download.contentType === "image/png" &&
        download.filename.startsWith("test_qr_") &&
        !isPayableUpiPayload(payload),
      download.filename
    );

    await deactivateMerchantQR(superAdmin, qrId);
    const deactivated = await prisma.qRCode.findUnique({ where: { id: qrId } });
    record(
      "Deactivate QR",
      deactivated?.status === EntityStatus.INACTIVE,
      `status=${deactivated?.status}`
    );

    await reactivateMerchantQR(superAdmin, qrId);
    const reactivated = await prisma.qRCode.findUnique({ where: { id: qrId } });
    record(
      "Reactivate QR",
      reactivated?.status === EntityStatus.ACTIVE,
      `status=${reactivated?.status}`
    );

    const duplicateCount = await prisma.qRCode.count({
      where: { sabpaisaQrId: providerRef || undefined },
    });
    record(
      "Lifecycle stability",
      reactivated?.clientId === clientId &&
        reactivated?.merchantId === merchantId &&
        reactivated?.providerMode === QRProviderMode.MOCK &&
        reactivated?.sabpaisaQrId === providerRef &&
        duplicateCount === 1,
      "ownership/provider reference stable"
    );
  } catch (error) {
    record("E2E workflow", false, String(error));
  } finally {
    await cleanup();
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n${passed}/${results.length} tests passed${failed ? `, ${failed} failed` : ""}`);

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
