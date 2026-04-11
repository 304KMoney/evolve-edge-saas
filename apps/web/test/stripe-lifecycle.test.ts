import assert from "node:assert/strict";
import { CanonicalPlanKey, SubscriptionStatus } from "@evolve-edge/db";
import { resolveStripeSubscriptionStatus } from "../lib/billing";
import {
  getCanonicalPlanKeyFromPlanCode,
  getRevenuePlanDefinition
} from "../lib/revenue-catalog";

function runStripeLifecycleTests() {
  assert.equal(
    resolveStripeSubscriptionStatus("trialing"),
    SubscriptionStatus.TRIALING
  );
  assert.equal(
    resolveStripeSubscriptionStatus("active"),
    SubscriptionStatus.ACTIVE
  );
  assert.equal(
    resolveStripeSubscriptionStatus("past_due"),
    SubscriptionStatus.PAST_DUE
  );
  assert.equal(
    resolveStripeSubscriptionStatus("canceled"),
    SubscriptionStatus.CANCELED
  );
  assert.equal(
    resolveStripeSubscriptionStatus("unpaid"),
    SubscriptionStatus.CANCELED
  );
  assert.equal(
    resolveStripeSubscriptionStatus("paused"),
    SubscriptionStatus.PAUSED
  );
  assert.equal(
    resolveStripeSubscriptionStatus("incomplete_expired"),
    SubscriptionStatus.INCOMPLETE
  );

  assert.equal(
    getRevenuePlanDefinition("starter-annual")?.canonicalKey,
    CanonicalPlanKey.STARTER
  );
  assert.equal(
    getRevenuePlanDefinition("scale-annual")?.canonicalKey,
    CanonicalPlanKey.SCALE
  );
  assert.equal(
    getCanonicalPlanKeyFromPlanCode("starter-monthly"),
    CanonicalPlanKey.STARTER
  );
  assert.equal(
    getCanonicalPlanKeyFromPlanCode("scale-monthly"),
    CanonicalPlanKey.SCALE
  );

  console.log("stripe-lifecycle tests passed");
}

runStripeLifecycleTests();
