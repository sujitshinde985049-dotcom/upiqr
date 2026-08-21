-- Phase 5 Part 1: Transaction provider mapping fields
ALTER TABLE "Transaction" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'sabpaisa';
ALTER TABLE "Transaction" ADD COLUMN "providerMode" "QRProviderMode" NOT NULL DEFAULT 'LEGACY';
ALTER TABLE "Transaction" ADD COLUMN "providerTransactionId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "referenceNumber" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "railId" "PaymentRail";

CREATE UNIQUE INDEX "Transaction_provider_providerMode_providerTransactionId_key"
ON "Transaction"("provider", "providerMode", "providerTransactionId");
