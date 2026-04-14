import "server-only";

import {
  AuditActorType,
  BillingEventStatus,
  Prisma,
  SubscriptionStatus,
  prisma
} from "@evolve-edge/db";
import {
  synchronizeStripeCheckoutSession,
  synchronizeStripeSubscription,
  upsertSubscriptionFromStripe
} from "./billing";
import { publishDomainEvent } from "./domain-events";
import { queueEmailNotification } from "./email";
import { logServerEvent } from "./monitoring";
import { getAppUrl } from "./runtime-config";

export type ReplayableStripeEvent = {
  id: string;
  type: string;
  created?: number;
  data: {
    object: Record<string, any>;
  };
};

export const REPLAYABLE_STRIPE_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "customer.subscription.trial_will_end"
] as const;

function getStripeObjectMetadata(
  object: Record<string, any> | undefined
): Record<string, string> {
  if (!object || typeof object !== "object" || !object.metadata) {
    return {};
  }

  const metadata = object.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(metadata).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : []
    )
  );
}

function getStripeSubscriptionIdFromObject(object: Record<string, any>) {
  if (typeof object.subscription === "string") {
    return object.subscription;
  }

  if (typeof object.id === "string" && object.object === "subscription") {
    return object.id;
  }

  return null;
}

async function findOrganizationIdForStripeObject(object: Record<string, any>) {
  const metadata = getStripeObjectMetadata(object);
  if (metadata.organizationId) {
    return metadata.organizationId;
  }

  if (typeof object.subscription === "string") {
    const bySubscriptionId = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId: object.subscription },
      select: { organizationId: true }
    });

    if (bySubscriptionId?.organizationId) {
      return bySubscriptionId.organizationId;
    }
  }

  if (typeof object.id === "string") {
    const byObjectSubscriptionId = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId: object.id },
      select: { organizationId: true }
    });

    if (byObjectSubscriptionId?.organizationId) {
      return byObjectSubscriptionId.organizationId;
    }
  }

  if (typeof object.customer === "string") {
    const byCustomerId = await prisma.subscription.findFirst({
      where: { stripeCustomerId: object.customer },
      select: { organizationId: true },
      orderBy: { createdAt: "desc" }
    });

    if (byCustomerId?.organizationId) {
      return byCustomerId.organizationId;
    }
  }

  return null;
}

async function findSubscriptionByStripeReferences(object: Record<string, any>) {
  if (typeof object.subscription === "string") {
    const byReferencedSubscription = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId: object.subscription }
    });

    if (byReferencedSubscription) {
      return byReferencedSubscription;
    }
  }

  if (typeof object.id === "string") {
    const byObjectId = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId: object.id }
    });

    if (byObjectId) {
      return byObjectId;
    }
  }

  if (typeof object.customer === "string") {
    return prisma.subscription.findFirst({
      where: { stripeCustomerId: object.customer },
      orderBy: { createdAt: "desc" }
    });
  }

  return null;
}

async function markBillingEventProcessed(eventId: string, event: ReplayableStripeEvent) {
  await prisma.billingEvent.update({
    where: { stripeEventId: eventId },
    data: {
      status: BillingEventStatus.PROCESSED,
      processedAt: new Date(),
      failedAt: null,
      lastError: null,
      payload: event
    }
  });
}

async function markBillingEventFailed(
  eventId: string,
  event: ReplayableStripeEvent,
  error: unknown
) {
  const message = error instanceof Error ? error.message : "Unknown error";

  await prisma.billingEvent.update({
    where: { stripeEventId: eventId },
    data: {
      status: BillingEventStatus.FAILED,
      failedAt: new Date(),
      lastError: message,
      payload: event
    }
  });
}

