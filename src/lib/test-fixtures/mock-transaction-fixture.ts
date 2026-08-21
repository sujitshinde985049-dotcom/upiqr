/**
 * Development/test-only mock transaction fixture helper.
 * NOT a production payment endpoint.
 */
import { randomBytes } from "node:crypto";
import {
  QRProviderMode,
  TransactionStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { createAuditLog } from "@/lib/audit/audit-log";
import { generateEntityId } from "@/lib/utils/id-generator";
import {
  assertTransactionRelationshipIntegrity,
  TransactionServiceError,
} from "@/lib/services/transaction-service";
import {
  mockTransactionCreateSchema,
  type MockTransactionCreateInput,
} from "@/lib/validations/transactions";

export function assertMockTransactionFixtureAllowed(): void {
  const allowed =
    process.env.ALLOW_MOCK_TRANSACTION_FIXTURES === "true" ||
    process.env.NODE_ENV !== "production";
  if (!allowed) {
    throw new TransactionServiceError(
      "Mock transaction fixtures are disabled",
      "FIXTURE_DISABLED"
    );
  }
}

function toPrismaStatus(status: MockTransactionCreateInput["status"]): TransactionStatus {
  return status.toUpperCase() as TransactionStatus;
}

function syntheticReference(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function createMockTestTransaction(
  input: MockTransactionCreateInput,
  options?: { actorUserId?: string | null }
) {
  assertMockTransactionFixtureAllowed();
  const parsed = mockTransactionCreateSchema.parse(input);

  const qr = await prisma.qRCode.findUnique({
    where: { id: parsed.qrId },
    include: { merchant: true },
  });
  if (!qr) {
    throw new TransactionServiceError("QR code not found", "NOT_FOUND");
  }

  const clientId = qr.clientId;
  const merchantId = qr.merchantId;
  assertTransactionRelationshipIntegrity({
    clientId,
    merchantId,
    qrId: qr.id,
    qrClientId: qr.clientId,
    qrMerchantId: qr.merchantId,
    merchantClientId: qr.merchant.clientId,
  });

  const now = new Date();
  const providerTransactionId = `mock_txn_${randomBytes(8).toString("hex")}`;
  const amount = new Prisma.Decimal(parsed.amount.toFixed(2));
  const status = toPrismaStatus(parsed.status);
  const completedAt =
    status === TransactionStatus.PENDING ? null : new Date(now.getTime() + 1000);

  const transaction = await prisma.transaction.create({
    data: {
      id: generateEntityId("TXN"),
      clientId,
      merchantId,
      qrId: qr.id,
      transactionId: `MC-TXN-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(2).toString("hex").toUpperCase()}`,
      provider: "sabpaisa",
      providerMode: QRProviderMode.MOCK,
      providerTransactionId,
      amount,
      status,
      railId: qr.railId,
      customerVpa: "test-customer@mock",
      customerName: "Test Customer",
      referenceNumber: syntheticReference("MOCK-REF"),
      bankReferenceNumber: syntheticReference("MOCK-BANK"),
      paymentMethod: "UPI",
      initiatedAt: now,
      completedAt,
    },
  });

  await createAuditLog({
    userId: options?.actorUserId ?? null,
    clientId,
    action: "TRANSACTION_FIXTURE_CREATED",
    entityType: "Transaction",
    entityId: transaction.id,
    metadata: {
      merchantId,
      qrId: qr.id,
      providerMode: "MOCK",
      status: parsed.status,
    },
  });

  return transaction;
}
