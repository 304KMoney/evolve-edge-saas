CREATE TABLE "Briefing" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "structuredSections" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Briefing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Briefing_reportId_key" ON "Briefing"("reportId");
CREATE INDEX "Briefing_organizationId_createdAt_idx" ON "Briefing"("organizationId", "createdAt");

ALTER TABLE "Briefing"
ADD CONSTRAINT "Briefing_reportId_fkey"
FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Briefing"
ADD CONSTRAINT "Briefing_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
