-- CreateEnum
CREATE TYPE "MonitoringSubscriptionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELED');

-- CreateEnum
CREATE TYPE "MonitoringFindingStatus" AS ENUM ('OPEN', 'ACCEPTED', 'IN_REMEDIATION', 'RESOLVED', 'DEFERRED');

-- CreateEnum
CREATE TYPE "MonitoringFrameworkStatus" AS ENUM ('ATTENTION_REQUIRED', 'WATCH', 'STABLE');

-- CreateEnum
CREATE TYPE "MonitoringCheckStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED');

-- CreateTable
CREATE TABLE "MonitoringSubscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "MonitoringSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "cadenceDays" INTEGER NOT NULL DEFAULT 30,
    "currentPostureScore" INTEGER,
    "currentRiskLevel" TEXT,
    "lastAssessmentId" TEXT,
    "lastReportId" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "summaryJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MonitoringSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringFinding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "monitoringSubscriptionId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "sourceFindingId" TEXT,
    "firstAssessmentId" TEXT,
    "lastAssessmentId" TEXT,
    "lastReportId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "severity" "FindingSeverity" NOT NULL,
    "riskDomain" TEXT NOT NULL,
    "impactedFrameworks" JSONB NOT NULL,
    "status" "MonitoringFindingStatus" NOT NULL DEFAULT 'OPEN',
    "ownerRole" TEXT,
    "targetDate" TEXT,
    "remediationNotes" TEXT,
    "acceptedReason" TEXT,
    "deferredUntil" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastStatusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MonitoringFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringFramework" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "monitoringSubscriptionId" TEXT,
    "frameworkId" TEXT NOT NULL,
    "lastAssessmentId" TEXT,
    "status" "MonitoringFrameworkStatus" NOT NULL DEFAULT 'WATCH',
    "score" INTEGER,
    "openFindingsCount" INTEGER NOT NULL DEFAULT 0,
    "inRemediationCount" INTEGER NOT NULL DEFAULT 0,
    "resolvedFindingsCount" INTEGER NOT NULL DEFAULT 0,
    "trendDelta" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MonitoringFramework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringRiskSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "monitoringSubscriptionId" TEXT,
    "assessmentId" TEXT,
    "reportId" TEXT,
    "source" TEXT NOT NULL,
    "postureScore" INTEGER,
    "riskLevel" TEXT,
    "openFindingsCount" INTEGER NOT NULL DEFAULT 0,
    "criticalFindingsCount" INTEGER NOT NULL DEFAULT 0,
    "resolvedFindingsCount" INTEGER NOT NULL DEFAULT 0,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MonitoringRiskSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringCheck" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "monitoringSubscriptionId" TEXT,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetType" TEXT NOT NULL,
    "cadenceDays" INTEGER NOT NULL DEFAULT 30,
    "status" "MonitoringCheckStatus" NOT NULL DEFAULT 'DRAFT',
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "configJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MonitoringCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringSubscription_organizationId_key" ON "MonitoringSubscription"("organizationId");
CREATE INDEX "MonitoringSubscription_status_updatedAt_idx" ON "MonitoringSubscription"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringFinding_organizationId_dedupeKey_key" ON "MonitoringFinding"("organizationId", "dedupeKey");
CREATE INDEX "MonitoringFinding_organizationId_status_updatedAt_idx" ON "MonitoringFinding"("organizationId", "status", "updatedAt");
CREATE INDEX "MonitoringFinding_monitoringSubscriptionId_status_updatedAt_idx" ON "MonitoringFinding"("monitoringSubscriptionId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringFramework_organizationId_frameworkId_key" ON "MonitoringFramework"("organizationId", "frameworkId");
CREATE INDEX "MonitoringFramework_organizationId_status_updatedAt_idx" ON "MonitoringFramework"("organizationId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "MonitoringRiskSnapshot_organizationId_recordedAt_idx" ON "MonitoringRiskSnapshot"("organizationId", "recordedAt");
CREATE INDEX "MonitoringRiskSnapshot_monitoringSubscriptionId_recordedAt_idx" ON "MonitoringRiskSnapshot"("monitoringSubscriptionId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringCheck_organizationId_key_key" ON "MonitoringCheck"("organizationId", "key");
CREATE INDEX "MonitoringCheck_organizationId_status_nextRunAt_idx" ON "MonitoringCheck"("organizationId", "status", "nextRunAt");

-- AddForeignKey
ALTER TABLE "MonitoringSubscription" ADD CONSTRAINT "MonitoringSubscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringFinding" ADD CONSTRAINT "MonitoringFinding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonitoringFinding" ADD CONSTRAINT "MonitoringFinding_monitoringSubscriptionId_fkey" FOREIGN KEY ("monitoringSubscriptionId") REFERENCES "MonitoringSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MonitoringFinding" ADD CONSTRAINT "MonitoringFinding_sourceFindingId_fkey" FOREIGN KEY ("sourceFindingId") REFERENCES "Finding"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MonitoringFinding" ADD CONSTRAINT "MonitoringFinding_firstAssessmentId_fkey" FOREIGN KEY ("firstAssessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MonitoringFinding" ADD CONSTRAINT "MonitoringFinding_lastAssessmentId_fkey" FOREIGN KEY ("lastAssessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MonitoringFinding" ADD CONSTRAINT "MonitoringFinding_lastReportId_fkey" FOREIGN KEY ("lastReportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringFramework" ADD CONSTRAINT "MonitoringFramework_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonitoringFramework" ADD CONSTRAINT "MonitoringFramework_monitoringSubscriptionId_fkey" FOREIGN KEY ("monitoringSubscriptionId") REFERENCES "MonitoringSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MonitoringFramework" ADD CONSTRAINT "MonitoringFramework_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "Framework"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonitoringFramework" ADD CONSTRAINT "MonitoringFramework_lastAssessmentId_fkey" FOREIGN KEY ("lastAssessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringRiskSnapshot" ADD CONSTRAINT "MonitoringRiskSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonitoringRiskSnapshot" ADD CONSTRAINT "MonitoringRiskSnapshot_monitoringSubscriptionId_fkey" FOREIGN KEY ("monitoringSubscriptionId") REFERENCES "MonitoringSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MonitoringRiskSnapshot" ADD CONSTRAINT "MonitoringRiskSnapshot_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MonitoringRiskSnapshot" ADD CONSTRAINT "MonitoringRiskSnapshot_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringCheck" ADD CONSTRAINT "MonitoringCheck_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonitoringCheck" ADD CONSTRAINT "MonitoringCheck_monitoringSubscriptionId_fkey" FOREIGN KEY ("monitoringSubscriptionId") REFERENCES "MonitoringSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
