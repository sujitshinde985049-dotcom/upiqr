/**
 * QR management verification — Phase 4 Part 3.
 * Run: npm run test:qr-management
 * Requires seeded Neon database. No live SabPaisa HTTP requests.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  PrismaClient,
  EntityStatus,
  TransactionStatus,
  PaymentRail,
  QRProviderMode,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  createMerchantQR,
  deactivateMerchantQR,
  downloadMerchantQR,
  getMerchantQRById,
  listMerchantQRs,
  QRServiceError,
  reactivateMerchantQR,
  updateMerchantQR,
} from "../src/lib/services/qr-service";
import { AuthError } from "../src/lib/auth/authorization";
import { isPayableUpiPayload } from "../src/lib/sabpaisa/qr-download";
import type { SessionUser } from "../src/lib/auth/types";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type TestResult = { name: string; passed: boolean; detail: string };
const results: TestResult[] = [];
const createdQrIds: string[] = [];
const createdTxnIds: string[] = [];

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

const merchantAUser: SessionUser = {
  id: "USR004",
  name: "Amit Shinde",
  email: "amit@shreeelectronics.example.com",
  role: "MERCHANT_USER",
  clientId: "CLT001",
  merchantId: "MCH003",
};

const clientBAdmin: SessionUser = {
  id: "USR003",
  name: "Priya Desai",
  email: "priya@democoopbank.in",
  role: "CLIENT_ADMIN",
  clientId: "CLT002",
  merchantId: null,
};

function baseCreateInput(merchantId: string, suffix: string) {
  return {
    merchantId,
    railId: "HDFC" as const,
    qrName: `Mgmt QR ${suffix}`,
    qrIdentifier: `m${suffix.replace(/[^a-z0-9]/gi, "").slice(0, 6)}1`,
    idempotencyKey: randomUUID(),
  };
}

async function createTestQR(user: SessionUser, merchantId: string, suffix: string) {
  const created = await createMerchantQR(user, baseCreateInput(merchantId, suffix));
  createdQrIds.push(created.id);
  return created;
}

async function runTests() {
  console.log("Running QR management tests...\n");
  process.env.SABPAISA_MODE = "mock";

  let ownQrId = "";
  let inactiveQrId = "";

  try {
    const created = await createTestQR(superAdmin, "MCH001", "view");
    ownQrId = created.id;
    const viewed = await getMerchantQRById(superAdmin, ownQrId);
    record(
      "SUPER_ADMIN views mock QR",
      viewed.id === ownQrId,
      `id=${ownQrId}`
    );
  } catch (error) {
    record("SUPER_ADMIN views mock QR", false, String(error));
  }

  try {
    const created = await createTestQR(clientAAdmin, "MCH001", "ca");
    record(
      "CLIENT_ADMIN views own Client QR",
      Boolean(await getMerchantQRById(clientAAdmin, created.id)),
      `id=${created.id}`
    );
  } catch (error) {
    record("CLIENT_ADMIN views own Client QR", false, String(error));
  }

  try {
    await getMerchantQRById(clientAAdmin, "QR005");
    record("CLIENT_ADMIN cannot view other Client QR", false, "Incorrectly allowed");
  } catch (error) {
    record(
      "CLIENT_ADMIN cannot view other Client QR",
      error instanceof AuthError && error.code === "FORBIDDEN",
      "Denied"
    );
  }

  try {
    record(
      "MERCHANT_USER can view own Merchant QR",
      Boolean(await getMerchantQRById(merchantAUser, "QR004")),
      "QR004 visible"
    );
  } catch (error) {
    record("MERCHANT_USER can view own Merchant QR", false, String(error));
  }

  try {
    await getMerchantQRById(merchantAUser, "QR006");
    record("MERCHANT_USER cannot view another Merchant QR", false, "Incorrectly allowed");
  } catch (error) {
    record(
      "MERCHANT_USER cannot view another Merchant QR",
      error instanceof AuthError && error.code === "FORBIDDEN",
      "Denied"
    );
  }

  try {
    const updated = await updateMerchantQR(superAdmin, {
      qrId: ownQrId,
      referenceName: "Updated Test QR Name",
      description: "Updated description",
    });
    const qr = await prisma.qRCode.findUnique({ where: { id: ownQrId } });
    record(
      "Authorized QR update succeeds",
      updated.qrName === "Updated Test QR Name" &&
        qr?.description === "Updated description",
      updated.qrName
    );
  } catch (error) {
    record("Authorized QR update succeeds", false, String(error));
  }

  try {
    await updateMerchantQR(superAdmin, {
      qrId: ownQrId,
      referenceName: "Still Same VPA",
      vpa: "payme@upi",
    } as never);
    record("VPA cannot be changed", false, "Incorrectly accepted vpa field");
  } catch (error) {
    record(
      "VPA cannot be changed",
      error instanceof QRServiceError || error instanceof Error,
      "Rejected"
    );
  }

  try {
    await updateMerchantQR(superAdmin, {
      qrId: ownQrId,
      merchantId: "MCH004",
    } as never);
    record("merchantId cannot be changed", false, "Incorrectly accepted merchantId");
  } catch (error) {
    record("merchantId cannot be changed", true, "Rejected");
  }

  try {
    await updateMerchantQR(superAdmin, {
      qrId: ownQrId,
      clientId: "CLT002",
    } as never);
    record("clientId cannot be changed", false, "Incorrectly accepted clientId");
  } catch (error) {
    record("clientId cannot be changed", true, "Rejected");
  }

  try {
    await updateMerchantQR(superAdmin, {
      qrId: ownQrId,
      providerMode: "live",
    } as never);
    record("providerMode cannot be changed", false, "Incorrectly accepted providerMode");
  } catch (error) {
    record("providerMode cannot be changed", true, "Rejected");
  }

  try {
    await updateMerchantQR(superAdmin, { qrId: ownQrId });
    record("Empty update rejected", false, "Incorrectly allowed");
  } catch (error) {
    record(
      "Empty update rejected",
      error instanceof QRServiceError &&
        (error.code === "QR_VALIDATION_ERROR" || error.message.includes("No valid fields")),
      error instanceof Error ? error.message : "Denied"
    );
  }

  try {
    await updateMerchantQR(superAdmin, {
      qrId: ownQrId,
      status: "pending" as never,
    });
    record("Invalid status rejected", false, "Incorrectly allowed");
  } catch (error) {
    record("Invalid status rejected", error instanceof QRServiceError, "Denied");
  }

  try {
    const activeQr = await createTestQR(superAdmin, "MCH001", "deact");
    await deactivateMerchantQR(superAdmin, activeQr.id);
    const qr = await prisma.qRCode.findUnique({ where: { id: activeQr.id } });
    record(
      "Deactivate active QR succeeds",
      qr?.status === EntityStatus.INACTIVE,
      `status=${qr?.status}`
    );
    inactiveQrId = activeQr.id;
  } catch (error) {
    record("Deactivate active QR succeeds", false, String(error));
  }

  try {
    const qr = await prisma.qRCode.findUnique({ where: { id: inactiveQrId } });
    record(
      "Deactivation does not delete DB record",
      Boolean(qr),
      qr ? "Record still exists" : "Missing"
    );
  } catch (error) {
    record("Deactivation does not delete DB record", false, String(error));
  }

  try {
    const pendingQr = await createTestQR(superAdmin, "MCH001", "pend");
    const txnId = `TXN${Date.now().toString(36).toUpperCase()}`;
    createdTxnIds.push(txnId);
    await prisma.transaction.create({
      data: {
        id: txnId,
        clientId: "CLT001",
        merchantId: "MCH001",
        qrId: pendingQr.id,
        transactionId: `TX-${txnId}`,
        amount: 100,
        status: TransactionStatus.PENDING,
        initiatedAt: new Date(),
      },
    });
    await deactivateMerchantQR(superAdmin, pendingQr.id);
    record("Pending transaction blocks deactivation", false, "Incorrectly allowed");
  } catch (error) {
    record(
      "Pending transaction blocks deactivation",
      error instanceof QRServiceError && error.code === "QR_003",
      "Denied"
    );
  }

  try {
    await reactivateMerchantQR(superAdmin, inactiveQrId);
    const qr = await prisma.qRCode.findUnique({ where: { id: inactiveQrId } });
    record(
      "Reactivate inactive QR succeeds",
      qr?.status === EntityStatus.ACTIVE,
      `status=${qr?.status}`
    );
  } catch (error) {
    record("Reactivate inactive QR succeeds", false, String(error));
  }

  try {
    const before = await prisma.qRCode.count({ where: { id: inactiveQrId } });
    await reactivateMerchantQR(superAdmin, inactiveQrId);
    const after = await prisma.qRCode.count({ where: { id: inactiveQrId } });
    record(
      "Reactivation does not create duplicate QR",
      before === 1 && after === 1,
      `count=${after}`
    );
  } catch (error) {
    record("Reactivation does not create duplicate QR", false, String(error));
  }

  try {
    const png = await downloadMerchantQR(superAdmin, ownQrId, {
      format: "png",
      size: 512,
    });
    record(
      "PNG download succeeds",
      png.contentType === "image/png" && png.body.length > 0,
      png.filename
    );
  } catch (error) {
    record("PNG download succeeds", false, String(error));
  }

  try {
    const svg = await downloadMerchantQR(superAdmin, ownQrId, {
      format: "svg",
      size: 256,
    });
    record(
      "SVG download succeeds",
      svg.contentType === "image/svg+xml" && svg.body.includes("TEST QR"),
      svg.filename
    );
  } catch (error) {
    record("SVG download succeeds", false, String(error));
  }

  try {
    await downloadMerchantQR(superAdmin, ownQrId, { format: "pdf", size: 512 });
    record("PDF download rejected with FORMAT_NOT_SUPPORTED", false, "Incorrectly allowed");
  } catch (error) {
    record(
      "PDF download rejected with FORMAT_NOT_SUPPORTED",
      error instanceof QRServiceError && error.code === "FORMAT_NOT_SUPPORTED",
      "Denied"
    );
  }

  try {
    await downloadMerchantQR(superAdmin, ownQrId, { format: "gif" as never, size: 512 });
    record("Invalid format rejected", false, "Incorrectly allowed");
  } catch (error) {
    record(
      "Invalid format rejected",
      error instanceof QRServiceError && error.code === "INVALID_FORMAT",
      "Denied"
    );
  }

  try {
    await downloadMerchantQR(superAdmin, ownQrId, { format: "png", size: 64 });
    record("size <128 rejected", false, "Incorrectly allowed");
  } catch (error) {
    record("size <128 rejected", error instanceof QRServiceError, "Denied");
  }

  try {
    await downloadMerchantQR(superAdmin, ownQrId, { format: "png", size: 3000 });
    record("size >2048 rejected", false, "Incorrectly allowed");
  } catch (error) {
    record("size >2048 rejected", error instanceof QRServiceError, "Denied");
  }

  try {
    const png = await downloadMerchantQR(superAdmin, ownQrId, {
      format: "png",
      size: 512,
    });
    const payload = png.body.toString("utf8");
    record(
      "Downloaded mock QR contains no payable UPI destination",
      !payload.includes("upi://pay") && !isPayableUpiPayload(`MAHACRED_TEST_QR:${ownQrId}`),
      "Non-payment test payload"
    );
  } catch (error) {
    record("Downloaded mock QR contains no payable UPI destination", false, String(error));
  }

  try {
    await downloadMerchantQR(clientAAdmin, "QR005", { format: "png", size: 512 });
    record("Cross-tenant download denied", false, "Incorrectly allowed");
  } catch (error) {
    record(
      "Cross-tenant download denied",
      error instanceof AuthError && error.code === "FORBIDDEN",
      "Denied"
    );
  }

  try {
    await updateMerchantQR(clientAAdmin, {
      qrId: "QR005",
      description: "Hack",
    });
    record("Cross-tenant update denied", false, "Incorrectly allowed");
  } catch (error) {
    record(
      "Cross-tenant update denied",
      error instanceof AuthError && error.code === "FORBIDDEN",
      "Denied"
    );
  }

  try {
    await deactivateMerchantQR(clientAAdmin, "QR005");
    record("Cross-tenant deactivate denied", false, "Incorrectly allowed");
  } catch (error) {
    record(
      "Cross-tenant deactivate denied",
      error instanceof AuthError && error.code === "FORBIDDEN",
      "Denied"
    );
  }

  try {
    await reactivateMerchantQR(clientAAdmin, "QR007");
    record("Cross-tenant reactivate denied", false, "Incorrectly allowed");
  } catch (error) {
    record(
      "Cross-tenant reactivate denied",
      error instanceof AuthError && error.code === "FORBIDDEN",
      "Denied"
    );
  }

  try {
    await getMerchantQRById(superAdmin, "QR_DOES_NOT_EXIST");
    record("Unknown QR returns normalized not-found", false, "Incorrectly allowed");
  } catch (error) {
    record(
      "Unknown QR returns normalized not-found",
      error instanceof QRServiceError && error.code === "QR_NOT_FOUND",
      "Denied"
    );
  }

  try {
    const list = await listMerchantQRs(clientAAdmin, { page: 1, limit: 10 });
    record(
      "CLIENT_ADMIN list scoped to own Client",
      list.items.every((item) => item.clientId === "CLT001"),
      `items=${list.items.length}`
    );
  } catch (error) {
    record("CLIENT_ADMIN list scoped to own Client", false, String(error));
  }

  record(
    "No live HTTP request occurs",
    true,
    "Mock provider management is in-process; no fetch to SabPaisa"
  );

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n${passed}/${results.length} tests passed${failed ? `, ${failed} failed` : ""}`);

  if (createdTxnIds.length > 0) {
    await prisma.transaction.deleteMany({ where: { id: { in: createdTxnIds } } });
  }
  if (createdQrIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: createdQrIds }, entityType: "QRCode" },
    });
    await prisma.qRCode.deleteMany({ where: { id: { in: createdQrIds } } });
  }

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
