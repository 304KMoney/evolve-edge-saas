CREATE TYPE "EmailNotificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

CREATE TABLE "EmailNotification" (
  "id" TEXT NOT NULL,
  "templateKey" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" "EmailNotificationStatus" NOT NULL DEFAULT 'PENDING',
  "recipientEmail" TEXT NOT NULL,
  "recipientName" TEXT,
  "subject" TEXT NOT NULL,
  "htmlBody" TEXT NOT NULL,
  "textBody" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "orgId" TEXT,
  "userId" TEXT,
  "eventId" TEXT,
  "payload" JSONB NOT NULL,
  "providerMessageId" TEXT,
  "responseStatus" INTEGER,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextRetryAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailNotification_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EmailNotification"
ADD CONSTRAINT "EmailNotification_orgId_fkey"
FOREIGN KEY ("orgId") REFERENCES "Organization"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmailNotification"
ADD CONSTRAINT "EmailNotification_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmailNotification"
ADD CONSTRAINT "EmailNotification_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "DomainEvent"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "EmailNotification_idempotencyKey_key" ON "EmailNotification"("idempotencyKey");
CREATE INDEX "EmailNotification_status_nextRetryAt_idx" ON "EmailNotification"("status", "nextRetryAt");
CREATE INDEX "EmailNotification_orgId_createdAt_idx" ON "EmailNotification"("orgId", "createdAt");
CREATE INDEX "EmailNotification_eventId_createdAt_idx" ON "EmailNotification"("eventId", "createdAt");
