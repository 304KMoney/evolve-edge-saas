import "server-only";

import type { CanonicalPlanCode } from "./canonical-domain";
import {
  resolveCanonicalPlanCode,
  resolveCanonicalPlanCodeFromRevenuePlanCode
} from "./commercial-catalog";

export const STRIPE_PAYMENT_RECONCILIATION_STATUSES = [
  "verified",
  "payment_confirmed",
  "binding_pending",
  "binding_reconciled",
  "reconciliation_failed"
] as const;

export type StripePaymentReconciliationStatus =
  (typeof STRIPE_PAYMENT_RECONCILIATION_STATUSES)[number];

export type StripePaymentReconciliation = {
  stripeEventId: string;
  checkoutSessionId: string | null;
  stripePaymentReference: string | null;
  customerEmail: string | null;
  selectedPlan: CanonicalPlanCode | null;
  internalBinding: {
    customerId: string | null;
    organizationId: string | null;
    reportId: string | null;
  };
  reconciliationStatus: StripePaymentReconciliationStatus;
  correlationId: string | null;
};

function normalizeEmail(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized || null;
}

function normalizeCanonicalPlanCode(
  value: string | CanonicalPlanCode | null | undefined
): CanonicalPlanCode | null {
  return (
    resolveCanonicalPlanCode(value ?? null) ??
    resolveCanonicalPlanCodeFromRevenuePlanCode(value ?? null)
  );
}

export function createStripePaymentReconciliation(input: {
  stripeEventId: string;
  checkoutSessionId?: string | null;
  stripePaymentReference?: string | null;
  customerEmail?: string | null;
  selectedPlan?: string | CanonicalPlanCode | null;
  customerId?: string | null;
  organizationId?: string | null;
  reportId?: string | null;
  correlationId?: string | null;
  reconciliationStatus: StripePaymentReconciliationStatus;
}): StripePaymentReconciliation {
  return {
    stripeEventId: input.stripeEventId.trim(),
    checkoutSessionId: input.checkoutSessionId?.trim() || null,
    stripePaymentReference: input.stripePaymentReference?.trim() || null,
    customerEmail: normalizeEmail(input.customerEmail),
    selectedPlan: normalizeCanonicalPlanCode(input.selectedPlan),
    internalBinding: {
      customerId: input.customerId?.trim() || null,
      organizationId: input.organizationId?.trim() || null,
      reportId: input.reportId?.trim() || null
    },
    reconciliationStatus: input.reconciliationStatus,
    correlationId: input.correlationId?.trim() || null
  };
}

// TODO: Persist this normalized reconciliation record into
// PaymentReconciliationRecord from the verified Stripe webhook path so the app
// can issue report access from durable payment facts.
// TODO: Extend the internal binding block once checkout reconciliation can
// attach a report id or a dedicated customer-to-report grant record.
