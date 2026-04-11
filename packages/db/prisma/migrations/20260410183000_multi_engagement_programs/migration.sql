-- CreateEnum
CREATE TYPE "EngagementProgramType" AS ENUM (
    'ONE_TIME_AUDIT',
    'ONGOING_MONITORING',
    'REMEDIATION_SUPPORT',
    'ADVISORY_ADD_ON',
    'FRAMEWORK_FOLLOW_ON',
    'PERIODIC_REASSESSMENT'
);

-- CreateEnum
CREATE TYPE "EngagementProgramStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'PAUSED', 'CANCELED');

-- CreateEnum
CREATE TYPE "EngagementCommercialModel" AS ENUM ('PROJECT', 'SUBSCRIPTION', 'ADD_ON', 'HYBRID', 'INTERNAL');

-- CreateEnum
CREATE TYPE "EngagementDeliverableType" AS ENUM (
    'ASSESSMENT',
    'REPORT',
    'EXECUTIVE_PACKAGE',
    'MONITORING_REVIEW',
    'REMEDIATION_CHECKPOINT',
    'ADVISORY_MEMO'
);

-- CreateEnum
CREATE TYPE "EngagementDeliverableStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'READY', 'DELIVERED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EngagementOpportunityCategory" AS ENUM (
    'ONGOING_MONITORING',
    'REMEDIATION_SUPPORT',
    'ADVISORY_ADD_ON',
    'FRAMEWORK_FOLLOW_ON',
    'PERIODIC_REASSESSMENT'
);

-- CreateEnum
CREATE TYPE "EngagementOpportunityStatus" AS ENUM ('OPEN', 'QUALIFIED', 'CONVERTED', 'DISMISSED');

-- AlterTable
ALTER TABLE "Assessment" ADD COLUMN "engagementProgramId" TEXT;

-- AlterTable
ALTER TABLE "MonitoringFinding" ADD COLUMN "engagementProgramId" TEXT;

-- AlterTable
ALTER TABLE "MonitoringSubscription" ADD COLUMN "engagementProgramId" TEXT;

-- AlterTable
ALTER TABLE "Report" ADD COLUMN "engagementProgramId" TEXT;

-- AlterTable
ALTER TABLE "ReportPackage" ADD COLUMN "engagementProgramId" TEXT;

-- CreateTable
CREATE TABLE "EngagementProgram" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerAccountId" TEXT,
    "subscriptionId" TEXT,
    "type" "EngagementProgramType" NOT NULL,
    "status" "EngagementProgramStatus" NOT NULL DEFAULT 'DRAFT',
    "commercialModel" "EngagementCommercialModel" NOT NULL,
    "externalKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "frameworkFocus" JSONB,
    "tags" JSONB,
    "currentCycleLabel" TEXT,
    "startedAt" TIMESTAMP(3),
    "targetEndAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EngagementProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementDeliverable" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "engagementProgramId" TEXT NOT NULL,
    "assessmentId" TEXT,
    "reportId" TEXT,
    "reportPackageId" TEXT,
    "externalKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "deliverableType" "EngagementDeliverableType" NOT NULL,
    "status" "EngagementDeliverableStatus" NOT NULL DEFAULT 'PLANNED',
    "versionLabel" TEXT,
    "dueAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EngagementDeliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementOpportunity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "engagementProgramId" TEXT,
    "externalKey" TEXT NOT NULL,
    "category" "EngagementOpportunityCategory" NOT NULL,
    "status" "EngagementOpportunityStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "sourceSignal" TEXT,
    "sourceReferenceId" TEXT,
    "tags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "qualifiedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    CONSTRAINT "EngagementOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringSubscription_engagementProgramId_key" ON "MonitoringSubscription"("engagementProgramId");
CREATE INDEX "Assessment_engagementProgramId_createdAt_idx" ON "Assessment"("engagementProgramId", "createdAt");
CREATE INDEX "MonitoringFinding_engagementProgramId_status_updatedAt_idx" ON "MonitoringFinding"("engagementProgramId", "status", "updatedAt");
CREATE INDEX "Report_engagementProgramId_createdAt_idx" ON "Report"("engagementProgramId", "createdAt");
CREATE INDEX "ReportPackage_engagementProgramId_updatedAt_idx" ON "ReportPackage"("engagementProgramId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EngagementProgram_externalKey_key" ON "EngagementProgram"("externalKey");
CREATE INDEX "EngagementProgram_organizationId_status_updatedAt_idx" ON "EngagementProgram"("organizationId", "status", "updatedAt");
CREATE INDEX "EngagementProgram_organizationId_type_updatedAt_idx" ON "EngagementProgram"("organizationId", "type", "updatedAt");
CREATE INDEX "EngagementProgram_customerAccountId_updatedAt_idx" ON "EngagementProgram"("customerAccountId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EngagementDeliverable_externalKey_key" ON "EngagementDeliverable"("externalKey");
CREATE INDEX "EngagementDeliverable_organizationId_status_updatedAt_idx" ON "EngagementDeliverable"("organizationId", "status", "updatedAt");
CREATE INDEX "EngagementDeliverable_engagementProgramId_status_updatedAt_idx" ON "EngagementDeliverable"("engagementProgramId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EngagementOpportunity_externalKey_key" ON "EngagementOpportunity"("externalKey");
CREATE INDEX "EngagementOpportunity_organizationId_status_updatedAt_idx" ON "EngagementOpportunity"("organizationId", "status", "updatedAt");
CREATE INDEX "EngagementOpportunity_organizationId_category_updatedAt_idx" ON "EngagementOpportunity"("organizationId", "category", "updatedAt");

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_engagementProgramId_fkey" FOREIGN KEY ("engagementProgramId") REFERENCES "EngagementProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringSubscription" ADD CONSTRAINT "MonitoringSubscription_engagementProgramId_fkey" FOREIGN KEY ("engagementProgramId") REFERENCES "EngagementProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringFinding" ADD CONSTRAINT "MonitoringFinding_engagementProgramId_fkey" FOREIGN KEY ("engagementProgramId") REFERENCES "EngagementProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_engagementProgramId_fkey" FOREIGN KEY ("engagementProgramId") REFERENCES "EngagementProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportPackage" ADD CONSTRAINT "ReportPackage_engagementProgramId_fkey" FOREIGN KEY ("engagementProgramId") REFERENCES "EngagementProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementProgram" ADD CONSTRAINT "EngagementProgram_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngagementProgram" ADD CONSTRAINT "EngagementProgram_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EngagementProgram" ADD CONSTRAINT "EngagementProgram_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementDeliverable" ADD CONSTRAINT "EngagementDeliverable_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngagementDeliverable" ADD CONSTRAINT "EngagementDeliverable_engagementProgramId_fkey" FOREIGN KEY ("engagementProgramId") REFERENCES "EngagementProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngagementDeliverable" ADD CONSTRAINT "EngagementDeliverable_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EngagementDeliverable" ADD CONSTRAINT "EngagementDeliverable_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EngagementDeliverable" ADD CONSTRAINT "EngagementDeliverable_reportPackageId_fkey" FOREIGN KEY ("reportPackageId") REFERENCES "ReportPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementOpportunity" ADD CONSTRAINT "EngagementOpportunity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngagementOpportunity" ADD CONSTRAINT "EngagementOpportunity_engagementProgramId_fkey" FOREIGN KEY ("engagementProgramId") REFERENCES "EngagementProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;
