import "server-only";

export type StripeWebhookHandlingDisposition =
  | "ignore_safely"
  | "retryable"
  | "operator_visible";

export type StripeWebhookErrorClass =
  | "signature_verification_failure"
  | "malformed_event"
  | "unsupported_event_type"
  | "reconciliation_failure"
  | "access_grant_issuance_failure"
  | "duplicate_event";

export type StripeWebhookClassification = {
  errorClass: StripeWebhookErrorClass;
  disposition: StripeWebhookHandlingDisposition;
  retryable: boolean;
  operatorVisible: boolean;
  customerSafeMessage: string;
};

export class StripeWebhookProcessingError extends Error {
  classification: StripeWebhookClassification;

  constructor(message: string, classification: StripeWebhookClassification) {
    super(message);
    this.name = "StripeWebhookProcessingError";
    this.classification = classification;
  }
}

export function createMalformedStripeEventError(message: string) {
  return new StripeWebhookProcessingError(message, {
    errorClass: "malformed_event",
    disposition: "operator_visible",
    retryable: false,
    operatorVisible: true,
    customerSafeMessage:
      "The Stripe event could not be normalized into the expected internal contract."
  });
}

export function createReconciliationFailureError(message: string) {
  return new StripeWebhookProcessingError(message, {
    errorClass: "reconciliation_failure",
    disposition: "operator_visible",
    retryable: true,
    operatorVisible: true,
    customerSafeMessage:
      "The payment event was verified but could not be reconciled into app state."
  });
}

export function createAccessGrantIssuanceFailureError(message: string) {
  return new StripeWebhookProcessingError(message, {
    errorClass: "access_grant_issuance_failure",
    disposition: "operator_visible",
    retryable: true,
    operatorVisible: true,
    customerSafeMessage:
      "The payment event was verified but the access-grant issuance step did not complete."
  });
}

export function classifyStripeWebhookVerificationFailure(): StripeWebhookClassification {
  return {
    errorClass: "signature_verification_failure",
    disposition: "operator_visible",
    retryable: false,
    operatorVisible: true,
    customerSafeMessage:
      "The Stripe webhook signature could not be verified."
  };
}

export function classifyUnsupportedStripeWebhookEvent(): StripeWebhookClassification {
  return {
    errorClass: "unsupported_event_type",
    disposition: "ignore_safely",
    retryable: false,
    operatorVisible: false,
    customerSafeMessage:
      "The Stripe event type is not handled by the current reconciliation flow."
  };
}

export function classifyDuplicateStripeWebhookEvent(): StripeWebhookClassification {
  return {
    errorClass: "duplicate_event",
    disposition: "ignore_safely",
    retryable: false,
    operatorVisible: false,
    customerSafeMessage:
      "The Stripe event was already processed or is currently being processed."
  };
}

export function classifyStripeWebhookProcessingFailure(
  error: unknown
): StripeWebhookClassification {
  if (error instanceof StripeWebhookProcessingError) {
    return error.classification;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const retryable =
    message.includes("timeout") ||
    message.includes("temporar") ||
    message.includes("network") ||
    message.includes("connection") ||
    message.includes("rate limit") ||
    message.includes("try again");

  return {
    errorClass: "reconciliation_failure",
    disposition: "operator_visible",
    retryable,
    operatorVisible: true,
    customerSafeMessage:
      "The verified Stripe event could not complete reconciliation."
  };
}
