CREATE TYPE "OperatorWorkflowEventCode" AS ENUM (
  'PAYMENT_RECEIVED',
  'RECONCILIATION_COMPLETE',
  'ACCESS_GRANT_ISSUED',
  'INTAKE_RECEIVED',
  'REPORT_PROCESSING',
  'REPORT_READY',
  'REPORT_DELIVERED',
  'DELIVERY_FAILED'
);

CREATE TABLE "OperatorWorkflowEventRecord" (
  "id" TEXT NOT NULL,
  "eventKey" TEXT,
  "organizationId" TEXT,
  "customerAccountId" TEXT,
  "reportId" TEXT,
  "paymentReconciliationId" TEXT,
  "eventCode" "OperatorWorkflowEventCode" NOT NULL,
  "severity" "CustomerAccountTimelineSeverity" NOT NULL DEFAULT 'INFO',
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OperatorWorkflowEventRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperatorWorkflowEventRecord_eventKey_key"
  ON "OperatorWorkflowEventRecord"("eventKey");

CREATE INDEX "OperatorWorkflowEventRecord_organizationId_createdAt_idx"
  ON "OperatorWorkflowEventRecord"("organizationId", "createdAt");

CREATE INDEX "OperatorWorkflowEventRecord_customerAccountId_createdAt_idx"
  ON "OperatorWorkflowEventRecord"("customerAccountId", "createdAt");

CREATE INDEX "OperatorWorkflowEventRecord_reportId_createdAt_idx"
  ON "OperatorWorkflowEventRecord"("reportId", "createdAt");

CREATE INDEX "OperatorWorkflowEventRecord_paymentReconciliationId_createdAt_idx"
  ON "OperatorWorkflowEventRecord"("paymentReconciliationId", "createdAt");

CREATE INDEX "OperatorWorkflowEventRecord_eventCode_createdAt_idx"
  ON "OperatorWorkflowEventRecord"("eventCode", "createdAt");

CREATE INDEX "OperatorWorkflowEventRecord_severity_createdAt_idx"
  ON "OperatorWorkflowEventRecord"("severity", "createdAt");

ALTER TABLE "OperatorWorkflowEventRecord"
  ADD CONSTRAINT "OperatorWorkflowEventRecord_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OperatorWorkflowEventRecord"
  ADD CONSTRAINT "OperatorWorkflowEventRecord_customerAccountId_fkey"
  FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OperatorWorkflowEventRecord"
  ADD CONSTRAINT "OperatorWorkflowEventRecord_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "Report"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OperatorWorkflowEventRecord"
  ADD CONSTRAINT "OperatorWorkflowEventRecord_paymentReconciliationId_fkey"
  FOREIGN KEY ("paymentReconciliationId") REFERENCES "PaymentReconciliationRecord"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
