CREATE TYPE "DeliveryStateStatus" AS ENUM (
  'PAID',
  'ROUTED',
  'PROCESSING',
  'AWAITING_REVIEW',
  'REPORT_GENERATED',
  'DELIVERED',
  'FAILED'
);

CREATE TABLE "DeliveryStateRecord" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT,
  "billingEventId" TEXT,
  "routingSnapshotId" TEXT,
  "workflowDispatchId" TEXT,
  "reportId" TEXT,
  "reportPackageId" TEXT,
  "sourceSystem" TEXT NOT NULL,
  "sourceEventType" TEXT NOT NULL,
  "sourceEventId" TEXT NOT NULL,
  "sourceRecordType" TEXT,
  "sourceRecordId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "planCode" "CommercialPlanCode",
  "workflowCode" "CanonicalWorkflowCode",
  "externalResultReference" TEXT,
  "entitlementsJson" JSONB,
  "routingHintsJson" JSONB,
  "statusReasonJson" JSONB,
  "latestExecutionResultJson" JSONB,
  "lastError" TEXT,
  "status" "DeliveryStateStatus" NOT NULL DEFAULT 'PAID',
  "paidAt" TIMESTAMP(3),
  "routedAt" TIMESTAMP(3),
  "processingAt" TIMESTAMP(3),
  "awaitingReviewAt" TIMESTAMP(3),
  "reportGeneratedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliveryStateRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeliveryStateTransition" (
  "id" TEXT NOT NULL,
  "deliveryStateRecordId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorType" "AuditActorType" NOT NULL DEFAULT 'SYSTEM',
  "actorLabel" TEXT,
  "fromStatus" "DeliveryStateStatus",
  "toStatus" "DeliveryStateStatus" NOT NULL,
  "reasonCode" TEXT,
  "note" TEXT,
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryStateTransition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeliveryStateRecord_routingSnapshotId_key" ON "DeliveryStateRecord"("routingSnapshotId");
CREATE UNIQUE INDEX "DeliveryStateRecord_workflowDispatchId_key" ON "DeliveryStateRecord"("workflowDispatchId");
CREATE UNIQUE INDEX "DeliveryStateRecord_reportId_key" ON "DeliveryStateRecord"("reportId");
CREATE UNIQUE INDEX "DeliveryStateRecord_reportPackageId_key" ON "DeliveryStateRecord"("reportPackageId");
CREATE UNIQUE INDEX "DeliveryStateRecord_idempotencyKey_key" ON "DeliveryStateRecord"("idempotencyKey");
CREATE UNIQUE INDEX "DeliveryStateRecord_sourceSystem_sourceEventId_key" ON "DeliveryStateRecord"("sourceSystem", "sourceEventId");
CREATE INDEX "DeliveryStateRecord_organizationId_status_updatedAt_idx" ON "DeliveryStateRecord"("organizationId", "status", "updatedAt");
CREATE INDEX "DeliveryStateRecord_organizationId_createdAt_idx" ON "DeliveryStateRecord"("organizationId", "createdAt");
CREATE INDEX "DeliveryStateRecord_billingEventId_createdAt_idx" ON "DeliveryStateRecord"("billingEventId", "createdAt");
CREATE INDEX "DeliveryStateRecord_externalResultReference_createdAt_idx" ON "DeliveryStateRecord"("externalResultReference", "createdAt");

CREATE INDEX "DeliveryStateTransition_deliveryStateRecordId_occurredAt_idx" ON "DeliveryStateTransition"("deliveryStateRecordId", "occurredAt");
CREATE INDEX "DeliveryStateTransition_organizationId_occurredAt_idx" ON "DeliveryStateTransition"("organizationId", "occurredAt");
CREATE INDEX "DeliveryStateTransition_toStatus_occurredAt_idx" ON "DeliveryStateTransition"("toStatus", "occurredAt");

ALTER TABLE "DeliveryStateRecord"
  ADD CONSTRAINT "DeliveryStateRecord_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryStateRecord"
  ADD CONSTRAINT "DeliveryStateRecord_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeliveryStateRecord"
  ADD CONSTRAINT "DeliveryStateRecord_billingEventId_fkey"
  FOREIGN KEY ("billingEventId") REFERENCES "BillingEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeliveryStateRecord"
  ADD CONSTRAINT "DeliveryStateRecord_routingSnapshotId_fkey"
  FOREIGN KEY ("routingSnapshotId") REFERENCES "RoutingSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeliveryStateRecord"
  ADD CONSTRAINT "DeliveryStateRecord_workflowDispatchId_fkey"
  FOREIGN KEY ("workflowDispatchId") REFERENCES "WorkflowDispatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeliveryStateRecord"
  ADD CONSTRAINT "DeliveryStateRecord_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeliveryStateRecord"
  ADD CONSTRAINT "DeliveryStateRecord_reportPackageId_fkey"
  FOREIGN KEY ("reportPackageId") REFERENCES "ReportPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DeliveryStateTransition"
  ADD CONSTRAINT "DeliveryStateTransition_deliveryStateRecordId_fkey"
  FOREIGN KEY ("deliveryStateRecordId") REFERENCES "DeliveryStateRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryStateTransition"
  ADD CONSTRAINT "DeliveryStateTransition_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryStateTransition"
  ADD CONSTRAINT "DeliveryStateTransition_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
