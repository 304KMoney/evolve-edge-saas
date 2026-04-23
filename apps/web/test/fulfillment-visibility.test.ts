import assert from "node:assert/strict";
import {
  CustomerRunStatus,
  DeliveryStateStatus,
  WebhookDeliveryStatus,
  WorkflowDispatchStatus
} from "@evolve-edge/db";
import {
  buildFulfillmentVisibilityEntry,
  buildFulfillmentVisibilitySummary
} from "../lib/fulfillment-visibility";

function buildBaseVisibilityInput() {
  return {
    organization: {
      id: "org_123",
      name: "Acme Health",
      slug: "acme-health"
    },
    deliveryState: {
      id: "ds_123",
      status: DeliveryStateStatus.REPORT_GENERATED,
      updatedAt: new Date("2026-04-22T12:00:00.000Z"),
      deliveredAt: null,
      failedAt: null,
      lastError: null,
      reportId: "rep_123",
      workflowDispatchId: "wd_123",
      sourceRecordType: "report",
      sourceRecordId: "rep_123"
    },
    report: {
      id: "rep_123",
      title: "Acme Q2 Audit",
      assessmentId: "asm_123"
    },
    workflowDispatch: {
      id: "wd_123",
      status: WorkflowDispatchStatus.SUCCEEDED,
      attemptCount: 1,
      lastError: null,
      updatedAt: new Date("2026-04-22T11:55:00.000Z"),
      externalExecutionId: "exec_123"
    },
    customerRun: {
      id: "run_123",
      status: CustomerRunStatus.RUNNING,
      currentStep: "CRM_SYNC",
      lastError: null,
      retryCount: 0,
      lastRecoveredAt: null,
      lastRecoveryNote: null
    },
    webhookDeliveries: [
      {
        id: "wh_123",
        destination: "hubspot-crm",
        status: WebhookDeliveryStatus.DELIVERED,
        lastError: null,
        attemptCount: 1,
        updatedAt: new Date("2026-04-22T11:58:00.000Z"),
        deliveredAt: new Date("2026-04-22T11:58:00.000Z"),
        eventType: "report.generated"
      }
    ]
  };
}

function runFulfillmentVisibilityTests() {
  {
    const entry = buildFulfillmentVisibilityEntry(buildBaseVisibilityInput());

    assert.equal(entry.status, "aligned");
    assert.equal(entry.code, "aligned");
    assert.equal(entry.linkage.customerRunId, "run_123");
  }

  {
    const entry = buildFulfillmentVisibilityEntry({
      ...buildBaseVisibilityInput(),
      deliveryState: {
        ...buildBaseVisibilityInput().deliveryState,
        status: DeliveryStateStatus.DELIVERED,
        deliveredAt: new Date("2026-04-22T12:05:00.000Z")
      }
    });

    assert.equal(entry.status, "attention");
    assert.equal(entry.severity, "critical");
    assert.equal(entry.code, "delivery_completed_but_run_open");
  }

  {
    const entry = buildFulfillmentVisibilityEntry({
      ...buildBaseVisibilityInput(),
      customerRun: null
    });

    assert.equal(entry.status, "attention");
    assert.equal(entry.code, "delivery_state_missing_customer_run");
  }

  {
    const entry = buildFulfillmentVisibilityEntry({
      ...buildBaseVisibilityInput(),
      webhookDeliveries: [
        {
          id: "wh_456",
          destination: "hubspot-crm",
          status: WebhookDeliveryStatus.FAILED,
          lastError: "HubSpot 500",
          attemptCount: 3,
          updatedAt: new Date("2026-04-22T12:06:00.000Z"),
          deliveredAt: null,
          eventType: "report.generated"
        }
      ]
    });

    assert.equal(entry.status, "attention");
    assert.equal(entry.code, "crm_delivery_failed_without_run_attention");
    assert.deepEqual(entry.state.failedDestinations, ["hubspot-crm"]);
  }

  {
    const entry = buildFulfillmentVisibilityEntry({
      ...buildBaseVisibilityInput(),
      customerRun: {
        ...buildBaseVisibilityInput().customerRun,
        status: CustomerRunStatus.COMPLETED,
        currentStep: "DELIVERY",
        lastRecoveredAt: new Date("2026-04-22T12:03:00.000Z")
      }
    });

    assert.equal(entry.status, "recovered");
    assert.equal(entry.code, "recently_recovered");
  }

  {
    const summary = buildFulfillmentVisibilitySummary([
      buildFulfillmentVisibilityEntry(buildBaseVisibilityInput()),
      buildFulfillmentVisibilityEntry({
        ...buildBaseVisibilityInput(),
        deliveryState: {
          ...buildBaseVisibilityInput().deliveryState,
          status: DeliveryStateStatus.DELIVERED,
          deliveredAt: new Date("2026-04-22T12:05:00.000Z")
        }
      }),
      buildFulfillmentVisibilityEntry({
        ...buildBaseVisibilityInput(),
        customerRun: {
          ...buildBaseVisibilityInput().customerRun,
          status: CustomerRunStatus.COMPLETED,
          currentStep: "DELIVERY",
          lastRecoveredAt: new Date("2026-04-22T12:03:00.000Z")
        }
      })
    ]);

    assert.deepEqual(summary.counts, {
      aligned: 1,
      attention: 1,
      recovered: 1,
      critical: 1
    });
    assert.equal(summary.recentAttention[0]?.code, "delivery_completed_but_run_open");
    assert.equal(summary.recentRecovered[0]?.code, "recently_recovered");
  }

  console.log("fulfillment-visibility tests passed");
}

runFulfillmentVisibilityTests();
