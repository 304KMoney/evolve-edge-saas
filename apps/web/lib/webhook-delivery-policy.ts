import { WebhookDeliveryStatus } from "@evolve-edge/db";

const MAX_DELIVERY_ATTEMPTS = 5;

export function resolveRecoveredWebhookDeliveryState(input: {
  attemptCount: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const exhausted = input.attemptCount >= MAX_DELIVERY_ATTEMPTS;

  return {
    status: exhausted
      ? WebhookDeliveryStatus.FAILED
      : WebhookDeliveryStatus.RETRYING,
    nextRetryAt: exhausted ? null : now,
    lastError: exhausted
      ? "Webhook delivery exhausted retries after becoming stale in processing."
      : "Webhook delivery was recovered after exceeding the processing timeout."
  };
}

export function canReplayWebhookDelivery(status: WebhookDeliveryStatus) {
  return (
    status === WebhookDeliveryStatus.FAILED ||
    status === WebhookDeliveryStatus.RETRYING ||
    status === WebhookDeliveryStatus.PENDING
  );
}
