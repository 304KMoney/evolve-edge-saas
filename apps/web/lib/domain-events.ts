import { Prisma, prisma } from "@evolve-edge/db";

type EventStoreClient = Prisma.TransactionClient | typeof prisma;

export type DomainEventInput = {
  type: string;
  aggregateType: string;
  aggregateId: string;
  orgId?: string | null;
  userId?: string | null;
  idempotencyKey: string;
  occurredAt?: Date;
  payload: Prisma.InputJsonValue;
  status?: "PENDING" | "PROCESSING" | "PROCESSED" | "FAILED";
};

// Domain events are persisted before any external automation exists.
// For now the lifecycle is:
// 1. app writes a PENDING event
// 2. idempotencyKey prevents duplicate writes on retries/replays
// 3. future dispatchers can claim, process, and advance status
export async function publishDomainEvent(
  db: EventStoreClient,
  event: DomainEventInput
) {
  return db.domainEvent.upsert({
    where: { idempotencyKey: event.idempotencyKey },
    update: {},
    create: {
      type: event.type,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      orgId: event.orgId ?? null,
      userId: event.userId ?? null,
      idempotencyKey: event.idempotencyKey,
      occurredAt: event.occurredAt ?? new Date(),
      payload: event.payload,
      status: event.status ?? "PENDING"
    }
  });
}

export async function publishDomainEvents(
  db: EventStoreClient,
  events: DomainEventInput[]
) {
  const persisted = [];

  for (const event of events) {
    persisted.push(await publishDomainEvent(db, event));
  }

  return persisted;
}
