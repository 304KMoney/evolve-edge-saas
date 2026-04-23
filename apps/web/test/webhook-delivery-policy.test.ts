import assert from "node:assert/strict";
import { WebhookDeliveryStatus } from "@evolve-edge/db";
import {
  canReplayWebhookDelivery,
  resolveRecoveredWebhookDeliveryState
} from "../lib/webhook-delivery-policy";

function runWebhookDeliveryPolicyTests() {
  const now = new Date("2026-04-22T15:00:00.000Z");

  assert.deepEqual(
    resolveRecoveredWebhookDeliveryState({
      attemptCount: 2,
      now
    }),
    {
      status: WebhookDeliveryStatus.RETRYING,
      nextRetryAt: now,
      lastError: "Webhook delivery was recovered after exceeding the processing timeout."
    }
  );

  assert.deepEqual(
    resolveRecoveredWebhookDeliveryState({
      attemptCount: 5,
      now
    }),
    {
      status: WebhookDeliveryStatus.FAILED,
      nextRetryAt: null,
      lastError: "Webhook delivery exhausted retries after becoming stale in processing."
    }
  );

  assert.equal(canReplayWebhookDelivery(WebhookDeliveryStatus.FAILED), true);
  assert.equal(canReplayWebhookDelivery(WebhookDeliveryStatus.RETRYING), true);
  assert.equal(canReplayWebhookDelivery(WebhookDeliveryStatus.PENDING), true);
  assert.equal(canReplayWebhookDelivery(WebhookDeliveryStatus.DELIVERED), false);
  assert.equal(canReplayWebhookDelivery(WebhookDeliveryStatus.PROCESSING), false);

  console.log("webhook-delivery-policy tests passed");
}

runWebhookDeliveryPolicyTests();
