ALTER TABLE "AnalysisJob"
ADD COLUMN "providerRequestId" TEXT,
ADD COLUMN "contractVersion" TEXT,
ADD COLUMN "workflowVersion" TEXT,
ADD COLUMN "requestHash" TEXT,
ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastAttemptAt" TIMESTAMP(3);

CREATE INDEX "AnalysisJob_status_createdAt_idx" ON "AnalysisJob"("status", "createdAt");
CREATE INDEX "AnalysisJob_provider_status_idx" ON "AnalysisJob"("provider", "status");
CREATE INDEX "AnalysisJob_providerRequestId_idx" ON "AnalysisJob"("providerRequestId");
