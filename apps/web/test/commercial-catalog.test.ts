import assert from "node:assert/strict";
import { CanonicalPlanKey } from "@evolve-edge/db";
import {
  getCanonicalCommercialPlanDefinition,
  getCanonicalPricingSummary,
  mapCanonicalPlanKeyToCanonicalPlanCode,
  resolveCanonicalPlanCode,
  resolveCanonicalPlanCodeFromRevenuePlanCode,
  resolveRevenuePlanCodeForCanonicalPlan,
  supportsStripeCheckoutForCanonicalPlan
} from "../lib/commercial-catalog";

function runCommercialCatalogTests() {
  assert.equal(resolveCanonicalPlanCode("starter"), "starter");
  assert.equal(resolveCanonicalPlanCode("growth"), "scale");
  assert.equal(resolveCanonicalPlanCodeFromRevenuePlanCode("growth-annual"), "scale");
  assert.equal(resolveRevenuePlanCodeForCanonicalPlan("starter"), "starter-annual");
  assert.equal(resolveRevenuePlanCodeForCanonicalPlan("scale"), "scale-annual");
  assert.equal(resolveRevenuePlanCodeForCanonicalPlan("enterprise"), "enterprise-annual");
  assert.equal(mapCanonicalPlanKeyToCanonicalPlanCode(CanonicalPlanKey.GROWTH), "scale");
  assert.equal(supportsStripeCheckoutForCanonicalPlan("starter"), true);
  assert.equal(supportsStripeCheckoutForCanonicalPlan("enterprise"), false);
  assert.equal(
    getCanonicalCommercialPlanDefinition("scale")?.publicPriceLabel,
    "$7,500 one-time"
  );
  assert.equal(getCanonicalPricingSummary().length, 3);

  console.log("commercial-catalog tests passed");
}

runCommercialCatalogTests();
