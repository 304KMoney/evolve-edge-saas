ALTER TABLE "RoutingSnapshot"
  ADD COLUMN "billingEventId" TEXT;

CREATE INDEX "RoutingSnapshot_billingEventId_createdAt_idx"
  ON "RoutingSnapshot"("billingEventId", "createdAt");

ALTER TABLE "RoutingSnapshot"
  ADD CONSTRAINT "RoutingSnapshot_billingEventId_fkey"
  FOREIGN KEY ("billingEventId") REFERENCES "BillingEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