async function handleReplayableStripeEvent(input: {
  event: ReplayableStripeEvent;
  actorEmail: string;
  requestContext: Prisma.InputJsonValue;
}) {
  const { event } = input;
  const object = event.data.object;
  const metadata = getStripeObjectMetadata(object);
  const actorType = AuditActorType.ADMIN;
  const actorLabel = input.actorEmail;

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const organizationId =
        metadata.organizationId ?? (await findOrganizationIdForStripeObject(object));

      if (!organizationId || !object.customer || !object.subscription) {
        throw new Error("Stripe checkout event is missing replayable organization context.");
      }

      await synchronizeStripeCheckoutSession({
        organizationId,
        checkoutSessionId: String(object.id),
        fallbackPlanCode: metadata.planCode ?? null,
        auditActorType: actorType,
        auditActorLabel: actorLabel,
        auditRequestContext: input.requestContext
      });
      return;
    }

    case "checkout.session.async_payment_failed": {
      const organizationId =
        metadata.organizationId ?? (await findOrganizationIdForStripeObject(object));
      const stripeSubscriptionId = getStripeSubscriptionIdFromObject(object);
      const existingSubscription = await findSubscriptionByStripeReferences(object);
      const stripeCustomerId =
        (typeof object.customer === "string" ? object.customer : null) ??
        existingSubscription?.stripeCustomerId ??
        null;

      if (!organizationId || !stripeCustomerId || !stripeSubscriptionId) {
        throw new Error("Stripe async checkout failure is missing replayable billing context.");
      }

      await prisma.$transaction(async (tx) => {
        await upsertSubscriptionFromStripe({
          db: tx,
          organizationId,
          stripeCustomerId,
          stripeSubscriptionId,
          fallbackPlanCode: metadata.planCode ?? null,
          status: SubscriptionStatus.INCOMPLETE,
          currentPeriodStart: existingSubscription?.currentPeriodStart,
          currentPeriodEnd: existingSubscription?.currentPeriodEnd,
          cancelAtPeriodEnd: false,
          latestInvoiceId: typeof object.invoice === "string" ? object.invoice : undefined,
          latestInvoiceStatus:
            typeof object.payment_status === "string"
              ? object.payment_status
              : "async_payment_failed",
          lastPaymentFailedAt: new Date(),
          lastPaymentFailureMessage:
            "Stripe checkout payment did not complete. The customer can retry from billing.",
          auditActorType: actorType,
          auditActorLabel: actorLabel,
          auditRequestContext: input.requestContext
        });
      });
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const organizationId =
        metadata.organizationId ?? (await findOrganizationIdForStripeObject(object));

      if (!organizationId || !object.customer || !object.id) {
        throw new Error("Stripe subscription event is missing replayable organization context.");
      }

      await synchronizeStripeSubscription({
        organizationId,
        stripeSubscriptionId: String(object.id),
        fallbackPlanCode: metadata.planCode ?? null,
        auditActorType: actorType,
        auditActorLabel: actorLabel,
        auditRequestContext: input.requestContext
      });
      return;
    }

    case "invoice.paid": {
      const organizationId = await findOrganizationIdForStripeObject(object);
      const existingSubscription = await findSubscriptionByStripeReferences(object);
      const stripeSubscriptionId =
        getStripeSubscriptionIdFromObject(object) ??
        existingSubscription?.stripeSubscriptionId ??
        null;

      if (!organizationId || !stripeSubscriptionId) {
        throw new Error("Stripe invoice.paid event is missing replayable subscription context.");
      }

      const syncedSubscription = await synchronizeStripeSubscription({
        organizationId,
        stripeSubscriptionId,
        auditActorType: actorType,
        auditActorLabel: actorLabel,
        auditRequestContext: input.requestContext
      });

      if (
        existingSubscription &&
        existingSubscription.status === SubscriptionStatus.PAST_DUE &&
        syncedSubscription.status === SubscriptionStatus.ACTIVE
      ) {
        await publishDomainEvent(prisma, {
          type: "payment.recovered",
          aggregateType: "subscription",
          aggregateId: syncedSubscription.id,
          orgId: organizationId,
          idempotencyKey: `payment.recovered:${event.id}`,
          payload: {
            organizationId,
            subscriptionId: syncedSubscription.id,
            stripeSubscriptionId,
            invoiceId: typeof object.id === "string" ? object.id : null,
            status: syncedSubscription.status
          } as Prisma.InputJsonValue
        });
      }
      return;
    }

    case "invoice.payment_failed": {
      const organizationId = await findOrganizationIdForStripeObject(object);
      const existingSubscription = await findSubscriptionByStripeReferences(object);
      const stripeCustomerId = existingSubscription?.stripeCustomerId;
      const stripeSubscriptionId =
        getStripeSubscriptionIdFromObject(object) ??
        existingSubscription?.stripeSubscriptionId ??
        null;

      if (!organizationId || !stripeCustomerId || !stripeSubscriptionId) {
        throw new Error("Stripe invoice failure is missing replayable subscription context.");
      }

      const failureMessage =
        typeof object.last_finalization_error?.message === "string"
          ? object.last_finalization_error.message
          : typeof object.status_transitions?.finalized_at === "number"
            ? "Invoice payment failed after finalization."
            : "Stripe invoice payment failed.";

      await prisma.$transaction(async (tx) => {
        const syncedSubscription = await upsertSubscriptionFromStripe({
          db: tx,
          organizationId,
          stripeCustomerId,
          stripeSubscriptionId,
          status: SubscriptionStatus.PAST_DUE,
          currentPeriodStart: existingSubscription?.currentPeriodStart,
          currentPeriodEnd: existingSubscription?.currentPeriodEnd,
          cancelAtPeriodEnd: existingSubscription?.cancelAtPeriodEnd,
          cancelScheduledAt: existingSubscription?.cancelScheduledAt,
          trialEndsAt: existingSubscription?.trialEndsAt,
          latestInvoiceId: typeof object.id === "string" ? object.id : undefined,
          latestInvoiceStatus:
            typeof object.status === "string" ? object.status : "payment_failed",
          lastPaymentFailedAt: new Date(),
          lastPaymentFailureMessage: failureMessage,
          auditActorType: actorType,
          auditActorLabel: actorLabel,
          auditRequestContext: input.requestContext
        });

        const organization = await tx.organization.findUnique({
          where: { id: organizationId },
          include: {
            members: {
              where: { role: "OWNER" },
              include: { user: true },
              orderBy: { createdAt: "asc" },
              take: 1
            }
          }
        });

        await publishDomainEvent(tx, {
          type: "payment.failed",
          aggregateType: "subscription",
          aggregateId: syncedSubscription.id,
          orgId: organizationId,
          idempotencyKey: `payment.failed:${event.id}`,
          payload: {
            organizationId,
            subscriptionId: syncedSubscription.id,
            stripeSubscriptionId,
            stripeCustomerId,
            invoiceId: typeof object.id === "string" ? object.id : null,
            status: syncedSubscription.status,
            failureMessage
          } as Prisma.InputJsonValue
        });

        const owner = organization?.members[0]?.user;
        if (organization && owner?.email) {
          await queueEmailNotification(tx, {
            templateKey: "payment-failed",
            recipientEmail: owner.email,
            recipientName: owner.firstName ?? null,
            orgId: organization.id,
            userId: owner.id,
            idempotencyKey: `email:payment-failed:${syncedSubscription.id}:${object.id ?? "latest"}`,
            payload: {
              organizationName: organization.name,
              billingUrl: `${getAppUrl()}/dashboard/settings`,
              failureMessage
            }
          });
        }
      });
      return;
    }

    case "invoice.payment_action_required": {
      const organizationId = await findOrganizationIdForStripeObject(object);
      const existingSubscription = await findSubscriptionByStripeReferences(object);
      const stripeCustomerId = existingSubscription?.stripeCustomerId;
      const stripeSubscriptionId =
        getStripeSubscriptionIdFromObject(object) ??
        existingSubscription?.stripeSubscriptionId ??
        null;

      if (!organizationId || !stripeCustomerId || !stripeSubscriptionId) {
        throw new Error("Stripe payment action required is missing replayable subscription context.");
      }

      await prisma.$transaction(async (tx) => {
        await upsertSubscriptionFromStripe({
          db: tx,
          organizationId,
          stripeCustomerId,
          stripeSubscriptionId,
          status: SubscriptionStatus.PAST_DUE,
          currentPeriodStart: existingSubscription?.currentPeriodStart,
          currentPeriodEnd: existingSubscription?.currentPeriodEnd,
          cancelAtPeriodEnd: existingSubscription?.cancelAtPeriodEnd,
          cancelScheduledAt: existingSubscription?.cancelScheduledAt,
          trialEndsAt: existingSubscription?.trialEndsAt,
          latestInvoiceId: typeof object.id === "string" ? object.id : undefined,
          latestInvoiceStatus:
            typeof object.status === "string" ? object.status : "payment_action_required",
          lastPaymentFailedAt: new Date(),
          lastPaymentFailureMessage:
            "Stripe requires customer action to complete payment for the latest invoice.",
          auditActorType: actorType,
          auditActorLabel: actorLabel,
          auditRequestContext: input.requestContext
        });
      });
      return;
    }

    case "customer.subscription.trial_will_end": {
      const organizationId = await findOrganizationIdForStripeObject(object);

      if (!organizationId || !object.id) {
        throw new Error("Stripe trial ending event is missing replayable subscription context.");
      }

      await publishDomainEvent(prisma, {
        type: "subscription.trial_will_end",
        aggregateType: "subscription",
        aggregateId: String(object.id),
        orgId: organizationId,
        idempotencyKey: `subscription.trial_will_end:${event.id}`,
        payload: {
          organizationId,
          stripeSubscriptionId: String(object.id),
          trialEndsAt:
            typeof object.trial_end === "number"
              ? new Date(object.trial_end * 1000).toISOString()
              : null
        } as Prisma.InputJsonValue
      });
      return;
    }

    default:
      throw new Error("This Stripe event type is not approved for replay.");
  }
}

