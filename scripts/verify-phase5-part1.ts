/**
 * Phase 5 Part 1 transaction foundation verification.
 * Run: npm run test:phase5-part1
 * Requires Neon database. No live SabPaisa HTTP requests.
 */
import "dotenv/config";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  PrismaClient,
  QRProviderMode,
  TransactionStatus,
  Prisma,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { AuthError } from "../src/lib/auth/authorization";
import { decimalToNumber } from "../src/lib/mappers";
import { loadSabPaisaIntegrationMode } from "../src/lib/sabpaisa/mode";
import {
  getTransactionByIdForUser,
  listQRTransactionsForUser,
  listTransactionsForUser,
  assertTransactionRelationshipIntegrity,
  TransactionServiceError,
} from "../src/lib/services/transaction-service";
import { createMockTestTransaction } from "../src/lib/test-fixtures/mock-transaction-fixture";
import { transactionListQuerySchema } from "../src/lib/validations/transactions";
import type { SessionUser } from "../src/lib/auth/types";

process.env.SABPAISA_MODE = "mock";
process.env.ALLOW_MOCK_TRANSACTION_FIXTURES = "true";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type TestResult = { name: string; passed: boolean; detail: string };
const results: TestResult[] = [];
const createdTransactionIds: string[] = [];

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

const clientBAdmin: SessionUser = {
  id: "USR003",
  name: "Priya Deshmukh",
  email: "priya@democoopbank.in",
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

const merchantBUser: SessionUser = {
  id: "USR006",
  name: "Krishna Desai",
  email: "krishna@krishnaent.example.com",
  role: "MERCHANT_USER",
  clientId: "CLT002",
  merchantId: "MCH005",
};

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

async function cleanup() {
  if (createdTransactionIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: {
        entityType: "Transaction",
        entityId: { in: createdTransactionIds },
      },
    });
    await prisma.transaction.deleteMany({
      where: { id: { in: createdTransactionIds } },
    });
  }
}

