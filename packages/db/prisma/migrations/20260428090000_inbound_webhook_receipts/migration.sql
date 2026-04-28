CREATE TYPE "InboundWebhookReceiptStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

CREATE TABLE "InboundWebhookReceipt" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "eventType" TEXT,
  "status" "InboundWebhookReceiptStatus" NOT NULL DEFAULT 'PENDING',
  "processingStartedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InboundWebhookReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InboundWebhookReceipt_provider_messageId_key"
  ON "InboundWebhookReceipt"("provider", "messageId");

CREATE INDEX "InboundWebhookReceipt_provider_status_createdAt_idx"
  ON "InboundWebhookReceipt"("provider", "status", "createdAt");
