import { createHmac, timingSafeEqual } from "node:crypto";
import {
  AuditActorType,
  BillingEventStatus,
  BillingEventLogSource,
  Prisma,
  SubscriptionStatus,
  prisma
} from "@evolve-edge/db";
import { NextResponse } from "next/server";
import {
  synchronizeStripeCheckoutSession,
  synchronizeStripeSubscription,
  upsertSubscriptionFromStripe
} from "../../../../lib/billing";
import { buildAuditRequestContextFromRequest } from "../../../../lib/audit";
import {
  computeAndPersistRoutingSnapshot,
  resolveCommercialRoutingContextFromCheckout
} from "../../../../lib/commercial-routing";
import { publishDomainEvent } from "../../../../lib/domain-events";
import { queueEmailNotification } from "../../../../lib/email";
import { readStripeContextMetadata } from "../../../../lib/integration-contracts";
import { logServerEvent, sendOperationalAlert } from "../../../../lib/monitoring";
import { getAppUrl, requireEnv } from "../../../../lib/runtime-config";
import { appendBillingEventLog } from "../../../../lib/subscription-domain";
import { queueAuditRequestedDispatch } from "../../../../lib/workflow-dispatch";

const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

type StripeEvent = {
  id: string;
  type: string;
  created?: number;
  data: {
    object: Record<string, any>;
  };
};

function verifyStripeSignature(payload: string, signatureHeader: string) {
  const webhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET");

  const parts = signatureHeader.split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));

  if (!timestamp || signatures.length === 0) {
    throw new Error("Invalid Stripe signature header.");
  }

  const parsedTimestamp = Number(timestamp);
  const currentTimestamp = Math.floor(Date.now() / 1000);

  if (
    !Number.isFinite(parsedTimestamp) ||
    Math.abs(currentTimestamp - parsedTimestamp) > STRIPE_SIGNATURE_TOLERANCE_SECONDS
  ) {
    throw new Error("Stripe webhook signature timestamp is outside the allowed tolerance.");
  }

  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = createHmac("sha256", webhookSecret)
    .update(signedPayload)
    .digest("hex");

  const expected = Buffer.from(expectedSignature);
  const isValid = signatures.some((signature) => {
    const provided = Buffer.from(signature);
    return expected.length === provided.length && timingSafeEqual(expected, provided);
  });

  if (!isValid) {
    throw new Error("Invalid Stripe webhook signature.");
  }
}

function getStripeObjectMetadata(
  object: Record<string, any> | undefined
): Record<string, string> {
  if (!object || typeof object !== "object" || !object.metadata) {
    return {};
  }

  const parsed = readStripeContextMetadata(object.metadata);

  return Object.fromEntries(
    Object.entries({
      organizationId: parsed.organizationId,
      customerEmail: parsed.customerEmail,
      planKey: parsed.planKey,
      planCode: parsed.planCode,
      revenuePlanCode: parsed.revenuePlanCode,
      environment: parsed.environment,
      source: parsed.source,
      workflowType: parsed.workflowType
    }).flatMap(([key, value]) => (typeof value === "string" ? [[key, value]] : []))
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

async function claimBillingEvent(event: StripeEvent) {
  const billingEvent = await prisma.billingEvent.upsert({
    where: { stripeEventId: event.id },
    update: {
      type: event.type,
      payload: event
    },
    create: {
      stripeEventId: event.id,
      type: event.type,
      payload: event
    }
  });

  if (billingEvent.status === BillingEventStatus.PROCESSED && billingEvent.processedAt) {
    return {
      billingEvent,
      claimed: false,
      reason: "processed" as const
    };
  }

  const staleBefore = new Date(Date.now() - 10 * 60 * 1000);
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
      payload: event
    }
  });

  if (claimResult.count === 0) {
    return {
      billingEvent,
      claimed: false,
      reason: "in-flight" as const
    };
  }

  return {
    billingEvent,
    claimed: true,
    reason: "claimed" as const
  };
}

async function markBillingEventProcessed(eventId: string, event: StripeEvent) {
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

function isRetryableStripeWebhookProcessingError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (!message) {
    return false;
  }

  if (
    message.includes("timeout") ||
    message.includes("temporar") ||
    message.includes("network") ||
    message.includes("connection") ||
    message.includes("rate limit") ||
    message.includes("try again")
  ) {
    return true;
  }

  if (
    message.includes("missing a customer reference") ||
    message.includes("missing required event fields") ||
    message.includes("plan mapping")
  ) {
    return false;
  }

  return true;
}

