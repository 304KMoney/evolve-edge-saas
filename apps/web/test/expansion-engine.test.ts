import assert from "node:assert/strict";
import { getExpansionOffers } from "../lib/expansion-engine";

function buildBaseInput() {
  return {
    placement: "reports" as const,
    session: {
      organization: {
        role: "OWNER"
      }
    },
    entitlements: {
      features: {
        executiveReviews: false,
        prioritySupport: false
      },
      activeAssessments: 0,
      reportsGenerated: 0
    },
    usageMetering: {
      topWarning: null,
      metrics: [
        {
          key: "reportsGenerated",
          used: 0,
          status: "ok"
        },
        {
          key: "aiProcessingRuns",
          used: 0,
          status: "ok"
        }
      ]
    },
    currentPlanCode: null,
    hasStripeCustomer: false
  };
}

function runExpansionEngineTests() {
  delete process.env.AUTH_MODE;
  delete process.env.DEMO_MODE_ENABLED;
  delete process.env.DEMO_EXTERNAL_SIDE_EFFECTS;

  let offers = getExpansionOffers(buildBaseInput() as Parameters<typeof getExpansionOffers>[0]);
  assert.equal(offers[0]?.cta.kind, "checkout");

  process.env.AUTH_MODE = "demo";
  process.env.DEMO_EXTERNAL_SIDE_EFFECTS = "false";

  offers = getExpansionOffers(buildBaseInput() as Parameters<typeof getExpansionOffers>[0]);
  assert.equal(offers[0]?.cta.kind, "link");
  assert.equal(
    offers[0]?.cta.kind === "link" ? offers[0].cta.href : null,
    "/dashboard/settings?billing=demo-mode#billing-controls"
  );

  delete process.env.AUTH_MODE;
  delete process.env.DEMO_MODE_ENABLED;
  delete process.env.DEMO_EXTERNAL_SIDE_EFFECTS;

  console.log("expansion-engine tests passed");
}

runExpansionEngineTests();
