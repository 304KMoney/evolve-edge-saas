import assert from "node:assert/strict";
import {
  BillingAccessState,
  EmailNotificationStatus
} from "@evolve-edge/db";
import {
  getOrganizationDeliveryOperationsSnapshot,
  getReportDeliveryEmailIdempotencyKeys,
  getReportDeliveryOperationsSnapshot,
  summarizeDeliveryNotifications
} from "../lib/report-delivery-operations";

function clearDeliveryEnv() {
  delete process.env.EMAIL_FROM_ADDRESS;
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_WEBHOOK_SIGNING_SECRET;
  delete process.env.NOTIFICATION_DISPATCH_SECRET;
  delete process.env.CRON_SECRET;
}

async function runReportDeliveryOperationsTests() {
  {
    assert.deepEqual(getReportDeliveryEmailIdempotencyKeys("rpt_123"), [
      "email:report-delivered:rpt_123",
      "email:report-follow-up-3-day:rpt_123",
      "email:report-follow-up-7-day:rpt_123"
    ]);
  }

  {
    const summary = summarizeDeliveryNotifications(
      [
        {
          id: "email_1",
          templateKey: "report-delivered",
          status: EmailNotificationStatus.SENT,
          createdAt: new Date("2026-04-24T12:00:00.000Z"),
          nextRetryAt: null,
          lastAttemptAt: new Date("2026-04-24T12:01:00.000Z"),
          sentAt: new Date("2026-04-24T12:02:00.000Z"),
          failedAt: null,
          lastError: null,
          idempotencyKey: "email:report-delivered:rpt_123"
        },
        {
          id: "email_2",
          templateKey: "report-follow-up-3-day",
          status: EmailNotificationStatus.PENDING,
          createdAt: new Date("2026-04-24T12:00:00.000Z"),
          nextRetryAt: new Date("2026-04-27T12:00:00.000Z"),
          lastAttemptAt: null,
          sentAt: null,
          failedAt: null,
          lastError: null,
          idempotencyKey: "email:report-follow-up-3-day:rpt_123"
        },
        {
          id: "email_3",
          templateKey: "report-follow-up-7-day",
          status: EmailNotificationStatus.FAILED,
          createdAt: new Date("2026-04-24T12:00:00.000Z"),
          nextRetryAt: null,
          lastAttemptAt: new Date("2026-04-24T12:05:00.000Z"),
          sentAt: null,
          failedAt: new Date("2026-04-24T12:06:00.000Z"),
          lastError: "Temporary provider timeout",
          idempotencyKey: "email:report-follow-up-7-day:rpt_123"
        }
      ],
      new Date("2026-04-25T12:00:00.000Z")
    );

    assert.equal(summary.counts.sent, 1);
    assert.equal(summary.counts.pending, 1);
    assert.equal(summary.counts.failed, 1);
    assert.equal(summary.scheduledCount, 1);
    assert.equal(summary.dueCount, 1);
    assert.equal(
      summary.latestActivityAt?.toISOString(),
      "2026-04-24T12:06:00.000Z"
    );
    assert.equal(
      "recipientEmail" in (summary.notifications[0] as Record<string, unknown>),
      false
    );
  }

  {
    clearDeliveryEnv();
    process.env.EMAIL_FROM_ADDRESS = "Evolve Edge <ops@example.com>";
    process.env.RESEND_API_KEY = "re_test_123";
    process.env.RESEND_WEBHOOK_SIGNING_SECRET = "resend_webhook_secret";
    process.env.NOTIFICATION_DISPATCH_SECRET = "notification_secret";
    process.env.CRON_SECRET = "cron_secret";

    const snapshot = await getReportDeliveryOperationsSnapshot({
      organizationId: "org_123",
      reportId: "rpt_123",
      subscriptionAccessState: BillingAccessState.ACTIVE,
      db: {
        emailNotification: {
          findMany: async () => [
            {
              id: "email_1",
              templateKey: "report-delivered",
              status: EmailNotificationStatus.SENT,
              createdAt: new Date("2026-04-24T12:00:00.000Z"),
              nextRetryAt: null,
              lastAttemptAt: new Date("2026-04-24T12:01:00.000Z"),
              sentAt: new Date("2026-04-24T12:02:00.000Z"),
              failedAt: null,
              lastError: null,
              idempotencyKey: "email:report-delivered:rpt_123"
            }
          ]
        }
      } as any
    });

    assert.equal(snapshot.billing.eligible, true);
    assert.equal(snapshot.dispatch.configured, true);
    assert.equal(snapshot.emailQueue.counts.sent, 1);
  }

  {
    clearDeliveryEnv();
    process.env.EMAIL_FROM_ADDRESS = "Evolve Edge <ops@example.com>";
    process.env.RESEND_API_KEY = "re_test_123";
    process.env.NOTIFICATION_DISPATCH_SECRET = "notification_secret";
    process.env.CRON_SECRET = "cron_secret";
    const snapshot = await getOrganizationDeliveryOperationsSnapshot({
      organizationId: "org_123",
      subscriptionAccessState: BillingAccessState.PAST_DUE,
      db: {
        emailNotification: {
          findMany: async () => [
            {
              id: "email_2",
              templateKey: "report-follow-up-3-day",
              status: EmailNotificationStatus.FAILED,
              createdAt: new Date("2026-04-24T12:00:00.000Z"),
              nextRetryAt: null,
              lastAttemptAt: new Date("2026-04-24T12:01:00.000Z"),
              sentAt: null,
              failedAt: new Date("2026-04-24T12:02:00.000Z"),
              lastError: "Missing provider config",
              idempotencyKey: "email:report-follow-up-3-day:rpt_123"
            }
          ]
        }
      } as any
    });

    assert.equal(snapshot.billing.eligible, false);
    assert.equal(snapshot.dispatch.configured, false);
    assert.equal(
      snapshot.dispatch.requiredEnv.some(
        (entry) =>
          entry.key === "RESEND_WEBHOOK_SIGNING_SECRET" && entry.configured === false
      ),
      true
    );
    assert.equal(snapshot.emailQueue.counts.failed, 1);
    assert.match(snapshot.billing.message, /blocked/i);
  }

  clearDeliveryEnv();
  console.log("report-delivery-operations tests passed");
}

void runReportDeliveryOperationsTests();
