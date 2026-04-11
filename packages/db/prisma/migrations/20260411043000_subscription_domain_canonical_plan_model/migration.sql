-- CreateEnum
CREATE TYPE "CanonicalPlanKey" AS ENUM ('STARTER', 'GROWTH', 'SCALE', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "BillingEventLogSource" AS ENUM ('APP', 'STRIPE', 'MANUAL', 'INTERNAL');

-- AlterTable
ALTER TABLE "Organization"
ADD COLUMN "billingOwnerUserId" TEXT;

-- AlterTable
ALTER TABLE "Plan"
ADD COLUMN "canonicalKey" "CanonicalPlanKey" NOT NULL DEFAULT 'GROWTH';

-- Backfill canonical keys from existing variant plans.
UPDATE "Plan"
SET "canonicalKey" = CASE
  WHEN "family" = 'enterprise' OR "code" ILIKE 'enterprise-%' THEN 'ENTERPRISE'::"CanonicalPlanKey"
  ELSE 'GROWTH'::"CanonicalPlanKey"
END;

-- AlterTable
ALTER TABLE "Plan"
ALTER COLUMN "canonicalKey" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Subscription"
ADD COLUMN "billingCustomerId" TEXT,
ADD COLUMN "canonicalPlanKeySnapshot" "CanonicalPlanKey";

-- CreateTable
CREATE TABLE "BillingCustomer" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "billingOwnerUserId" TEXT,
  "billingProvider" "BillingProvider" NOT NULL DEFAULT 'STRIPE',
  "providerCustomerId" TEXT NOT NULL,
  "email" TEXT,
  "name" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BillingCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingEventLog" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "billingCustomerId" TEXT,
  "subscriptionId" TEXT,
  "planId" TEXT,
  "recordedByUserId" TEXT,
  "eventSource" "BillingEventLogSource" NOT NULL DEFAULT 'APP',
  "eventType" TEXT NOT NULL,
  "idempotencyKey" TEXT,
  "sourceReference" TEXT,
  "canonicalPlanKey" "CanonicalPlanKey",
  "payload" JSONB NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BillingEventLog_pkey" PRIMARY KEY ("id")
);

-- Backfill organization billing owners from the org creator where available.
UPDATE "Organization"
SET "billingOwnerUserId" = "createdByUserId"
WHERE "billingOwnerUserId" IS NULL
  AND "createdByUserId" IS NOT NULL;

-- Backfill billing customers from the latest Stripe-backed subscription per org.
WITH latest_org_subscription AS (
  SELECT DISTINCT ON ("organizationId")
    "organizationId",
    "stripeCustomerId",
    "updatedAt"
  FROM "Subscription"
  WHERE "stripeCustomerId" IS NOT NULL
  ORDER BY "organizationId", "updatedAt" DESC
)
INSERT INTO "BillingCustomer" (
  "id",
  "organizationId",
  "billingOwnerUserId",
  "billingProvider",
  "providerCustomerId",
  "email",
  "name",
  "isDefault",
  "metadata",
  "createdAt",
  "updatedAt"
)
SELECT
  'bc_' || md5(los."organizationId" || ':' || los."stripeCustomerId"),
  los."organizationId",
  o."billingOwnerUserId",
  'STRIPE'::"BillingProvider",
  los."stripeCustomerId",
  NULL,
  o."name",
  true,
  jsonb_build_object('source', 'migration_backfill'),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM latest_org_subscription los
JOIN "Organization" o ON o."id" = los."organizationId"
ON CONFLICT ("organizationId", "billingProvider") DO NOTHING;

-- Backfill subscription canonical snapshots from the linked plan.
UPDATE "Subscription" s
SET "canonicalPlanKeySnapshot" = p."canonicalKey"
FROM "Plan" p
WHERE s."planId" = p."id"
  AND s."canonicalPlanKeySnapshot" IS NULL;

-- Backfill subscription billing customer links from org/provider.
UPDATE "Subscription" s
SET "billingCustomerId" = bc."id"
FROM "BillingCustomer" bc
WHERE s."organizationId" = bc."organizationId"
  AND s."billingProvider" = bc."billingProvider"
  AND s."billingCustomerId" IS NULL;

-- CreateIndex
CREATE INDEX "Organization_billingOwnerUserId_idx" ON "Organization"("billingOwnerUserId");

-- CreateIndex
CREATE INDEX "Plan_canonicalKey_isActive_sortOrder_idx" ON "Plan"("canonicalKey", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "Subscription_billingCustomerId_updatedAt_idx" ON "Subscription"("billingCustomerId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCustomer_organizationId_billingProvider_key" ON "BillingCustomer"("organizationId", "billingProvider");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCustomer_billingProvider_providerCustomerId_key" ON "BillingCustomer"("billingProvider", "providerCustomerId");

-- CreateIndex
CREATE INDEX "BillingCustomer_billingOwnerUserId_updatedAt_idx" ON "BillingCustomer"("billingOwnerUserId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingEventLog_eventSource_idempotencyKey_key" ON "BillingEventLog"("eventSource", "idempotencyKey");

-- CreateIndex
CREATE INDEX "BillingEventLog_organizationId_occurredAt_idx" ON "BillingEventLog"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "BillingEventLog_billingCustomerId_occurredAt_idx" ON "BillingEventLog"("billingCustomerId", "occurredAt");

-- CreateIndex
CREATE INDEX "BillingEventLog_subscriptionId_occurredAt_idx" ON "BillingEventLog"("subscriptionId", "occurredAt");

-- CreateIndex
CREATE INDEX "BillingEventLog_eventType_occurredAt_idx" ON "BillingEventLog"("eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "BillingEventLog_canonicalPlanKey_occurredAt_idx" ON "BillingEventLog"("canonicalPlanKey", "occurredAt");

-- AddForeignKey
ALTER TABLE "Organization"
ADD CONSTRAINT "Organization_billingOwnerUserId_fkey"
FOREIGN KEY ("billingOwnerUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription"
ADD CONSTRAINT "Subscription_billingCustomerId_fkey"
FOREIGN KEY ("billingCustomerId") REFERENCES "BillingCustomer"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingCustomer"
ADD CONSTRAINT "BillingCustomer_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingCustomer"
ADD CONSTRAINT "BillingCustomer_billingOwnerUserId_fkey"
FOREIGN KEY ("billingOwnerUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingEventLog"
ADD CONSTRAINT "BillingEventLog_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingEventLog"
ADD CONSTRAINT "BillingEventLog_billingCustomerId_fkey"
FOREIGN KEY ("billingCustomerId") REFERENCES "BillingCustomer"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingEventLog"
ADD CONSTRAINT "BillingEventLog_subscriptionId_fkey"
FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingEventLog"
ADD CONSTRAINT "BillingEventLog_planId_fkey"
FOREIGN KEY ("planId") REFERENCES "Plan"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingEventLog"
ADD CONSTRAINT "BillingEventLog_recordedByUserId_fkey"
FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
