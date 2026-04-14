import {
  OperationsQueueSeverity,
  OperationsQueueSourceSystem,
  OperationsQueueType,
  Prisma,
  prisma
} from "@evolve-edge/db";
import { recordOperationalFinding } from "./operations-queues";

type StripeMissingContextDbClient = Prisma.TransactionClient | typeof prisma;

export async function recordStripeMissingContextFinding(input: {
  organizationId: string | null;
  stripeEventId: string;
  stripeEventType: string;
  sourceRecordType: string;
  sourceRecordId?: string | null;
  missing: string[];
  metadata?: Prisma.InputJsonValue;
  db?: StripeMissingContextDbClient;
}) {
  if (!input.organizationId) {
    return null;
  }

  return recordOperationalFinding(
    {
      organizationId: input.organizationId,
      queueType: OperationsQueueType.BILLING_ANOMALY,
      ruleCode: "billing.webhook_missing_context",
      severity: OperationsQueueSeverity.HIGH,
      sourceSystem: OperationsQueueSourceSystem.STRIPE,
      sourceRecordType: input.sourceRecordType,
      sourceRecordId: input.sourceRecordId ?? input.stripeEventId,
      title: "Stripe webhook is missing required billing context",
      summary:
        "A verified Stripe webhook could not advance billing state because required organization, customer, or subscription context could not be resolved safely.",
      recommendedAction:
        "Review the Stripe event metadata and existing subscription/customer bindings, then replay the event only after the missing context is corrected.",
      metadata: {
        stripeEventId: input.stripeEventId,
        stripeEventType: input.stripeEventType,
        missing: input.missing,
        ...(input.metadata &&
        typeof input.metadata === "object" &&
        !Array.isArray(input.metadata)
          ? input.metadata
          : {})
      }
    },
    input.db ?? prisma
  );
}