async function runTests() {
  console.log("Running Phase 5 Part 1 transaction foundation tests...\n");

  record(
    "Integration mode defaults to mock",
    loadSabPaisaIntegrationMode() === "mock",
    loadSabPaisaIntegrationMode()
  );

  const qr = await prisma.qRCode.findUnique({
    where: { id: "QR004" },
    include: { merchant: true },
  });
  if (!qr) {
    record("Seed QR004 available", false, "QR004 missing");
  } else {
    record("Seed QR004 available", true, qr.id);

    const mockTxn = await createMockTestTransaction(
      { qrId: qr.id, amount: 10.5, status: "success" },
      { actorUserId: superAdmin.id }
    );
    createdTransactionIds.push(mockTxn.id);

    record(
      "Mock transaction maps to correct Client",
      mockTxn.clientId === qr.clientId,
      `${mockTxn.clientId} === ${qr.clientId}`
    );
    record(
      "Mock transaction maps to correct Merchant",
      mockTxn.merchantId === qr.merchantId,
      `${mockTxn.merchantId} === ${qr.merchantId}`
    );
    record(
      "Mock transaction maps to correct QR",
      mockTxn.qrId === qr.id,
      `${mockTxn.qrId} === ${qr.id}`
    );
    record(
      "Mock transaction marked MOCK/TEST",
      mockTxn.providerMode === QRProviderMode.MOCK &&
        mockTxn.providerTransactionId?.startsWith("mock_txn_") === true,
      `${mockTxn.providerMode} ${mockTxn.providerTransactionId}`
    );
    record(
      "Mock transaction uses synthetic customer VPA",
      mockTxn.customerVpa === "test-customer@mock",
      mockTxn.customerVpa ?? "null"
    );
    record(
      "No mock transaction is presented as LIVE",
      mockTxn.providerMode !== QRProviderMode.LIVE,
      mockTxn.providerMode
    );

    const duplicateProviderId = mockTxn.providerTransactionId!;
    let duplicateBlocked = false;
    try {
      await prisma.transaction.create({
        data: {
          id: "TXN-DUP-TEST",
          clientId: qr.clientId,
          merchantId: qr.merchantId,
          qrId: qr.id,
          transactionId: "MC-TXN-DUP-TEST",
          provider: "sabpaisa",
          providerMode: QRProviderMode.MOCK,
          providerTransactionId: duplicateProviderId,
          amount: new Prisma.Decimal("1.00"),
          status: TransactionStatus.SUCCESS,
          initiatedAt: new Date(),
        },
      });
    } catch {
      duplicateBlocked = true;
    }
    record(
      "Provider transaction ID uniqueness enforced",
      duplicateBlocked,
      duplicateBlocked ? "Unique constraint blocked duplicate" : "Duplicate allowed"
    );
    record(
      "Duplicate transaction insertion prevented",
      duplicateBlocked,
      duplicateProviderId
    );

    for (const [amount, label] of [
      [1.0, "1.00"],
      [10.5, "10.50"],
      [1500.0, "1500.00"],
    ] as const) {
      const txn = await createMockTestTransaction(
        { qrId: qr.id, amount, status: "success" },
        { actorUserId: superAdmin.id }
      );
      createdTransactionIds.push(txn.id);
      const stored = decimalToNumber(txn.amount);
      record(
        `Amount exactness ${label}`,
        stored === amount,
        `stored=${stored} expected=${amount}`
      );
    }

    const ownRead = await getTransactionByIdForUser(superAdmin, mockTxn.id);
    record(
      "CLIENT_ADMIN can read own Client transaction",
      Boolean(
        ownRead &&
          (await getTransactionByIdForUser(clientAAdmin, mockTxn.id))?.id ===
            mockTxn.id
      ),
      ownRead?.id ?? "null"
    );

    let clientBCrossReadFailed = false;
    try {
      await getTransactionByIdForUser(clientBAdmin, mockTxn.id);
    } catch (error) {
      clientBCrossReadFailed =
        error instanceof AuthError && error.code === "FORBIDDEN";
    }
    record(
      "CLIENT_ADMIN cannot read Client B transaction",
      clientBCrossReadFailed,
      clientBCrossReadFailed ? "Forbidden" : "Allowed unexpectedly"
    );

    let operatorCrossReadFailed = false;
    try {
      const clt002Txn = await prisma.transaction.findFirst({
        where: { clientId: "CLT002" },
      });
      if (clt002Txn) {
        await getTransactionByIdForUser(clientAOperator, clt002Txn.id);
      } else {
        operatorCrossReadFailed = true;
      }
    } catch (error) {
      operatorCrossReadFailed =
        error instanceof AuthError && error.code === "FORBIDDEN";
    }
    record(
      "CLIENT_OPERATOR cannot cross tenant",
      operatorCrossReadFailed,
      operatorCrossReadFailed ? "Forbidden" : "Allowed unexpectedly"
    );

    const merchantOwn = await listQRTransactionsForUser(merchantAUser, qr.id, {
      page: 1,
      limit: 10,
    });
    record(
      "MERCHANT_USER can read own Merchant transaction",
      merchantOwn.items.some((item) => item.id === mockTxn.id),
      `${merchantOwn.items.length} items`
    );

    let merchantCrossFailed = false;
    try {
      await listQRTransactionsForUser(merchantBUser, qr.id, {
        page: 1,
        limit: 10,
      });
    } catch (error) {
      merchantCrossFailed =
        error instanceof AuthError && error.code === "FORBIDDEN";
    }
    record(
      "MERCHANT_USER cannot read Merchant B transaction",
      merchantCrossFailed,
      merchantCrossFailed ? "Forbidden" : "Allowed unexpectedly"
    );

    let tamperedQrFailed = false;
    try {
      await listQRTransactionsForUser(clientAAdmin, "QR008", {
        page: 1,
        limit: 10,
      });
    } catch (error) {
      tamperedQrFailed =
        error instanceof AuthError && error.code === "FORBIDDEN";
    }
    record(
      "Tampered QR ID cannot expose transaction",
      tamperedQrFailed,
      tamperedQrFailed ? "Forbidden" : "Allowed unexpectedly"
    );

    let tamperedMerchantFailed = false;
    try {
      await listTransactionsForUser(clientAAdmin, {
        merchantId: "MCH005",
        page: 1,
        limit: 10,
      });
    } catch (error) {
      tamperedMerchantFailed =
        error instanceof AuthError && error.code === "FORBIDDEN";
    }
    record(
      "Tampered merchantId cannot expose transaction",
      tamperedMerchantFailed,
      tamperedMerchantFailed ? "Forbidden" : "Allowed unexpectedly"
    );

    let tamperedClientFailed = false;
    try {
      await listTransactionsForUser(clientAAdmin, {
        clientId: "CLT002",
        page: 1,
        limit: 10,
      });
    } catch (error) {
      tamperedClientFailed =
        error instanceof AuthError && error.code === "FORBIDDEN";
    }
    record(
      "Tampered clientId cannot expose transaction",
      tamperedClientFailed,
      tamperedClientFailed ? "Forbidden" : "Allowed unexpectedly"
    );

    const successList = await listTransactionsForUser(clientAAdmin, {
      status: "success",
      page: 1,
      limit: 100,
    });
    record(
      "Status filter success works",
      successList.items.every((item) => item.status === "success"),
      `${successList.items.length} items`
    );

    const pendingTxn = await createMockTestTransaction(
      { qrId: qr.id, amount: 25, status: "pending" },
      { actorUserId: superAdmin.id }
    );
    createdTransactionIds.push(pendingTxn.id);
    const pendingList = await listTransactionsForUser(clientAAdmin, {
      qr_id: qr.id,
      status: "pending",
      page: 1,
      limit: 100,
    });
    record(
      "Status filter pending works",
      pendingList.items.every((item) => item.status === "pending"),
      `${pendingList.items.length} items`
    );

    const failedTxn = await createMockTestTransaction(
      { qrId: qr.id, amount: 15, status: "failed" },
      { actorUserId: superAdmin.id }
    );
    createdTransactionIds.push(failedTxn.id);
    const failedList = await listTransactionsForUser(clientAAdmin, {
      qr_id: qr.id,
      status: "failed",
      page: 1,
      limit: 100,
    });
    record(
      "Status filter failed works",
      failedList.items.every((item) => item.status === "failed"),
      `${failedList.items.length} items`
    );

    const allList = await listTransactionsForUser(clientAAdmin, {
      qr_id: qr.id,
      status: "all",
      page: 1,
      limit: 100,
    });
    const persistedStatuses = new Set(
      (
        await prisma.transaction.findMany({
          where: { qrId: qr.id },
          select: { status: true },
        })
      ).map((row) => row.status)
    );
    record(
      "all works only as filter",
      allList.items.length >= 1 &&
        ![...persistedStatuses].includes("ALL" as never) &&
        allList.items.some((item) => item.status === "success"),
      `${allList.items.length} items`
    );

    const limitRejected = transactionListQuerySchema.safeParse({
      page: 1,
      limit: 101,
    }).success;
    record(
      "limit >100 rejected",
      !limitRejected,
      limitRejected ? "Accepted" : "Rejected"
    );

    const invalidDateRange = transactionListQuerySchema.safeParse({
      page: 1,
      limit: 10,
      from_date: "2025-08-20",
      to_date: "2025-08-01",
    }).success;
    record(
      "invalid date range rejected",
      !invalidDateRange,
      invalidDateRange ? "Accepted" : "Rejected"
    );

    const searchTooLong = transactionListQuerySchema.safeParse({
      page: 1,
      limit: 10,
      search: "x".repeat(101),
    }).success;
    record(
      "search >100 rejected",
      !searchTooLong,
      searchTooLong ? "Accepted" : "Rejected"
    );

    const invalidSort = transactionListQuerySchema.safeParse({
      page: 1,
      limit: 10,
      sort_by: "invalid_field",
    }).success;
    record(
      "invalid sort field rejected",
      !invalidSort,
      invalidSort ? "Accepted" : "Rejected"
    );

    let relationshipMismatch = false;
    try {
      assertTransactionRelationshipIntegrity({
        clientId: "CLT001",
        merchantId: qr.merchantId,
        qrId: qr.id,
        qrClientId: "CLT002",
        qrMerchantId: qr.merchantId,
        merchantClientId: qr.merchant.clientId,
      });
    } catch (error) {
      relationshipMismatch =
        error instanceof TransactionServiceError &&
        error.code === "RELATIONSHIP_MISMATCH";
    }
    record(
      "QR/client mismatch rejected on create",
      relationshipMismatch,
      relationshipMismatch ? "Rejected" : "Allowed"
    );

    let crossTenantVpaExposed = false;
    try {
      const clt002Txn = await prisma.transaction.findFirst({
        where: { clientId: "CLT002", customerVpa: { not: null } },
      });
      if (clt002Txn) {
        const result = await getTransactionByIdForUser(clientAAdmin, clt002Txn.id);
        crossTenantVpaExposed = Boolean(result?.customerVpa);
      }
    } catch {
      crossTenantVpaExposed = false;
    }
    record(
      "customer VPA not exposed cross-tenant",
      !crossTenantVpaExposed,
      crossTenantVpaExposed ? "Exposed" : "Protected"
    );

    const maskedList = await listQRTransactionsForUser(clientAAdmin, qr.id, {
      page: 1,
      limit: 10,
    });
    record(
      "customer VPA masked in authorized list",
      maskedList.items.every(
        (item) =>
          !item.customerVpa.includes("@") ||
          item.customerVpa.includes("****") ||
          item.customerVpa === ""
      ),
      maskedList.items[0]?.customerVpa ?? "none"
    );
  }

  const relationshipViolations = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM "Transaction" t
    JOIN "QRCode" q ON q.id = t."qrId"
    JOIN "Merchant" m ON m.id = t."merchantId"
    WHERE t."clientId" <> q."clientId"
       OR t."merchantId" <> q."merchantId"
       OR t."clientId" <> m."clientId"
  `;
  record(
    "existing QR/transaction relationships remain consistent",
    Number(relationshipViolations[0]?.count ?? 0) === 0,
    `${relationshipViolations[0]?.count ?? 0} violations`
  );

  const serviceSource = readFileSync(
    join(process.cwd(), "src/lib/services/transaction-service.ts"),
    "utf8"
  );
  const actionFiles = walkFiles(join(process.cwd(), "src/lib/actions"));
  const hasTransactionUpdate = actionFiles.some((file) =>
    readFileSync(file, "utf8").includes("prisma.transaction.update")
  );
  record(
    "normal user cannot edit transaction amount/status",
    !serviceSource.includes("prisma.transaction.update") && !hasTransactionUpdate,
    hasTransactionUpdate || serviceSource.includes("prisma.transaction.update")
      ? "Update path found"
      : "No transaction update path"
  );

  const srcFiles = walkFiles(join(process.cwd(), "src/lib/sabpaisa"));
  const liveHttpInTransactionLayer = srcFiles
    .filter((file) => file.includes("transaction"))
    .some((file) => {
      const content = readFileSync(file, "utf8");
      return /\bfetch\s*\(/.test(content) || /axios/.test(content);
    });
  record(
    "no live HTTP request occurs in transaction provider layer",
    !liveHttpInTransactionLayer,
    liveHttpInTransactionLayer ? "HTTP call found" : "No HTTP calls"
  );

  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;
  console.log(`\nPhase 5 Part 1: ${passed}/${results.length}`);
  await cleanup();
  await prisma.$disconnect();
  await pool.end();
  process.exit(failed ? 1 : 0);
}

runTests().catch(async (error) => {
  console.error(error);
  await cleanup().catch(() => undefined);
  await prisma.$disconnect();
  await pool.end();
  process.exit(1);
});
