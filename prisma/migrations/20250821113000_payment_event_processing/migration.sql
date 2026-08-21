-- Phase 5 Part 2: Payment event idempotency and processing records
CREATE TYPE "PaymentEventProcessingStatus" AS ENUM (
  'RECEIVED',
  'PROCESSED',
  'DUPLICATE',
  'REJECTED',
  'FAILED'
);

CREATE TABLE "PaymentEvent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'sabpaisa',
  "providerMode" "QRProviderMode" NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "providerTransactionId" TEXT,
  "eventType" TEXT,
  "processingStatus" "PaymentEventProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
  "transactionId" TEXT,
  "qrId" TEXT,
  "clientId" TEXT,
  "merchantId" TEXT,
  "failureReasonCode" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentEvent_provider_providerMode_providerEventId_key"
ON "PaymentEvent"("provider", "providerMode", "providerEventId");

CREATE INDEX "PaymentEvent_providerTransactionId_idx"
ON "PaymentEvent"("providerTransactionId");

CREATE INDEX "PaymentEvent_transactionId_idx"
ON "PaymentEvent"("transactionId");

CREATE INDEX "PaymentEvent_processingStatus_idx"
ON "PaymentEvent"("processingStatus");

CREATE INDEX "PaymentEvent_receivedAt_idx"
ON "PaymentEvent"("receivedAt");

ALTER TABLE "PaymentEvent"
ADD CONSTRAINT "PaymentEvent_transactionId_fkey"
FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
