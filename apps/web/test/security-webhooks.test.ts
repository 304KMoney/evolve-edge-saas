import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  STRIPE_SIGNATURE_TOLERANCE_SECONDS,
  verifyStripeWebhookSignature,
  verifySvixWebhookSignature
} from "../lib/security-webhooks";

function buildStripeSignature(payload: string, secret: string, timestamp: number) {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  return `t=${timestamp},v1=${signature}`;
}


function buildSvixSignature(input: {
  payload: string;
  secret: string;
  messageId: string;
  timestamp: number;
}) {
  const normalizedSecret = input.secret.startsWith("whsec_")
    ? input.secret.slice("whsec_".length)
    : input.secret;
  const key = Buffer.from(normalizedSecret, "base64");
  const signedPayload = `${input.messageId}.${input.timestamp}.${input.payload}`;
  const signature = createHmac("sha256", key).update(signedPayload).digest("base64");

  return `v1,${signature}`;
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


  const svixSecret = "whsec_" + Buffer.from("svix_test_secret").toString("base64");
  const svixMessageId = "msg_123";
  const svixTimestamp = Math.floor(Date.now() / 1000);
  const svixSignature = buildSvixSignature({
    payload,
    secret: svixSecret,
    messageId: svixMessageId,
    timestamp: svixTimestamp
  });

  assert.doesNotThrow(() =>
    verifySvixWebhookSignature({
      payload,
      webhookSecret: svixSecret,
      messageId: svixMessageId,
      timestamp: String(svixTimestamp),
      signatureHeader: svixSignature
    })
  );

  assert.throws(
    () =>
      verifySvixWebhookSignature({
        payload,
        webhookSecret: svixSecret,
        messageId: svixMessageId,
        timestamp: String(svixTimestamp),
        signatureHeader: "v1,invalid"
      }),
    /Invalid webhook signature/
  );


  console.log("security-webhooks tests passed");
}

runSecurityWebhookTests();
