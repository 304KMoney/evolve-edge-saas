import assert from "node:assert/strict";
import {
  OperationsQueueSeverity,
  OperationsQueueSourceSystem,
  OperationsQueueStatus,
  OperationsQueueType
} from "@evolve-edge/db";
import { recordDifyAnalysisFailureFinding } from "../lib/dify";

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

async function runDifyOperationsTests() {
  const retryableFixture = createMockDb();
  const skipped = await recordDifyAnalysisFailureFinding({
    organizationId: "org_123",
    analysisJobId: "job_retryable",
    assessmentId: "asm_123",
    workflowVersion: "v1",
    attemptCount: 1,
    retryable: true,
    category: "timeout",
    statusCode: 504,
    message: "Gateway timeout",
    db: retryableFixture.db as never
  });

  assert.equal(skipped, null);
  assert.equal(retryableFixture.createdItems.length, 0);

  const terminalFixture = createMockDb();
  const created = await recordDifyAnalysisFailureFinding({
    organizationId: "org_123",
    analysisJobId: "job_terminal",
    assessmentId: "asm_123",
    workflowVersion: "v1",
    attemptCount: 2,
    retryable: false,
    category: "auth",
    statusCode: 401,
    message: "Unauthorized",
    db: terminalFixture.db as never
  });

  assert.ok(created);
  assert.equal(terminalFixture.createdItems.length, 1);
  assert.equal(created?.queueType, OperationsQueueType.SUCCESS_RISK);
  assert.equal(created?.severity, OperationsQueueSeverity.HIGH);
  assert.equal(created?.sourceSystem, OperationsQueueSourceSystem.APP);

  const metadata = created?.metadata as Record<string, unknown>;
  assert.equal(metadata.analysisJobId, "job_terminal");
  assert.equal(metadata.retryable, false);
  assert.equal(metadata.category, "auth");
  assert.equal(metadata.statusCode, 401);

  const exhaustedFixture = createMockDb();
  const exhausted = await recordDifyAnalysisFailureFinding({
    organizationId: "org_123",
    analysisJobId: "job_exhausted",
    assessmentId: "asm_456",
    workflowVersion: "v1",
    attemptCount: 3,
    retryable: true,
    category: "timeout",
    statusCode: 504,
    message: "Gateway timeout",
    db: exhaustedFixture.db as never
  });

  assert.ok(exhausted);
  assert.equal(exhaustedFixture.createdItems.length, 1);

  console.log("dify-operations tests passed");
}

void runDifyOperationsTests();