export async function replayStoredStripeBillingEvent(input: {
  billingEventId: string;
  actorEmail: string;
  requestContext: Prisma.InputJsonValue;
}) {
  const storedEvent = await prisma.billingEvent.findUnique({
    where: { id: input.billingEventId }
  });

  if (!storedEvent) {
    throw new Error("Stored billing event was not found.");
  }

  const event = storedEvent.payload as ReplayableStripeEvent;
  if (!event?.id || !event?.type || !event?.data?.object) {
    throw new Error("Stored billing event payload is malformed.");
  }

  if (
    !REPLAYABLE_STRIPE_EVENT_TYPES.includes(
      event.type as (typeof REPLAYABLE_STRIPE_EVENT_TYPES)[number]
    )
  ) {
    throw new Error("This Stripe event type is not approved for replay.");
  }

  if (storedEvent.status === BillingEventStatus.PROCESSED) {
    return {
      replayed: false,
      deduplicated: true,
      eventId: event.id,
      type: event.type
    };
  }

  const claim = await prisma.billingEvent.updateMany({
    where: {
      id: storedEvent.id,
      status: {
        in: [BillingEventStatus.FAILED, BillingEventStatus.PENDING]
      }
    },
    data: {
      status: BillingEventStatus.PROCESSING,
      processingStartedAt: new Date(),
      failedAt: null,
      lastError: null,
      payload: event
    }
  });

  if (claim.count === 0) {
    throw new Error("Billing event is currently being processed and cannot be replayed.");
  }

  try {
    await handleReplayableStripeEvent({
      event,
      actorEmail: input.actorEmail,
      requestContext: input.requestContext
    });
    await markBillingEventProcessed(event.id, event);

    logServerEvent("info", "stripe.webhook.replayed", {
      eventId: event.id,
      type: event.type,
      billingEventId: storedEvent.id
    });

    return {
      replayed: true,
      deduplicated: false,
      eventId: event.id,
      type: event.type
    };
  } catch (error) {
    await markBillingEventFailed(event.id, event, error);
    throw error;
  }
}
