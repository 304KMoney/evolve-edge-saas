import assert from "node:assert/strict";
import {
  OperationsQueueSeverity,
  OperationsQueueSourceSystem,
  OperationsQueueStatus,
  OperationsQueueType
} from "@evolve-edge/db";
import { recordOperationalFinding } from "../lib/operations-queues";

function createMockDb() {
  const createdItems: Array<Record<string, unknown>> = [];
  const updatedItems: Array<Record<string, unknown>> = [];
  const historyEntries: Array<Record<string, unknown>> = [];
  const existingByDedupeKey = new Map<string, Record<string, unknown>>();

  const db = {
    customerAccount: {
      async findFirst() {
        return null;
      }
    },
    operationsQueueItem: {
      async findUnique(input: { where: { dedupeKey: string } }) {
        return existingByDedupeKey.get(input.where.dedupeKey) ?? null;
      },
      async create(input: { data: Record<string, unknown> }) {
        const created: Record<string, unknown> = {
          id: "queue_1",
          status: OperationsQueueStatus.NEW,
          ...input.data
        };
        createdItems.push(created);
        existingByDedupeKey.set(String(created.dedupeKey), created);
        return created;
      },
      async update(input: {
        where: { id: string };
        data: Record<string, unknown>;
      }) {
        const existing = Array.from(existingByDedupeKey.values()).find(
          (item) => item.id === input.where.id
        );
        assert.ok(existing, "existing queue item should be present");
        const updated = {
          ...existing,
          ...input.data
        };
        updatedItems.push(updated);
        existingByDedupeKey.set(String(updated.dedupeKey), updated);
        return updated;
      }
    },
    operationsQueueHistoryEntry: {
      async create(input: { data: Record<string, unknown> }) {
        historyEntries.push(input.data);
        return input.data;
      }
    }
  };

  return {
    db,
    createdItems,
    updatedItems,
    historyEntries,
    existingByDedupeKey
  };
}

async function runOperationsFindingsTests() {
  const createdFixture = createMockDb();

  const created = await recordOperationalFinding(
    {
      organizationId: "org_123",
      queueType: OperationsQueueType.BILLING_ANOMALY,
      ruleCode: "billing.webhook_processing_failed",
      severity: OperationsQueueSeverity.HIGH,
      sourceSystem: OperationsQueueSourceSystem.STRIPE,
      sourceRecordType: "billingEvent",
      sourceRecordId: "billing_evt_123",
      title: "Stripe webhook processing failed",
      summary: "A billing event could not be normalized into backend state."
    },
    createdFixture.db as never
  );

  assert.equal(createdFixture.createdItems.length, 1);
  assert.equal(created.status, OperationsQueueStatus.NEW);
  assert.equal(createdFixture.historyEntries.length, 1);

  const reopenedFixture = createMockDb();
  const dedupeKey = [
    OperationsQueueType.SUCCESS_RISK,
    "success.workflow_execution_failed",
    "org_123",
    "account:none",
    "workflowDispatch",
    "dispatch_123"
  ].join(":");

  reopenedFixture.existingByDedupeKey.set(dedupeKey, {
    id: "queue_2",
    organizationId: "org_123",
    customerAccountId: null,
    queueType: OperationsQueueType.SUCCESS_RISK,
    ruleCode: "success.workflow_execution_failed",
    dedupeKey,
    sourceSystem: OperationsQueueSourceSystem.APP,
    sourceRecordType: "workflowDispatch",
    sourceRecordId: "dispatch_123",
    severity: OperationsQueueSeverity.HIGH,
    status: OperationsQueueStatus.RESOLVED,
    title: "Workflow execution failed",
    summary: "Old summary",
    statusUpdatedAt: new Date(),
    resolvedAt: new Date(),
    dismissedAt: null
  });

  const reopened = await recordOperationalFinding(
    {
      organizationId: "org_123",
      queueType: OperationsQueueType.SUCCESS_RISK,
      ruleCode: "success.workflow_execution_failed",
      severity: OperationsQueueSeverity.HIGH,
      sourceSystem: OperationsQueueSourceSystem.APP,
      sourceRecordType: "workflowDispatch",
      sourceRecordId: "dispatch_123",
      title: "Workflow execution failed after orchestration started",
      summary: "The workflow failed after n8n acknowledged it."
    },
    reopenedFixture.db as never
  );

  assert.equal(reopenedFixture.updatedItems.length, 1);
  assert.equal(reopened.status, OperationsQueueStatus.NEW);
  assert.equal(reopenedFixture.historyEntries.length, 1);

  console.log("operations-findings tests passed");
}

void runOperationsFindingsTests();
