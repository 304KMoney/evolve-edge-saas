import assert from "node:assert/strict";
import { CanonicalPlanKey } from "@evolve-edge/db";
import {
  getCanonicalCadencePricingSummary,
  getCanonicalCommercialPlanDefinition,
  getCanonicalPricingSummary,
  getStripeCheckoutModeForCanonicalPlan,
  mapCanonicalPlanKeyToCanonicalPlanCode,
  resolveCanonicalBillingCadence,
  resolveCanonicalPlanCode,
  resolveCanonicalPlanCodeFromRevenuePlanCode,
  resolveRevenuePlanCodeForCommercialSelection,
  resolveRevenuePlanCodeForCanonicalPlan,
  supportsStripeCheckoutForCanonicalPlan
} from "../lib/commercial-catalog";

function runCommercialCatalogTests() {
  assert.equal(resolveCanonicalPlanCode("starter"), "starter");
  assert.equal(resolveCanonicalPlanCode("growth"), "scale");
  assert.equal(resolveCanonicalBillingCadence("monthly"), "monthly");
  assert.equal(resolveCanonicalPlanCodeFromRevenuePlanCode("growth-annual"), "scale");
  assert.equal(resolveRevenuePlanCodeForCommercialSelection("starter"), "starter-annual");
  assert.equal(
    resolveRevenuePlanCodeForCommercialSelection("scale", "monthly"),
    "scale-monthly"
  );
  assert.equal(
    resolveRevenuePlanCodeForCommercialSelection("starter-annual"),
    "starter-annual"
  );
  assert.equal(resolveRevenuePlanCodeForCanonicalPlan("starter"), "starter-annual");
  assert.equal(resolveRevenuePlanCodeForCanonicalPlan("starter", "monthly"), "starter-monthly");
  assert.equal(resolveRevenuePlanCodeForCanonicalPlan("scale"), "scale-annual");
  assert.equal(resolveRevenuePlanCodeForCanonicalPlan("enterprise"), "enterprise-annual");
  assert.equal(mapCanonicalPlanKeyToCanonicalPlanCode(CanonicalPlanKey.GROWTH), "scale");
  assert.equal(supportsStripeCheckoutForCanonicalPlan("starter"), true);
  assert.equal(supportsStripeCheckoutForCanonicalPlan("enterprise"), false);
  assert.equal(getStripeCheckoutModeForCanonicalPlan("starter"), "subscription");
  assert.equal(
    getCanonicalCommercialPlanDefinition("scale")?.publicPriceLabel,
    "Starting at $18,500 / month"
  );
  assert.equal(getCanonicalCadencePricingSummary("starter").monthly.label, "$5,000 / month");
  assert.equal(getCanonicalCommercialPlanDefinition("enterprise")?.publicPriceUsd, null);
  assert.equal(getCanonicalPricingSummary().length, 3);

  console.log("commercial-catalog tests passed");
}

runCommercialCatalogTests();
