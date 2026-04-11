-- CreateEnum
CREATE TYPE "UsageMeterKey" AS ENUM ('AUDITS', 'EVIDENCE_UPLOADS', 'DOCUMENTS_PROCESSED');

-- CreateTable
CREATE TABLE "UsageMeter" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "meterKey" "UsageMeterKey" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "usedQuantity" INTEGER NOT NULL DEFAULT 0,
    "limitQuantity" INTEGER,
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageMeter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "usageMeterId" TEXT,
    "meterKey" "UsageMeterKey" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRecordType" TEXT,
    "sourceRecordId" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UsageMeter_organizationId_meterKey_periodStart_key" ON "UsageMeter"("organizationId", "meterKey", "periodStart");

-- CreateIndex
CREATE INDEX "UsageMeter_organizationId_periodStart_meterKey_idx" ON "UsageMeter"("organizationId", "periodStart", "meterKey");

-- CreateIndex
CREATE INDEX "UsageMeter_subscriptionId_periodStart_meterKey_idx" ON "UsageMeter"("subscriptionId", "periodStart", "meterKey");

-- CreateIndex
CREATE UNIQUE INDEX "UsageEvent_idempotencyKey_key" ON "UsageEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "UsageEvent_organizationId_meterKey_occurredAt_idx" ON "UsageEvent"("organizationId", "meterKey", "occurredAt");

-- CreateIndex
CREATE INDEX "UsageEvent_usageMeterId_occurredAt_idx" ON "UsageEvent"("usageMeterId", "occurredAt");

-- CreateIndex
CREATE INDEX "UsageEvent_subscriptionId_occurredAt_idx" ON "UsageEvent"("subscriptionId", "occurredAt");

-- CreateIndex
CREATE INDEX "UsageEvent_sourceRecordType_sourceRecordId_idx" ON "UsageEvent"("sourceRecordType", "sourceRecordId");

-- AddForeignKey
ALTER TABLE "UsageMeter" ADD CONSTRAINT "UsageMeter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageMeter" ADD CONSTRAINT "UsageMeter_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_usageMeterId_fkey" FOREIGN KEY ("usageMeterId") REFERENCES "UsageMeter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
