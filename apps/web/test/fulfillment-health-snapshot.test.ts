import assert from "node:assert/strict";
import { CustomerRunStatus, WorkflowDispatchStatus, prisma } from "@evolve-edge/db";
import { getFulfillmentHealthSnapshot } from "../lib/fulfillment-health";

async function runFulfillmentHealthSnapshotTests() {
  const originalCustomerRunCount = prisma.customerRun.count;
  const originalWorkflowDispatchCount = prisma.workflowDispatch.count;
  const originalWorkflowDispatchFindFirst = prisma.workflowDispatch.findFirst;
  const originalDeliveryStateFindMany = prisma.deliveryStateRecord.findMany;
  const originalCustomerRunFindMany = prisma.customerRun.findMany;
  const originalWebhookDeliveryFindMany = prisma.webhookDelivery.findMany;

  (prisma.customerRun.count as any) = async (input: {
    where?: { status?: { in?: string[] } | string };
  }) => {
    const status = input.where?.status;
    if (typeof status === "string") {
      return status === CustomerRunStatus.ACTION_REQUIRED ? 1 : 0;
    }
    return Array.isArray(status?.in) ? 2 : 0;
  };

  (prisma.workflowDispatch.count as any) = async () => 1;
  (prisma.workflowDispatch.findFirst as any) = async () => ({
    id: "wd_latest",
    status: WorkflowDispatchStatus.FAILED,
    destination: "auditRequested",
    updatedAt: new Date("2026-04-22T15:00:00.000Z"),
    lastError: "Timed out"
  });
  (prisma.deliveryStateRecord.findMany as any) = async () => [
    {
      id: "ds_123",
      organizationId: "org_123",
      reportId: "rep_123",
      workflowDispatchId: "wd_123",
      status: "DELIVERED",
      updatedAt: new Date("2026-04-22T15:05:00.000Z"),
      deliveredAt: new Date("2026-04-22T15:05:00.000Z"),
      failedAt: null,
      lastError: null,
      sourceRecordType: "report",
      sourceRecordId: "rep_123",
      organization: {
        id: "org_123",
        name: "Acme Health",
        slug: "acme-health"
      },
      workflowDispatch: {
        id: "wd_123",
        status: "SUCCEEDED",
        attemptCount: 1,
        lastError: null,
        updatedAt: new Date("2026-04-22T15:03:00.000Z"),
        externalExecutionId: "exec_123"
      },
      report: {
        id: "rep_123",
        title: "Acme Report",
        assessmentId: "asm_123"
      }
    }
  ];
  (prisma.customerRun.findMany as any) = async () => [
    {
      id: "run_123",
      reportId: "rep_123",
      assessmentId: "asm_123",
      status: "RUNNING",
      currentStep: "DELIVERY",
      lastError: null,
      retryCount: 0,
      lastRecoveredAt: null,
      lastRecoveryNote: null,
      updatedAt: new Date("2026-04-22T15:04:00.000Z"),
      createdAt: new Date("2026-04-22T14:00:00.000Z")
    }
  ];
  (prisma.webhookDelivery.findMany as any) = async () => [];

  try {
    const snapshot = await getFulfillmentHealthSnapshot();

    assert.equal(snapshot.ok, true);
    assert.equal(snapshot.status, "attention");
    assert.deepEqual(snapshot.reconciliation.counts, {
      aligned: 0,
      attention: 1,
      recovered: 0,
      critical: 1
    });
    assert.equal(
      snapshot.reconciliation.recentAttention[0]?.code,
      "delivery_completed_but_run_open"
    );
    assert.equal(snapshot.pipeline.workflowDispatches.latestStatus?.id, "wd_latest");
  } finally {
    (prisma.customerRun.count as any) = originalCustomerRunCount;
    (prisma.workflowDispatch.count as any) = originalWorkflowDispatchCount;
    (prisma.workflowDispatch.findFirst as any) = originalWorkflowDispatchFindFirst;
    (prisma.deliveryStateRecord.findMany as any) = originalDeliveryStateFindMany;
    (prisma.customerRun.findMany as any) = originalCustomerRunFindMany;
    (prisma.webhookDelivery.findMany as any) = originalWebhookDeliveryFindMany;
  }

  console.log("fulfillment-health-snapshot tests passed");
}

void runFulfillmentHealthSnapshotTests();
