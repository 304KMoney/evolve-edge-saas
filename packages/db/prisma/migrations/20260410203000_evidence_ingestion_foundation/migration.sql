-- CreateEnum
CREATE TYPE "EvidenceCategory" AS ENUM (
  'POLICY_DOCUMENT',
  'SECURITY_PROCEDURE',
  'ARCHITECTURE_DOCUMENT',
  'QUESTIONNAIRE',
  'VENDOR_ARTIFACT',
  'SCREENSHOT',
  'CONTROL_EXPORT',
  'SPREADSHEET',
  'PDF_DOCUMENT',
  'STRUCTURED_DOCUMENT',
  'ANALYST_NOTE',
  'OTHER'
);

-- CreateEnum
CREATE TYPE "EvidenceSource" AS ENUM (
  'CUSTOMER_UPLOAD',
  'INTERNAL_UPLOAD',
  'GENERATED_EXPORT',
  'API_IMPORT',
  'MANUAL_ENTRY'
);

-- CreateEnum
CREATE TYPE "EvidenceProcessingStatus" AS ENUM (
  'UPLOADED',
  'PROCESSING',
  'PARSED',
  'FAILED'
);

-- CreateEnum
CREATE TYPE "EvidenceReviewStatus" AS ENUM (
  'NEEDS_REVIEW',
  'APPROVED',
  'REJECTED',
  'SUPERSEDED'
);

-- CreateEnum
CREATE TYPE "EvidenceAnnotationVisibility" AS ENUM (
  'INTERNAL',
  'CUSTOMER'
);

-- AlterTable
ALTER TABLE "EvidenceFile"
  ADD COLUMN "organizationId" TEXT,
  ADD COLUMN "engagementProgramId" TEXT,
  ADD COLUMN "reportId" TEXT,
  ADD COLUMN "findingId" TEXT,
  ADD COLUMN "monitoringFindingId" TEXT,
  ADD COLUMN "frameworkId" TEXT,
  ADD COLUMN "frameworkControlId" TEXT,
  ADD COLUMN "uploadedByUserId" TEXT,
  ADD COLUMN "reviewedByUserId" TEXT,
  ADD COLUMN "duplicateOfEvidenceId" TEXT,
  ADD COLUMN "title" TEXT,
  ADD COLUMN "storageProvider" TEXT NOT NULL DEFAULT 'local',
  ADD COLUMN "extension" TEXT,
  ADD COLUMN "sha256Hash" TEXT,
  ADD COLUMN "source" "EvidenceSource" NOT NULL DEFAULT 'CUSTOMER_UPLOAD',
  ADD COLUMN "category" "EvidenceCategory" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "processingStatus" "EvidenceProcessingStatus" NOT NULL DEFAULT 'UPLOADED',
  ADD COLUMN "reviewStatus" "EvidenceReviewStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
  ADD COLUMN "tags" JSONB,
  ADD COLUMN "metadataJson" JSONB,
  ADD COLUMN "extractionJson" JSONB,
  ADD COLUMN "visibleSummary" TEXT,
  ADD COLUMN "parserVersion" TEXT,
  ADD COLUMN "processingStartedAt" TIMESTAMP(3),
  ADD COLUMN "parsedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill org ownership for existing evidence rows.
UPDATE "EvidenceFile" AS ef
SET
  "organizationId" = a."organizationId",
  "createdAt" = ef."uploadedAt",
  "updatedAt" = ef."uploadedAt"
FROM "Assessment" AS a
WHERE ef."assessmentId" = a."id";

-- Existing evidence attachments are assessment-scoped and should remain valid.
ALTER TABLE "EvidenceFile"
  ALTER COLUMN "organizationId" SET NOT NULL,
  ALTER COLUMN "assessmentId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "EvidenceFileVersion" (
  "id" TEXT NOT NULL,
  "evidenceFileId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "versionNumber" INTEGER NOT NULL,
  "fileName" TEXT NOT NULL,
  "storageProvider" TEXT NOT NULL DEFAULT 'local',
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT,
  "extension" TEXT,
  "sizeBytes" INTEGER,
  "sha256Hash" TEXT,
  "source" "EvidenceSource" NOT NULL DEFAULT 'CUSTOMER_UPLOAD',
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EvidenceFileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceAnnotation" (
  "id" TEXT NOT NULL,
  "evidenceFileId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "authorUserId" TEXT,
  "visibility" "EvidenceAnnotationVisibility" NOT NULL DEFAULT 'INTERNAL',
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EvidenceAnnotation_pkey" PRIMARY KEY ("id")
);

