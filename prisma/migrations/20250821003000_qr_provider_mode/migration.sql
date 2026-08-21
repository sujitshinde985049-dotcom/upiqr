-- CreateEnum
CREATE TYPE "QRProviderMode" AS ENUM ('MOCK', 'LIVE', 'LEGACY');

-- AlterTable
ALTER TABLE "QRCode" ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'sabpaisa',
ADD COLUMN     "providerMode" "QRProviderMode" NOT NULL DEFAULT 'LEGACY',
ADD COLUMN     "upiString" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "isPayable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "providerCreatedAt" TIMESTAMP(3),
ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "QRCode_idempotencyKey_key" ON "QRCode"("idempotencyKey");
