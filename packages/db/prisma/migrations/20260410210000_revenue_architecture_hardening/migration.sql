CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'ANNUAL', 'CUSTOM');

CREATE TYPE "BillingProvider" AS ENUM ('STRIPE', 'MANUAL', 'INTERNAL');

CREATE TYPE "BillingAccessState" AS ENUM (
  'TRIALING',
  'ACTIVE',
  'GRACE_PERIOD',
  'PAST_DUE',
  'CANCELED',
  'PAUSED',
  'INCOMPLETE',
  'INACTIVE'
);

ALTER TABLE "Plan"
ADD COLUMN "family" TEXT NOT NULL DEFAULT 'growth',
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "description" TEXT,
ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN "billingIntervalMode" "BillingInterval" NOT NULL DEFAULT 'ANNUAL',
ADD COLUMN "trialDays" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "billingProvider" "BillingProvider" NOT NULL DEFAULT 'STRIPE',
ADD COLUMN "billingLookupKey" TEXT,
ADD COLUMN "entitlementConfig" JSONB,
ADD COLUMN "adminMetadata" JSONB;

ALTER TABLE "Subscription"
ADD COLUMN "accessState" "BillingAccessState" NOT NULL DEFAULT 'INCOMPLETE',
ADD COLUMN "billingProvider" "BillingProvider" NOT NULL DEFAULT 'STRIPE',
ADD COLUMN "externalStatus" TEXT,
ADD COLUMN "planCodeSnapshot" TEXT,
ADD COLUMN "stripePriceIdSnapshot" TEXT,
ADD COLUMN "accessEndsAt" TIMESTAMP(3),
ADD COLUMN "gracePeriodEndsAt" TIMESTAMP(3),
ADD COLUMN "trialStartedAt" TIMESTAMP(3),
ADD COLUMN "cancelScheduledAt" TIMESTAMP(3),
ADD COLUMN "canceledAt" TIMESTAMP(3),
ADD COLUMN "endedAt" TIMESTAMP(3),
ADD COLUMN "reactivatedAt" TIMESTAMP(3),
ADD COLUMN "statusUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "billingMetadata" JSONB;

UPDATE "Plan"
SET
  "family" = CASE
    WHEN "code" LIKE 'enterprise%' THEN 'enterprise'
    ELSE 'growth'
  END,
  "description" = CASE
    WHEN "code" LIKE 'enterprise%' THEN 'Enterprise compliance operations with expanded governance capacity.'
    ELSE 'Core SaaS compliance workflow for growing regulated teams.'
  END,
  "billingIntervalMode" = CASE
    WHEN LOWER("billingInterval") = 'monthly' THEN 'MONTHLY'::"BillingInterval"
    WHEN LOWER("billingInterval") = 'annual' THEN 'ANNUAL'::"BillingInterval"
    ELSE 'CUSTOM'::"BillingInterval"
  END,
  "sortOrder" = CASE
    WHEN "code" LIKE 'growth%' THEN 10
    WHEN "code" LIKE 'enterprise%' THEN 20
    ELSE 100
  END,
  "billingLookupKey" = "code",
  "entitlementConfig" = jsonb_build_object(
    'limits', jsonb_build_object(
      'activeAssessments', "activeAssessmentsLimit",
      'seats', "seatsLimit",
      'frameworks', "frameworksLimit"
    ),
    'features', COALESCE("features"::jsonb, '{}'::jsonb)
  ),
  "adminMetadata" = jsonb_build_object(
    'planCode', "code",
    'source', 'migration',
    'investorGrade', true
  );

UPDATE "Subscription"
SET
  "accessState" = CASE
    WHEN "status" = 'TRIALING' THEN 'TRIALING'::"BillingAccessState"
    WHEN "status" = 'ACTIVE' AND "cancelAtPeriodEnd" = true THEN 'GRACE_PERIOD'::"BillingAccessState"
    WHEN "status" = 'ACTIVE' THEN 'ACTIVE'::"BillingAccessState"
    WHEN "status" = 'PAST_DUE' THEN 'PAST_DUE'::"BillingAccessState"
    WHEN "status" = 'CANCELED' THEN 'CANCELED'::"BillingAccessState"
    WHEN "status" = 'PAUSED' THEN 'PAUSED'::"BillingAccessState"
    WHEN "status" = 'INCOMPLETE' THEN 'INCOMPLETE'::"BillingAccessState"
    ELSE 'INACTIVE'::"BillingAccessState"
  END,
  "externalStatus" = "status"::text,
  "planCodeSnapshot" = "Plan"."code",
  "stripePriceIdSnapshot" = "Plan"."stripePriceId",
  "trialStartedAt" = COALESCE("trialStartedAt", "createdAt"),
  "cancelScheduledAt" = CASE
    WHEN "cancelAtPeriodEnd" = true THEN COALESCE("currentPeriodEnd", "updatedAt")
    ELSE NULL
  END,
  "canceledAt" = CASE
    WHEN "status" = 'CANCELED' THEN COALESCE("updatedAt", CURRENT_TIMESTAMP)
    ELSE NULL
  END,
  "endedAt" = CASE
    WHEN "status" = 'CANCELED' THEN COALESCE("currentPeriodEnd", "updatedAt")
    ELSE NULL
  END,
  "reactivatedAt" = CASE
    WHEN "status" IN ('ACTIVE', 'TRIALING') THEN "updatedAt"
    ELSE NULL
  END,
  "statusUpdatedAt" = COALESCE("updatedAt", CURRENT_TIMESTAMP),
  "accessEndsAt" = CASE
    WHEN "status" IN ('ACTIVE', 'TRIALING', 'PAST_DUE', 'PAUSED') THEN "currentPeriodEnd"
    WHEN "status" = 'CANCELED' THEN COALESCE("currentPeriodEnd", "updatedAt")
    ELSE NULL
  END,
  "gracePeriodEndsAt" = CASE
    WHEN "cancelAtPeriodEnd" = true THEN "currentPeriodEnd"
    ELSE NULL
  END
FROM "Plan"
WHERE "Subscription"."planId" = "Plan"."id";

CREATE UNIQUE INDEX "Plan_billingLookupKey_key" ON "Plan"("billingLookupKey");
CREATE INDEX "Plan_family_isActive_sortOrder_idx" ON "Plan"("family", "isActive", "sortOrder");
CREATE INDEX "Subscription_organizationId_accessState_updatedAt_idx" ON "Subscription"("organizationId", "accessState", "updatedAt");
CREATE INDEX "Subscription_organizationId_status_updatedAt_idx" ON "Subscription"("organizationId", "status", "updatedAt");
