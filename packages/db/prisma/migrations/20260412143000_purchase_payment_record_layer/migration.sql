ALTER TABLE "BillingEventLog"
  ADD COLUMN "planCodeSnapshot" TEXT,
  ADD COLUMN "stripeEventId" TEXT,
  ADD COLUMN "stripeCheckoutSessionId" TEXT,
  ADD COLUMN "stripePaymentIntentId" TEXT,
  ADD COLUMN "amountCents" INTEGER,
  ADD COLUMN "currency" TEXT;

CREATE INDEX "BillingEventLog_planCodeSnapshot_occurredAt_idx"
  ON "BillingEventLog"("planCodeSnapshot", "occurredAt");

CREATE INDEX "BillingEventLog_stripeEventId_idx"
  ON "BillingEventLog"("stripeEventId");

CREATE INDEX "BillingEventLog_stripeCheckoutSessionId_idx"
  ON "BillingEventLog"("stripeCheckoutSessionId");

CREATE INDEX "BillingEventLog_stripePaymentIntentId_idx"
  ON "BillingEventLog"("stripePaymentIntentId");
