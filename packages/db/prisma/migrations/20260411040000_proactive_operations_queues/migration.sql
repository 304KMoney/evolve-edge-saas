DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OperationsQueueType') THEN
    CREATE TYPE "OperationsQueueType" AS ENUM ('SUCCESS_RISK', 'BILLING_ANOMALY');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OperationsQueueSeverity') THEN
    CREATE TYPE "OperationsQueueSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OperationsQueueStatus') THEN
    CREATE TYPE "OperationsQueueStatus" AS ENUM ('NEW', 'INVESTIGATING', 'ACTION_TAKEN', 'RESOLVED', 'DISMISSED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OperationsQueueSourceSystem') THEN
    CREATE TYPE "OperationsQueueSourceSystem" AS ENUM ('APP', 'STRIPE', 'MANUAL');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OperationsQueueHistoryEntryType') THEN
    CREATE TYPE "OperationsQueueHistoryEntryType" AS ENUM (
      'SYSTEM_DETECTED',
      'SYSTEM_REOPENED',
      'SYSTEM_RESOLVED',
      'STATUS_CHANGED',
      'ASSIGNED',
      'NOTE_ADDED'
    );
  END IF;
END $$;

CREATE TABLE "OperationsQueueItem" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "customerAccountId" TEXT,
  "assignedUserId" TEXT,
  "queueType" "OperationsQueueType" NOT NULL,
  "ruleCode" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "sourceSystem" "OperationsQueueSourceSystem" NOT NULL DEFAULT 'APP',
  "sourceRecordType" TEXT,
  "sourceRecordId" TEXT,
  "severity" "OperationsQueueSeverity" NOT NULL,
  "status" "OperationsQueueStatus" NOT NULL DEFAULT 'NEW',
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "recommendedAction" TEXT,
  "reasonLabel" TEXT,
  "metadata" JSONB,
  "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastEvaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "statusUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "dismissedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationsQueueItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperationsQueueHistoryEntry" (
  "id" TEXT NOT NULL,
  "operationsQueueItemId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorType" "AuditActorType" NOT NULL DEFAULT 'SYSTEM',
  "actorLabel" TEXT,
  "entryType" "OperationsQueueHistoryEntryType" NOT NULL,
  "fromStatus" "OperationsQueueStatus",
  "toStatus" "OperationsQueueStatus",
  "note" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationsQueueHistoryEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperationsQueueItem_dedupeKey_key" ON "OperationsQueueItem"("dedupeKey");
CREATE INDEX "OperationsQueueItem_organizationId_queueType_status_severity_updatedAt_idx" ON "OperationsQueueItem"("organizationId", "queueType", "status", "severity", "updatedAt");
CREATE INDEX "OperationsQueueItem_customerAccountId_queueType_status_updatedAt_idx" ON "OperationsQueueItem"("customerAccountId", "queueType", "status", "updatedAt");
CREATE INDEX "OperationsQueueItem_assignedUserId_status_updatedAt_idx" ON "OperationsQueueItem"("assignedUserId", "status", "updatedAt");
CREATE INDEX "OperationsQueueItem_queueType_status_severity_updatedAt_idx" ON "OperationsQueueItem"("queueType", "status", "severity", "updatedAt");
CREATE INDEX "OperationsQueueItem_sourceRecordType_sourceRecordId_idx" ON "OperationsQueueItem"("sourceRecordType", "sourceRecordId");

CREATE INDEX "OperationsQueueHistoryEntry_operationsQueueItemId_createdAt_idx" ON "OperationsQueueHistoryEntry"("operationsQueueItemId", "createdAt");
CREATE INDEX "OperationsQueueHistoryEntry_organizationId_createdAt_idx" ON "OperationsQueueHistoryEntry"("organizationId", "createdAt");
CREATE INDEX "OperationsQueueHistoryEntry_entryType_createdAt_idx" ON "OperationsQueueHistoryEntry"("entryType", "createdAt");

ALTER TABLE "OperationsQueueItem"
  ADD CONSTRAINT "OperationsQueueItem_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OperationsQueueItem"
  ADD CONSTRAINT "OperationsQueueItem_customerAccountId_fkey"
  FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OperationsQueueItem"
  ADD CONSTRAINT "OperationsQueueItem_assignedUserId_fkey"
  FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OperationsQueueHistoryEntry"
  ADD CONSTRAINT "OperationsQueueHistoryEntry_operationsQueueItemId_fkey"
  FOREIGN KEY ("operationsQueueItemId") REFERENCES "OperationsQueueItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OperationsQueueHistoryEntry"
  ADD CONSTRAINT "OperationsQueueHistoryEntry_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OperationsQueueHistoryEntry"
  ADD CONSTRAINT "OperationsQueueHistoryEntry_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
