-- CreateEnum
CREATE TYPE "ReportPackageDeliveryStatus" AS ENUM (
  'GENERATED',
  'REVIEWED',
  'SENT',
  'BRIEFING_BOOKED',
  'BRIEFING_COMPLETED'
);

-- CreateEnum
CREATE TYPE "ReportPackageQaStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'CHANGES_REQUESTED'
);

-- CreateTable
CREATE TABLE "ReportPackage" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "latestReportId" TEXT,
  "title" TEXT NOT NULL,
  "deliveryStatus" "ReportPackageDeliveryStatus" NOT NULL DEFAULT 'GENERATED',
  "qaStatus" "ReportPackageQaStatus" NOT NULL DEFAULT 'PENDING',
  "requiresFounderReview" BOOLEAN NOT NULL DEFAULT false,
  "founderReviewReason" TEXT,
  "qaNotes" TEXT,
  "founderReviewNotes" TEXT,
  "sentNotes" TEXT,
  "briefingNotes" TEXT,
  "currentVersionNumber" INTEGER NOT NULL DEFAULT 1,
  "reviewedAt" TIMESTAMP(3),
  "reviewedByUserId" TEXT,
  "founderReviewedAt" TIMESTAMP(3),
  "founderReviewedByUserId" TEXT,
  "sentAt" TIMESTAMP(3),
  "sentByUserId" TEXT,
  "briefingBookedAt" TIMESTAMP(3),
  "briefingBookedByUserId" TEXT,
  "briefingCompletedAt" TIMESTAMP(3),
  "briefingCompletedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReportPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportPackageVersion" (
  "id" TEXT NOT NULL,
  "reportPackageId" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "createdByUserId" TEXT,
  "executiveSummaryJson" JSONB NOT NULL,
  "roadmapSummaryJson" JSONB NOT NULL,
  "frameworkSummaryJson" JSONB NOT NULL,
  "packetJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReportPackageVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReportPackage_organizationId_assessmentId_key" ON "ReportPackage"("organizationId", "assessmentId");

-- CreateIndex
CREATE INDEX "ReportPackage_organizationId_deliveryStatus_updatedAt_idx" ON "ReportPackage"("organizationId", "deliveryStatus", "updatedAt");

-- CreateIndex
CREATE INDEX "ReportPackage_assessmentId_updatedAt_idx" ON "ReportPackage"("assessmentId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReportPackageVersion_reportId_key" ON "ReportPackageVersion"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportPackageVersion_reportPackageId_versionNumber_key" ON "ReportPackageVersion"("reportPackageId", "versionNumber");

-- CreateIndex
CREATE INDEX "ReportPackageVersion_reportPackageId_createdAt_idx" ON "ReportPackageVersion"("reportPackageId", "createdAt");

-- AddForeignKey
ALTER TABLE "ReportPackage"
ADD CONSTRAINT "ReportPackage_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportPackage"
ADD CONSTRAINT "ReportPackage_assessmentId_fkey"
FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportPackage"
ADD CONSTRAINT "ReportPackage_latestReportId_fkey"
FOREIGN KEY ("latestReportId") REFERENCES "Report"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportPackage"
ADD CONSTRAINT "ReportPackage_reviewedByUserId_fkey"
FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportPackage"
ADD CONSTRAINT "ReportPackage_founderReviewedByUserId_fkey"
FOREIGN KEY ("founderReviewedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportPackage"
ADD CONSTRAINT "ReportPackage_sentByUserId_fkey"
FOREIGN KEY ("sentByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportPackage"
ADD CONSTRAINT "ReportPackage_briefingBookedByUserId_fkey"
FOREIGN KEY ("briefingBookedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportPackage"
ADD CONSTRAINT "ReportPackage_briefingCompletedByUserId_fkey"
FOREIGN KEY ("briefingCompletedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportPackageVersion"
ADD CONSTRAINT "ReportPackageVersion_reportPackageId_fkey"
FOREIGN KEY ("reportPackageId") REFERENCES "ReportPackage"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportPackageVersion"
ADD CONSTRAINT "ReportPackageVersion_reportId_fkey"
FOREIGN KEY ("reportId") REFERENCES "Report"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportPackageVersion"
ADD CONSTRAINT "ReportPackageVersion_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