-- Seed a first version row for existing attachments.
INSERT INTO "EvidenceFileVersion" (
  "id",
  "evidenceFileId",
  "organizationId",
  "versionNumber",
  "fileName",
  "storageProvider",
  "storageKey",
  "mimeType",
  "extension",
  "sizeBytes",
  "sha256Hash",
  "source",
  "createdAt"
)
SELECT
  'evv_' || md5(random()::text || clock_timestamp()::text || ef."id"),
  ef."id",
  ef."organizationId",
  1,
  ef."fileName",
  ef."storageProvider",
  ef."storageKey",
  ef."mimeType",
  ef."extension",
  ef."sizeBytes",
  ef."sha256Hash",
  ef."source",
  ef."uploadedAt"
FROM "EvidenceFile" AS ef;

-- CreateIndex
CREATE INDEX "EvidenceFile_organizationId_uploadedAt_idx" ON "EvidenceFile"("organizationId", "uploadedAt");
CREATE INDEX "EvidenceFile_organizationId_reviewStatus_updatedAt_idx" ON "EvidenceFile"("organizationId", "reviewStatus", "updatedAt");
CREATE INDEX "EvidenceFile_organizationId_processingStatus_updatedAt_idx" ON "EvidenceFile"("organizationId", "processingStatus", "updatedAt");
CREATE INDEX "EvidenceFile_engagementProgramId_uploadedAt_idx" ON "EvidenceFile"("engagementProgramId", "uploadedAt");
CREATE INDEX "EvidenceFile_assessmentId_uploadedAt_idx" ON "EvidenceFile"("assessmentId", "uploadedAt");
CREATE INDEX "EvidenceFile_reportId_uploadedAt_idx" ON "EvidenceFile"("reportId", "uploadedAt");
CREATE INDEX "EvidenceFile_findingId_uploadedAt_idx" ON "EvidenceFile"("findingId", "uploadedAt");
CREATE INDEX "EvidenceFile_frameworkId_uploadedAt_idx" ON "EvidenceFile"("frameworkId", "uploadedAt");
CREATE INDEX "EvidenceFile_frameworkControlId_uploadedAt_idx" ON "EvidenceFile"("frameworkControlId", "uploadedAt");
CREATE INDEX "EvidenceFile_sha256Hash_sizeBytes_idx" ON "EvidenceFile"("sha256Hash", "sizeBytes");

CREATE UNIQUE INDEX "EvidenceFileVersion_evidenceFileId_versionNumber_key" ON "EvidenceFileVersion"("evidenceFileId", "versionNumber");
CREATE INDEX "EvidenceFileVersion_organizationId_createdAt_idx" ON "EvidenceFileVersion"("organizationId", "createdAt");
CREATE INDEX "EvidenceFileVersion_evidenceFileId_createdAt_idx" ON "EvidenceFileVersion"("evidenceFileId", "createdAt");

CREATE INDEX "EvidenceAnnotation_evidenceFileId_createdAt_idx" ON "EvidenceAnnotation"("evidenceFileId", "createdAt");
CREATE INDEX "EvidenceAnnotation_organizationId_createdAt_idx" ON "EvidenceAnnotation"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_engagementProgramId_fkey" FOREIGN KEY ("engagementProgramId") REFERENCES "EngagementProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_monitoringFindingId_fkey" FOREIGN KEY ("monitoringFindingId") REFERENCES "MonitoringFinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "Framework"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_frameworkControlId_fkey" FOREIGN KEY ("frameworkControlId") REFERENCES "FrameworkControl"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_duplicateOfEvidenceId_fkey" FOREIGN KEY ("duplicateOfEvidenceId") REFERENCES "EvidenceFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EvidenceFileVersion" ADD CONSTRAINT "EvidenceFileVersion_evidenceFileId_fkey" FOREIGN KEY ("evidenceFileId") REFERENCES "EvidenceFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceFileVersion" ADD CONSTRAINT "EvidenceFileVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceFileVersion" ADD CONSTRAINT "EvidenceFileVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EvidenceAnnotation" ADD CONSTRAINT "EvidenceAnnotation_evidenceFileId_fkey" FOREIGN KEY ("evidenceFileId") REFERENCES "EvidenceFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceAnnotation" ADD CONSTRAINT "EvidenceAnnotation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceAnnotation" ADD CONSTRAINT "EvidenceAnnotation_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
