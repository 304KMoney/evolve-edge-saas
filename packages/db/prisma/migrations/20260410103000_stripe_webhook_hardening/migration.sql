CREATE TYPE "BillingEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

ALTER TABLE "Subscription"
ADD COLUMN "latestInvoiceId" TEXT,
ADD COLUMN "latestInvoiceStatus" TEXT,
ADD COLUMN "lastInvoicePaidAt" TIMESTAMP(3),
ADD COLUMN "lastPaymentFailedAt" TIMESTAMP(3),
ADD COLUMN "lastPaymentFailureMessage" TEXT;

ALTER TABLE "BillingEvent"
ADD COLUMN "status" "BillingEventStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "processingStartedAt" TIMESTAMP(3),
ADD COLUMN "failedAt" TIMESTAMP(3),
ADD COLUMN "lastError" TEXT;

UPDATE "BillingEvent"
SET "status" = CASE
  WHEN "processedAt" IS NOT NULL THEN 'PROCESSED'::"BillingEventStatus"
  ELSE 'PENDING'::"BillingEventStatus"
END;

CREATE INDEX "BillingEvent_status_createdAt_idx" ON "BillingEvent"("status", "createdAt");
