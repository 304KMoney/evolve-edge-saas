import {
  supportsStripeCheckoutForCanonicalPlan,
  type CanonicalPlanCode
} from "./commercial-catalog";

export type CheckoutAfterOnboardingDecision =
  | { action: "checkout" }
  | { action: "dashboard" }
  | { action: "contact_sales" }
  | {
      action: "billing_settings";
      reason: "stripe_config_missing" | "demo_mode" | "missing_organization";
    };

export function resolveCheckoutAfterOnboardingDecision(input: {
  checkoutAfterOnboarding: boolean;
  leadSource?: string | null;
  canonicalPlanCode?: CanonicalPlanCode | null;
  hasStripeBillingConfig: boolean;
  demoExternalSideEffectsBlocked: boolean;
  organizationId?: string | null;
}): CheckoutAfterOnboardingDecision {
  if (
    !input.checkoutAfterOnboarding ||
    input.leadSource !== "pricing_plan_selection" ||
    !input.canonicalPlanCode
  ) {
    return { action: "dashboard" };
  }

  if (!input.organizationId) {
    return { action: "billing_settings", reason: "missing_organization" };
  }

  if (!supportsStripeCheckoutForCanonicalPlan(input.canonicalPlanCode)) {
    return { action: "contact_sales" };
  }

  if (input.demoExternalSideEffectsBlocked) {
    return { action: "billing_settings", reason: "demo_mode" };
  }

  if (!input.hasStripeBillingConfig) {
    return { action: "billing_settings", reason: "stripe_config_missing" };
  }

  return { action: "checkout" };
}
