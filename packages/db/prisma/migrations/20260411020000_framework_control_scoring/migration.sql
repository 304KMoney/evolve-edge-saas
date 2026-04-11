-- CreateEnum
CREATE TYPE "ControlImplementationStatus" AS ENUM (
  'NOT_ASSESSED',
  'NOT_IMPLEMENTED',
  'PARTIALLY_IMPLEMENTED',
  'IMPLEMENTED',
  'NEEDS_REVIEW',
  'COMPENSATING_CONTROL',
  'NOT_APPLICABLE'
);

-- CreateEnum
CREATE TYPE "ControlScoreSource" AS ENUM (
  'INFERRED',
  'REVIEWED',
  'OVERRIDDEN'
);

-- CreateEnum
CREATE TYPE "FrameworkPostureStatus" AS ENUM (
  'ATTENTION_REQUIRED',
  'WATCH',
  'STABLE'
);

-- AlterTable
ALTER TABLE "FrameworkControl"
  ADD COLUMN "familyCode" TEXT,
  ADD COLUMN "familyName" TEXT,
  ADD COLUMN "weight" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ControlAssessment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "frameworkId" TEXT NOT NULL,
  "frameworkControlId" TEXT NOT NULL,
  "engagementProgramId" TEXT,
  "assessmentId" TEXT,
  "reportId" TEXT,
  "reviewedByUserId" TEXT,
  "status" "ControlImplementationStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
  "score" INTEGER,
  "overriddenScore" INTEGER,
  "scoreSource" "ControlScoreSource" NOT NULL DEFAULT 'INFERRED',
  "weighting" INTEGER NOT NULL DEFAULT 100,
  "rationale" TEXT,
  "summaryJson" JSONB,
  "lastEvidenceLinkedAt" TIMESTAMP(3),
  "lastFindingLinkedAt" TIMESTAMP(3),
  "lastScoredAt" TIMESTAMP(3),
  "lastReviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ControlAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlAssessmentSnapshot" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "controlAssessmentId" TEXT NOT NULL,
  "frameworkId" TEXT NOT NULL,
  "frameworkControlId" TEXT NOT NULL,
  "assessmentId" TEXT,
  "reportId" TEXT,
  "status" "ControlImplementationStatus" NOT NULL,
  "score" INTEGER,
  "scoreSource" "ControlScoreSource" NOT NULL,
  "rationale" TEXT,
  "summaryJson" JSONB,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ControlAssessmentSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FindingControlMapping" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "findingId" TEXT NOT NULL,
  "frameworkId" TEXT NOT NULL,
  "frameworkControlId" TEXT NOT NULL,
  "mappingSource" TEXT NOT NULL DEFAULT 'inferred',
  "confidence" INTEGER,
  "rationale" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FindingControlMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceControlMapping" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "evidenceFileId" TEXT NOT NULL,
  "frameworkId" TEXT NOT NULL,
  "frameworkControlId" TEXT NOT NULL,
  "mappingSource" TEXT NOT NULL DEFAULT 'manual',
  "confidence" INTEGER,
  "rationale" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EvidenceControlMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationControlMapping" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "recommendationId" TEXT NOT NULL,
  "frameworkId" TEXT NOT NULL,
  "frameworkControlId" TEXT NOT NULL,
  "mappingSource" TEXT NOT NULL DEFAULT 'inferred',
  "rationale" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RecommendationControlMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FrameworkPostureSnapshot" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "frameworkId" TEXT NOT NULL,
  "engagementProgramId" TEXT,
  "assessmentId" TEXT,
  "reportId" TEXT,
  "status" "FrameworkPostureStatus" NOT NULL,
  "score" INTEGER,
  "assessedControlsCount" INTEGER NOT NULL DEFAULT 0,
  "implementedControlsCount" INTEGER NOT NULL DEFAULT 0,
  "gapControlsCount" INTEGER NOT NULL DEFAULT 0,
  "needsReviewControlsCount" INTEGER NOT NULL DEFAULT 0,
  "weightedCoveragePercent" INTEGER,
  "scoringSummaryJson" JSONB,
  "sourceLabel" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FrameworkPostureSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FrameworkControl_frameworkId_familyCode_sortOrder_idx" ON "FrameworkControl"("frameworkId", "familyCode", "sortOrder");

CREATE UNIQUE INDEX "ControlAssessment_organizationId_frameworkControlId_key" ON "ControlAssessment"("organizationId", "frameworkControlId");
CREATE INDEX "ControlAssessment_organizationId_frameworkId_status_idx" ON "ControlAssessment"("organizationId", "frameworkId", "status");
CREATE INDEX "ControlAssessment_organizationId_score_updatedAt_idx" ON "ControlAssessment"("organizationId", "score", "updatedAt");
CREATE INDEX "ControlAssessment_engagementProgramId_updatedAt_idx" ON "ControlAssessment"("engagementProgramId", "updatedAt");

CREATE INDEX "ControlAssessmentSnapshot_organizationId_recordedAt_idx" ON "ControlAssessmentSnapshot"("organizationId", "recordedAt");
CREATE INDEX "ControlAssessmentSnapshot_controlAssessmentId_recordedAt_idx" ON "ControlAssessmentSnapshot"("controlAssessmentId", "recordedAt");
CREATE INDEX "ControlAssessmentSnapshot_frameworkId_recordedAt_idx" ON "ControlAssessmentSnapshot"("frameworkId", "recordedAt");

