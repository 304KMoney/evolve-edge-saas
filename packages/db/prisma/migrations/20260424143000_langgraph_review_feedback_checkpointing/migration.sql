DO $$
BEGIN
    CREATE TYPE "AuditWorkflowCheckpointStatus" AS ENUM (
        'RUNNING',
        'COMPLETED',
        'FAILED',
        'PAUSED_FOR_REVIEW'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE "AiWorkflowFeedbackType" AS ENUM (
        'APPROVED',
        'REJECTED',
        'EDITED',
        'REGENERATED',
        'FLAGGED',
        'CUSTOMER_FEEDBACK'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "ReportStatus" ADD VALUE IF NOT EXISTS 'GENERATED';
ALTER TYPE "ReportStatus" ADD VALUE IF NOT EXISTS 'PENDING_REVIEW';
ALTER TYPE "ReportStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "ReportStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

CREATE TABLE IF NOT EXISTS "AuditWorkflowCheckpoint" (
    "id" TEXT NOT NULL,
    "analysisJobId" TEXT,
    "workflowDispatchId" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "nodeName" TEXT NOT NULL,
    "nodeOrder" INTEGER NOT NULL,
    "status" "AuditWorkflowCheckpointStatus" NOT NULL,
    "stateSnapshot" JSONB NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditWorkflowCheckpoint_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AuditWorkflowCheckpoint_analysisJobId_fkey"
        FOREIGN KEY ("analysisJobId") REFERENCES "AnalysisJob"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AuditWorkflowCheckpoint_workflowDispatchId_createdAt_idx"
ON "AuditWorkflowCheckpoint"("workflowDispatchId", "createdAt");

CREATE INDEX IF NOT EXISTS "AuditWorkflowCheckpoint_workflowDispatchId_nodeOrder_createdAt_idx"
ON "AuditWorkflowCheckpoint"("workflowDispatchId", "nodeOrder", "createdAt");

CREATE INDEX IF NOT EXISTS "AuditWorkflowCheckpoint_analysisJobId_createdAt_idx"
ON "AuditWorkflowCheckpoint"("analysisJobId", "createdAt");

CREATE INDEX IF NOT EXISTS "AuditWorkflowCheckpoint_status_createdAt_idx"
ON "AuditWorkflowCheckpoint"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "AiWorkflowFeedback" (
    "id" TEXT NOT NULL,
    "workflowDispatchId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reportId" TEXT,
    "feedbackType" "AiWorkflowFeedbackType" NOT NULL,
    "notes" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiWorkflowFeedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AiWorkflowFeedback_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AiWorkflowFeedback_reportId_fkey"
        FOREIGN KEY ("reportId") REFERENCES "Report"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AiWorkflowFeedback_workflowDispatchId_createdAt_idx"
ON "AiWorkflowFeedback"("workflowDispatchId", "createdAt");

CREATE INDEX IF NOT EXISTS "AiWorkflowFeedback_organizationId_feedbackType_createdAt_idx"
ON "AiWorkflowFeedback"("organizationId", "feedbackType", "createdAt");

CREATE INDEX IF NOT EXISTS "AiWorkflowFeedback_reportId_createdAt_idx"
ON "AiWorkflowFeedback"("reportId", "createdAt");
