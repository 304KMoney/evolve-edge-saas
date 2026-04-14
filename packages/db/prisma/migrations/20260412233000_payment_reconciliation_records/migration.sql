CREATE TYPE "PaymentReconciliationStatus" AS ENUM (
  'VERIFIED',
  'PAYMENT_CONFIRMED',
  'BINDING_PENDING',
  'BINDING_RECONCILED',
  'RECONCILIATION_FAILED'
);

CREATE TABLE "PaymentReconciliationRecord" (
  "id" TEXT NOT NULL,
  "billingEventId" TEXT,
  "stripeEventId" TEXT NOT NULL,
  "stripeEventType" TEXT NOT NULL,
  "checkoutSessionId" TEXT,
  "stripePaymentReference" TEXT,
  "customerEmail" TEXT,
  "selectedPlan" "CommercialPlanCode",
  "reconciliationStatus" "PaymentReconciliationStatus" NOT NULL DEFAULT 'VERIFIED',
  "correlationId" TEXT,
  "organizationId" TEXT,
  "customerAccountId" TEXT,
  "reportId" TEXT,
  "metadata" JSONB,
  "lastError" TEXT,
  "reconciledAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PaymentReconciliationRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentReconciliationRecord_billingEventId_key"
  ON "PaymentReconciliationRecord"("billingEventId");

CREATE UNIQUE INDEX "PaymentReconciliationRecord_stripeEventId_key"
  ON "PaymentReconciliationRecord"("stripeEventId");

CREATE INDEX "PaymentReconciliationRecord_reconciliationStatus_createdAt_idx"
  ON "PaymentReconciliationRecord"("reconciliationStatus", "createdAt");

CREATE INDEX "PaymentReconciliationRecord_checkoutSessionId_createdAt_idx"
  ON "PaymentReconciliationRecord"("checkoutSessionId", "createdAt");

CREATE INDEX "PaymentReconciliationRecord_stripePaymentReference_createdAt_idx"
  ON "PaymentReconciliationRecord"("stripePaymentReference", "createdAt");

CREATE INDEX "PaymentReconciliationRecord_organizationId_createdAt_idx"
  ON "PaymentReconciliationRecord"("organizationId", "createdAt");

CREATE INDEX "PaymentReconciliationRecord_customerEmail_createdAt_idx"
  ON "PaymentReconciliationRecord"("customerEmail", "createdAt");

CREATE INDEX "PaymentReconciliationRecord_customerAccountId_createdAt_idx"
  ON "PaymentReconciliationRecord"("customerAccountId", "createdAt");

CREATE INDEX "PaymentReconciliationRecord_correlationId_createdAt_idx"
  ON "PaymentReconciliationRecord"("correlationId", "createdAt");

ALTER TABLE "PaymentReconciliationRecord"
  ADD CONSTRAINT "PaymentReconciliationRecord_billingEventId_fkey"
  FOREIGN KEY ("billingEventId") REFERENCES "BillingEvent"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentReconciliationRecord"
  ADD CONSTRAINT "PaymentReconciliationRecord_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentReconciliationRecord"
  ADD CONSTRAINT "PaymentReconciliationRecord_customerAccountId_fkey"
  FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentReconciliationRecord"
  ADD CONSTRAINT "PaymentReconciliationRecord_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "Report"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
