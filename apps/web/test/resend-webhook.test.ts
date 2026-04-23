import assert from "node:assert/strict";
import { EmailNotificationStatus } from "@evolve-edge/db";
import {
  buildResendNotificationStatusUpdate,
  getResendFailureMessage,
  isResendFailureEvent,
  shouldSkipResendNotificationSideEffects
} from "../lib/resend-webhook";

function runResendWebhookTests() {
  assert.equal(isResendFailureEvent("email.bounced"), true);
  assert.equal(isResendFailureEvent("email.delivered"), false);

  assert.equal(
    getResendFailureMessage({
      eventType: "email.bounced",
      bounceMessage: "Mailbox unavailable"
    }),
    "Mailbox unavailable"
  );
  assert.equal(
    getResendFailureMessage({
      eventType: "email.delivery_delayed",
      bounceMessage: ""
    }),
    "Resend reported email.delivery_delayed"
  );

  assert.equal(
    shouldSkipResendNotificationSideEffects({
      eventType: "email.delivered",
      notification: {
        status: EmailNotificationStatus.SENT,
        lastError: null
      }
    }),
    true
  );

  assert.equal(
    shouldSkipResendNotificationSideEffects({
      eventType: "email.bounced",
      notification: {
        status: EmailNotificationStatus.FAILED,
        lastError: "Mailbox unavailable"
      },
      failureMessage: "Mailbox unavailable"
    }),
    true
  );

  assert.equal(
    shouldSkipResendNotificationSideEffects({
      eventType: "email.bounced",
      notification: {
        status: EmailNotificationStatus.FAILED,
        lastError: "Older failure"
      },
      failureMessage: "Mailbox unavailable"
    }),
    false
  );

  const now = new Date("2026-04-22T14:30:00.000Z");
  const deliveredUpdate = buildResendNotificationStatusUpdate({
    eventType: "email.delivered",
    notification: {
      status: EmailNotificationStatus.PROCESSING,
      sentAt: null
    },
    now
  });
  assert.deepEqual(deliveredUpdate, {
    status: EmailNotificationStatus.SENT,
    sentAt: now,
    failedAt: null,
    lastError: null,
    nextRetryAt: null
  });

  const failedUpdate = buildResendNotificationStatusUpdate({
    eventType: "email.bounced",
    notification: {
      status: EmailNotificationStatus.FAILED,
      sentAt: null
    },
    failureMessage: "Mailbox unavailable",
    now
  });
  assert.deepEqual(failedUpdate, {
    status: EmailNotificationStatus.FAILED,
    failedAt: now,
    lastError: "Mailbox unavailable",
    nextRetryAt: null
  });

  console.log("resend-webhook tests passed");
}

runResendWebhookTests();
