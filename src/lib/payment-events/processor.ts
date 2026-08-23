import { randomBytes } from "node:crypto";
import {
  PaymentEventProcessingStatus,
  PaymentRail,
  QRProviderMode,
  TransactionStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { createAuditLog } from "@/lib/audit/audit-log";
import { toUiTransactionStatus } from "@/lib/mappers";
import { generateEntityId } from "@/lib/utils/id-generator";
import { PaymentEventProcessingError } from "./errors";
import { createPaymentNotificationSafely } from "@/lib/services/notification-service";
import { isAllowedStatusTransition } from "./state-machine";
import {
  normalizedPaymentEventSchema,
  PAYMENT_EVENT_FAILURE_CODES,
  type NormalizedPaymentEvent,
  type NormalizedPaymentStatus,
  type PaymentEventProcessingResult,
} from "./types";

const TRANSACTION_TIMEOUT_MS = 20000;

type DbClient = Prisma.TransactionClient;

function toPrismaStatus(status: NormalizedPaymentStatus): TransactionStatus {
  return status.toUpperCase() as TransactionStatus;
}

function toTransactionState(
  status: TransactionStatus | null | undefined
): NormalizedPaymentStatus | "new" {
  if (!status) return "new";
  return toUiTransactionStatus(status);
}

export function parseNormalizedPaymentAmount(amount: number): Prisma.Decimal {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new PaymentEventProcessingError(
      "Payment amount must be a positive finite number",
      PAYMENT_EVENT_FAILURE_CODES.INVALID_AMOUNT
    );
  }

  const amountString = String(amount);
  const [, fraction = ""] = amountString.split(".");
  if (fraction.length > 2) {
    throw new PaymentEventProcessingError(
      "Payment amount must have at most two decimal places",
      PAYMENT_EVENT_FAILURE_CODES.INVALID_AMOUNT
    );
  }

  const decimal = new Prisma.Decimal(amount.toFixed(2));
  if (decimal.lte(0)) {
    throw new PaymentEventProcessingError(
      "Payment amount must be greater than zero",
      PAYMENT_EVENT_FAILURE_CODES.INVALID_AMOUNT
    );
  }

  return decimal;
}

function amountsEqual(left: Prisma.Decimal, right: Prisma.Decimal): boolean {
  return left.toFixed(2) === right.toFixed(2);
}

function toProviderMode(
  mode: NormalizedPaymentEvent["providerMode"]
): QRProviderMode {
  return mode.toUpperCase() as QRProviderMode;
}

async function resolveQrFromProviderId(
  tx: DbClient,
  providerQrId: string
) {
  const bySabpaisaId = await tx.qRCode.findFirst({
    where: { sabpaisaQrId: providerQrId },
    include: { merchant: true },
  });
  if (bySabpaisaId) return bySabpaisaId;

  return tx.qRCode.findUnique({
    where: { id: providerQrId },
    include: { merchant: true },
  });
}

function buildMcTransactionId(): string {
  const now = new Date();
  return `MC-TXN-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(2).toString("hex").toUpperCase()}`;
}

async function writeAudit(
  action: "PAYMENT_EVENT_PROCESSED" | "PAYMENT_EVENT_REJECTED",
  metadata: Prisma.InputJsonValue
) {
  await createAuditLog({
    action,
    entityType: "PaymentEvent",
    entityId: String((metadata as Record<string, unknown>).paymentEventId ?? ""),
    clientId: ((metadata as Record<string, unknown>).clientId as string | undefined) ?? null,
    metadata,
  });
}

function duplicateResult(
  paymentEventId: string,
  transactionId?: string | null,
  transactionStatus?: TransactionStatus | null
): PaymentEventProcessingResult {
  return {
    processingStatus: "DUPLICATE",
    paymentEventId,
    transactionId: transactionId ?? undefined,
    transactionStatus: transactionStatus
      ? toUiTransactionStatus(transactionStatus)
      : undefined,
    duplicate: true,
  };
}