async function markBillingEventFailed(eventId: string, event: StripeEvent, error: unknown) {
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

  const organizationId = await findOrganizationIdForStripeObject(event.data.object);

  if (!organizationId) {
    return;
  }

  await appendBillingEventLog({
    organizationId,
    eventSource: BillingEventLogSource.STRIPE,
    eventType: "stripe.webhook.processing_failed",
    idempotencyKey: `stripe.webhook.processing_failed:${event.id}`,
    sourceReference: event.id,
    payload: {
      stripeEventId: event.id,
      type: event.type,
      retryable: isRetryableStripeWebhookProcessingError(error),
      message
    }
  });
}

async function handleCheckoutCompleted(
  event: StripeEvent,
  requestContext: Prisma.InputJsonValue
) {
  const object = event.data.object;
  const metadata = getStripeObjectMetadata(object);
  if (!object.customer || !object.subscription) {
    throw new Error("Stripe checkout session is missing a customer or subscription reference.");
  }

  const commercialContext = await resolveCommercialRoutingContextFromCheckout({
    stripeObject: object,
    sourceEventId: event.id
  });

  await synchronizeStripeCheckoutSession({
    organizationId: commercialContext.organization.id,
    checkoutSessionId: String(object.id),
    fallbackPlanCode:
      commercialContext.planMapping.revenuePlanCode ?? metadata.planCode ?? null,
    auditActorType: AuditActorType.WEBHOOK,
    auditActorLabel: "stripe",
    auditRequestContext: requestContext
  });

  const routingSnapshot = await computeAndPersistRoutingSnapshot({
    organizationId: commercialContext.organization.id,
    userId: commercialContext.user.id,
    sourceSystem: "stripe",
    sourceEventType: event.type,
    sourceEventId: event.id,
    sourceRecordType: "checkoutSession",
    sourceRecordId: String(object.id),
    planCode: commercialContext.planMapping.planCode,
    idempotencyKey: `routing-snapshot:stripe-checkout:${event.id}`
  });

  await queueAuditRequestedDispatch({
    routingSnapshotId: routingSnapshot.id
  });
}

async function handleCustomerSubscriptionEvent(event: StripeEvent, requestContext: Prisma.InputJsonValue) {
  const object = event.data.object;
  const metadata = getStripeObjectMetadata(object);
  const organizationId = metadata.organizationId ?? (await findOrganizationIdForStripeObject(object));

  if (!organizationId || !object.customer || !object.id) {
    logServerEvent("warn", "stripe.webhook.subscription_missing_context", {
      eventId: event.id,
      type: event.type,
      organizationId,
      stripeSubscriptionId: object.id ?? null,
      stripeCustomerId: object.customer ?? null
    });
    return;
  }

  await synchronizeStripeSubscription({
    organizationId,
    stripeSubscriptionId: String(object.id),
    fallbackPlanCode: metadata.planCode ?? null,
    auditActorType: AuditActorType.WEBHOOK,
    auditActorLabel: "stripe",
    auditRequestContext: requestContext
  });
}

async function handleInvoicePaid(event: StripeEvent, requestContext: Prisma.InputJsonValue) {
  const object = event.data.object;
  const organizationId = await findOrganizationIdForStripeObject(object);
  const existingSubscription = await findSubscriptionByStripeReferences(object);
  const stripeSubscriptionId =
    getStripeSubscriptionIdFromObject(object) ??
    existingSubscription?.stripeSubscriptionId ??
    null;

  if (!organizationId || !stripeSubscriptionId) {
    logServerEvent("warn", "stripe.webhook.invoice_paid_missing_context", {
      eventId: event.id,
      organizationId,
      invoiceId: object.id ?? null,
      stripeSubscriptionId: object.subscription ?? null
    });
    return;
  }

  const syncedSubscription = await synchronizeStripeSubscription({
    organizationId,
    stripeSubscriptionId,
    auditActorType: AuditActorType.WEBHOOK,
    auditActorLabel: "stripe",
    auditRequestContext: requestContext
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
      } satisfies Prisma.InputJsonValue
    });
  }

  await appendBillingEventLog({
    organizationId,
    billingCustomerId: syncedSubscription.billingCustomerId,
    subscriptionId: syncedSubscription.id,
    planId: syncedSubscription.planId,
    canonicalPlanKey: syncedSubscription.canonicalPlanKeySnapshot,
    eventSource: "STRIPE",
    eventType: "stripe.invoice.paid",
    idempotencyKey: `stripe.invoice.paid:${event.id}`,
    sourceReference: typeof object.id === "string" ? object.id : stripeSubscriptionId,
    payload: {
      stripeEventId: event.id,
      invoiceId: typeof object.id === "string" ? object.id : null,
      stripeSubscriptionId,
      latestInvoiceStatus: syncedSubscription.latestInvoiceStatus,
      status: syncedSubscription.status
    }
  });
}

