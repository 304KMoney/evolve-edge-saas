CREATE TYPE "DataClassification" AS ENUM ('NON_SENSITIVE', 'SENSITIVE');

ALTER TABLE "Organization"
ADD COLUMN "dataClassification" "DataClassification";

UPDATE "Organization"
SET "dataClassification" = 'SENSITIVE'
WHERE "dataClassification" IS NULL;

ALTER TABLE "Organization"
ALTER COLUMN "dataClassification" SET NOT NULL,
ALTER COLUMN "dataClassification" SET DEFAULT 'SENSITIVE';

ALTER TABLE "WorkflowDispatch"
ADD COLUMN "dataClassification" "DataClassification";

UPDATE "WorkflowDispatch"
SET "dataClassification" = 'NON_SENSITIVE'
WHERE "dataClassification" IS NULL;

ALTER TABLE "WorkflowDispatch"
ALTER COLUMN "dataClassification" SET NOT NULL,
ALTER COLUMN "dataClassification" SET DEFAULT 'NON_SENSITIVE';

ALTER TABLE "EvidenceFile"
ADD COLUMN "dataClassification" "DataClassification";

UPDATE "EvidenceFile"
SET "dataClassification" = 'SENSITIVE'
WHERE "dataClassification" IS NULL;

ALTER TABLE "EvidenceFile"
ALTER COLUMN "dataClassification" SET NOT NULL,
ALTER COLUMN "dataClassification" SET DEFAULT 'SENSITIVE';

ALTER TABLE "EvidenceFileVersion"
ADD COLUMN "dataClassification" "DataClassification";

UPDATE "EvidenceFileVersion"
SET "dataClassification" = 'SENSITIVE'
WHERE "dataClassification" IS NULL;

ALTER TABLE "EvidenceFileVersion"
ALTER COLUMN "dataClassification" SET NOT NULL,
ALTER COLUMN "dataClassification" SET DEFAULT 'SENSITIVE';

ALTER TABLE "Report"
ADD COLUMN "dataClassification" "DataClassification";

UPDATE "Report"
SET "dataClassification" = 'SENSITIVE'
WHERE "dataClassification" IS NULL;

ALTER TABLE "Report"
ALTER COLUMN "dataClassification" SET NOT NULL,
ALTER COLUMN "dataClassification" SET DEFAULT 'SENSITIVE';

ALTER TABLE "AuditLog"
ADD COLUMN "resourceType" TEXT,
ADD COLUMN "resourceId" TEXT,
ADD COLUMN "dataClassification" "DataClassification";

CREATE INDEX "AuditLog_resourceType_resourceId_createdAt_idx"
ON "AuditLog"("resourceType", "resourceId", "createdAt");
