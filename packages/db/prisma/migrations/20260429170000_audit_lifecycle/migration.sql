CREATE TYPE "AuditLifecycleStatus" AS ENUM (
  'INTAKE_PENDING',
  'INTAKE_COMPLETE',
  'ROUTING_COMPLETE',
  'ANALYSIS_PENDING',
  'ANALYSIS_RUNNING',
  'ANALYSIS_COMPLETE',
  'REPORT_READY',
  'BRIEFING_READY',
  'DELIVERED',
  'FAILED_REVIEW_REQUIRED'
);

CREATE TABLE "AuditLifecycle" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "routingSnapshotId" TEXT,
  "workflowDispatchId" TEXT,
  "reportId" TEXT,
  "briefingId" TEXT,
  "status" "AuditLifecycleStatus" NOT NULL DEFAULT 'INTAKE_PENDING',
  "statusReason" TEXT,
  "currentMetadata" JSONB,
  "intakePendingAt" TIMESTAMP(3),
  "intakeCompleteAt" TIMESTAMP(3),
  "routingCompleteAt" TIMESTAMP(3),
  "analysisPendingAt" TIMESTAMP(3),
  "analysisRunningAt" TIMESTAMP(3),
  "analysisCompleteAt" TIMESTAMP(3),
  "reportReadyAt" TIMESTAMP(3),
  "briefingReadyAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "failedReviewRequiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuditLifecycle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLifecycleTransition" (
  "id" TEXT NOT NULL,
  "auditLifecycleId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorType" "AuditActorType" NOT NULL DEFAULT 'SYSTEM',
  "actorLabel" TEXT,
  "fromStatus" "AuditLifecycleStatus",
  "toStatus" "AuditLifecycleStatus" NOT NULL,
  "reasonCode" TEXT,
  "note" TEXT,
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLifecycleTransition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuditLifecycle_assessmentId_key" ON "AuditLifecycle"("assessmentId");
CREATE UNIQUE INDEX "AuditLifecycle_reportId_key" ON "AuditLifecycle"("reportId");
CREATE INDEX "AuditLifecycle_organizationId_status_updatedAt_idx" ON "AuditLifecycle"("organizationId", "status", "updatedAt");
CREATE INDEX "AuditLifecycle_routingSnapshotId_idx" ON "AuditLifecycle"("routingSnapshotId");
CREATE INDEX "AuditLifecycle_workflowDispatchId_idx" ON "AuditLifecycle"("workflowDispatchId");
CREATE INDEX "AuditLifecycle_briefingId_idx" ON "AuditLifecycle"("briefingId");
CREATE INDEX "AuditLifecycleTransition_auditLifecycleId_occurredAt_idx" ON "AuditLifecycleTransition"("auditLifecycleId", "occurredAt");
CREATE INDEX "AuditLifecycleTransition_organizationId_occurredAt_idx" ON "AuditLifecycleTransition"("organizationId", "occurredAt");
CREATE INDEX "AuditLifecycleTransition_assessmentId_occurredAt_idx" ON "AuditLifecycleTransition"("assessmentId", "occurredAt");
CREATE INDEX "AuditLifecycleTransition_toStatus_occurredAt_idx" ON "AuditLifecycleTransition"("toStatus", "occurredAt");

ALTER TABLE "AuditLifecycle" ADD CONSTRAINT "AuditLifecycle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLifecycle" ADD CONSTRAINT "AuditLifecycle_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLifecycle" ADD CONSTRAINT "AuditLifecycle_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLifecycleTransition" ADD CONSTRAINT "AuditLifecycleTransition_auditLifecycleId_fkey" FOREIGN KEY ("auditLifecycleId") REFERENCES "AuditLifecycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLifecycleTransition" ADD CONSTRAINT "AuditLifecycleTransition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLifecycleTransition" ADD CONSTRAINT "AuditLifecycleTransition_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
