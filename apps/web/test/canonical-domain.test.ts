import assert from "node:assert/strict";
import {
  CANONICAL_ENV_KEYS,
  CANONICAL_ENV_GROUPS,
  CANONICAL_DIFY_FIELD_KEYS,
  CANONICAL_HOSTINGER_RULES,
  CANONICAL_PLAN_CODES,
  CANONICAL_PUBLIC_PRICING,
  CANONICAL_STRIPE_PRICE_ENV_MAP,
  CANONICAL_WORKFLOW_CODES,
  getCanonicalEnvKeysForGroup,
  getCanonicalPlanDisplayName,
  getCanonicalPublicPriceLabel,
  isCanonicalPlanCode
} from "../lib/canonical-domain";

function runCanonicalDomainTests() {
  assert.deepEqual(CANONICAL_PLAN_CODES, ["starter", "scale", "enterprise"]);
  assert.deepEqual(CANONICAL_WORKFLOW_CODES, [
    "audit_starter",
    "audit_scale",
    "audit_enterprise",
    "briefing_only",
    "intake_review"
  ]);
  assert.equal(getCanonicalPlanDisplayName("starter"), "Starter");
  assert.equal(getCanonicalPublicPriceLabel("scale"), "$7,500 one-time");
  assert.equal(CANONICAL_PUBLIC_PRICING.enterprise.usd, null);
  assert.equal(CANONICAL_STRIPE_PRICE_ENV_MAP.starter, "STRIPE_PRICE_STARTER_ANNUAL");
  assert.equal(CANONICAL_HOSTINGER_RULES.enterprise.salesLedOnly, true);
  assert.equal(CANONICAL_ENV_KEYS.authSecret, "AUTH_SECRET");
  assert.deepEqual(getCanonicalEnvKeysForGroup("auth"), CANONICAL_ENV_GROUPS.auth);
  assert.equal(
    CANONICAL_DIFY_FIELD_KEYS.includes("plan_code"),
    true
  );
  assert.equal(isCanonicalPlanCode("starter"), true);
  assert.equal(isCanonicalPlanCode("growth"), false);

  console.log("canonical-domain tests passed");
}

runCanonicalDomainTests();
