import assert from "node:assert/strict";
import {
  BillingAccessState,
  CanonicalPlanKey,
  SubscriptionStatus
} from "@evolve-edge/db";
import {
  CANONICAL_PLAN_KEYS,
  getCanonicalPlanKeyFromPlanCode,
  getDefaultRevenuePlanCodeForCanonicalKey,
  getRevenuePlanDefinition
} from "../lib/revenue-catalog";
import {
  deriveBillingAccessStateFromSubscriptionStatus,
  listCanonicalPlans,
  normalizeBillingAmountCents,
  normalizeBillingCurrency,
  retrieveCanonicalPlan
} from "../lib/subscription-domain";

function runSubscriptionDomainTests() {
  assert.deepEqual(CANONICAL_PLAN_KEYS, [
    CanonicalPlanKey.STARTER,
    CanonicalPlanKey.GROWTH,
    CanonicalPlanKey.SCALE,
    CanonicalPlanKey.ENTERPRISE
  ]);

  const publicPlans = listCanonicalPlans();
  assert.equal(publicPlans.length, 3);
  assert.deepEqual(
    publicPlans.map((plan: (typeof publicPlans)[number]) => plan.code),
    ["starter", "scale", "enterprise"]
  );
  assert.equal(retrieveCanonicalPlan(CanonicalPlanKey.GROWTH)?.displayName, "Scale");
  assert.equal(
    retrieveCanonicalPlan(CanonicalPlanKey.ENTERPRISE)?.publicRevenuePlanCode,
    "enterprise-annual"
  );
  assert.equal(
    getDefaultRevenuePlanCodeForCanonicalKey(CanonicalPlanKey.STARTER),
    "starter-annual"
  );
  assert.equal(
    getDefaultRevenuePlanCodeForCanonicalKey(CanonicalPlanKey.SCALE),
    "scale-annual"
  );

  assert.equal(
    getRevenuePlanDefinition("growth-annual")?.canonicalKey,
    CanonicalPlanKey.GROWTH
  );
  assert.equal(
    getCanonicalPlanKeyFromPlanCode("enterprise-monthly"),
    CanonicalPlanKey.ENTERPRISE
  );
  assert.equal(getCanonicalPlanKeyFromPlanCode("unknown-plan"), null);
  assert.equal(normalizeBillingAmountCents(2500), 2500);
  assert.equal(normalizeBillingAmountCents("7500"), 7500);
  assert.equal(normalizeBillingAmountCents(""), null);
  assert.equal(normalizeBillingAmountCents(undefined), null);
  assert.equal(normalizeBillingCurrency("USD"), "usd");
  assert.equal(normalizeBillingCurrency(" usd "), "usd");
  assert.equal(normalizeBillingCurrency(""), null);
  assert.equal(normalizeBillingCurrency(null), null);

  assert.equal(
    deriveBillingAccessStateFromSubscriptionStatus(SubscriptionStatus.TRIALING),
    BillingAccessState.TRIALING
  );
  assert.equal(
    deriveBillingAccessStateFromSubscriptionStatus(SubscriptionStatus.ACTIVE),
    BillingAccessState.ACTIVE
  );
  assert.equal(
    deriveBillingAccessStateFromSubscriptionStatus(SubscriptionStatus.PAST_DUE),
    BillingAccessState.PAST_DUE
  );
  assert.equal(
    deriveBillingAccessStateFromSubscriptionStatus(SubscriptionStatus.CANCELED),
    BillingAccessState.CANCELED
  );
  assert.equal(
    deriveBillingAccessStateFromSubscriptionStatus(SubscriptionStatus.PAUSED),
    BillingAccessState.PAUSED
  );
  assert.equal(
    deriveBillingAccessStateFromSubscriptionStatus(SubscriptionStatus.INCOMPLETE),
    BillingAccessState.INCOMPLETE
  );

  console.log("subscription-domain tests passed");
}

runSubscriptionDomainTests();
