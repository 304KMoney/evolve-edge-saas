-- CreateEnum
CREATE TYPE "CommercialPlanCode" AS ENUM ('STARTER', 'SCALE', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "CanonicalWorkflowCode" AS ENUM ('AUDIT_STARTER', 'AUDIT_SCALE', 'AUDIT_ENTERPRISE', 'BRIEFING_ONLY', 'INTAKE_REVIEW');

-- CreateEnum
CREATE TYPE "RoutingSnapshotStatus" AS ENUM ('PENDING', 'DISPATCH_QUEUED', 'DISPATCHED', 'STATUS_UPDATED', 'REPORT_READY', 'FAILED');

-- CreateEnum
CREATE TYPE "WorkflowDispatchStatus" AS ENUM ('PENDING', 'DISPATCHING', 'DISPATCHED', 'ACKNOWLEDGED', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "RoutingSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "sourceSystem" TEXT NOT NULL,
    "sourceEventType" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "sourceRecordType" TEXT,
    "sourceRecordId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "planCode" "CommercialPlanCode" NOT NULL,
    "workflowCode" "CanonicalWorkflowCode" NOT NULL,
    "entitlementsJson" JSONB NOT NULL,
    "normalizedHintsJson" JSONB NOT NULL,
    "routingReasonJson" JSONB NOT NULL,
    "commercialStateJson" JSONB,
    "status" "RoutingSnapshotStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowDispatch" (
    "id" TEXT NOT NULL,
    "routingSnapshotId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "status" "WorkflowDispatchStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "responseStatus" INTEGER,
    "lastError" TEXT,
    "externalExecutionId" TEXT,
    "requestPayload" JSONB NOT NULL,
    "responsePayload" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoutingSnapshot_idempotencyKey_key" ON "RoutingSnapshot"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "RoutingSnapshot_sourceSystem_sourceEventId_key" ON "RoutingSnapshot"("sourceSystem", "sourceEventId");

-- CreateIndex
CREATE INDEX "RoutingSnapshot_organizationId_createdAt_idx" ON "RoutingSnapshot"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "RoutingSnapshot_status_createdAt_idx" ON "RoutingSnapshot"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RoutingSnapshot_planCode_workflowCode_createdAt_idx" ON "RoutingSnapshot"("planCode", "workflowCode", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowDispatch_idempotencyKey_key" ON "WorkflowDispatch"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowDispatch_correlationId_key" ON "WorkflowDispatch"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowDispatch_routingSnapshotId_eventType_destination_key" ON "WorkflowDispatch"("routingSnapshotId", "eventType", "destination");

-- CreateIndex
CREATE INDEX "WorkflowDispatch_status_nextRetryAt_idx" ON "WorkflowDispatch"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "WorkflowDispatch_routingSnapshotId_createdAt_idx" ON "WorkflowDispatch"("routingSnapshotId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowDispatch_destination_status_createdAt_idx" ON "WorkflowDispatch"("destination", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "RoutingSnapshot" ADD CONSTRAINT "RoutingSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingSnapshot" ADD CONSTRAINT "RoutingSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowDispatch" ADD CONSTRAINT "WorkflowDispatch_routingSnapshotId_fkey" FOREIGN KEY ("routingSnapshotId") REFERENCES "RoutingSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
