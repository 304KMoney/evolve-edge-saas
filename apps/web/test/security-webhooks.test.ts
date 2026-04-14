import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  STRIPE_SIGNATURE_TOLERANCE_SECONDS,
  verifyStripeWebhookSignature
} from "../lib/security-webhooks";

function buildStripeSignature(payload: string, secret: string, timestamp: number) {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  return `t=${timestamp},v1=${signature}`;
}

function runSecurityWebhookTests() {
  const payload = JSON.stringify({
    id: "evt_123",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_123"
      }
    }
  });
  const secret = "whsec_test_secret";
  const timestamp = Math.floor(Date.now() / 1000);
  const signatureHeader = buildStripeSignature(payload, secret, timestamp);

  const verified = verifyStripeWebhookSignature({
    payload,
    signatureHeader,
    webhookSecret: secret
  }) as Record<string, unknown>;

  assert.equal(verified.id, "evt_123");
  assert.equal(verified.type, "checkout.session.completed");

  assert.throws(
    () =>
      verifyStripeWebhookSignature({
        payload,
        signatureHeader: `t=${timestamp},v1=invalidsignature`,
        webhookSecret: secret
      }),
    /Invalid Stripe webhook signature/
  );

  assert.throws(
    () =>
      verifyStripeWebhookSignature({
        payload,
        signatureHeader: buildStripeSignature(
          payload,
          secret,
          timestamp - STRIPE_SIGNATURE_TOLERANCE_SECONDS - 1
        ),
        webhookSecret: secret
      }),
    /outside the allowed tolerance/
  );

  assert.throws(
    () =>
      verifyStripeWebhookSignature({
        payload: "{bad json",
        signatureHeader: buildStripeSignature("{bad json", secret, timestamp),
        webhookSecret: secret
      }),
    /not valid JSON/
  );

  console.log("security-webhooks tests passed");
}

runSecurityWebhookTests();
