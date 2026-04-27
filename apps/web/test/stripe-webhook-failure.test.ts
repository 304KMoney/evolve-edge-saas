import assert from "node:assert/strict";
import { shouldEmitStripeWebhookFailureArtifacts } from "../lib/stripe-webhook-failure";

function runStripeWebhookFailureTests() {
  assert.equal(
    shouldEmitStripeWebhookFailureArtifacts({
      transitioned: true,
      billingEventId: "be_123",
      organizationId: "org_123"
    }),
    true
  );

  assert.equal(
    shouldEmitStripeWebhookFailureArtifacts({
      transitioned: false,
      billingEventId: "be_123",
      organizationId: "org_123"
    }),
    false
  );

  assert.equal(
    shouldEmitStripeWebhookFailureArtifacts({
      transitioned: true,
      billingEventId: "be_123",
      organizationId: null
    }),
    false
  );

  console.log("stripe-webhook-failure tests passed");
}

runStripeWebhookFailureTests();
