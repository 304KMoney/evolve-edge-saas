import assert from "node:assert/strict";
import {
  OperationsQueueSeverity,
  OperationsQueueSourceSystem,
  OperationsQueueStatus,
  OperationsQueueType
} from "@evolve-edge/db";
import { recordStripeMissingContextFinding } from "../lib/stripe-missing-context";

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
    historyEntries
  };
}

async function runStripeMissingContextTests() {
  const skippedFixture = createMockDb();
  const skipped = await recordStripeMissingContextFinding({
    organizationId: null,
    stripeEventId: "evt_missing_org",
    stripeEventType: "invoice.paid",
    sourceRecordType: "invoice",
    sourceRecordId: "in_123",
    missing: ["organizationId", "stripeSubscriptionId"],
    db: skippedFixture.db as never
  });

  assert.equal(skipped, null);
  assert.equal(skippedFixture.createdItems.length, 0);

  const createdFixture = createMockDb();
  const created = await recordStripeMissingContextFinding({
    organizationId: "org_123",
    stripeEventId: "evt_123",
    stripeEventType: "invoice.paid",
    sourceRecordType: "invoice",
    sourceRecordId: "in_123",
    missing: ["stripeSubscriptionId"],
    metadata: {
      stripeCustomerId: "cus_123"
    },
    db: createdFixture.db as never
  });

  assert.ok(created);
  assert.equal(created?.queueType, OperationsQueueType.BILLING_ANOMALY);
  assert.equal(created?.severity, OperationsQueueSeverity.HIGH);
  assert.equal(created?.sourceSystem, OperationsQueueSourceSystem.STRIPE);
  assert.equal(created?.sourceRecordType, "invoice");
  assert.equal(created?.sourceRecordId, "in_123");
  assert.equal(createdFixture.historyEntries.length, 1);

  const metadata = created?.metadata as Record<string, unknown>;
  assert.equal(metadata.stripeEventId, "evt_123");
  assert.equal(metadata.stripeEventType, "invoice.paid");
  assert.deepEqual(metadata.missing, ["stripeSubscriptionId"]);
  assert.equal(metadata.stripeCustomerId, "cus_123");

  console.log("stripe-missing-context tests passed");
}

void runStripeMissingContextTests();
