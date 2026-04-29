import assert from "node:assert/strict";
import { resolveBillingReturnDestination } from "../lib/first-customer-journey";

function runFirstCustomerJourneyTests() {
  assert.equal(
    resolveBillingReturnDestination({
      status: "success",
      intakeComplete: false
    }),
    "/onboarding?billing=success"
  );

  assert.equal(
    resolveBillingReturnDestination({
      status: "success",
      intakeComplete: true
    }),
    "/dashboard?billing=success"
  );

  assert.equal(
    resolveBillingReturnDestination({
      status: "processing",
      intakeComplete: false
    }),
    "/onboarding?billing=processing"
  );

  assert.equal(
    resolveBillingReturnDestination({
      status: "cancelled",
      intakeComplete: true,
      queryString: "billing=cancelled&planCode=scale"
    }),
    "/dashboard/settings?billing=cancelled&planCode=scale"
  );

  assert.equal(
    resolveBillingReturnDestination({
      status: "portal",
      intakeComplete: true
    }),
    "/dashboard/settings?billing=portal-returned"
  );

  console.log("first customer journey tests passed");
}

runFirstCustomerJourneyTests();
