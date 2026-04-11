CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM', 'INTERNAL_API', 'WEBHOOK', 'JOB', 'ADMIN');

ALTER TABLE "AuditLog"
ALTER COLUMN "organizationId" DROP NOT NULL;

ALTER TABLE "AuditLog"
ADD COLUMN "actorType" "AuditActorType" NOT NULL DEFAULT 'USER',
ADD COLUMN "actorLabel" TEXT,
ADD COLUMN "requestContext" JSONB;

CREATE INDEX "AuditLog_organizationId_createdAt_idx"
ON "AuditLog"("organizationId", "createdAt");

CREATE INDEX "AuditLog_action_createdAt_idx"
ON "AuditLog"("action", "createdAt");

CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx"
ON "AuditLog"("entityType", "entityId", "createdAt");
