import assert from "node:assert/strict";
import {
  BillingEventStatus,
  DomainEventStatus,
  EventReplayTargetType,
  WebhookDeliveryStatus
} from "@evolve-edge/db";
import {
  formatReplayTargetType,
  getBillingEventReplayEligibility,
  getDomainEventReplayEligibility,
  getWebhookDeliveryReplayEligibility
} from "../lib/event-replay";

function runEventReplayTests() {
  {
    const eligibility = getBillingEventReplayEligibility({
      status: BillingEventStatus.FAILED,
      type: "invoice.payment_failed",
      lastError: "fetch failed with status 503",
      replayCount24h: 0
    });

    assert.equal(eligibility.eligible, true);
    assert.equal(eligibility.retryable, true);
    assert.equal(eligibility.normalizedState, "failed_retryable");
  }

  {
    const eligibility = getBillingEventReplayEligibility({
      status: BillingEventStatus.PROCESSED,
      type: "invoice.payment_failed",
      lastError: null,
      replayCount24h: 0
    });

    assert.equal(eligibility.eligible, false);
    assert.equal(eligibility.code, "already_processed");
  }

  {
    const eligibility = getWebhookDeliveryReplayEligibility({
      status: WebhookDeliveryStatus.FAILED,
      lastError: "Returned status 403 from downstream system.",
      destinationConfigured: true,
      replayCount24h: 0
    });

    assert.equal(eligibility.eligible, true);
    assert.equal(eligibility.retryable, false);
  }

  {
    const eligibility = getWebhookDeliveryReplayEligibility({
      status: WebhookDeliveryStatus.FAILED,
      lastError: "Missing destination configuration",
      destinationConfigured: false,
      replayCount24h: 0
    });

    assert.equal(eligibility.eligible, false);
    assert.equal(eligibility.code, "destination_missing");
  }

  {
    const eligibility = getWebhookDeliveryReplayEligibility({
      status: WebhookDeliveryStatus.PROCESSING,
      lastError: "Still running",
      destinationConfigured: true,
      replayCount24h: 0
    });

    assert.equal(eligibility.eligible, false);
    assert.equal(eligibility.code, "in_flight");
  }

  {
    const originalDestinations = process.env.OUTBOUND_WEBHOOK_DESTINATIONS;
    const originalDemoMode = process.env.DEMO_MODE_ENABLED;
    const originalDemoSideEffects = process.env.DEMO_EXTERNAL_SIDE_EFFECTS;
    process.env.OUTBOUND_WEBHOOK_DESTINATIONS = JSON.stringify([
      {
        name: "ops-primary",
        url: "https://example.com/hooks/ops"
      }
    ]);
    process.env.DEMO_MODE_ENABLED = "true";
    process.env.DEMO_EXTERNAL_SIDE_EFFECTS = "true";

    try {
      const eligibility = getDomainEventReplayEligibility({
        status: DomainEventStatus.FAILED,
        type: "report.generated",
        payload: {
          reportId: "rpt_123"
        },
        replayCount24h: 0,
        hasFailedDelivery: true
      });

      assert.equal(eligibility.eligible, true);
      assert.equal(eligibility.retryable, true);
    } finally {
      process.env.OUTBOUND_WEBHOOK_DESTINATIONS = originalDestinations;
      process.env.DEMO_MODE_ENABLED = originalDemoMode;
      process.env.DEMO_EXTERNAL_SIDE_EFFECTS = originalDemoSideEffects;
    }
  }

  {
    const eligibility = getDomainEventReplayEligibility({
      status: DomainEventStatus.PROCESSED,
      type: "report.generated",
      payload: {},
      replayCount24h: 0,
      hasFailedDelivery: false
    });

    assert.equal(eligibility.eligible, false);
    assert.equal(eligibility.code, "already_processed");
  }

  {
    const eligibility = getBillingEventReplayEligibility({
      status: BillingEventStatus.FAILED,
      type: "invoice.payment_failed",
      lastError: "timeout",
      replayCount24h: 3
    });

    assert.equal(eligibility.eligible, false);
    assert.equal(eligibility.code, "rate_limited");
  }

  {
    assert.equal(
      formatReplayTargetType(EventReplayTargetType.WEBHOOK_DELIVERY),
      "Webhook Delivery"
    );
  }

  console.log("event-replay tests passed");
}

runEventReplayTests();
