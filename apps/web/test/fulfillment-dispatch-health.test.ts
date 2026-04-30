import assert from "node:assert/strict";
import { prisma } from "@evolve-edge/db";
import { getFulfillmentDispatchHealthSnapshot } from "../lib/fulfillment-health";

async function runFulfillmentDispatchHealthTests() {
  const env = process.env as Record<string, string | undefined>;
  const originalN8nWorkflowDestinations = env.N8N_WORKFLOW_DESTINATIONS;
  const originalWorkflowDispatchFindFirst = prisma.workflowDispatch.findFirst;
  const originalWebhookDeliveryFindMany = prisma.webhookDelivery.findMany;

  env.N8N_WORKFLOW_DESTINATIONS = JSON.stringify([
    {
      name: "auditRequested",
      url: "https://n8n.example.com/webhook/audit-requested"
    },
    {
      name: "leadPipeline",
      url: "https://n8n.example.com/webhook/lead-pipeline"
    },
    {
      name: "reportReady",
      url: "notaurl"
    }
  ]);

  (prisma.workflowDispatch.findFirst as any) = async () => ({
    id: "wd_123",
    status: "FAILED",
    responseStatus: 504,
    lastError: "Timed out",
    lastAttemptAt: new Date("2026-04-26T13:00:00.000Z"),
    dispatchedAt: new Date("2026-04-26T12:59:00.000Z"),
    deliveredAt: null,
    updatedAt: new Date("2026-04-26T13:01:00.000Z")
  });
  (prisma.webhookDelivery.findMany as any) = async () => [
    {
      id: "whd_456",
      destination: "leadPipeline",
      status: "DELIVERED",
      responseStatus: 200,
      lastError: null,
      lastAttemptAt: new Date("2026-04-26T13:02:00.000Z"),
      deliveredAt: new Date("2026-04-26T13:02:30.000Z"),
      updatedAt: new Date("2026-04-26T13:02:30.000Z"),
      event: {
        type: "lead.captured",
        aggregateType: "leadSubmission"
      }
    },
    {
      id: "whd_789",
      destination: "billingRecovery",
      status: "FAILED",
      responseStatus: 500,
      lastError: "Destination returned 500",
      lastAttemptAt: new Date("2026-04-26T12:00:00.000Z"),
      deliveredAt: null,
      updatedAt: new Date("2026-04-26T12:01:00.000Z"),
      event: {
        type: "payment.failed",
        aggregateType: "billingEvent"
      }
    }
  ];

  try {
    const snapshot = await getFulfillmentDispatchHealthSnapshot();
    assert.equal(snapshot.ok, true);
    assert.equal(snapshot.dispatchTarget.workflow, "auditRequested");
    assert.equal(snapshot.dispatchTarget.configured, true);
    assert.equal(snapshot.dispatchTarget.urlHost, "n8n.example.com");
    assert.equal(snapshot.recentOutcome?.dispatchId, "wd_123");

    assert.equal(snapshot.workflowDestinations.length, 9);

    const auditRequested = snapshot.workflowDestinations.find(
      (entry) => entry.workflow === "auditRequested"
    );
    assert.equal(auditRequested?.dispatchChannel, "workflow_dispatch");
    assert.equal(auditRequested?.latestOutcome?.recordType, "workflowDispatch");

    const leadPipeline = snapshot.workflowDestinations.find(
      (entry) => entry.workflow === "leadPipeline"
    );
    assert.equal(leadPipeline?.configured, true);
    assert.equal(leadPipeline?.latestOutcome?.recordType, "webhookDelivery");
    assert.equal(leadPipeline?.latestOutcome?.eventType, "lead.captured");
    assert.equal(leadPipeline?.urlHost, "n8n.example.com");

    const reportReady = snapshot.workflowDestinations.find(
      (entry) => entry.workflow === "reportReady"
    );
    assert.equal(reportReady?.configured, true);
    assert.equal(reportReady?.urlHost, null);
    assert.equal(reportReady?.latestOutcome, null);

    const customerOnboarding = snapshot.workflowDestinations.find(
      (entry) => entry.workflow === "customerOnboarding"
    );
    assert.equal(customerOnboarding?.configured, false);
    assert.deepEqual(customerOnboarding?.expectedEvents, [
      "org.created",
      "onboarding.completed"
    ]);
  } finally {
    if (originalN8nWorkflowDestinations === undefined) {
      delete env.N8N_WORKFLOW_DESTINATIONS;
    } else {
      env.N8N_WORKFLOW_DESTINATIONS = originalN8nWorkflowDestinations;
    }

    (prisma.workflowDispatch.findFirst as any) = originalWorkflowDispatchFindFirst;
    (prisma.webhookDelivery.findMany as any) = originalWebhookDeliveryFindMany;
  }

  console.log("fulfillment-dispatch-health tests passed");
}

void runFulfillmentDispatchHealthTests();
