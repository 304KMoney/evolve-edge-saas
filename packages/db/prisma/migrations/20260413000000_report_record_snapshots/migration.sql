ALTER TABLE "Report"
  ADD COLUMN "customerAccountId" TEXT,
  ADD COLUMN "organizationNameSnapshot" TEXT,
  ADD COLUMN "customerEmailSnapshot" TEXT,
  ADD COLUMN "selectedPlan" "CommercialPlanCode",
  ADD COLUMN "executiveSummary" TEXT,
  ADD COLUMN "overallRiskPostureJson" JSONB,
  ADD COLUMN "artifactMetadataJson" JSONB;

CREATE INDEX "Report_customerAccountId_createdAt_idx"
  ON "Report"("customerAccountId", "createdAt");

CREATE INDEX "Report_selectedPlan_createdAt_idx"
  ON "Report"("selectedPlan", "createdAt");

ALTER TABLE "Report"
  ADD CONSTRAINT "Report_customerAccountId_fkey"
  FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
