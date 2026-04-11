import assert from "node:assert/strict";
import {
  CustomerAccountTimelineCategory,
  CustomerAccountTimelineSeverity,
  CustomerRunStatus,
  LeadSubmissionStatus,
  ProvisioningStatus,
  SubscriptionStatus
} from "@evolve-edge/db";
import {
  buildUsageQuotaTimelineEvents,
  buildCustomerRunTimelineEvents,
  buildLeadTimelineEvents,
  buildProvisioningTimelineEvents,
  buildSubscriptionTimelineEvents,
  formatAccountTimelineSourceSystem
} from "../lib/account-timeline";

function runAccountTimelineTests() {
  {
    const events = buildLeadTimelineEvents({
      customerAccountId: "cust_1",
      organizationId: "org_1",
      leads: [
        {
          id: "lead_1",
          email: "founder@example.com",
          source: "pricing",
          intent: "demo",
          stage: LeadSubmissionStatus.QUALIFIED,
          sourcePath: "/pricing",
          requestedPlanCode: "growth-annual",
          pricingContext: "primary_cta",
          submittedAt: new Date("2026-04-01T12:00:00.000Z"),
          updatedAt: new Date("2026-04-02T12:00:00.000Z")
        }
      ]
    });

    assert.equal(events.length, 2);
    assert.equal(events[0]?.category, CustomerAccountTimelineCategory.LEAD);
    assert.equal(events[1]?.eventCode, "sales.lead_qualified");
  }

  {
    const events = buildProvisioningTimelineEvents({
      customerAccountId: "cust_1",
      organizationId: "org_1",
      provisioningRequest: {
        id: "prov_1",
        sourceSystem: "app",
        status: ProvisioningStatus.FAILED,
        planCode: "growth-annual",
        crmDealId: "deal_1",
        createdAt: new Date("2026-04-01T12:00:00.000Z"),
        processedAt: null,
        failedAt: new Date("2026-04-01T13:00:00.000Z"),
        lastError: "HubSpot handoff failed."
      }
    });

    assert.equal(events.length, 2);
    assert.equal(events[1]?.severity, CustomerAccountTimelineSeverity.WARNING);
    assert.equal(events[1]?.eventCode, "system.provisioning_failed");
  }

  {
    const events = buildSubscriptionTimelineEvents({
      customerAccountId: "cust_1",
      organizationId: "org_1",
      subscriptions: [
        {
          id: "sub_1",
          status: SubscriptionStatus.CANCELED,
          accessState: "GRACE_PERIOD",
          planCodeSnapshot: "growth-annual",
          currentPeriodEnd: new Date("2026-05-01T00:00:00.000Z"),
          cancelScheduledAt: new Date("2026-04-20T00:00:00.000Z"),
          canceledAt: new Date("2026-05-01T00:00:00.000Z"),
          endedAt: null,
          reactivatedAt: null,
          lastInvoicePaidAt: new Date("2026-04-01T00:00:00.000Z"),
          lastPaymentFailedAt: new Date("2026-04-15T00:00:00.000Z"),
          lastPaymentFailureMessage: "Card declined.",
          createdAt: new Date("2026-03-01T00:00:00.000Z")
        }
      ]
    });

    assert.equal(events.some((event) => event.eventCode === "billing.payment_received"), true);
    assert.equal(events.some((event) => event.eventCode === "billing.payment_failed"), true);
    assert.equal(events.some((event) => event.eventCode === "retention.cancellation_scheduled"), true);
    assert.equal(events.some((event) => event.eventCode === "retention.subscription_ended"), true);
    assert.equal(events[0]?.title, "Subscription started");
    assert.equal(
      events.some((event) => event.title === "Payment failed"),
      true
    );
  }

  {
    const events = buildUsageQuotaTimelineEvents({
      customerAccountId: "cust_1",
      organizationId: "org_1",
      usageMeters: [
        {
          id: "meter_1",
          meterKey: "documents_processed",
          usedQuantity: 60,
          limitQuantity: 60,
          periodStart: new Date("2026-04-01T00:00:00.000Z"),
          periodEnd: new Date("2026-05-01T00:00:00.000Z"),
          lastEventAt: new Date("2026-04-15T00:00:00.000Z")
        }
      ]
    });

    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventCode, "billing.quota_exceeded");
    assert.equal(events[0]?.category, CustomerAccountTimelineCategory.BILLING);
    assert.equal(events[0]?.severity, CustomerAccountTimelineSeverity.WARNING);
  }

  {
    const events = buildCustomerRunTimelineEvents({
      customerAccountId: "cust_1",
      organizationId: "org_1",
      runs: [
        {
          id: "run_1",
          currentStep: "CRM_SYNC",
          status: CustomerRunStatus.ACTION_REQUIRED,
          source: "report_flow",
          startedAt: new Date("2026-04-01T12:00:00.000Z"),
          completedAt: null,
          lastRecoveredAt: new Date("2026-04-01T14:00:00.000Z"),
          lastRecoveryNote: "CRM retry requested by operator.",
          recoveryHint: "Retry the delivery.",
          lastError: "HubSpot unavailable."
        }
      ]
    });

    assert.equal(events.some((event) => event.eventCode === "system.customer_run_failed"), true);
    assert.equal(events.some((event) => event.eventCode === "support.customer_run_retried"), true);
  }

  {
    assert.equal(formatAccountTimelineSourceSystem("N8N" as never), "n8n");
  }

  console.log("account-timeline tests passed");
}

runAccountTimelineTests();
