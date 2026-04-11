-- CreateTable
CREATE TABLE "ProductAnalyticsEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "organizationId" TEXT,
    "userId" TEXT,
    "anonymousId" TEXT,
    "sessionId" TEXT,
    "path" TEXT,
    "referrer" TEXT,
    "billingPlanCode" TEXT,
    "attribution" JSONB,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductAnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductAnalyticsEvent_name_occurredAt_idx" ON "ProductAnalyticsEvent"("name", "occurredAt");

-- CreateIndex
CREATE INDEX "ProductAnalyticsEvent_category_occurredAt_idx" ON "ProductAnalyticsEvent"("category", "occurredAt");

-- CreateIndex
CREATE INDEX "ProductAnalyticsEvent_organizationId_occurredAt_idx" ON "ProductAnalyticsEvent"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "ProductAnalyticsEvent_userId_occurredAt_idx" ON "ProductAnalyticsEvent"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "ProductAnalyticsEvent_source_occurredAt_idx" ON "ProductAnalyticsEvent"("source", "occurredAt");

-- AddForeignKey
ALTER TABLE "ProductAnalyticsEvent" ADD CONSTRAINT "ProductAnalyticsEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAnalyticsEvent" ADD CONSTRAINT "ProductAnalyticsEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
