import assert from "node:assert/strict";
import { resolveCheckoutAfterOnboardingDecision } from "../lib/checkout-handoff";

function runCheckoutHandoffTests() {
  assert.deepEqual(
    resolveCheckoutAfterOnboardingDecision({
      checkoutAfterOnboarding: false,
      leadSource: "pricing_plan_selection",
      canonicalPlanCode: "starter",
      hasStripeBillingConfig: true,
      demoExternalSideEffectsBlocked: false,
      organizationId: "org_123"
    }),
    { action: "dashboard" }
  );

  assert.deepEqual(
    resolveCheckoutAfterOnboardingDecision({
      checkoutAfterOnboarding: true,
      leadSource: "contact_sales",
      canonicalPlanCode: "starter",
      hasStripeBillingConfig: true,
      demoExternalSideEffectsBlocked: false,
      organizationId: "org_123"
    }),
    { action: "dashboard" }
  );

  assert.deepEqual(
    resolveCheckoutAfterOnboardingDecision({
      checkoutAfterOnboarding: true,
      leadSource: "pricing_plan_selection",
      canonicalPlanCode: "enterprise",
      hasStripeBillingConfig: true,
      demoExternalSideEffectsBlocked: false,
      organizationId: "org_123"
    }),
    { action: "contact_sales" }
  );

  assert.deepEqual(
    resolveCheckoutAfterOnboardingDecision({
      checkoutAfterOnboarding: true,
      leadSource: "pricing_plan_selection",
      canonicalPlanCode: "scale",
      hasStripeBillingConfig: false,
      demoExternalSideEffectsBlocked: false,
      organizationId: "org_123"
    }),
    { action: "billing_settings", reason: "stripe_config_missing" }
  );

  assert.deepEqual(
    resolveCheckoutAfterOnboardingDecision({
      checkoutAfterOnboarding: true,
      leadSource: "pricing_plan_selection",
      canonicalPlanCode: "scale",
      hasStripeBillingConfig: true,
      demoExternalSideEffectsBlocked: true,
      organizationId: "org_123"
    }),
    { action: "billing_settings", reason: "demo_mode" }
  );

  assert.deepEqual(
    resolveCheckoutAfterOnboardingDecision({
      checkoutAfterOnboarding: true,
      leadSource: "pricing_plan_selection",
      canonicalPlanCode: "scale",
      hasStripeBillingConfig: true,
      demoExternalSideEffectsBlocked: false,
      organizationId: "org_123"
    }),
    { action: "checkout" }
  );

  console.log("checkout handoff tests passed");
}

runCheckoutHandoffTests();
