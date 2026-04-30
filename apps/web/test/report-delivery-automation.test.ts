import assert from "node:assert/strict";
import { BillingAccessState } from "@evolve-edge/db";
import {
  isPaidReportDeliveryAccessState,
  queuePostReportDeliveryAutomation
} from "../lib/report-delivery-automation";

async function runReportDeliveryAutomationTests() {
  {
    assert.equal(isPaidReportDeliveryAccessState(BillingAccessState.ACTIVE), true);
    assert.equal(isPaidReportDeliveryAccessState(BillingAccessState.GRACE_PERIOD), true);
    assert.equal(isPaidReportDeliveryAccessState(BillingAccessState.TRIALING), false);
    assert.equal(isPaidReportDeliveryAccessState(BillingAccessState.PAST_DUE), false);
  }

  {
    const queuedEmails: Array<Record<string, unknown>> = [];
    const publishedEvents: Array<Record<string, unknown>> = [];
    let syncedOrganizationId: string | null = null;
    const deliveredAt = new Date("2026-04-24T15:00:00.000Z");

    await queuePostReportDeliveryAutomation({
      db: {
        emailNotification: {
          upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
            queuedEmails.push({ ...create, ...update });
            return { id: `email_${queuedEmails.length}` };
          }
        },
        domainEvent: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            publishedEvents.push(data);
            return { id: `evt_${publishedEvents.length}`, ...data };
          }
        }
      } as any,
      report: {
        id: "rpt_123",
        organizationId: "org_123",
        assessmentId: "asm_123",
        customerAccountId: "acct_123",
        title: "Executive Security Audit Report",
        executiveSummary:
          "Leadership should prioritize access control cleanup and third-party review discipline.",
        customerEmailSnapshot: "customer@example.com",
        organization: {
          id: "org_123",
          name: "Example Health"
        },
        customerAccount: {
          id: "acct_123",
          primaryContactEmail: "customer@example.com",
          companyName: "Example Health"
        }
      },
      deliveryPackageId: "pkg_123",
      actorUserId: "usr_123",
      deliveredAt,
      syncEngagementPrograms: async (organizationId) => {
        syncedOrganizationId = organizationId;
      }
    });

    assert.equal(queuedEmails.length, 3);
    assert.deepEqual(
      queuedEmails.map((email) => email.templateKey),
      ["report-delivered", "report-follow-up-3-day", "report-follow-up-7-day"]
    );
    assert.equal(
      queuedEmails[1]?.nextRetryAt instanceof Date,
      true
    );
    assert.equal(
      (queuedEmails[1]?.nextRetryAt as Date).toISOString(),
      "2026-04-27T15:00:00.000Z"
    );
    assert.equal(
      (queuedEmails[2]?.nextRetryAt as Date).toISOString(),
      "2026-05-01T15:00:00.000Z"
    );
    assert.equal(syncedOrganizationId, "org_123");
    assert.deepEqual(
      publishedEvents.map((event) => event.type),
      ["report.follow_up_scheduled", "report.upsell_opportunity_refreshed"]
    );
  }

  console.log("report-delivery-automation tests passed");
}

void runReportDeliveryAutomationTests();
