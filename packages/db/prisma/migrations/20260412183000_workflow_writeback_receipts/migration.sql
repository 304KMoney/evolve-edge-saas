CREATE TABLE "WorkflowWritebackReceipt" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "statusMarker" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowWritebackReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkflowWritebackReceipt_dedupeKey_key"
ON "WorkflowWritebackReceipt"("dedupeKey");

CREATE INDEX "WorkflowWritebackReceipt_correlationId_createdAt_idx"
ON "WorkflowWritebackReceipt"("correlationId", "createdAt");

CREATE INDEX "WorkflowWritebackReceipt_reportId_createdAt_idx"
ON "WorkflowWritebackReceipt"("reportId", "createdAt");

CREATE INDEX "WorkflowWritebackReceipt_dispatchId_createdAt_idx"
ON "WorkflowWritebackReceipt"("dispatchId", "createdAt");

CREATE INDEX "WorkflowWritebackReceipt_statusMarker_createdAt_idx"
ON "WorkflowWritebackReceipt"("statusMarker", "createdAt");
