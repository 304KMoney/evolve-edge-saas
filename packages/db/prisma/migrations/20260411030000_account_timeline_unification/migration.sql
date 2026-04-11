-- CreateEnum
CREATE TYPE "CustomerAccountTimelineCategory" AS ENUM (
  'LEAD',
  'SALES',
  'BILLING',
  'ONBOARDING',
  'ACTIVATION',
  'DELIVERY',
  'MONITORING',
  'RETENTION',
  'SUPPORT',
  'SYSTEM',
  'RISK'
);

-- CreateEnum
CREATE TYPE "CustomerAccountTimelineVisibility" AS ENUM (
  'INTERNAL',
  'CUSTOMER'
);

-- CreateEnum
CREATE TYPE "CustomerAccountTimelineSeverity" AS ENUM (
  'INFO',
  'WARNING',
  'CRITICAL'
);

-- CreateEnum
CREATE TYPE "CustomerAccountTimelineSourceSystem" AS ENUM (
  'APP',
  'STRIPE',
  'HUBSPOT',
  'N8N',
  'DIFY',
  'MANUAL'
);

-- AlterTable
ALTER TABLE "CustomerAccountTimelineEntry"
  ADD COLUMN "category" "CustomerAccountTimelineCategory" NOT NULL DEFAULT 'SYSTEM',
  ADD COLUMN "visibility" "CustomerAccountTimelineVisibility" NOT NULL DEFAULT 'INTERNAL',
  ADD COLUMN "severity" "CustomerAccountTimelineSeverity" NOT NULL DEFAULT 'INFO',
  ADD COLUMN "sourceSystem" "CustomerAccountTimelineSourceSystem" NOT NULL DEFAULT 'APP',
  ADD COLUMN "eventCode" TEXT,
  ADD COLUMN "eventKey" TEXT,
  ADD COLUMN "sourceRecordType" TEXT,
  ADD COLUMN "sourceRecordId" TEXT,
  ADD COLUMN "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill
UPDATE "CustomerAccountTimelineEntry"
SET
  "occurredAt" = "createdAt",
  "visibility" = 'INTERNAL',
  "severity" = 'INFO',
  "sourceSystem" = CASE
    WHEN "entryType" IN ('NOTE_ADDED', 'TASK_UPDATED', 'ESCALATION_UPDATED') THEN 'MANUAL'::"CustomerAccountTimelineSourceSystem"
    ELSE 'APP'::"CustomerAccountTimelineSourceSystem"
  END,
  "category" = CASE
    WHEN "entryType" = 'NOTE_ADDED' THEN 'SUPPORT'::"CustomerAccountTimelineCategory"
    WHEN "entryType" = 'TASK_UPDATED' THEN 'SUPPORT'::"CustomerAccountTimelineCategory"
    WHEN "entryType" = 'ESCALATION_UPDATED' THEN 'RISK'::"CustomerAccountTimelineCategory"
    WHEN "entryType" = 'CRM_SYNC' THEN 'SALES'::"CustomerAccountTimelineCategory"
    WHEN "entryType" = 'STATUS_CHANGED' THEN 'SALES'::"CustomerAccountTimelineCategory"
    ELSE 'SYSTEM'::"CustomerAccountTimelineCategory"
  END,
  "eventCode" = CASE
    WHEN "entryType" = 'NOTE_ADDED' THEN 'support.note_added'
    WHEN "entryType" = 'TASK_UPDATED' THEN 'support.follow_up_updated'
    WHEN "entryType" = 'ESCALATION_UPDATED' THEN 'risk.escalation_updated'
    WHEN "entryType" = 'CRM_SYNC' THEN 'sales.crm_sync_requested'
    WHEN "entryType" = 'STATUS_CHANGED' THEN 'sales.lifecycle_changed'
    WHEN "entryType" = 'WORKFLOW_TRIGGERED' THEN 'system.workflow_triggered'
    ELSE 'system.sync'
  END;

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAccountTimelineEntry_eventKey_key" ON "CustomerAccountTimelineEntry"("eventKey");
CREATE INDEX "CustomerAccountTimelineEntry_customerAccountId_occurredAt_idx" ON "CustomerAccountTimelineEntry"("customerAccountId", "occurredAt");
CREATE INDEX "CustomerAccountTimelineEntry_organizationId_occurredAt_idx" ON "CustomerAccountTimelineEntry"("organizationId", "occurredAt");
CREATE INDEX "CustomerAccountTimelineEntry_entryType_occurredAt_idx" ON "CustomerAccountTimelineEntry"("entryType", "occurredAt");
CREATE INDEX "CustomerAccountTimelineEntry_category_occurredAt_idx" ON "CustomerAccountTimelineEntry"("category", "occurredAt");
CREATE INDEX "CustomerAccountTimelineEntry_visibility_occurredAt_idx" ON "CustomerAccountTimelineEntry"("visibility", "occurredAt");
CREATE INDEX "CustomerAccountTimelineEntry_severity_occurredAt_idx" ON "CustomerAccountTimelineEntry"("severity", "occurredAt");
CREATE INDEX "CustomerAccountTimelineEntry_sourceSystem_occurredAt_idx" ON "CustomerAccountTimelineEntry"("sourceSystem", "occurredAt");

-- DropIndex
DROP INDEX "CustomerAccountTimelineEntry_customerAccountId_createdAt_idx";
DROP INDEX "CustomerAccountTimelineEntry_organizationId_createdAt_idx";
DROP INDEX "CustomerAccountTimelineEntry_entryType_createdAt_idx";
