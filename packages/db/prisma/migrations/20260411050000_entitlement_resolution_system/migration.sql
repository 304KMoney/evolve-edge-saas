-- CreateEnum
CREATE TYPE "EntitlementOverrideSource" AS ENUM ('ENTERPRISE', 'PROMO', 'MANUAL');

-- CreateTable
CREATE TABLE "EntitlementOverride" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "source" "EntitlementOverrideSource" NOT NULL DEFAULT 'MANUAL',
  "entitlementKey" TEXT NOT NULL,
  "enabled" BOOLEAN,
  "limitOverride" TEXT,
  "reason" TEXT,
  "expiresAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EntitlementOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EntitlementOverride_organizationId_entitlementKey_key" ON "EntitlementOverride"("organizationId", "entitlementKey");

-- CreateIndex
CREATE INDEX "EntitlementOverride_organizationId_expiresAt_updatedAt_idx" ON "EntitlementOverride"("organizationId", "expiresAt", "updatedAt");

-- CreateIndex
CREATE INDEX "EntitlementOverride_source_updatedAt_idx" ON "EntitlementOverride"("source", "updatedAt");

-- AddForeignKey
ALTER TABLE "EntitlementOverride"
ADD CONSTRAINT "EntitlementOverride_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntitlementOverride"
ADD CONSTRAINT "EntitlementOverride_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
