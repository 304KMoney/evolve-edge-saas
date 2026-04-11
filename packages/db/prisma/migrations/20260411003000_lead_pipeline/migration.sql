-- CreateEnum
CREATE TYPE "LeadSubmissionStatus" AS ENUM ('CAPTURED', 'QUALIFIED', 'CONVERTED', 'FAILED');

-- CreateTable
CREATE TABLE "LeadSubmission" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "companyName" TEXT,
    "jobTitle" TEXT,
    "phone" TEXT,
    "teamSize" TEXT,
    "source" TEXT NOT NULL,
    "intent" TEXT,
    "stage" "LeadSubmissionStatus" NOT NULL DEFAULT 'CAPTURED',
    "sourcePath" TEXT,
    "requestedPlanCode" TEXT,
    "pricingContext" TEXT,
    "hubspotContactId" TEXT,
    "attribution" JSONB,
    "payload" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadSubmission_normalizedEmail_submittedAt_idx" ON "LeadSubmission"("normalizedEmail", "submittedAt");

-- CreateIndex
CREATE INDEX "LeadSubmission_source_submittedAt_idx" ON "LeadSubmission"("source", "submittedAt");

-- CreateIndex
CREATE INDEX "LeadSubmission_stage_submittedAt_idx" ON "LeadSubmission"("stage", "submittedAt");

-- CreateIndex
CREATE INDEX "LeadSubmission_organizationId_submittedAt_idx" ON "LeadSubmission"("organizationId", "submittedAt");

-- CreateIndex
CREATE INDEX "LeadSubmission_dedupeKey_submittedAt_idx" ON "LeadSubmission"("dedupeKey", "submittedAt");

-- AddForeignKey
ALTER TABLE "LeadSubmission" ADD CONSTRAINT "LeadSubmission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSubmission" ADD CONSTRAINT "LeadSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
