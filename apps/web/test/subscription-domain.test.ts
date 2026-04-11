import assert from "node:assert/strict";
import {
  BillingAccessState,
  CanonicalPlanKey,
  SubscriptionStatus
} from "@evolve-edge/db";
import {
  CANONICAL_PLAN_KEYS,
  getCanonicalPlanCatalog,
  getCanonicalPlanDefinition,
  getCanonicalPlanKeyFromPlanCode,
  getDefaultRevenuePlanCodeForCanonicalKey,
  getRevenuePlanDefinition
} from "../lib/revenue-catalog";
import { deriveBillingAccessStateFromSubscriptionStatus } from "../lib/subscription-domain";

function runSubscriptionDomainTests() {
  assert.deepEqual(CANONICAL_PLAN_KEYS, [
    CanonicalPlanKey.STARTER,
    CanonicalPlanKey.GROWTH,
    CanonicalPlanKey.SCALE,
    CanonicalPlanKey.ENTERPRISE
  ]);

  assert.equal(getCanonicalPlanCatalog().length, 4);
  assert.equal(getCanonicalPlanDefinition(CanonicalPlanKey.GROWTH)?.label, "Growth");
  assert.equal(
    getCanonicalPlanDefinition(CanonicalPlanKey.ENTERPRISE)?.defaultRevenuePlanCode,
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
