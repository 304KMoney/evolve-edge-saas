ALTER TABLE "Report"
ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "deliveredByUserId" TEXT,
ADD COLUMN "viewedAt" TIMESTAMP(3),
ADD COLUMN "viewedByUserId" TEXT;

CREATE TYPE "ReportStatus_new" AS ENUM (
  'PENDING',
  'PROCESSING',
  'READY',
  'FAILED',
  'DELIVERED',
  'SUPERSEDED'
);

ALTER TABLE "Report"
ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Report"
ALTER COLUMN "status" TYPE "ReportStatus_new"
USING (
  CASE "status"::text
    WHEN 'DRAFT' THEN 'PENDING'
    WHEN 'PUBLISHED' THEN 'READY'
    ELSE "status"::text
  END
)::"ReportStatus_new";

DROP TYPE "ReportStatus";

ALTER TYPE "ReportStatus_new" RENAME TO "ReportStatus";

ALTER TABLE "Report"
ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TABLE "Report"
ADD CONSTRAINT "Report_deliveredByUserId_fkey"
FOREIGN KEY ("deliveredByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Report"
ADD CONSTRAINT "Report_viewedByUserId_fkey"
FOREIGN KEY ("viewedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Report_organizationId_status_publishedAt_idx"
ON "Report"("organizationId", "status", "publishedAt");
