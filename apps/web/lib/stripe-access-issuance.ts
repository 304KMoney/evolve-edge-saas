import "server-only";

import {
  createCustomerAccessGrant,
  type CustomerAccessGrant,
  type CustomerAccessGrantStatus
} from "./customer-access-grants";
import {
  createAccessGrantIssuanceFailureError,
  createReconciliationFailureError
} from "./stripe-webhook-errors";
import {
  createStripePaymentReconciliation,
  type StripePaymentReconciliation,
  type StripePaymentReconciliationStatus
} from "./stripe-payment-reconciliation";
import type { NormalizedStripePaymentEvent } from "./stripe-webhook-normalization";

export type StripeAccessIssuanceResult = {
  paymentReconciliation: StripePaymentReconciliation;
  accessGrant: CustomerAccessGrant;
};

export function createStripeAccessIssuance(input: {
  normalizedEvent: NormalizedStripePaymentEvent;
  selectedPlan?: string | null;
  customerEmail?: string | null;
  customerId?: string | null;
  organizationId?: string | null;
  reportId?: string | null;
  reconciliationStatus: StripePaymentReconciliationStatus;
  grantStatus: CustomerAccessGrantStatus;
  grantExpiresAt?: Date | string | null;
}): StripeAccessIssuanceResult {
  let paymentReconciliation: StripePaymentReconciliation;

  try {
    paymentReconciliation = createStripePaymentReconciliation({
      stripeEventId: input.normalizedEvent.stripeEventId,
      checkoutSessionId: input.normalizedEvent.checkoutSessionId,
      stripePaymentReference:
        input.normalizedEvent.stripeSubscriptionId ??
        input.normalizedEvent.stripePaymentIntentId,
      customerEmail: input.customerEmail ?? input.normalizedEvent.customerEmail,
      selectedPlan: input.selectedPlan ?? input.normalizedEvent.selectedPlan,
      customerId: input.customerId ?? input.normalizedEvent.customerId,
      organizationId: input.organizationId ?? input.normalizedEvent.organizationId,
      reportId: input.reportId ?? null,
      correlationId: input.normalizedEvent.correlationId,
      reconciliationStatus: input.reconciliationStatus
    });
  } catch (error) {
    throw createReconciliationFailureError(
      error instanceof Error ? error.message : "Failed to build Stripe payment reconciliation."
    );
  }

  let accessGrant: CustomerAccessGrant;

  try {
    accessGrant = createCustomerAccessGrant({
      customerId: paymentReconciliation.internalBinding.customerId,
      organizationId: paymentReconciliation.internalBinding.organizationId,
      reportId: paymentReconciliation.internalBinding.reportId,
      selectedPlan: paymentReconciliation.selectedPlan,
      grantStatus: input.grantStatus,
      expiresAt: input.grantExpiresAt ?? null
    });
  } catch (error) {
    throw createAccessGrantIssuanceFailureError(
      error instanceof Error ? error.message : "Failed to build customer access grant."
    );
  }

  return {
    paymentReconciliation,
    accessGrant
  };
}

// Current behavior:
// - the verified webhook can issue an in-memory/logged access-grant contract
//   from a reconciled payment event
// Future durable behavior:
// - persist both the reconciliation record and the access grant in the backend
//   before protected report access depends on them as the source of truth.
