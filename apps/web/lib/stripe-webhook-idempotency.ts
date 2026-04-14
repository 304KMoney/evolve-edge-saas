import "server-only";

import { BillingEventStatus, Prisma, prisma } from "@evolve-edge/db";

export type StripeWebhookEventEnvelope = {
  id: string;
  type: string;
  payload: Prisma.InputJsonValue;
};

export type StripeWebhookClaimResult =
  | {
      claimed: true;
      reason: "claimed";
      billingEvent: {
        id: string;
        status: BillingEventStatus;
        processedAt: Date | null;
        failedAt: Date | null;
      };
    }
  | {
      claimed: false;
      reason: "processed" | "in-flight";
      billingEvent: {
        id: string;
        status: BillingEventStatus;
        processedAt: Date | null;
        failedAt: Date | null;
      };
    };

export type StripeWebhookTransitionResult = {
  transitioned: boolean;
  billingEvent: {
    id: string;
    status: BillingEventStatus;
    processedAt: Date | null;
    failedAt: Date | null;
  } | null;
};

const STALE_PROCESSING_WINDOW_MS = 10 * 60 * 1000;

export async function claimStripeWebhookEventProcessing(
  event: StripeWebhookEventEnvelope
): Promise<StripeWebhookClaimResult> {
  const billingEvent = await prisma.billingEvent.upsert({
    where: { stripeEventId: event.id },
    update: {},
    create: {
      stripeEventId: event.id,
      type: event.type,
      payload: event.payload
    },
    select: {
      id: true,
      status: true,
      processedAt: true,
      failedAt: true
    }
  });

  if (billingEvent.status === BillingEventStatus.PROCESSED && billingEvent.processedAt) {
    return {
      billingEvent,
      claimed: false,
      reason: "processed"
    };
  }

  const staleBefore = new Date(Date.now() - STALE_PROCESSING_WINDOW_MS);
  const claimResult = await prisma.billingEvent.updateMany({
    where: {
      id: billingEvent.id,
      OR: [
        { status: BillingEventStatus.PENDING },
        { status: BillingEventStatus.FAILED },
        {
          status: BillingEventStatus.PROCESSING,
          processingStartedAt: { lt: staleBefore }
        }
      ]
    },
    data: {
      status: BillingEventStatus.PROCESSING,
      processingStartedAt: new Date(),
      failedAt: null,
      lastError: null,
      payload: event.payload
    }
  });

  if (claimResult.count === 0) {
    return {
      billingEvent,
      claimed: false,
      reason: "in-flight"
    };
  }

  return {
    billingEvent,
    claimed: true,
    reason: "claimed"
  };
}

export async function markStripeWebhookEventProcessed(
  eventId: string,
  payload: Prisma.InputJsonValue
): Promise<StripeWebhookTransitionResult> {
  const result = await prisma.billingEvent.updateMany({
    where: {
      stripeEventId: eventId,
      status: BillingEventStatus.PROCESSING
    },
    data: {
      status: BillingEventStatus.PROCESSED,
      processingStartedAt: null,
      processedAt: new Date(),
      failedAt: null,
      lastError: null,
      payload
    }
  });

  if (result.count > 0) {
    return {
      transitioned: true,
      billingEvent: null
    };
  }

  return {
    transitioned: false,
    billingEvent: await prisma.billingEvent.findUnique({
      where: { stripeEventId: eventId },
      select: {
        id: true,
        status: true,
        processedAt: true,
        failedAt: true
      }
    })
  };
}

export async function markStripeWebhookEventFailed(
  eventId: string,
  payload: Prisma.InputJsonValue,
  error: unknown
): Promise<StripeWebhookTransitionResult> {
  const message = error instanceof Error ? error.message : "Unknown error";

  const transitionResult = await prisma.billingEvent.updateMany({
    where: {
      stripeEventId: eventId,
      status: BillingEventStatus.PROCESSING
    },
    data: {
      status: BillingEventStatus.FAILED,
      processingStartedAt: null,
      failedAt: new Date(),
      lastError: message,
      payload
    }
  });

  if (transitionResult.count > 0) {
    return {
      transitioned: true,
      billingEvent: await prisma.billingEvent.findUnique({
        where: { stripeEventId: eventId },
        select: {
          id: true,
          status: true,
          processedAt: true,
          failedAt: true
        }
      })
    };
  }

  return {
    transitioned: false,
    billingEvent: await prisma.billingEvent.findUnique({
      where: { stripeEventId: eventId },
      select: {
        id: true,
        status: true,
        processedAt: true,
        failedAt: true
      }
    })
  };
}

// Current limitation:
// - this is durable event-level idempotency backed by the BillingEvent table
// - it prevents double-processing of the same Stripe event id
// - it does not by itself guarantee exactly-once effects for every downstream
//   side effect unless those downstream writes also remain idempotent
// Future hook:
// - extend the same BillingEvent-backed record with richer reconciliation or
//   stage-level checkpoints if finer-grained replay safety is needed later.
