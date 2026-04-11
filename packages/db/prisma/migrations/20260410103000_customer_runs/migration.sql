-- CreateEnum
CREATE TYPE "CustomerRunStatus" AS ENUM (
  'PENDING',
  'RUNNING',
  'ACTION_REQUIRED',
  'FAILED',
  'COMPLETED',
  'CANCELED'
);

-- CreateEnum
CREATE TYPE "CustomerRunStep" AS ENUM (
  'INTAKE',
  'ANALYSIS',
  'REPORT_GENERATION',
  'CRM_SYNC',
  'DELIVERY'
);

-- CreateTable
CREATE TABLE "CustomerRun" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "initiatedByUserId" TEXT,
  "assessmentId" TEXT,
  "reportId" TEXT,
  "runType" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" "CustomerRunStatus" NOT NULL DEFAULT 'PENDING',
  "currentStep" "CustomerRunStep" NOT NULL DEFAULT 'INTAKE',
  "stepsJson" JSONB NOT NULL,
  "contextJson" JSONB,
  "recoveryHint" TEXT,
  "lastError" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "lastRecoveredAt" TIMESTAMP(3),
  "lastRecoveryNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CustomerRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerRun_idempotencyKey_key" ON "CustomerRun"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CustomerRun_organizationId_createdAt_idx" ON "CustomerRun"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerRun_status_currentStep_createdAt_idx" ON "CustomerRun"("status", "currentStep", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerRun_assessmentId_createdAt_idx" ON "CustomerRun"("assessmentId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerRun_reportId_createdAt_idx" ON "CustomerRun"("reportId", "createdAt");

-- AddForeignKey
ALTER TABLE "CustomerRun"
ADD CONSTRAINT "CustomerRun_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRun"
ADD CONSTRAINT "CustomerRun_initiatedByUserId_fkey"
FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRun"
ADD CONSTRAINT "CustomerRun_assessmentId_fkey"
FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRun"
ADD CONSTRAINT "CustomerRun_reportId_fkey"
FOREIGN KEY ("reportId") REFERENCES "Report"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
