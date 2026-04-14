CREATE TYPE "CustomerAccessGrantScopeType" AS ENUM (
  'ORGANIZATION_REPORTS',
  'REPORT_PLACEHOLDER'
);

CREATE TYPE "CustomerAccessGrantStatus" AS ENUM (
  'ISSUED',
  'BINDING_PENDING',
  'EXPIRED',
  'REVOKED'
);

CREATE TABLE "CustomerAccessGrantRecord" (
  "id" TEXT NOT NULL,
  "paymentReconciliationId" TEXT,
  "userId" TEXT,
  "customerEmail" TEXT,
  "organizationId" TEXT,
  "customerAccountId" TEXT,
  "selectedPlan" "CommercialPlanCode",
  "scopeType" "CustomerAccessGrantScopeType" NOT NULL,
  "reportId" TEXT,
  "grantStatus" "CustomerAccessGrantStatus" NOT NULL DEFAULT 'ISSUED',
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CustomerAccessGrantRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerAccessGrantRecord_paymentReconciliationId_createdAt_idx"
  ON "CustomerAccessGrantRecord"("paymentReconciliationId", "createdAt");

CREATE INDEX "CustomerAccessGrantRecord_grantStatus_createdAt_idx"
  ON "CustomerAccessGrantRecord"("grantStatus", "createdAt");

CREATE INDEX "CustomerAccessGrantRecord_organizationId_createdAt_idx"
  ON "CustomerAccessGrantRecord"("organizationId", "createdAt");

CREATE INDEX "CustomerAccessGrantRecord_userId_createdAt_idx"
  ON "CustomerAccessGrantRecord"("userId", "createdAt");

CREATE INDEX "CustomerAccessGrantRecord_customerEmail_createdAt_idx"
  ON "CustomerAccessGrantRecord"("customerEmail", "createdAt");

CREATE INDEX "CustomerAccessGrantRecord_customerAccountId_createdAt_idx"
  ON "CustomerAccessGrantRecord"("customerAccountId", "createdAt");

CREATE INDEX "CustomerAccessGrantRecord_reportId_createdAt_idx"
  ON "CustomerAccessGrantRecord"("reportId", "createdAt");

CREATE INDEX "CustomerAccessGrantRecord_expiresAt_createdAt_idx"
  ON "CustomerAccessGrantRecord"("expiresAt", "createdAt");

ALTER TABLE "CustomerAccessGrantRecord"
  ADD CONSTRAINT "CustomerAccessGrantRecord_paymentReconciliationId_fkey"
  FOREIGN KEY ("paymentReconciliationId") REFERENCES "PaymentReconciliationRecord"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerAccessGrantRecord"
  ADD CONSTRAINT "CustomerAccessGrantRecord_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerAccessGrantRecord"
  ADD CONSTRAINT "CustomerAccessGrantRecord_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerAccessGrantRecord"
  ADD CONSTRAINT "CustomerAccessGrantRecord_customerAccountId_fkey"
  FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerAccessGrantRecord"
  ADD CONSTRAINT "CustomerAccessGrantRecord_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "Report"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