async function handleInvoicePaymentFailed(event: StripeEvent, requestContext: Prisma.InputJsonValue) {
  const object = event.data.object;
  const organizationId = await findOrganizationIdForStripeObject(object);
  const existingSubscription = await findSubscriptionByStripeReferences(object);
  const stripeCustomerId = existingSubscription?.stripeCustomerId;
  const stripeSubscriptionId =
    getStripeSubscriptionIdFromObject(object) ??
    existingSubscription?.stripeSubscriptionId ??
    null;

  if (!organizationId || !stripeCustomerId || !stripeSubscriptionId) {
    logServerEvent("warn", "stripe.webhook.invoice_failed_missing_context", {
      eventId: event.id,
      organizationId,
      invoiceId: object.id ?? null,
      stripeSubscriptionId: object.subscription ?? null
    });
    return;
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
      auditActorType: AuditActorType.WEBHOOK,
      auditActorLabel: "stripe",
      auditRequestContext: requestContext
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
      } satisfies Prisma.InputJsonValue
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

    await appendBillingEventLog({
      db: tx,
      organizationId,
      billingCustomerId: syncedSubscription.billingCustomerId,
      subscriptionId: syncedSubscription.id,
      planId: syncedSubscription.planId,
      canonicalPlanKey: syncedSubscription.canonicalPlanKeySnapshot,
      eventSource: "STRIPE",
      eventType: "stripe.invoice.payment_failed",
      idempotencyKey: `stripe.invoice.payment_failed:${event.id}`,
      sourceReference: typeof object.id === "string" ? object.id : stripeSubscriptionId,
      payload: {
        stripeEventId: event.id,
        invoiceId: typeof object.id === "string" ? object.id : null,
        stripeSubscriptionId,
        failureMessage,
        latestInvoiceStatus: syncedSubscription.latestInvoiceStatus,
        status: syncedSubscription.status
      }
    });
  });
}

async function handleInvoicePaymentActionRequired(
  event: StripeEvent,
  requestContext: Prisma.InputJsonValue
) {
  const object = event.data.object;
  const organizationId = await findOrganizationIdForStripeObject(object);
  const existingSubscription = await findSubscriptionByStripeReferences(object);
  const stripeCustomerId = existingSubscription?.stripeCustomerId;
  const stripeSubscriptionId =
    getStripeSubscriptionIdFromObject(object) ??
    existingSubscription?.stripeSubscriptionId ??
    null;

  if (!organizationId || !stripeCustomerId || !stripeSubscriptionId) {
    logServerEvent("warn", "stripe.webhook.invoice_action_required_missing_context", {
      eventId: event.id,
      organizationId,
      invoiceId: object.id ?? null,
      stripeSubscriptionId: object.subscription ?? null
    });
    return;
  }

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
        typeof object.status === "string" ? object.status : "payment_action_required",
      lastPaymentFailedAt: new Date(),
      lastPaymentFailureMessage:
        "Stripe requires customer action to complete payment for the latest invoice.",
      auditActorType: AuditActorType.WEBHOOK,
      auditActorLabel: "stripe",
      auditRequestContext: requestContext
    });

    await appendBillingEventLog({
      db: tx,
      organizationId,
      billingCustomerId: syncedSubscription.billingCustomerId,
      subscriptionId: syncedSubscription.id,
      planId: syncedSubscription.planId,
      canonicalPlanKey: syncedSubscription.canonicalPlanKeySnapshot,
      eventSource: "STRIPE",
      eventType: "stripe.invoice.payment_action_required",
      idempotencyKey: `stripe.invoice.payment_action_required:${event.id}`,
      sourceReference: typeof object.id === "string" ? object.id : stripeSubscriptionId,
      payload: {
        stripeEventId: event.id,
        invoiceId: typeof object.id === "string" ? object.id : null,
        stripeSubscriptionId,
        latestInvoiceStatus: syncedSubscription.latestInvoiceStatus,
        status: syncedSubscription.status
      }
    });
  });
}

async function handleTrialWillEnd(event: StripeEvent) {
  const object = event.data.object;
  const organizationId = await findOrganizationIdForStripeObject(object);

  if (!organizationId || !object.id) {
    logServerEvent("warn", "stripe.webhook.trial_will_end_missing_context", {
      eventId: event.id,
      organizationId,
      stripeSubscriptionId: object.id ?? null
    });
    return;
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
    } satisfies Prisma.InputJsonValue
  });
}