CREATE UNIQUE INDEX "FindingControlMapping_findingId_frameworkControlId_key" ON "FindingControlMapping"("findingId", "frameworkControlId");
CREATE INDEX "FindingControlMapping_organizationId_frameworkId_createdAt_idx" ON "FindingControlMapping"("organizationId", "frameworkId", "createdAt");

CREATE UNIQUE INDEX "EvidenceControlMapping_evidenceFileId_frameworkControlId_key" ON "EvidenceControlMapping"("evidenceFileId", "frameworkControlId");
CREATE INDEX "EvidenceControlMapping_organizationId_frameworkId_createdAt_idx" ON "EvidenceControlMapping"("organizationId", "frameworkId", "createdAt");

CREATE UNIQUE INDEX "RecommendationControlMapping_recommendationId_frameworkControlId_key" ON "RecommendationControlMapping"("recommendationId", "frameworkControlId");
CREATE INDEX "RecommendationControlMapping_organizationId_frameworkId_createdAt_idx" ON "RecommendationControlMapping"("organizationId", "frameworkId", "createdAt");

CREATE INDEX "FrameworkPostureSnapshot_organizationId_recordedAt_idx" ON "FrameworkPostureSnapshot"("organizationId", "recordedAt");
CREATE INDEX "FrameworkPostureSnapshot_frameworkId_recordedAt_idx" ON "FrameworkPostureSnapshot"("frameworkId", "recordedAt");
CREATE INDEX "FrameworkPostureSnapshot_engagementProgramId_recordedAt_idx" ON "FrameworkPostureSnapshot"("engagementProgramId", "recordedAt");

-- AddForeignKey
ALTER TABLE "ControlAssessment" ADD CONSTRAINT "ControlAssessment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ControlAssessment" ADD CONSTRAINT "ControlAssessment_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "Framework"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ControlAssessment" ADD CONSTRAINT "ControlAssessment_frameworkControlId_fkey" FOREIGN KEY ("frameworkControlId") REFERENCES "FrameworkControl"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ControlAssessment" ADD CONSTRAINT "ControlAssessment_engagementProgramId_fkey" FOREIGN KEY ("engagementProgramId") REFERENCES "EngagementProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ControlAssessment" ADD CONSTRAINT "ControlAssessment_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ControlAssessment" ADD CONSTRAINT "ControlAssessment_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ControlAssessment" ADD CONSTRAINT "ControlAssessment_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ControlAssessmentSnapshot" ADD CONSTRAINT "ControlAssessmentSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ControlAssessmentSnapshot" ADD CONSTRAINT "ControlAssessmentSnapshot_controlAssessmentId_fkey" FOREIGN KEY ("controlAssessmentId") REFERENCES "ControlAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ControlAssessmentSnapshot" ADD CONSTRAINT "ControlAssessmentSnapshot_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "Framework"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ControlAssessmentSnapshot" ADD CONSTRAINT "ControlAssessmentSnapshot_frameworkControlId_fkey" FOREIGN KEY ("frameworkControlId") REFERENCES "FrameworkControl"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ControlAssessmentSnapshot" ADD CONSTRAINT "ControlAssessmentSnapshot_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ControlAssessmentSnapshot" ADD CONSTRAINT "ControlAssessmentSnapshot_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FindingControlMapping" ADD CONSTRAINT "FindingControlMapping_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FindingControlMapping" ADD CONSTRAINT "FindingControlMapping_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FindingControlMapping" ADD CONSTRAINT "FindingControlMapping_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "Framework"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FindingControlMapping" ADD CONSTRAINT "FindingControlMapping_frameworkControlId_fkey" FOREIGN KEY ("frameworkControlId") REFERENCES "FrameworkControl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EvidenceControlMapping" ADD CONSTRAINT "EvidenceControlMapping_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceControlMapping" ADD CONSTRAINT "EvidenceControlMapping_evidenceFileId_fkey" FOREIGN KEY ("evidenceFileId") REFERENCES "EvidenceFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceControlMapping" ADD CONSTRAINT "EvidenceControlMapping_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "Framework"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceControlMapping" ADD CONSTRAINT "EvidenceControlMapping_frameworkControlId_fkey" FOREIGN KEY ("frameworkControlId") REFERENCES "FrameworkControl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecommendationControlMapping" ADD CONSTRAINT "RecommendationControlMapping_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecommendationControlMapping" ADD CONSTRAINT "RecommendationControlMapping_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecommendationControlMapping" ADD CONSTRAINT "RecommendationControlMapping_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "Framework"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecommendationControlMapping" ADD CONSTRAINT "RecommendationControlMapping_frameworkControlId_fkey" FOREIGN KEY ("frameworkControlId") REFERENCES "FrameworkControl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FrameworkPostureSnapshot" ADD CONSTRAINT "FrameworkPostureSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FrameworkPostureSnapshot" ADD CONSTRAINT "FrameworkPostureSnapshot_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "Framework"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FrameworkPostureSnapshot" ADD CONSTRAINT "FrameworkPostureSnapshot_engagementProgramId_fkey" FOREIGN KEY ("engagementProgramId") REFERENCES "EngagementProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FrameworkPostureSnapshot" ADD CONSTRAINT "FrameworkPostureSnapshot_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FrameworkPostureSnapshot" ADD CONSTRAINT "FrameworkPostureSnapshot_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;
