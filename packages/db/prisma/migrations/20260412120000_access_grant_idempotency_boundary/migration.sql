-- Enforce a single durable access-grant issuance record per reconciliation.
-- PostgreSQL allows multiple NULLs for a unique index, so local/demo grants
-- without reconciliation linkage can still coexist while webhook-issued grants
-- gain an auditable idempotency boundary.
CREATE UNIQUE INDEX "CustomerAccessGrantRecord_paymentReconciliationId_key"
ON "CustomerAccessGrantRecord"("paymentReconciliationId");
