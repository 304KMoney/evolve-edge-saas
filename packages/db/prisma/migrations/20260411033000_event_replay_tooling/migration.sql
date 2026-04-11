DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EventReplayTargetType') THEN
    CREATE TYPE "EventReplayTargetType" AS ENUM ('BILLING_EVENT', 'DOMAIN_EVENT', 'WEBHOOK_DELIVERY');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EventReplayAttemptStatus') THEN
    CREATE TYPE "EventReplayAttemptStatus" AS ENUM ('REQUESTED', 'SUCCEEDED', 'FAILED', 'BLOCKED');
  END IF;
END $$;

CREATE TABLE "EventReplayAttempt" (
  "id" TEXT NOT NULL,
  "targetType" "EventReplayTargetType" NOT NULL,
  "targetId" TEXT NOT NULL,
  "organizationId" TEXT,
  "billingEventId" TEXT,
  "domainEventId" TEXT,
  "webhookDeliveryId" TEXT,
  "requestedByUserId" TEXT,
  "requestedByEmail" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "notes" TEXT,
  "correlationId" TEXT NOT NULL,
  "status" "EventReplayAttemptStatus" NOT NULL DEFAULT 'REQUESTED',
  "failureCode" TEXT,
  "failureReason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "EventReplayAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventReplayAttempt_correlationId_key" ON "EventReplayAttempt"("correlationId");
CREATE INDEX "EventReplayAttempt_targetType_targetId_createdAt_idx" ON "EventReplayAttempt"("targetType", "targetId", "createdAt");
CREATE INDEX "EventReplayAttempt_organizationId_createdAt_idx" ON "EventReplayAttempt"("organizationId", "createdAt");
CREATE INDEX "EventReplayAttempt_status_createdAt_idx" ON "EventReplayAttempt"("status", "createdAt");

ALTER TABLE "EventReplayAttempt"
  ADD CONSTRAINT "EventReplayAttempt_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EventReplayAttempt"
  ADD CONSTRAINT "EventReplayAttempt_billingEventId_fkey"
  FOREIGN KEY ("billingEventId") REFERENCES "BillingEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EventReplayAttempt"
  ADD CONSTRAINT "EventReplayAttempt_domainEventId_fkey"
  FOREIGN KEY ("domainEventId") REFERENCES "DomainEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EventReplayAttempt"
  ADD CONSTRAINT "EventReplayAttempt_webhookDeliveryId_fkey"
  FOREIGN KEY ("webhookDeliveryId") REFERENCES "WebhookDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EventReplayAttempt"
  ADD CONSTRAINT "EventReplayAttempt_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
