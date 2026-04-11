-- CreateEnum
CREATE TYPE "CustomerLifecycleStage" AS ENUM (
  'LEAD',
  'QUALIFIED',
  'PROPOSAL_SENT',
  'WON',
  'ONBOARDING',
  'INTAKE_PENDING',
  'INTAKE_COMPLETE',
  'AUDIT_PROCESSING',
  'REPORT_READY',
  'BRIEFING_SCHEDULED',
  'MONITORING_ACTIVE'
);

-- CreateEnum
CREATE TYPE "CustomerAccountStageSource" AS ENUM (
  'SYSTEM',
  'MANUAL'
);

-- CreateEnum
CREATE TYPE "CustomerAccountTimelineEntryType" AS ENUM (
  'STATUS_CHANGED',
  'NOTE_ADDED',
  'TASK_UPDATED',
  'WORKFLOW_TRIGGERED',
  'CRM_SYNC',
  'SYSTEM_SYNC'
);

-- CreateTable
CREATE TABLE "CustomerAccount" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "primaryLeadSubmissionId" TEXT,
  "primaryProvisioningRequestId" TEXT,
  "dedupeKey" TEXT NOT NULL,
  "primaryContactEmail" TEXT NOT NULL,
  "normalizedPrimaryContactEmail" TEXT NOT NULL,
  "companyName" TEXT,
  "lifecycleStage" "CustomerLifecycleStage" NOT NULL DEFAULT 'LEAD',
  "stageSource" "CustomerAccountStageSource" NOT NULL DEFAULT 'SYSTEM',
  "stageUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSystemSyncedAt" TIMESTAMP(3),
  "wonAt" TIMESTAMP(3),
  "briefingScheduledAt" TIMESTAMP(3),
  "monitoringActivatedAt" TIMESTAMP(3),
  "nextActionLabel" TEXT,
  "nextActionDueAt" TIMESTAMP(3),
  "nextActionOwner" TEXT,
  "crmCompanyId" TEXT,
  "crmDealId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CustomerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAccountTimelineEntry" (
  "id" TEXT NOT NULL,
  "customerAccountId" TEXT NOT NULL,
  "organizationId" TEXT,
  "actorUserId" TEXT,
  "actorType" "AuditActorType" NOT NULL DEFAULT 'SYSTEM',
  "actorLabel" TEXT,
  "entryType" "CustomerAccountTimelineEntryType" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CustomerAccountTimelineEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAccount_organizationId_key" ON "CustomerAccount"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAccount_dedupeKey_key" ON "CustomerAccount"("dedupeKey");

-- CreateIndex
CREATE INDEX "CustomerAccount_normalizedPrimaryContactEmail_createdAt_idx" ON "CustomerAccount"("normalizedPrimaryContactEmail", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerAccount_lifecycleStage_updatedAt_idx" ON "CustomerAccount"("lifecycleStage", "updatedAt");

-- CreateIndex
CREATE INDEX "CustomerAccount_primaryLeadSubmissionId_idx" ON "CustomerAccount"("primaryLeadSubmissionId");

-- CreateIndex
CREATE INDEX "CustomerAccount_primaryProvisioningRequestId_idx" ON "CustomerAccount"("primaryProvisioningRequestId");

-- CreateIndex
CREATE INDEX "CustomerAccountTimelineEntry_customerAccountId_createdAt_idx" ON "CustomerAccountTimelineEntry"("customerAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerAccountTimelineEntry_organizationId_createdAt_idx" ON "CustomerAccountTimelineEntry"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerAccountTimelineEntry_entryType_createdAt_idx" ON "CustomerAccountTimelineEntry"("entryType", "createdAt");

-- AddForeignKey
ALTER TABLE "CustomerAccount"
ADD CONSTRAINT "CustomerAccount_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAccount"
ADD CONSTRAINT "CustomerAccount_primaryLeadSubmissionId_fkey"
FOREIGN KEY ("primaryLeadSubmissionId") REFERENCES "LeadSubmission"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAccount"
ADD CONSTRAINT "CustomerAccount_primaryProvisioningRequestId_fkey"
FOREIGN KEY ("primaryProvisioningRequestId") REFERENCES "ProvisioningRequest"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAccountTimelineEntry"
ADD CONSTRAINT "CustomerAccountTimelineEntry_customerAccountId_fkey"
FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAccountTimelineEntry"
ADD CONSTRAINT "CustomerAccountTimelineEntry_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAccountTimelineEntry"
ADD CONSTRAINT "CustomerAccountTimelineEntry_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