async function rejectEvent(
  tx: DbClient,
  paymentEventId: string,
  failureReasonCode: string,
  context: {
    providerMode: NormalizedPaymentEvent["providerMode"];
    qrId?: string;
    clientId?: string;
    merchantId?: string;
    transactionId?: string;
    paymentStatus?: NormalizedPaymentStatus;
  }
): Promise<PaymentEventProcessingResult> {
  const rejected = await tx.paymentEvent.update({
    where: { id: paymentEventId },
    data: {
      processingStatus: PaymentEventProcessingStatus.REJECTED,
      failureReasonCode,
      qrId: context.qrId,
      clientId: context.clientId,
      merchantId: context.merchantId,
      transactionId: context.transactionId,
      processedAt: new Date(),
    },
  });

  await writeAudit("PAYMENT_EVENT_REJECTED", {
    paymentEventId: rejected.id,
    providerMode: context.providerMode,
    transactionId: context.transactionId,
    qrId: context.qrId,
    merchantId: context.merchantId,
    clientId: context.clientId,
    paymentStatus: context.paymentStatus,
    processingResult: PaymentEventProcessingStatus.REJECTED,
    failureReasonCode,
  });

  return {
    processingStatus: "REJECTED",
    paymentEventId: rejected.id,
    transactionId: context.transactionId,
    failureReasonCode,
  };
}

