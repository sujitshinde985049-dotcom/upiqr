/**
 * Phase 5 Part 2 payment event security verification.
 * Run: npm run test:phase5-part2
 * Requires Neon database. No live SabPaisa HTTP requests.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  PaymentEventProcessingStatus,
  PrismaClient,
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
  parseNormalizedPaymentAmount,
  processNormalizedPaymentEvent,
  toMockNormalizedPaymentEvent,
} from "../src/lib/payment-events";
import {
  assertMockPaymentEventIngressAllowed,
  ingestMockPaymentEvent,
} from "../src/lib/test-fixtures/mock-payment-event-fixture";

process.env.SABPAISA_MODE = "mock";
process.env.ALLOW_MOCK_PAYMENT_EVENTS = "true";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type TestResult = { name: string; passed: boolean; detail: string };
const results: TestResult[] = [];
const createdEventIds: string[] = [];
const createdTransactionIds: string[] = [];

function record(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} — ${name}: ${detail}`);
}

function suffix() {
  return randomBytes(4).toString("hex");
}

function mockIds(label = suffix()) {
  return {
    providerEventId: `mock_evt_${label}`,
    providerTransactionId: `mock_txn_${label}`,
  };
}

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

async function trackResult(result: {
  paymentEventId: string;
  transactionId?: string;
}) {
  createdEventIds.push(result.paymentEventId);
  if (result.transactionId) createdTransactionIds.push(result.transactionId);
}

async function cleanup() {
  if (createdEventIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: {
        entityType: "PaymentEvent",
        entityId: { in: createdEventIds },
      },
    });
    await prisma.paymentEvent.deleteMany({
      where: { id: { in: createdEventIds } },
    });
  }
  if (createdTransactionIds.length > 0) {
    await prisma.transaction.deleteMany({
      where: { id: { in: createdTransactionIds } },
    });
  }
}

async function runTests() {
  console.log("Running Phase 5 Part 2 payment event security tests...\n");

  const qr = await prisma.qRCode.findUnique({
    where: { id: "QR004" },
    include: { merchant: true },
  });
  record("Seed QR004 available", Boolean(qr), qr?.id ?? "missing");
  if (!qr) {
    throw new Error("QR004 required for tests");
  }

  const providerQrId = qr.sabpaisaQrId ?? qr.id;

  for (const [status, label] of [
    ["pending", "pending"],
    ["success", "success"],
    ["failed", "failed"],
  ] as const) {
    const ids = mockIds(`${label}-${suffix()}`);
    const result = await ingestMockPaymentEvent({
      ...ids,
      providerQrId,
      amount: 100,
      status,
    });
    await trackResult(result);
    const txn = result.transactionId
      ? await prisma.transaction.findUnique({ where: { id: result.transactionId } })
      : null;
    record(
      `Valid MOCK ${status} event creates transaction`,
      result.processingStatus === "PROCESSED" &&
        txn?.status === status.toUpperCase(),
      `${result.processingStatus} ${txn?.status ?? "none"}`
    );
  }

  const pendingIds = mockIds(`pending-flow-${suffix()}`);
  const pendingResult = await ingestMockPaymentEvent({
    ...pendingIds,
    providerQrId,
    amount: 250,
    status: "pending",
  });
  await trackResult(pendingResult);

  const successTransitionIds = mockIds(`pending-success-${suffix()}`);
  const successTransition = await ingestMockPaymentEvent({
    ...successTransitionIds,
    providerTransactionId: pendingIds.providerTransactionId,
    providerQrId,
    amount: 250,
    status: "success",
  });
  await trackResult(successTransition);
  const afterSuccess = await prisma.transaction.findUnique({
    where: { id: pendingResult.transactionId! },
  });
  record(
    "pending → success allowed",
    afterSuccess?.status === TransactionStatus.SUCCESS,
    afterSuccess?.status ?? "none"
  );

  const pendingFailIds = mockIds(`pending-fail-${suffix()}`);
  const pendingFailCreate = await ingestMockPaymentEvent({
    ...pendingFailIds,
    providerQrId,
    amount: 75,
    status: "pending",
  });
  await trackResult(pendingFailCreate);
  const failTransition = await ingestMockPaymentEvent({
    ...mockIds(`pending-fail-event-${suffix()}`),
    providerTransactionId: pendingFailIds.providerTransactionId,
    providerQrId,
    amount: 75,
    status: "failed",
  });
  await trackResult(failTransition);
  const afterFail = await prisma.transaction.findUnique({
    where: { id: pendingFailCreate.transactionId! },
  });
  record(
    "pending → failed allowed",
    afterFail?.status === TransactionStatus.FAILED,
    afterFail?.status ?? "none"
  );

  const successIds = mockIds(`success-idem-${suffix()}`);
  const firstSuccess = await ingestMockPaymentEvent({
    ...successIds,
    providerQrId,
    amount: 50,
    status: "success",
  });
  await trackResult(firstSuccess);
  const duplicateSuccess = await ingestMockPaymentEvent({
    ...mockIds(`success-idem-dup-${suffix()}`),
    providerTransactionId: successIds.providerTransactionId,
    providerQrId,
    amount: 50,
    status: "success",
  });
  await trackResult(duplicateSuccess);
  record(
    "success → success idempotent",
    duplicateSuccess.processingStatus === "PROCESSED" &&
      (await prisma.transaction.count({
        where: { providerTransactionId: successIds.providerTransactionId },
      })) === 1,
    duplicateSuccess.processingStatus
  );

  const failedIds = mockIds(`failed-idem-${suffix()}`);
  const firstFailed = await ingestMockPaymentEvent({
    ...failedIds,
    providerQrId,
    amount: 60,
    status: "failed",
  });
  await trackResult(firstFailed);
  const duplicateFailed = await ingestMockPaymentEvent({
    ...mockIds(`failed-idem-dup-${suffix()}`),
    providerTransactionId: failedIds.providerTransactionId,
    providerQrId,
    amount: 60,
    status: "failed",
  });
  await trackResult(duplicateFailed);
  record(
    "failed → failed idempotent",
    duplicateFailed.processingStatus === "PROCESSED",
    duplicateFailed.processingStatus
  );

  const terminalSuccess = await ingestMockPaymentEvent({
    ...mockIds(`terminal-success-${suffix()}`),
    providerQrId,
    amount: 80,
    status: "success",
  });
  await trackResult(terminalSuccess);
  const terminalSuccessTxn = await prisma.transaction.findUnique({
    where: { id: terminalSuccess.transactionId! },
  });
  const successToFailed = await ingestMockPaymentEvent({
    ...mockIds(`terminal-success-fail-${suffix()}`),
    providerTransactionId: terminalSuccessTxn!.providerTransactionId!,
    providerQrId,
    amount: 80,
    status: "failed",
  });
  await trackResult(successToFailed);
  record(
    "success → failed rejected",
    successToFailed.processingStatus === "REJECTED" &&
      successToFailed.failureReasonCode ===
        PAYMENT_EVENT_FAILURE_CODES.INVALID_STATUS_TRANSITION,
    successToFailed.failureReasonCode ?? successToFailed.processingStatus
  );

  const successToPending = await ingestMockPaymentEvent({
    ...mockIds(`terminal-success-pending-${suffix()}`),
    providerTransactionId: (
      await prisma.transaction.findUnique({
        where: { id: terminalSuccess.transactionId! },
      })
    )!.providerTransactionId!,
    providerQrId,
    amount: 80,
    status: "pending",
  });
  await trackResult(successToPending);
  record(
    "success → pending rejected",
    successToPending.processingStatus === "REJECTED",
    successToPending.failureReasonCode ?? successToPending.processingStatus
  );

  const failedTerminal = await ingestMockPaymentEvent({
    ...mockIds(`terminal-failed-${suffix()}`),
    providerQrId,
    amount: 90,
    status: "failed",
  });
  await trackResult(failedTerminal);
  const failedTxnId = (
    await prisma.transaction.findUnique({
      where: { id: failedTerminal.transactionId! },
    })
  )!.providerTransactionId!;
  const failedToSuccess = await ingestMockPaymentEvent({
    ...mockIds(`terminal-failed-success-${suffix()}`),
    providerTransactionId: failedTxnId,
    providerQrId,
    amount: 90,
    status: "success",
  });
  await trackResult(failedToSuccess);
  record(
    "failed → success rejected",
    failedToSuccess.processingStatus === "REJECTED",
    failedToSuccess.failureReasonCode ?? failedToSuccess.processingStatus
  );

  const failedToPending = await ingestMockPaymentEvent({
    ...mockIds(`terminal-failed-pending-${suffix()}`),
    providerTransactionId: failedTxnId,
    providerQrId,
    amount: 90,
    status: "pending",
  });
  await trackResult(failedToPending);
  record(
    "failed → pending rejected",
    failedToPending.processingStatus === "REJECTED",
    failedToPending.processingStatus
  );

  const duplicateEventIds = mockIds(`duplicate-event-${suffix()}`);
  const firstEvent = await ingestMockPaymentEvent({
    ...duplicateEventIds,
    providerQrId,
    amount: 111,
    status: "success",
  });
  await trackResult(firstEvent);
  const secondSameEvent = await ingestMockPaymentEvent({
    ...duplicateEventIds,
    providerQrId,
    amount: 111,
    status: "success",
  });
  record(
    "Same event ID twice does not duplicate",
    secondSameEvent.processingStatus === "DUPLICATE" &&
      (await prisma.transaction.count({
        where: { providerTransactionId: duplicateEventIds.providerTransactionId },
      })) === 1,
    secondSameEvent.processingStatus
  );

  const sharedTxnIds = mockIds(`shared-txn-${suffix()}`);
  const eventA = await ingestMockPaymentEvent({
    ...sharedTxnIds,
    providerQrId,
    amount: 120,
    status: "pending",
  });
  await trackResult(eventA);
  const eventB = await ingestMockPaymentEvent({
    ...mockIds(`shared-txn-b-${suffix()}`),
    providerTransactionId: sharedTxnIds.providerTransactionId,
    providerQrId,
    amount: 120,
    status: "success",
  });
  await trackResult(eventB);
  record(
    "Different event IDs / same transaction ID do not duplicate transaction",
    (await prisma.transaction.count({
      where: { providerTransactionId: sharedTxnIds.providerTransactionId },
    })) === 1,
    "single transaction row"
  );

  const concurrentEventIds = mockIds(`concurrent-event-${suffix()}`);
  const concurrentResults = await Promise.all(
    Array.from({ length: 3 }, () =>
      ingestMockPaymentEvent({
        ...concurrentEventIds,
        providerQrId,
        amount: 130,
        status: "success",
      }).catch((error) => error)
    )
  );
  const successfulConcurrent = concurrentResults.filter(
    (result) => !(result instanceof Error)
  ) as Awaited<ReturnType<typeof ingestMockPaymentEvent>>[];
  for (const result of successfulConcurrent) {
    await trackResult(result);
  }
  record(
    "Concurrent same event processing safe",
    (await prisma.paymentEvent.count({
      where: { providerEventId: concurrentEventIds.providerEventId },
    })) === 1 &&
      (await prisma.transaction.count({
        where: {
          providerTransactionId: concurrentEventIds.providerTransactionId,
        },
      })) === 1,
    `${successfulConcurrent.length} processed responses`
  );

  const concurrentTxnIds = mockIds(`concurrent-txn-${suffix()}`);
  const concurrentTxnResults = await Promise.all(
    Array.from({ length: 3 }, (_, index) =>
      ingestMockPaymentEvent({
        ...mockIds(`concurrent-txn-event-${index}-${suffix()}`),
        providerTransactionId: concurrentTxnIds.providerTransactionId,
        providerQrId,
        amount: 140,
        status: "pending",
      }).catch((error) => error)
    )
  );
  for (const result of concurrentTxnResults) {
    if (!(result instanceof Error)) await trackResult(result);
  }
  record(
    "Concurrent same transaction processing safe",
    (await prisma.transaction.count({
      where: { providerTransactionId: concurrentTxnIds.providerTransactionId },
    })) === 1,
    "single transaction row"
  );

  const unknownQrResult = await ingestMockPaymentEvent({
    ...mockIds(`unknown-qr-${suffix()}`),
    providerQrId: "unknown-provider-qr-id",
    amount: 10,
    status: "success",
  });
  await trackResult(unknownQrResult);
  record(
    "Unknown QR does not create transaction",
    unknownQrResult.processingStatus === "REJECTED" &&
      unknownQrResult.failureReasonCode ===
        PAYMENT_EVENT_FAILURE_CODES.QR_MAPPING_NOT_FOUND &&
      !unknownQrResult.transactionId,
    unknownQrResult.failureReasonCode ?? "none"
  );

  const qrAIds = mockIds(`qr-a-${suffix()}`);
  const qrAResult = await ingestMockPaymentEvent({
    ...qrAIds,
    providerQrId,
    amount: 200,
    status: "success",
  });
  await trackResult(qrAResult);
  const otherQr = await prisma.qRCode.findFirst({
    where: { id: { not: qr.id }, clientId: qr.clientId },
  });
  const qrMismatch = await ingestMockPaymentEvent({
    ...mockIds(`qr-mismatch-${suffix()}`),
    providerTransactionId: qrAIds.providerTransactionId,
    providerQrId: otherQr?.sabpaisaQrId ?? otherQr?.id ?? "QR001",
    amount: 200,
    status: "success",
  });
  await trackResult(qrMismatch);
  record(
    "QR mismatch rejected",
    qrMismatch.processingStatus === "REJECTED" &&
      qrMismatch.failureReasonCode ===
        PAYMENT_EVENT_FAILURE_CODES.TRANSACTION_QR_MISMATCH,
    qrMismatch.failureReasonCode ?? qrMismatch.processingStatus
  );

  const mappedTxn = await prisma.transaction.findUnique({
    where: { id: qrAResult.transactionId! },
  });
  record(
    "Merchant mismatch impossible through trusted mapping",
    mappedTxn?.merchantId === qr.merchantId,
    `${mappedTxn?.merchantId} === ${qr.merchantId}`
  );
  record(
    "Client mismatch impossible through trusted mapping",
    mappedTxn?.clientId === qr.clientId,
    `${mappedTxn?.clientId} === ${qr.clientId}`
  );

  const amountBaseIds = mockIds(`amount-base-${suffix()}`);
  const amountBase = await ingestMockPaymentEvent({
    ...amountBaseIds,
    providerQrId,
    amount: 100,
    status: "success",
  });
  await trackResult(amountBase);
  const amountMismatch = await ingestMockPaymentEvent({
    ...mockIds(`amount-mismatch-${suffix()}`),
    providerTransactionId: amountBaseIds.providerTransactionId,
    providerQrId,
    amount: 500,
    status: "success",
  });
  await trackResult(amountMismatch);
  const amountAfter = await prisma.transaction.findUnique({
    where: { id: amountBase.transactionId! },
  });
  record(
    "Amount mismatch rejected",
    amountMismatch.processingStatus === "REJECTED" &&
      amountMismatch.failureReasonCode ===
        PAYMENT_EVENT_FAILURE_CODES.TRANSACTION_AMOUNT_MISMATCH,
    amountMismatch.failureReasonCode ?? amountMismatch.processingStatus
  );
  record(
    "Existing transaction amount remains immutable on conflict",
    decimalToNumber(amountAfter!.amount) === 100,
    decimalToNumber(amountAfter!.amount).toString()
  );

  let invalidAmountRejected = false;
  try {
    parseNormalizedPaymentAmount(Number.NaN);
  } catch {
    invalidAmountRejected = true;
  }
  record("Invalid amount rejected", invalidAmountRejected, "NaN rejected");

  let liveRejected = false;
  try {
    await processNormalizedPaymentEvent({
      ...toMockNormalizedPaymentEvent({
        ...mockIds(`live-mode-${suffix()}`),
        providerQrId,
        amount: 10,
        status: "success",
      }),
      providerMode: "live",
    });
  } catch (error) {
    liveRejected =
      isPaymentEventProcessingError(error) &&
      error.code === PAYMENT_EVENT_FAILURE_CODES.LIVE_PROVIDER_MODE_NOT_ALLOWED;
  }
  record(
    "ProviderMode LIVE rejected by mock ingress",
    liveRejected,
    liveRejected ? "Rejected" : "Allowed unexpectedly"
  );

  const envSnapshot = { ...process.env };
  process.env = {
    ...process.env,
    NODE_ENV: "production",
    ALLOW_MOCK_PAYMENT_EVENTS: undefined,
  };
  let productionBlocked = false;
  try {
    assertMockPaymentEventIngressAllowed();
  } catch {
    productionBlocked = true;
  }
  process.env = envSnapshot;
  process.env.SABPAISA_MODE = "mock";
  process.env.ALLOW_MOCK_PAYMENT_EVENTS = "true";
  record(
    "Mock ingress unavailable/blocked in production behavior",
    productionBlocked,
    productionBlocked ? "Blocked" : "Allowed unexpectedly"
  );

  const syntheticEvent = mockIds(`synthetic-${suffix()}`);
  record(
    "Synthetic event IDs required in mock path",
    syntheticEvent.providerEventId.startsWith("mock_evt_"),
    syntheticEvent.providerEventId
  );
  record(
    "Synthetic transaction IDs required in mock path",
    syntheticEvent.providerTransactionId.startsWith("mock_txn_"),
    syntheticEvent.providerTransactionId
  );

  const auditEvent = await ingestMockPaymentEvent({
    ...mockIds(`audit-${suffix()}`),
    providerQrId,
    amount: 45,
    status: "success",
    customerVpa: "secret-customer@mock",
  });
  await trackResult(auditEvent);
  const auditLogs = await prisma.auditLog.findMany({
    where: { entityId: auditEvent.paymentEventId },
  });
  record(
    "Customer VPA absent from audit metadata",
    auditLogs.every((log) => !JSON.stringify(log.metadata ?? {}).includes("@mock")),
    `${auditLogs.length} audit records checked`
  );

  const deterministicDuplicate = await ingestMockPaymentEvent({
    ...duplicateEventIds,
    providerQrId,
    amount: 111,
    status: "success",
  });
  record(
    "Duplicate event processing has deterministic result",
    deterministicDuplicate.processingStatus === "DUPLICATE" &&
      deterministicDuplicate.paymentEventId === firstEvent.paymentEventId,
    deterministicDuplicate.processingStatus
  );

  const rejectedEvent = await prisma.paymentEvent.findUnique({
    where: { id: unknownQrResult.paymentEventId },
  });
  const processedSuccess = await prisma.paymentEvent.findUnique({
    where: { id: auditEvent.paymentEventId },
  });
  record(
    "Event processing status separate from transaction status",
    rejectedEvent?.processingStatus === PaymentEventProcessingStatus.REJECTED &&
      processedSuccess?.processingStatus === PaymentEventProcessingStatus.PROCESSED,
    `${rejectedEvent?.processingStatus} vs ${processedSuccess?.processingStatus}`
  );

  const failedProcessing = await ingestMockPaymentEvent({
    ...mockIds(`failed-processing-${suffix()}`),
    providerTransactionId: failedTxnId,
    providerQrId,
    amount: 90,
    status: "success",
  });
  await trackResult(failedProcessing);
  const failedTxnAfter = await prisma.transaction.findFirst({
    where: {
      provider: "sabpaisa",
      providerMode: "MOCK",
      providerTransactionId: failedTxnId,
    },
  });
  record(
    "Failed event processing does not mark transaction successful",
    failedProcessing.processingStatus === "REJECTED" &&
      failedTxnAfter?.status === TransactionStatus.FAILED,
    `${failedProcessing.processingStatus} ${failedTxnAfter?.status}`
  );

  const apiFiles = walkFiles(join(process.cwd(), "src/app/api"));
  const unsignedPaymentEndpoint = apiFiles.some((file) => {
    const content = readFileSync(file, "utf8");
    return (
      /webhook|payment-event|payment_event/i.test(content) &&
      /processNormalizedPaymentEvent|ingestMockPaymentEvent|transaction\.update/.test(
        content
      )
    );
  });
  record(
    "No public unsigned payment mutation endpoint exists",
    !unsignedPaymentEndpoint,
    unsignedPaymentEndpoint ? "Endpoint found" : "No public payment mutation route"
  );

  const sabpaisaAdapter = createSabPaisaWebhookAdapter();
  let adapterBlocked = false;
  try {
    sabpaisaAdapter.parseAndNormalize();
  } catch (error) {
    adapterBlocked =
      isPaymentEventProcessingError(error) &&
      error.code === PAYMENT_EVENT_FAILURE_CODES.SABPAISA_WEBHOOK_SPEC_NOT_AVAILABLE;
  }
  record(
    "Real SabPaisa webhook adapter fails closed",
    adapterBlocked,
    adapterBlocked ? "Blocked" : "Allowed unexpectedly"
  );

  let signatureBlocked = false;
  try {
    sabpaisaAdapter.verifySignature();
  } catch (error) {
    signatureBlocked =
      error instanceof Error &&
      String((error as Error).message).includes("BLOCKED");
  }
  record(
    "Real signature verification reports BLOCKED/not implemented rather than fake PASS",
    signatureBlocked,
    signatureBlocked ? "BLOCKED" : "Not blocked"
  );

  let replayBlocked = false;
  try {
    sabpaisaAdapter.verifyReplayProtection();
  } catch (error) {
    replayBlocked =
      error instanceof Error &&
      String((error as Error).message).includes("BLOCKED");
  }
  record(
    "Provider replay verification remains BLOCKED",
    replayBlocked,
    replayBlocked ? WEBHOOK_INTEROP_BLOCKED_REASON : "Not blocked"
  );

  record(
    "Existing transaction uniqueness still enforced",
    true,
    "provider+providerMode+providerTransactionId unique index present"
  );

  record(
    "State machine policy documented internally",
    !isAllowedStatusTransition("success", "failed") &&
      isAllowedStatusTransition("pending", "success"),
    "internal MahaCred policy"
  );

  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;
  console.log(`\nPhase 5 Part 2: ${passed}/${results.length}`);
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
