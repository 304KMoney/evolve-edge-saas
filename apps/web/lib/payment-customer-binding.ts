import "server-only";

import type { CanonicalPlanCode } from "./canonical-domain";
import {
  resolveCanonicalPlanCode,
  resolveCanonicalPlanCodeFromRevenuePlanCode
} from "./commercial-catalog";

export const PAYMENT_CUSTOMER_BINDING_STATUSES = [
  "checkout_created",
  "payment_confirmed",
  "organization_bound",
  "report_bound",
  "binding_failed"
] as const;

export type PaymentCustomerBindingStatus =
  (typeof PAYMENT_CUSTOMER_BINDING_STATUSES)[number];

export type PaymentCustomerBinding = {
  stripeCheckoutSessionId: string | null;
  stripePaymentReference: string | null;
  customerEmail: string;
  correlationId: string | null;
  selectedPlan: CanonicalPlanCode | null;
  reportId: string | null;
  organizationId: string | null;
  customerId: string | null;
  bindingStatus: PaymentCustomerBindingStatus;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeCanonicalPlanCode(
  value: string | CanonicalPlanCode | null | undefined
): CanonicalPlanCode | null {
  return (
    resolveCanonicalPlanCode(value ?? null) ??
    resolveCanonicalPlanCodeFromRevenuePlanCode(value ?? null)
  );
}

export function createPaymentCustomerBinding(input: {
  stripeCheckoutSessionId?: string | null;
  stripePaymentReference?: string | null;
  customerEmail: string;
  correlationId?: string | null;
  selectedPlan?: string | CanonicalPlanCode | null;
  reportId?: string | null;
  organizationId?: string | null;
  customerId?: string | null;
  bindingStatus: PaymentCustomerBindingStatus;
}): PaymentCustomerBinding {
  return {
    stripeCheckoutSessionId: input.stripeCheckoutSessionId?.trim() || null,
    stripePaymentReference: input.stripePaymentReference?.trim() || null,
    customerEmail: normalizeEmail(input.customerEmail),
    correlationId: input.correlationId?.trim() || null,
    selectedPlan: normalizeCanonicalPlanCode(input.selectedPlan),
    reportId: input.reportId?.trim() || null,
    organizationId: input.organizationId?.trim() || null,
    customerId: input.customerId?.trim() || null,
    bindingStatus: input.bindingStatus
  };
}

// TODO: Persist this normalized binding from Stripe webhooks or a dedicated
// backend reconciliation service so protected report access can later verify
// payment-to-customer-to-report lineage instead of relying only on org scope.
// TODO: Mirror the same correlation id into Stripe Checkout Session metadata
// so webhook handlers can join Stripe events back to this internal binding.
