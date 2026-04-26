import assert from "node:assert/strict";
import { publishDomainEvent } from "../lib/domain-events";

async function runDomainEventTests() {
  {
    let upsertArgs: Record<string, unknown> | null = null;
    const existingEvent = { id: "evt_existing", idempotencyKey: "event:123" };
    const persisted = await publishDomainEvent(
      {
        domainEvent: {
          upsert: async (args: Record<string, unknown>) => {
            upsertArgs = args;
            return existingEvent;
          }
        }
      } as any,
      {
        type: "report.generated",
        aggregateType: "report",
        aggregateId: "rpt_123",
        idempotencyKey: "event:123",
        payload: { reportId: "rpt_123" }
      }
    );

    assert.deepEqual(persisted, existingEvent);
    assert.ok(upsertArgs);
    assert.equal((upsertArgs as any).where.idempotencyKey, "event:123");
    assert.deepEqual((upsertArgs as any).update, {});
    assert.equal((upsertArgs as any).create.type, "report.generated");
    assert.equal((upsertArgs as any).create.aggregateId, "rpt_123");
  }

  console.log("domain-events tests passed");
}

void runDomainEventTests();