export async function processNormalizedPaymentEvent(
  rawEvent: NormalizedPaymentEvent
): Promise<PaymentEventProcessingResult> {
  const event = normalizedPaymentEventSchema.parse(rawEvent);
  const amount = parseNormalizedPaymentAmount(event.amount);
  const providerMode = toProviderMode(event.providerMode);

  if (
    event.providerEventId.startsWith("mock_evt_") &&
    providerMode !== QRProviderMode.MOCK
  ) {
    throw new PaymentEventProcessingError(
      "Synthetic mock events cannot use live provider mode",
      PAYMENT_EVENT_FAILURE_CODES.LIVE_PROVIDER_MODE_NOT_ALLOWED
    );
  }

  const prismaStatus = toPrismaStatus(event.status);
  const receivedAt = event.receivedAt ?? new Date();
  const completedAt =
    prismaStatus === TransactionStatus.PENDING
      ? null
      : event.completedAt ?? new Date();

  try {
    const result: PaymentEventProcessingResult = await prisma.$transaction(
      async (tx) => {
        const existingEvent = await tx.paymentEvent.findUnique({
          where: {
            provider_providerMode_providerEventId: {
              provider: event.provider,
              providerMode,
              providerEventId: event.providerEventId,
            },
          },
        });

        if (existingEvent) {
          return duplicateResult(
            existingEvent.id,
            existingEvent.transactionId,
            existingEvent.eventType
              ? toPrismaStatus(existingEvent.eventType as NormalizedPaymentStatus)
              : null
          );
        }

        const paymentEvent = await tx.paymentEvent.create({
          data: {
            id: generateEntityId("PEV"),
            provider: event.provider,
            providerMode,
            providerEventId: event.providerEventId,
            providerTransactionId: event.providerTransactionId,
            eventType: event.status,
            processingStatus: PaymentEventProcessingStatus.RECEIVED,
            receivedAt,
          },
        });

        const qr = await resolveQrFromProviderId(tx, event.providerQrId);
        if (!qr) {
          return rejectEvent(
            tx,
            paymentEvent.id,
            PAYMENT_EVENT_FAILURE_CODES.QR_MAPPING_NOT_FOUND,
            { providerMode: event.providerMode }
          );
        }

        const clientId = qr.clientId;
        const merchantId = qr.merchantId;
        const railId = (event.railId ?? qr.railId) as PaymentRail;

        const existingTransaction = await tx.transaction.findUnique({
          where: {
            provider_providerMode_providerTransactionId: {
              provider: event.provider,
              providerMode,
              providerTransactionId: event.providerTransactionId,
            },
          },
        });

        if (existingTransaction) {
          if (existingTransaction.qrId !== qr.id) {
            return rejectEvent(
              tx,
              paymentEvent.id,
              PAYMENT_EVENT_FAILURE_CODES.TRANSACTION_QR_MISMATCH,
              {
                providerMode: event.providerMode,
                qrId: qr.id,
                clientId,
                merchantId,
                transactionId: existingTransaction.id,
                paymentStatus: event.status,
              }
            );
          }

          if (!amountsEqual(existingTransaction.amount, amount)) {
            return rejectEvent(
              tx,
              paymentEvent.id,
              PAYMENT_EVENT_FAILURE_CODES.TRANSACTION_AMOUNT_MISMATCH,
              {
                providerMode: event.providerMode,
                qrId: qr.id,
                clientId,
                merchantId,
                transactionId: existingTransaction.id,
                paymentStatus: event.status,
              }
            );
          }

          const currentState = toTransactionState(existingTransaction.status);
          if (!isAllowedStatusTransition(currentState, event.status)) {
            return rejectEvent(
              tx,
              paymentEvent.id,
              PAYMENT_EVENT_FAILURE_CODES.INVALID_STATUS_TRANSITION,
              {
                providerMode: event.providerMode,
                qrId: qr.id,
                clientId,
                merchantId,
                transactionId: existingTransaction.id,
                paymentStatus: event.status,
              }
            );
          }

          const nextStatus = toPrismaStatus(event.status);
          const updatedTransaction =
            currentState === event.status
              ? existingTransaction
              : await tx.transaction.update({
                  where: { id: existingTransaction.id },
                  data: {
                    status: nextStatus,
                    completedAt:
                      nextStatus === TransactionStatus.PENDING
                        ? null
                        : completedAt,
                    referenceNumber:
                      event.referenceNumber ?? existingTransaction.referenceNumber,
                    bankReferenceNumber:
                      event.bankReferenceNumber ??
                      existingTransaction.bankReferenceNumber,
                    paymentMethod:
                      event.paymentMethod ?? existingTransaction.paymentMethod,
                  },
                });

          const processed = await tx.paymentEvent.update({
            where: { id: paymentEvent.id },
            data: {
              processingStatus: PaymentEventProcessingStatus.PROCESSED,
              transactionId: updatedTransaction.id,
              qrId: qr.id,
              clientId,
              merchantId,
              eventType: event.status,
              processedAt: new Date(),
            },
          });

          await writeAudit("PAYMENT_EVENT_PROCESSED", {
            paymentEventId: processed.id,
            providerMode: event.providerMode,
            transactionId: updatedTransaction.id,
            qrId: qr.id,
            merchantId,
            clientId,
            paymentStatus: event.status,
            processingResult: PaymentEventProcessingStatus.PROCESSED,
          });

          return {
            processingStatus: "PROCESSED",
            paymentEventId: processed.id,
            transactionId: updatedTransaction.id,
            transactionStatus: toUiTransactionStatus(updatedTransaction.status),
          };
        }

        const createdTransaction = await tx.transaction.create({
          data: {
            id: generateEntityId("TXN"),
            clientId,
            merchantId,
            qrId: qr.id,
            transactionId: buildMcTransactionId(),
            provider: event.provider,
            providerMode,
            providerTransactionId: event.providerTransactionId,
            amount,
            status: prismaStatus,
            railId,
            customerVpa: event.customerVpa ?? "test-customer@mock",
            customerName: event.customerName ?? "Test Customer",
            referenceNumber: event.referenceNumber ?? undefined,
            bankReferenceNumber: event.bankReferenceNumber ?? undefined,
            paymentMethod: event.paymentMethod ?? "UPI",
            initiatedAt: event.initiatedAt,
            completedAt,
          },
        });

        const processed = await tx.paymentEvent.update({
          where: { id: paymentEvent.id },
          data: {
            processingStatus: PaymentEventProcessingStatus.PROCESSED,
            transactionId: createdTransaction.id,
            qrId: qr.id,
            clientId,
            merchantId,
            eventType: event.status,
            processedAt: new Date(),
          },
        });

        await writeAudit("PAYMENT_EVENT_PROCESSED", {
          paymentEventId: processed.id,
          providerMode: event.providerMode,
          transactionId: createdTransaction.id,
          qrId: qr.id,
          merchantId,
          clientId,
          paymentStatus: event.status,
          processingResult: PaymentEventProcessingStatus.PROCESSED,
        });

        return {
          processingStatus: "PROCESSED",
          paymentEventId: processed.id,
          transactionId: createdTransaction.id,
          transactionStatus: toUiTransactionStatus(createdTransaction.status),
        };
      },
      { timeout: TRANSACTION_TIMEOUT_MS }
    );

    if (
      result.processingStatus === "PROCESSED" &&
      result.paymentEventId &&
      result.transactionId
    ) {
      await createPaymentNotificationSafely(
        result.paymentEventId,
        result.transactionId
      );
    }

    return result;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const duplicate = await prisma.paymentEvent.findUnique({
        where: {
          provider_providerMode_providerEventId: {
            provider: event.provider,
            providerMode,
            providerEventId: event.providerEventId,
          },
        },
      });
      if (duplicate) {
        return duplicateResult(
          duplicate.id,
          duplicate.transactionId,
          duplicate.eventType
            ? toPrismaStatus(duplicate.eventType as NormalizedPaymentStatus)
            : null
        );
      }
    }

    if (error instanceof PaymentEventProcessingError) {
      throw error;
    }
    throw error;
  }
}