async function handleCheckoutAsyncPaymentFailed(
  event: StripeEvent,
  requestContext: Prisma.InputJsonValue
) {
  const object = event.data.object;
  const metadata = getStripeObjectMetadata(object);
  const organizationId = metadata.organizationId ?? (await findOrganizationIdForStripeObject(object));
  const stripeSubscriptionId = getStripeSubscriptionIdFromObject(object);
  const existingSubscription = await findSubscriptionByStripeReferences(object);
  const stripeCustomerId =
    (typeof object.customer === "string" ? object.customer : null) ??
    existingSubscription?.stripeCustomerId ??
    null;

  if (!organizationId || !stripeCustomerId || !stripeSubscriptionId) {
    logServerEvent("warn", "stripe.webhook.checkout_async_failed_missing_context", {
      eventId: event.id,
      organizationId,
      stripeSubscriptionId,
      stripeCustomerId
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    const syncedSubscription = await upsertSubscriptionFromStripe({
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
        typeof object.payment_status === "string" ? object.payment_status : "async_payment_failed",
      lastPaymentFailedAt: new Date(),
      lastPaymentFailureMessage:
        "Stripe checkout payment did not complete. The customer can retry from billing.",
      auditActorType: AuditActorType.WEBHOOK,
      auditActorLabel: "stripe",
      auditRequestContext: requestContext
    });

    await appendBillingEventLog({
      db: tx,
      organizationId,
      billingCustomerId: syncedSubscription.billingCustomerId,
      subscriptionId: syncedSubscription.id,
      planId: syncedSubscription.planId,
      canonicalPlanKey: syncedSubscription.canonicalPlanKeySnapshot,
      eventSource: "STRIPE",
      eventType: "stripe.checkout.async_payment_failed",
      idempotencyKey: `stripe.checkout.async_payment_failed:${event.id}`,
      sourceReference: stripeSubscriptionId,
      payload: {
        stripeEventId: event.id,
        stripeSubscriptionId,
        stripeCustomerId,
        latestInvoiceStatus: syncedSubscription.latestInvoiceStatus,
        status: syncedSubscription.status
      }
    });
  });
}

async function processStripeEvent(event: StripeEvent, requestContext: Prisma.InputJsonValue) {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await handleCheckoutCompleted(event, requestContext);
      return;
    case "checkout.session.async_payment_failed":
      await handleCheckoutAsyncPaymentFailed(event, requestContext);
      return;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await handleCustomerSubscriptionEvent(event, requestContext);
      return;
    case "invoice.paid":
      await handleInvoicePaid(event, requestContext);
      return;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event, requestContext);
      return;
    case "invoice.payment_action_required":
      await handleInvoicePaymentActionRequired(event, requestContext);
      return;
    case "customer.subscription.trial_will_end":
      await handleTrialWillEnd(event);
      return;
    default:
      logServerEvent("info", "stripe.webhook.ignored", {
        eventId: event.id,
        type: event.type
      });
  }
}


export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return new NextResponse("Missing stripe-signature header", { status: 400 });
  }

  try {
    verifyStripeSignature(payload, signature);
    const event = JSON.parse(payload) as StripeEvent;
    const requestContext = buildAuditRequestContextFromRequest(request);

    if (!event?.id || !event?.type || !event?.data?.object) {
      throw new Error("Stripe webhook payload is missing required event fields.");
    }

    const claimedEvent = await claimBillingEvent(event);

    if (!claimedEvent.claimed) {
      return NextResponse.json({
        received: true,
        deduplicated: claimedEvent.reason === "processed",
        processing: claimedEvent.reason === "in-flight"
      });
    }

    try {
      await processStripeEvent(event, requestContext);
      await markBillingEventProcessed(event.id, event);

      logServerEvent("info", "stripe.webhook.processed", {
        eventId: event.id,
        type: event.type
      });

      return NextResponse.json({ received: true });
    } catch (processingError) {
      await markBillingEventFailed(event.id, event, processingError);
      throw processingError;
    }
  } catch (error) {
    logServerEvent("error", "stripe.webhook.failed", {
      message: error instanceof Error ? error.message : "Unknown error"
    });
    await sendOperationalAlert({
      source: "stripe.webhook",
      title: "Stripe webhook processing failed",
      metadata: {
        message: error instanceof Error ? error.message : "Unknown error"
      }
    });
    return new NextResponse("Webhook processing failed", { status: 400 });
  }
}
