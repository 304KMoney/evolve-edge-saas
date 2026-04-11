CREATE TYPE "ProvisioningStatus" AS ENUM ('PENDING', 'PROVISIONED', 'FAILED');

CREATE TABLE "ProvisioningRequest" (
  "id" TEXT NOT NULL,
  "sourceSystem" TEXT NOT NULL,
  "externalReferenceId" TEXT NOT NULL,
  "organizationId" TEXT,
  "primaryContactEmail" TEXT NOT NULL,
  "planCode" TEXT,
  "crmAccountId" TEXT,
  "crmDealId" TEXT,
  "status" "ProvisioningStatus" NOT NULL DEFAULT 'PENDING',
  "payload" JSONB NOT NULL,
  "processedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "ownerUserId" TEXT,
  "ownerInviteId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProvisioningRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProvisioningRequest"
ADD CONSTRAINT "ProvisioningRequest_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ProvisioningRequest_sourceSystem_externalReferenceId_key"
ON "ProvisioningRequest"("sourceSystem", "externalReferenceId");

CREATE INDEX "ProvisioningRequest_status_createdAt_idx"
ON "ProvisioningRequest"("status", "createdAt");

CREATE INDEX "ProvisioningRequest_organizationId_createdAt_idx"
ON "ProvisioningRequest"("organizationId", "createdAt");
