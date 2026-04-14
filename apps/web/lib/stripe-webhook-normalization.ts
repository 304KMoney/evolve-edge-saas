import "server-only";

import { readStripeContextMetadata } from "./integration-contracts";
import { createMalformedStripeEventError } from "./stripe-webhook-errors";

export const SUPPORTED_STRIPE_PAYMENT_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed"
] as const;

export type SupportedStripePaymentEventType =
  (typeof SUPPORTED_STRIPE_PAYMENT_EVENT_TYPES)[number];

export type NormalizedStripePaymentEvent = {
  source: "stripe";
  kind:
    | "checkout_completed"
    | "checkout_async_payment_succeeded"
    | "checkout_async_payment_failed";
  stripeEventId: string;
  stripeEventType: SupportedStripePaymentEventType;
  occurredAt: string | null;
  checkoutSessionId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePaymentIntentId: string | null;
  checkoutStatus: string | null;
  paymentStatus: string | null;
  organizationId: string | null;
  customerEmail: string | null;
  customerId: string | null;
  selectedPlan: string | null;
  revenuePlanCode: string | null;
  correlationId: string | null;
};

type StripeWebhookEvent = {
  id: string;
  type: string;
  created?: number;
  data: {
    object: Record<string, any>;
  };
};

function isSupportedStripePaymentEventType(
  value: string
): value is SupportedStripePaymentEventType {
  return (SUPPORTED_STRIPE_PAYMENT_EVENT_TYPES as readonly string[]).includes(value);
}

function normalizeStripePaymentEventKind(type: SupportedStripePaymentEventType) {
  switch (type) {
    case "checkout.session.completed":
      return "checkout_completed";
    case "checkout.session.async_payment_succeeded":
      return "checkout_async_payment_succeeded";
    case "checkout.session.async_payment_failed":
      return "checkout_async_payment_failed";
  }
}

export function normalizeStripePaymentEvent(
  event: StripeWebhookEvent
): NormalizedStripePaymentEvent | null {
  if (!isSupportedStripePaymentEventType(event.type)) {
    return null;
  }

  const object = event.data.object;
  const metadata = readStripeContextMetadata(object?.metadata);

  if (typeof object?.id !== "string" || object.id.trim().length === 0) {
    throw createMalformedStripeEventError(
      "Stripe checkout event is missing a checkout session identifier."
    );
  }

  return {
    source: "stripe",
    kind: normalizeStripePaymentEventKind(event.type),
    stripeEventId: event.id,
    stripeEventType: event.type,
    occurredAt:
      typeof event.created === "number"
        ? new Date(event.created * 1000).toISOString()
        : null,
    checkoutSessionId: object.id,
    stripeCustomerId: typeof object.customer === "string" ? object.customer : null,
    stripeSubscriptionId:
      typeof object.subscription === "string" ? object.subscription : null,
    stripePaymentIntentId:
      typeof object.payment_intent === "string" ? object.payment_intent : null,
    checkoutStatus:
      typeof object.status === "string" ? object.status.trim() || null : null,
    paymentStatus:
      typeof object.payment_status === "string"
        ? object.payment_status.trim() || null
        : null,
    organizationId: metadata.organizationId,
    customerEmail: metadata.customerEmail,
    customerId: metadata.customerId,
    selectedPlan: metadata.planCode,
    revenuePlanCode: metadata.revenuePlanCode,
    correlationId: metadata.correlationId
  };
}
