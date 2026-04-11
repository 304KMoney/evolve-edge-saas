-- CreateEnum
CREATE TYPE "WorkflowRoutingFamily" AS ENUM ('ASSESSMENT_ANALYSIS', 'REPORT_PIPELINE');

-- CreateEnum
CREATE TYPE "WorkflowRoutingDisposition" AS ENUM ('STANDARD', 'UPGRADED', 'THROTTLED', 'BLOCKED', 'TRIAL', 'FALLBACK');

-- CreateTable
CREATE TABLE "WorkflowRoutingDecision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "workflowFamily" "WorkflowRoutingFamily" NOT NULL,
    "sourceRecordType" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "routeKey" TEXT NOT NULL,
    "processingTier" TEXT NOT NULL,
    "disposition" "WorkflowRoutingDisposition" NOT NULL,
    "decisionVersion" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL DEFAULT 'app',
    "idempotencyKey" TEXT NOT NULL,
    "canonicalPlanKey" "CanonicalPlanKey",
    "planCode" TEXT,
    "subscriptionStatus" "SubscriptionStatus",
    "billingAccessState" "BillingAccessState",
    "workspaceMode" TEXT,
    "reasonCodes" JSONB NOT NULL,
    "matchedRules" JSONB,
    "entitlementSummary" JSONB NOT NULL,
    "quotaState" JSONB NOT NULL,
    "workflowHints" JSONB NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowRoutingDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowRoutingDecision_idempotencyKey_key" ON "WorkflowRoutingDecision"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WorkflowRoutingDecision_organizationId_createdAt_idx" ON "WorkflowRoutingDecision"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowRoutingDecision_workflowFamily_createdAt_idx" ON "WorkflowRoutingDecision"("workflowFamily", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowRoutingDecision_sourceRecordType_sourceRecordId_createdAt_idx" ON "WorkflowRoutingDecision"("sourceRecordType", "sourceRecordId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkflowRoutingDecision" ADD CONSTRAINT "WorkflowRoutingDecision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRoutingDecision" ADD CONSTRAINT "WorkflowRoutingDecision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
