import { EmailNotificationStatus } from "@evolve-edge/db";

export type ResendWebhookEventType =
  | "email.delivered"
  | "email.bounced"
  | "email.complained"
  | "email.delivery_delayed"
  | string;

export function isResendFailureEvent(eventType: string) {
  return ["email.bounced", "email.complained", "email.delivery_delayed"].includes(eventType);
}

export function getResendFailureMessage(input: {
  eventType: string;
  bounceMessage?: string | null;
}) {
  const normalizedBounceMessage = input.bounceMessage?.trim();
  return normalizedBounceMessage && normalizedBounceMessage.length > 0
    ? normalizedBounceMessage.slice(0, 1000)
    : `Resend reported ${input.eventType}`;
}

export function shouldSkipResendNotificationSideEffects(input: {
  eventType: ResendWebhookEventType;
  notification:
    | {
        status: EmailNotificationStatus;
        lastError?: string | null;
      }
    | null;
  failureMessage?: string | null;
}) {
  if (!input.notification) {
    return false;
  }

  if (
    input.eventType === "email.delivered" &&
    input.notification.status === EmailNotificationStatus.SENT
  ) {
    return true;
  }

  if (
    isResendFailureEvent(input.eventType) &&
    input.notification.status === EmailNotificationStatus.FAILED
  ) {
    const previousMessage = input.notification.lastError?.trim() ?? "";
    const nextMessage = input.failureMessage?.trim() ?? "";

    return previousMessage.length > 0 && previousMessage === nextMessage;
  }

  return false;
}

export function buildResendNotificationStatusUpdate(input: {
  eventType: ResendWebhookEventType;
  notification:
    | {
        status: EmailNotificationStatus;
        sentAt?: Date | null;
      }
    | null;
  failureMessage?: string | null;
  now?: Date;
}) {
  if (!input.notification) {
    return null;
  }

  const now = input.now ?? new Date();

  if (input.eventType === "email.delivered") {
    return {
      status: EmailNotificationStatus.SENT,
      sentAt: input.notification.sentAt ?? now,
      failedAt: null,
      lastError: null,
      nextRetryAt: null
    };
  }

  if (isResendFailureEvent(input.eventType)) {
    return {
      status: EmailNotificationStatus.FAILED,
      failedAt: now,
      lastError: input.failureMessage ?? `Resend reported ${input.eventType}`,
      nextRetryAt: null
    };
  }

  return null;
}
