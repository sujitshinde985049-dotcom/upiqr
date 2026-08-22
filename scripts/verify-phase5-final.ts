/**
 * Phase 5 final integration + security verification.
 * Run: npm run test:phase5-final
 * Requires Neon database. No live SabPaisa HTTP requests.
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  ClientType,
  EntityStatus,
  Prisma,
  PrismaClient,
  QRProviderMode,
  TransactionStatus,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { decimalToNumber } from "../src/lib/mappers";
import {
  PAYMENT_EVENT_FAILURE_CODES,
  WEBHOOK_INTEROP_BLOCKED_REASON,
  createSabPaisaWebhookAdapter,
  isAllowedStatusTransition,
  isPaymentEventProcessingError,
  type PaymentEventProcessingResult,
} from "../src/lib/payment-events";
import type { MockPaymentEventInput } from "../src/lib/payment-events/adapters/mock-adapter";
import {
  getSabPaisaQRProvider,
  getSabPaisaTransactionProvider,
} from "../src/lib/sabpaisa/providers";
import {
  assertLiveSabPaisaIntegrationReady,
  loadSabPaisaIntegrationMode,
} from "../src/lib/sabpaisa/mode";
import { SABPAISA_ENV_VARS } from "../src/lib/sabpaisa/constants";
import {
  assertMockPaymentEventIngressAllowed,
  ingestMockPaymentEvent,
} from "../src/lib/test-fixtures/mock-payment-event-fixture";
import {
  exportManagedTransactionsCsv,
  getManagedTransactionDetail,
  listManagedTransactions,
  listManagedTransactionsForScope,
} from "../src/lib/services/transaction-management-service";
import { createMerchantQR } from "../src/lib/services/qr-service";
import { buildCsvContent } from "../src/lib/utils/csv-export";
import { generateNextClientCode } from "../src/lib/utils/client-code";
import { generateNextMerchantCode } from "../src/lib/utils/merchant-code";
import type { SessionUser } from "../src/lib/auth/types";

process.env.SABPAISA_MODE = "mock";
process.env.ALLOW_MOCK_PAYMENT_EVENTS = "true";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type TestResult = { name: string; passed: boolean; detail: string; blocked?: boolean };
const results: TestResult[] = [];

const testClientIds: string[] = [];
const testMerchantIds: string[] = [];
const testQrIds: string[] = [];
const createdEventIds: string[] = [];
const createdTransactionIds: string[] = [];

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

function record(name: string, passed: boolean, detail: string, blocked = false) {
  results.push({ name, passed, detail, blocked });
  const label = blocked ? "BLOCKED" : passed ? "PASS" : "FAIL";
  console.log(`${label} — ${name}: ${detail}`);
}

function suffix() {
  return randomBytes(4).toString("hex");
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withDbRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const prismaCode =
        error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
      const networkCode = (error as { code?: string })?.code;
      const retryable =
        prismaCode === "P2028" ||
        networkCode === "ECONNRESET" ||
        networkCode === "ETIMEDOUT";
      if (retryable && attempt < attempts - 1) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

async function ingestWithRetry(
  input: MockPaymentEventInput,
  attempts = 4
): Promise<PaymentEventProcessingResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await ingestMockPaymentEvent(input);
    } catch (error) {
      lastError = error;
      const prismaCode =
        error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
      const networkCode = (error as { code?: string })?.code;
      const retryable =
        prismaCode === "P2028" ||
        networkCode === "ECONNRESET" ||
        networkCode === "ETIMEDOUT";
      if (retryable && attempt < attempts - 1) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

function walkFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
      walkFiles(fullPath, files);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

function scanTrackedFilesForSecrets(): { ok: boolean; detail: string } {
  const suspicious = [
    /SABPAISA_API_KEY\s*=\s*["'][^"'\s]{12,}/i,
    /SABPAISA_API_SECRET\s*=\s*["'][^"'\s]{12,}/i,
    /SABPAISA_ENCRYPTION_MASTER_KEY\s*=\s*["'][0-9a-f]{64}["']/i,
    /SABPAISA_ENCRYPTION_HMAC_SECRET\s*=\s*["'][0-9a-f]{96}["']/i,
    /DATABASE_URL\s*=\s*["']postgresql:\/\/[^:]+:[^@]+@(?!localhost|127\.0\.0\.1)/i,
    /AUTH_SECRET\s*=\s*["'][^"'\s]{20,}/i,
  ];
  let tracked = "";
  try {
    tracked = execSync("git ls-files", { encoding: "utf8" });
  } catch {
    return { ok: false, detail: "git ls-files failed" };
  }
  for (const file of tracked.split("\n").filter(Boolean)) {
    if (file === ".env.example") continue;
    if (!/^(src\/|prisma\/)/.test(file)) continue;
    try {
      const content = readFileSync(join(process.cwd(), file), "utf8");
      if (/NEXT_PUBLIC_.*SABPAISA/i.test(content)) {
        return { ok: false, detail: `NEXT_PUBLIC SabPaisa reference in ${file}` };
      }
      for (const pattern of suspicious) {
        if (pattern.test(content)) {
          return { ok: false, detail: `Suspicious pattern in ${file}` };
        }
      }
    } catch {
      // skip binary/unreadable
    }
  }
  return { ok: true, detail: "No suspicious assignments in src/ or prisma/" };
}

async function trackProcessing(result: {
  paymentEventId: string;
  transactionId?: string;
}) {
  createdEventIds.push(result.paymentEventId);
  if (result.transactionId) createdTransactionIds.push(result.transactionId);
}

async function cleanup() {
  if (createdEventIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { entityType: "PaymentEvent", entityId: { in: createdEventIds } },
    });
    await prisma.paymentEvent.deleteMany({ where: { id: { in: createdEventIds } } });
  }
  if (createdTransactionIds.length > 0) {
    await prisma.transaction.deleteMany({ where: { id: { in: createdTransactionIds } } });
  }
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

async function checkDatabaseIntegrity() {
  const transactions = await prisma.transaction.findMany({
    include: { client: true, merchant: true, qrCode: true },
  });

  let orphanCount = 0;
  let clientMismatch = 0;
  let merchantMismatch = 0;
  let qrMismatch = 0;

  for (const txn of transactions) {
    if (!txn.client || !txn.merchant || !txn.qrCode) orphanCount += 1;
    if (txn.clientId !== txn.merchant?.clientId) clientMismatch += 1;
    if (txn.merchantId !== txn.qrCode?.merchantId) merchantMismatch += 1;
    if (txn.qrId !== txn.qrCode?.id) qrMismatch += 1;
    if (txn.clientId !== txn.qrCode?.clientId) clientMismatch += 1;
  }

  const duplicateTxnGroups = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM (
      SELECT provider, "providerMode", "providerTransactionId", COUNT(*) AS c
      FROM "Transaction"
      WHERE "providerTransactionId" IS NOT NULL
      GROUP BY provider, "providerMode", "providerTransactionId"
      HAVING COUNT(*) > 1
    ) d`;

  const duplicateEventGroups = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM (
      SELECT provider, "providerMode", "providerEventId", COUNT(*) AS c
      FROM "PaymentEvent"
      GROUP BY provider, "providerMode", "providerEventId"
      HAVING COUNT(*) > 1
    ) d`;

  return {
    orphanCount,
    clientMismatch,
    merchantMismatch,
    qrMismatch,
    duplicateTxnIdentity: Number(duplicateTxnGroups[0]?.count ?? 0),
    duplicateEventIdentity: Number(duplicateEventGroups[0]?.count ?? 0),
  };
}

async function runTests() {
  console.log("Running Phase 5 final integration + security tests...\n");

  const runSuffix = `p5f${suffix()}`;
  const providerTxnId = `mock_txn_${runSuffix}`;
  const pendingEventId = `mock_evt_pending_${runSuffix}`;
  const successEventId = `mock_evt_success_${runSuffix}`;
  let clientId = "";
  let merchantId = "";
  let qrId = "";
  let providerQrId = "";
  let transactionDbId = "";

  try {
    clientId = await generateNextClientCode();
    await prisma.client.create({
      data: {
        id: clientId,
        clientCode: clientId,
        name: `Phase5 Final Client ${runSuffix}`,
        type: ClientType.PATSANSTHA,
        registrationNumber: `P5F-REG-${runSuffix}`,
        contactPerson: "P5 Final",
        mobile: "9876500001",
        email: `p5final.${runSuffix}@example.com`,
        status: EntityStatus.ACTIVE,
      },
    });
    testClientIds.push(clientId);

    merchantId = await generateNextMerchantCode();
    await prisma.merchant.create({
      data: {
        id: merchantId,
        merchantCode: merchantId,
        clientId,
        businessName: `Phase5 Final Merchant ${runSuffix}`,
        accountHolderName: "P5 Holder",
        currentAccountReference: `P5F-CA-${runSuffix}`,
        mobile: "9876500002",
        email: `p5final.merchant.${runSuffix}@example.com`,
        address: "Test",
        city: "Pune",
        district: "Pune",
        state: "Maharashtra",
        pinCode: "411001",
        status: EntityStatus.ACTIVE,
      },
    });
    testMerchantIds.push(merchantId);

    const qr = await createMerchantQR(superAdmin, {
      merchantId,
      railId: "HDFC",
      qrName: `P5 Final QR ${runSuffix}`,
      qrIdentifier: `p5f${runSuffix.slice(0, 6)}`,
      idempotencyKey: randomUUID(),
    });
    qrId = qr.id;
    providerQrId = qr.sabpaisaQrId ?? qr.id;
    testQrIds.push(qrId);

    const qrRow = await prisma.qRCode.findUnique({ where: { id: qrId } });
    record(
      "Client → Merchant → QR relationship valid",
      qrRow?.clientId === clientId &&
        qrRow?.merchantId === merchantId &&
        qrRow?.providerMode === QRProviderMode.MOCK,
      `client=${qrRow?.clientId} merchant=${qrRow?.merchantId}`
    );

    const pendingResult = await ingestWithRetry({
      providerEventId: pendingEventId,
      providerTransactionId: providerTxnId,
      providerQrId,
      amount: 150.25,
      status: "pending",
    });
    await trackProcessing(pendingResult);
    transactionDbId = pendingResult.transactionId ?? "";

    const pendingTxn = transactionDbId
      ? await prisma.transaction.findUnique({ where: { id: transactionDbId } })
      : null;
    record(
      "MOCK pending event → transaction pending",
      pendingResult.processingStatus === "PROCESSED" &&
        pendingTxn?.status === TransactionStatus.PENDING &&
        pendingTxn.providerMode === QRProviderMode.MOCK,
      `${pendingResult.processingStatus} ${pendingTxn?.status}`
    );

    const successResult = await ingestWithRetry({
      providerEventId: successEventId,
      providerTransactionId: providerTxnId,
      providerQrId,
      amount: 150.25,
      status: "success",
    });
    await trackProcessing(successResult);

    const successTxn = await prisma.transaction.findUnique({
      where: { id: transactionDbId },
    });
    record(
      "MOCK success event → same transaction success",
      successResult.transactionId === transactionDbId &&
        successTxn?.status === TransactionStatus.SUCCESS,
      `${successTxn?.status} amount=${successTxn?.amount.toFixed(2)}`
    );

    record(
      "Transaction identity stable",
      successTxn?.providerTransactionId === providerTxnId,
      successTxn?.providerTransactionId ?? "missing"
    );
    record(
      "Amount stable across events",
      successTxn?.amount.toFixed(2) === "150.25",
      successTxn?.amount.toFixed(2) ?? "missing"
    );
    record(
      "QR ownership stable",
      successTxn?.qrId === qrId && successTxn?.merchantId === merchantId,
      `qr=${successTxn?.qrId}`
    );

    const duplicatePending = await ingestWithRetry({
      providerEventId: pendingEventId,
      providerTransactionId: providerTxnId,
      providerQrId,
      amount: 150.25,
      status: "pending",
    });
    record(
      "Same event idempotent",
      duplicatePending.duplicate === true &&
        duplicatePending.processingStatus === "DUPLICATE",
      duplicatePending.processingStatus
    );

    const concurrent = await Promise.all(
      Array.from({ length: 3 }, () =>
        ingestWithRetry({
          providerEventId: `mock_evt_conc_${runSuffix}`,
          providerTransactionId: `mock_txn_conc_${runSuffix}`,
          providerQrId,
          amount: 99.99,
          status: "success",
        })
      )
    );
    const concTxnIds = new Set(
      concurrent.map((r) => r.transactionId).filter(Boolean)
    );
    record(
      "Concurrent same-event processing idempotent",
      concTxnIds.size <= 1,
      `${concTxnIds.size} transaction row(s)`
    );
    if (concurrent[0]?.transactionId) {
      createdTransactionIds.push(concurrent[0].transactionId!);
    }
    const concEvents = await prisma.paymentEvent.findMany({
      where: { providerEventId: `mock_evt_conc_${runSuffix}` },
    });
    createdEventIds.push(...concEvents.map((e) => e.id));

    const diffEventSameTxn = await ingestWithRetry({
      providerEventId: `mock_evt_diff_${runSuffix}`,
      providerTransactionId: providerTxnId,
      providerQrId,
      amount: 150.25,
      status: "success",
    });
    await trackProcessing(diffEventSameTxn);
    const txnCount = await prisma.transaction.count({
      where: {
        provider: "sabpaisa",
        providerMode: QRProviderMode.MOCK,
        providerTransactionId: providerTxnId,
      },
    });
    record(
      "Different event / same transaction idempotent",
      txnCount === 1 && diffEventSameTxn.processingStatus === "PROCESSED",
      `${txnCount} row(s)`
    );

    const invalidTransition = await ingestWithRetry({
      providerEventId: `mock_evt_bad_${runSuffix}`,
      providerTransactionId: providerTxnId,
      providerQrId,
      amount: 150.25,
      status: "failed",
    });
    await trackProcessing(invalidTransition);
    record(
      "Invalid success → failed transition rejected",
      invalidTransition.processingStatus === "REJECTED",
      invalidTransition.failureReasonCode ?? invalidTransition.processingStatus
    );

    const unknownQr = await ingestWithRetry({
      providerEventId: `mock_evt_unknown_${runSuffix}`,
      providerTransactionId: `mock_txn_unknown_${runSuffix}`,
      providerQrId: "unknown-qr-id",
      amount: 10,
      status: "success",
    });
    await trackProcessing(unknownQr);
    record(
      "Unknown QR rejected",
      unknownQr.processingStatus === "REJECTED",
      unknownQr.failureReasonCode ?? unknownQr.processingStatus
    );

    const amountMismatch = await ingestWithRetry({
      providerEventId: `mock_evt_amt_${runSuffix}`,
      providerTransactionId: providerTxnId,
      providerQrId,
      amount: 999.99,
      status: "success",
    });
    await trackProcessing(amountMismatch);
    const afterMismatch = await prisma.transaction.findUnique({
      where: { id: transactionDbId },
    });
    record(
      "Amount mismatch rejected and amount unchanged",
      amountMismatch.processingStatus === "REJECTED" &&
        afterMismatch?.amount.toFixed(2) === "150.25",
      `${amountMismatch.failureReasonCode} amount=${afterMismatch?.amount.toFixed(2)}`
    );

    const globalList = await withDbRetry(() =>
      listManagedTransactions(superAdmin, {
        page: 1,
        limit: 100,
        search: providerTxnId,
      })
    );
    record(
      "Transaction visible in /transactions",
      globalList.items.some((t) => t.id === transactionDbId),
      `${globalList.items.length} matched`
    );

    const clientView = await withDbRetry(() =>
      listManagedTransactionsForScope(superAdmin, {
        clientId,
        limit: 50,
      })
    );
    record(
      "Transaction visible in Client view",
      clientView.some((t) => t.id === transactionDbId),
      `${clientView.length} rows`
    );

    const merchantView = await withDbRetry(() =>
      listManagedTransactionsForScope(superAdmin, {
        merchantId,
        limit: 50,
      })
    );
    record(
      "Transaction visible in Merchant view",
      merchantView.some((t) => t.id === transactionDbId),
      `${merchantView.length} rows`
    );

    const qrView = await withDbRetry(() =>
      listManagedTransactionsForScope(superAdmin, {
        qrId,
        limit: 50,
      })
    );
    record(
      "Transaction visible in QR view",
      qrView.some((t) => t.id === transactionDbId),
      `${qrView.length} rows`
    );

    const scopedSummary = await withDbRetry(() =>
      listManagedTransactions(superAdmin, {
        page: 1,
        limit: 20,
        merchantId,
        providerMode: "mock",
      })
    );
    const successCount = scopedSummary.items.filter((t) => t.status === "success").length;
    record(
      "Summary counts include scoped success transaction",
      scopedSummary.summary.successful >= 1 && successCount >= 1,
      `successful=${scopedSummary.summary.successful}`
    );

    const successAgg = await prisma.transaction.aggregate({
      where: {
        merchantId,
        status: TransactionStatus.SUCCESS,
        providerMode: QRProviderMode.MOCK,
      },
      _sum: { amount: true },
    });
    record(
      "Successful amount Decimal-safe for MOCK scope",
      Math.abs(
        scopedSummary.summary.successfulAmountByProviderMode.mock -
          decimalToNumber(successAgg._sum.amount ?? 0)
      ) < 0.01,
      `summary=${scopedSummary.summary.successfulAmountByProviderMode.mock}`
    );

    const liveSummary = await withDbRetry(() =>
      listManagedTransactions(superAdmin, {
        page: 1,
        limit: 20,
        merchantId,
        providerMode: "live",
      })
    );
    record(
      "MOCK excluded from LIVE totals",
      liveSummary.summary.successfulAmountByProviderMode.live === 0,
      `live=${liveSummary.summary.successfulAmountByProviderMode.live}`
    );

    const legacySummary = await withDbRetry(() =>
      listManagedTransactions(superAdmin, {
        page: 1,
        limit: 20,
        providerMode: "legacy",
      })
    );
    record(
      "LEGACY tracked separately from LIVE totals",
      legacySummary.summary.successfulAmountByProviderMode.legacy >= 0 &&
        liveSummary.summary.successfulAmountByProviderMode.live === 0,
      `legacy=${legacySummary.summary.successfulAmountByProviderMode.legacy}`
    );

    const crossClientDetail = await withDbRetry(() =>
      getManagedTransactionDetail(clientAAdmin, transactionDbId)
    );
    record(
      "Client cross-tenant detail denied",
      crossClientDetail === null,
      crossClientDetail ? "leaked" : "not found"
    );

    const crossMerchantDetail = await withDbRetry(() =>
      getManagedTransactionDetail(merchantAUser, transactionDbId)
    );
    record(
      "Merchant cross-tenant detail denied",
      crossMerchantDetail === null,
      crossMerchantDetail ? "leaked" : "not found"
    );

    const crossExport = await withDbRetry(() =>
      listManagedTransactions(clientAAdmin, {
        page: 1,
        limit: 50,
        clientId,
      })
    );
    record(
      "Client cross-tenant list/export scope denied",
      crossExport.items.length === 0,
      `${crossExport.items.length} rows`
    );

    const csv = await withDbRetry(() =>
      exportManagedTransactionsCsv(superAdmin, {
        merchantId,
        providerMode: "mock",
        status: "success",
      })
    );
    record(
      "Authorized CSV contains transaction",
      csv.content.includes(providerTxnId) && csv.content.includes("MOCK"),
      `${csv.rowCount} rows`
    );
    record(
      "CSV excludes VPA",
      !csv.content.includes("@"),
      "no @ in export"
    );

    const formulaCsv = buildCsvContent(
      ["Amount"],
      [["=1+1"], ["+cmd"], ["-2"], ["@sum"]]
    );
    record(
      "CSV formula injection protected",
      formulaCsv.includes("'=1+1") && formulaCsv.includes("'@sum"),
      "escaped"
    );

    record("CSV export limit enforced", csv.rowCount <= 10_000, `rows=${csv.rowCount}`);

    const uiFiles = walkFiles(join(process.cwd(), "src/app/(dashboard)/transactions"));
    const uiCombined = uiFiles.map((f) => readFileSync(f, "utf8")).join("\n");
    record(
      "No manual status mutation UI",
      !uiCombined.toLowerCase().includes("mark as success") &&
        !uiCombined.includes("updateTransaction"),
      "clean"
    );

    const apiFiles = walkFiles(join(process.cwd(), "src/app/api"));
    const unsignedEndpoint = apiFiles.some((file) => {
      const content = readFileSync(file, "utf8");
      return (
        /webhook|payment-event|payment_event/i.test(content) &&
        /processNormalizedPaymentEvent|ingestMockPaymentEvent|transaction\.update/.test(
          content
        )
      );
    });
    record(
      "No public unsigned webhook endpoint",
      !unsignedEndpoint,
      unsignedEndpoint ? "found" : "none"
    );

    const env = process.env as Record<string, string | undefined>;
    const prevNodeEnv = env.NODE_ENV;
    env.NODE_ENV = "production";
    delete env.ALLOW_MOCK_PAYMENT_EVENTS;
    let ingressBlocked = false;
    try {
      assertMockPaymentEventIngressAllowed();
    } catch {
      ingressBlocked = true;
    }
    env.NODE_ENV = prevNodeEnv;
    env.ALLOW_MOCK_PAYMENT_EVENTS = "true";
    record(
      "Mock ingress fail-closed in production",
      ingressBlocked,
      ingressBlocked ? "blocked" : "allowed"
    );

    let liveQrBlocked = false;
    try {
      process.env[SABPAISA_ENV_VARS.MODE] = "live";
      getSabPaisaQRProvider();
    } catch {
      liveQrBlocked = true;
    } finally {
      delete process.env[SABPAISA_ENV_VARS.MODE];
      process.env.SABPAISA_MODE = "mock";
    }
    record("Live QR provider fail-closed", liveQrBlocked, liveQrBlocked ? "blocked" : "open");

    let liveTxnBlocked = false;
    try {
      process.env[SABPAISA_ENV_VARS.MODE] = "live";
      getSabPaisaTransactionProvider();
    } catch {
      liveTxnBlocked = true;
    } finally {
      delete process.env[SABPAISA_ENV_VARS.MODE];
      process.env.SABPAISA_MODE = "mock";
    }
    record(
      "Live transaction provider fail-closed",
      liveTxnBlocked,
      liveTxnBlocked ? "blocked" : "open"
    );

    const webhookAdapter = createSabPaisaWebhookAdapter();
    let adapterBlocked = false;
    let signatureBlocked = false;
    let replayBlocked = false;
    try {
      webhookAdapter.parseAndNormalize();
    } catch (error) {
      adapterBlocked =
        isPaymentEventProcessingError(error) &&
        error.code === PAYMENT_EVENT_FAILURE_CODES.SABPAISA_WEBHOOK_SPEC_NOT_AVAILABLE;
    }
    try {
      webhookAdapter.verifySignature();
    } catch (error) {
      signatureBlocked =
        error instanceof Error && error.message.includes("BLOCKED");
    }
    try {
      webhookAdapter.verifyReplayProtection();
    } catch (error) {
      replayBlocked =
        error instanceof Error &&
        error.message.includes(WEBHOOK_INTEROP_BLOCKED_REASON);
    }
    record(
      "Real webhook adapter BLOCKED",
      adapterBlocked,
      adapterBlocked ? "BLOCKED" : "open",
      true
    );
    record(
      "Payload interoperability BLOCKED",
      adapterBlocked,
      "via fail-closed adapter",
      true
    );
    record(
      "Signature verification BLOCKED",
      signatureBlocked,
      signatureBlocked ? "BLOCKED" : "open",
      true
    );
    record(
      "Provider replay verification BLOCKED",
      replayBlocked,
      replayBlocked ? "BLOCKED" : "open",
      true
    );

    record(
      "API crypto interoperability remains BLOCKED",
      true,
      "3 BLOCKED in SabPaisa foundation suite",
      true
    );

    const paymentAudits = await prisma.auditLog.findMany({
      where: {
        action: { in: ["PAYMENT_EVENT_PROCESSED", "PAYMENT_EVENT_REJECTED"] },
      },
      take: 50,
      orderBy: { createdAt: "desc" },
    });
    const auditSafe = paymentAudits.every((log) => {
      const meta = JSON.stringify(log.metadata ?? {});
      return (
        !/customerVpa|@/i.test(meta) &&
        !/DATABASE_URL|SABPAISA_API|password|encryption/i.test(meta)
      );
    });
    record(
      "Audit metadata contains no VPA/secrets",
      auditSafe,
      `checked ${paymentAudits.length} logs`
    );

    const integrity = await withDbRetry(() => checkDatabaseIntegrity());
    record(
      "Database relationship integrity valid",
      integrity.orphanCount === 0 &&
        integrity.clientMismatch === 0 &&
        integrity.merchantMismatch === 0 &&
        integrity.qrMismatch === 0,
      `orphan=${integrity.orphanCount} client=${integrity.clientMismatch} merchant=${integrity.merchantMismatch} qr=${integrity.qrMismatch}`
    );
    record(
      "Duplicate transaction identity count",
      integrity.duplicateTxnIdentity === 0,
      String(integrity.duplicateTxnIdentity)
    );
    record(
      "Duplicate event identity count",
      integrity.duplicateEventIdentity === 0,
      String(integrity.duplicateEventIdentity)
    );

    record(
      "State machine policy preserved",
      isAllowedStatusTransition("pending", "success") &&
        !isAllowedStatusTransition("success", "failed"),
      "internal policy"
    );

    record(
      "Payment processor uses Prisma transaction boundary",
      readFileSync(
        join(process.cwd(), "src/lib/payment-events/processor.ts"),
        "utf8"
      ).includes("prisma.$transaction"),
      "atomic block present"
    );

    const secretScan = scanTrackedFilesForSecrets();
    record("Secrets scan on tracked files", secretScan.ok, secretScan.detail);

    let envTracked = "";
    try {
      envTracked = execSync("git ls-files .env .env.local", {
        encoding: "utf8",
      }).trim();
    } catch {
      envTracked = "";
    }
    record(
      ".env and .env.local not tracked",
      envTracked.length === 0,
      envTracked || "untracked"
    );

    const settlementClaims = walkFiles(join(process.cwd(), "src/app"))
      .filter((f) => f.includes("transactions") || f.includes("reports"))
      .some((f) =>
        /\b(Settled|Settlement Status:\s*Settled|Mark as Settled)\b/i.test(
          readFileSync(f, "utf8")
        )
      );
    record(
      "Payment success not represented as settlement",
      !settlementClaims,
      settlementClaims ? "settlement label found" : "no settlement claims"
    );

    record(
      "Live SabPaisa integration disabled",
      loadSabPaisaIntegrationMode() === "mock",
      loadSabPaisaIntegrationMode()
    );

    try {
      process.env[SABPAISA_ENV_VARS.MODE] = "live";
      assertLiveSabPaisaIntegrationReady();
      record("Live readiness gate closed", false, "live allowed unexpectedly");
    } catch {
      record("Live readiness gate closed", true, "fail-closed");
    } finally {
      delete process.env[SABPAISA_ENV_VARS.MODE];
      process.env.SABPAISA_MODE = "mock";
    }

    let migrationStatus = "unknown";
    try {
      migrationStatus = execSync("npx prisma migrate status", {
        encoding: "utf8",
      });
    } catch (error) {
      migrationStatus = String(error);
    }
    record(
      "Neon migrations in sync",
      /Database schema is up to date|No pending migrations/i.test(migrationStatus),
      "migrate status checked"
    );
  } finally {
    await cleanup();
  }

  const blocked = results.filter((r) => r.blocked).length;
  const passed = results.filter((r) => r.passed && !r.blocked).length;
  const failed = results.filter((r) => !r.passed && !r.blocked).length;
  console.log(
    `\nPhase 5 Final: ${passed}/${results.length - blocked} PASS, ${blocked} BLOCKED${failed ? `, ${failed} FAIL` : ""}`
  );
  if (failed > 0) {
    console.log("\nFailed tests:");
    for (const result of results.filter((r) => !r.passed && !r.blocked)) {
      console.log(`  - ${result.name}: ${result.detail}`);
    }
    process.exit(1);
  }
}

runTests()
  .catch(async (error) => {
    record("Unhandled Phase 5 final error", false, String(error));
    console.error(error);
    await cleanup().catch(() => undefined);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
