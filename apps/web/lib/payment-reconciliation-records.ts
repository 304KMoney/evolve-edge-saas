import "server-only";

import {
  CommercialPlanCode,
  PaymentReconciliationStatus,
  Prisma,
  prisma
} from "@evolve-edge/db";
import {
  createStripePaymentReconciliation,
  type StripePaymentReconciliation,
  type StripePaymentReconciliationStatus
} from "./stripe-payment-reconciliation";
import {
  resolveCanonicalPlanCode,
  resolveCanonicalPlanCodeFromRevenuePlanCode
} from "./commercial-catalog";

type PaymentReconciliationDbClient = Prisma.TransactionClient | typeof prisma;

function normalizeEmail(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized || null;
}

function toCommercialPlanCode(
  value: string | null | undefined
): CommercialPlanCode | null {
  switch (
    resolveCanonicalPlanCode(value) ?? resolveCanonicalPlanCodeFromRevenuePlanCode(value)
  ) {
    case "starter":
      return CommercialPlanCode.STARTER;
    case "enterprise":
      return CommercialPlanCode.ENTERPRISE;
    case "scale":
      return CommercialPlanCode.SCALE;
    default:
      return null;
  }
}

function toPaymentReconciliationStatus(
  status: StripePaymentReconciliationStatus
): PaymentReconciliationStatus {
  switch (status) {
    case "payment_confirmed":
      return PaymentReconciliationStatus.PAYMENT_CONFIRMED;
    case "binding_pending":
      return PaymentReconciliationStatus.BINDING_PENDING;
    case "binding_reconciled":
      return PaymentReconciliationStatus.BINDING_RECONCILED;
    case "reconciliation_failed":
      return PaymentReconciliationStatus.RECONCILIATION_FAILED;
    case "verified":
    default:
      return PaymentReconciliationStatus.VERIFIED;
  }
}

export type PersistPaymentReconciliationRecordInput = {
  stripeEventId: string;
  stripeEventType: string;
  checkoutSessionId?: string | null;
  stripePaymentReference?: string | null;
  customerEmail?: string | null;
  selectedPlan?: string | null;
  customerId?: string | null;
  organizationId?: string | null;
  customerAccountId?: string | null;
  reportId?: string | null;
  correlationId?: string | null;
  reconciliationStatus: StripePaymentReconciliationStatus;
  billingEventId?: string | null;
  metadata?: Prisma.InputJsonValue;
  lastError?: string | null;
  reconciledAt?: Date | null;
  failedAt?: Date | null;
  db?: PaymentReconciliationDbClient;
};

export function buildPaymentReconciliationRecordData(
  input: PersistPaymentReconciliationRecordInput
) {
  const normalized = createStripePaymentReconciliation(input);

  return {
    normalized,
    create: {
      billingEventId: input.billingEventId?.trim() || null,
      stripeEventId: normalized.stripeEventId,
      stripeEventType: input.stripeEventType.trim(),
      checkoutSessionId: normalized.checkoutSessionId,
      stripePaymentReference: normalized.stripePaymentReference,
      customerEmail: normalized.customerEmail,
      selectedPlan: toCommercialPlanCode(normalized.selectedPlan),
      reconciliationStatus: toPaymentReconciliationStatus(
        normalized.reconciliationStatus
      ),
      correlationId: normalized.correlationId,
      organizationId: normalized.internalBinding.organizationId,
      customerAccountId: input.customerAccountId?.trim() || null,
      reportId: normalized.internalBinding.reportId,
      metadata: input.metadata ?? Prisma.JsonNull,
      lastError: input.lastError?.trim() || null,
      reconciledAt: input.reconciledAt ?? null,
      failedAt: input.failedAt ?? null
    }
  };
}

export async function upsertPaymentReconciliationRecord(
  input: PersistPaymentReconciliationRecordInput
) {
  const db = input.db ?? prisma;
  const prepared = buildPaymentReconciliationRecordData(input);

  return db.paymentReconciliationRecord.upsert({
    where: {
      stripeEventId: prepared.normalized.stripeEventId
    },
    update: prepared.create,
    create: prepared.create
  });
}

export async function getPaymentReconciliationRecordByStripeEventId(
  stripeEventId: string,
  db: PaymentReconciliationDbClient = prisma
) {
  return db.paymentReconciliationRecord.findUnique({
    where: {
      stripeEventId: stripeEventId.trim()
    }
  });
}

export async function listRecentPaymentReconciliationRecords(input?: {
  db?: PaymentReconciliationDbClient;
  organizationId?: string | null;
  limit?: number;
}) {
  const db = input?.db ?? prisma;
  return db.paymentReconciliationRecord.findMany({
    where: input?.organizationId?.trim()
      ? {
          organizationId: input.organizationId.trim()
        }
      : undefined,
    orderBy: [{ createdAt: "desc" }],
    take: input?.limit ?? 20
  });
}
