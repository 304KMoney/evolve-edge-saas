import {
  AuditActorType,
  DeliveryStateStatus,
  BillingEventLogSource,
  OperationsQueueSeverity,
  OperationsQueueSourceSystem,
  OperationsQueueType,
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
import { createStripeAccessIssuance } from "../../../../lib/stripe-access-issuance";
import { upsertPaymentReconciliationRecord } from "../../../../lib/payment-reconciliation-records";
import { upsertCustomerAccessGrantRecord } from "../../../../lib/customer-access-grant-records";
import {
  computeAndPersistRoutingSnapshot,
  normalizeCommercialPlanCode,
  resolveCommercialRoutingContextFromCheckout
} from "../../../../lib/commercial-routing";
import { resolveRevenuePlanCodeForCanonicalPlan } from "../../../../lib/commercial-catalog";
import {
  createDeliveryStateFromPaidRequest,
  transitionDeliveryState
} from "../../../../lib/delivery-state";
import { publishDomainEvent } from "../../../../lib/domain-events";
import { queueEmailNotification } from "../../../../lib/email";
import { readStripeContextMetadata } from "../../../../lib/integration-contracts";
import { logServerEvent, sendOperationalAlert } from "../../../../lib/monitoring";
import { appendOperatorWorkflowEventRecord } from "../../../../lib/operator-workflow-event-records";
import { recordOperationalFinding } from "../../../../lib/operations-queues";
import { recordStripeMissingContextFinding } from "../../../../lib/stripe-missing-context";
import { getAppUrl, requireEnv } from "../../../../lib/runtime-config";
import {
  getConfiguredStripeRuntimeMode,
  isStripeWebhookLivemodeMismatch
} from "../../../../lib/stripe-runtime";
import { applyRouteRateLimit } from "../../../../lib/security-rate-limit";
import { expectObject, ValidationError } from "../../../../lib/security-validation";
import { verifyStripeWebhookSignature } from "../../../../lib/security-webhooks";
import {
  classifyDuplicateStripeWebhookEvent,
  classifyStripeWebhookProcessingFailure,
  classifyStripeWebhookVerificationFailure,
  classifyUnsupportedStripeWebhookEvent
} from "../../../../lib/stripe-webhook-errors";
import {
  claimStripeWebhookEventProcessing,
  markStripeWebhookEventFailed,
  markStripeWebhookEventProcessed
} from "../../../../lib/stripe-webhook-idempotency";
import {
  appendBillingEventLog,
  normalizeBillingAmountCents,
  normalizeBillingCurrency
} from "../../../../lib/subscription-domain";
import {
  normalizeStripePaymentEvent,
  type NormalizedStripePaymentEvent
} from "../../../../lib/stripe-webhook-normalization";
import { queueAuditRequestedDispatch } from "../../../../lib/workflow-dispatch";
import { getOrganizationAuditReadiness } from "../../../../lib/audit-intake";

export const runtime = "nodejs";

type StripeEvent = {
  id: string;
  type: string;
  created?: number;
  livemode?: boolean;
  data: {
    object: Record<string, any>;
  };
};

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

async function handleFailedBillingEvent(
  eventId: string,
  event: StripeEvent,
  error: unknown
) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const failedResult = await markStripeWebhookEventFailed(eventId, event, error);
  const billingEvent = failedResult.billingEvent;

  if (!billingEvent) {
    return {
      transitioned: false as const,
      billingEvent: null
    };
  }

  const organizationId = await findOrganizationIdForStripeObject(event.data.object);

  if (!organizationId) {
    return {
      transitioned: true as const,
      billingEvent
    };
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

  await recordOperationalFinding({
    organizationId,
    queueType: OperationsQueueType.BILLING_ANOMALY,
    ruleCode: "billing.webhook_processing_failed",
    severity: OperationsQueueSeverity.HIGH,
    sourceSystem: OperationsQueueSourceSystem.STRIPE,
    sourceRecordType: "billingEvent",
    sourceRecordId: billingEvent.id,
    title: "Stripe webhook processing failed",
    summary:
      "A verified Stripe billing event could not be normalized into backend state and needs operator review.",
    recommendedAction:
      "Inspect the stored billing event payload, correct the underlying state or mapping issue, and replay the event safely.",
    metadata: {
      stripeEventId: event.id,
      stripeEventType: event.type,
      retryable: isRetryableStripeWebhookProcessingError(error),
      message
    }
  });

  await appendOperatorWorkflowEventRecord({
    eventKey: `operator.webhook_failure:${event.id}`,
    organizationId,
    eventCode: "delivery_failed",
    severity: isRetryableStripeWebhookProcessingError(error) ? "warning" : "critical",
    message:
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
        ? "Stripe payment processing failed before reconciliation or access-grant issuance could complete."
        : "Stripe webhook processing failed before the app could safely advance customer workflow state.",
    metadata: {
      stripeEventId: event.id,
      stripeEventType: event.type,
      retryable: isRetryableStripeWebhookProcessingError(error),
      message
    }
  });

  return {
    transitioned: failedResult.transitioned,
    billingEvent
  };
}

async function handleCheckoutCompleted(
  normalizedEvent: NormalizedStripePaymentEvent,
  event: StripeEvent,
  requestContext: Prisma.InputJsonValue,
  billingEventId: string
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
  const normalizedPlanCode = normalizeCommercialPlanCode(
    commercialContext.planMapping.planCode
  );
  const revenuePlanCode =
    commercialContext.planMapping.revenuePlanCode ??
    resolveRevenuePlanCodeForCanonicalPlan(normalizedPlanCode);
  const { paymentReconciliation, accessGrant } = createStripeAccessIssuance({
    normalizedEvent,
    selectedPlan: commercialContext.planMapping.planCode,
    customerEmail: commercialContext.user.email,
    customerId: commercialContext.user.id,
    organizationId: commercialContext.organization.id,
    reconciliationStatus: "binding_reconciled",
    grantStatus: "issued"
  });

  const persistedReconciliation = await upsertPaymentReconciliationRecord({
    stripeEventId: normalizedEvent.stripeEventId,
    stripeEventType: normalizedEvent.stripeEventType,
    checkoutSessionId: normalizedEvent.checkoutSessionId,
    stripePaymentReference:
      normalizedEvent.stripeSubscriptionId ?? normalizedEvent.stripePaymentIntentId,
    customerEmail: commercialContext.user.email,
    selectedPlan: commercialContext.planMapping.planCode,
    customerId: commercialContext.user.id,
    organizationId: commercialContext.organization.id,
    correlationId: normalizedEvent.correlationId,
    reconciliationStatus: paymentReconciliation.reconciliationStatus,
    billingEventId,
    metadata: paymentReconciliation,
    reconciledAt: new Date()
  });

  await upsertCustomerAccessGrantRecord({
    customerId: commercialContext.user.id,
    customerEmail: commercialContext.user.email,
    organizationId: commercialContext.organization.id,
    reportId: null,
    selectedPlan: commercialContext.planMapping.planCode,
    grantStatus: accessGrant.grantStatus,
    issuedAt: accessGrant.issuedAt,
    expiresAt: accessGrant.expiresAt,
    paymentReconciliationId: persistedReconciliation.id,
    metadata: accessGrant
  });

  const paidDeliveryState = await createDeliveryStateFromPaidRequest({
    organizationId: commercialContext.organization.id,
    userId: commercialContext.user.id,
    billingEventId,
    sourceSystem: "stripe",
    sourceEventType: event.type,
    sourceEventId: event.id,
    sourceRecordType: "checkoutSession",
    sourceRecordId: String(object.id),
    idempotencyKey: `delivery-state:stripe-checkout:${event.id}`,
    planCode: commercialContext.planMapping.planCode as unknown as Prisma.InputJsonValue,
    workflowCode:
      (commercialContext.planMapping.planCode === "STARTER"
        ? "AUDIT_STARTER"
        : commercialContext.planMapping.planCode === "ENTERPRISE"
          ? "AUDIT_ENTERPRISE"
          : "AUDIT_SCALE") as Prisma.InputJsonValue,
    statusReasonJson: {
      source: "checkout.session.completed",
      matchedBy: commercialContext.planMapping.matchedBy,
      matchedValue: commercialContext.planMapping.matchedValue
    }
  });

  await synchronizeStripeCheckoutSession({
    organizationId: commercialContext.organization.id,
    checkoutSessionId: String(object.id),
    fallbackPlanCode: revenuePlanCode,
    auditActorType: AuditActorType.WEBHOOK,
    auditActorLabel: "stripe",
    auditRequestContext: requestContext
  });

  const routingSnapshot = await computeAndPersistRoutingSnapshot({
    organizationId: commercialContext.organization.id,
    userId: commercialContext.user.id,
    billingEventId,
    sourceSystem: "stripe",
    sourceEventType: event.type,
    sourceEventId: event.id,
    sourceRecordType: "checkoutSession",
    sourceRecordId: String(object.id),
    planCode: commercialContext.planMapping.planCode,
    idempotencyKey: `routing-snapshot:stripe-checkout:${event.id}`
  });

  const readiness = await getOrganizationAuditReadiness({
    organizationId: commercialContext.organization.id
  });

  if (!readiness.readyForAudit) {
    await appendOperatorWorkflowEventRecord({
      eventKey: `operator.audit_dispatch_blocked_intake:${event.id}`,
      organizationId: commercialContext.organization.id,
      reportId: null,
      paymentReconciliationId: persistedReconciliation.id,
      eventCode: "intake_received",
      severity: "warning",
      message:
        "Stripe checkout was reconciled, but audit workflow dispatch stayed blocked because required app-owned intake is incomplete.",
      metadata: {
        stripeEventId: event.id,
        routingSnapshotId: routingSnapshot.id,
        deliveryStateRecordId: paidDeliveryState.id,
        reason: "audit_intake_incomplete"
      }
    });
    logServerEvent("warn", "stripe.webhook.audit_dispatch_blocked_intake", {
      event_id: event.id,
      org_id: commercialContext.organization.id,
      user_id: commercialContext.user.id,
      status: "blocked",
      source: "stripe",
      requestContext,
      metadata: {
        routingSnapshotId: routingSnapshot.id,
        deliveryStateRecordId: paidDeliveryState.id
      }
    });
  } else {
    await transitionDeliveryState({
      deliveryStateId: paidDeliveryState.id,
      organizationId: commercialContext.organization.id,
      actorUserId: commercialContext.user.id,
      actorType: AuditActorType.WEBHOOK,
      actorLabel: "stripe",
      toStatus: DeliveryStateStatus.ROUTED,
      reasonCode: "delivery.routed",
      linkages: {
        routingSnapshotId: routingSnapshot.id,
        entitlementsJson: routingSnapshot.entitlementsJson as Prisma.InputJsonValue,
        routingHintsJson: routingSnapshot.normalizedHintsJson as Prisma.InputJsonValue,
        statusReasonJson: routingSnapshot.routingReasonJson as Prisma.InputJsonValue
      }
    });

    await queueAuditRequestedDispatch({
      routingSnapshotId: routingSnapshot.id,
      deliveryStateRecordId: paidDeliveryState.id
    });
  }

  logServerEvent("info", "stripe.webhook.payment_reconciled", {
    event_id: event.id,
    org_id: commercialContext.organization.id,
    user_id: commercialContext.user.id,
    status: "reconciled",
    source: "stripe",
    requestContext,
    metadata: paymentReconciliation
  });
  logServerEvent("info", "stripe.webhook.access_grant_issued", {
    event_id: event.id,
    org_id: commercialContext.organization.id,
    user_id: commercialContext.user.id,
    status: "issued",
    source: "stripe",
    requestContext,
    metadata: accessGrant
  });

  await appendBillingEventLog({
    organizationId: commercialContext.organization.id,
    recordedByUserId: commercialContext.user.id,
    eventSource: BillingEventLogSource.STRIPE,
    eventType: "stripe.checkout.session.completed",
    idempotencyKey: `stripe.checkout.session.completed:${event.id}`,
    sourceReference: typeof object.id === "string" ? object.id : event.id,
    canonicalPlanKey: commercialContext.planMapping.canonicalPlanKey,
    planCodeSnapshot: revenuePlanCode,
    stripeEventId: event.id,
    stripeCheckoutSessionId: typeof object.id === "string" ? object.id : null,
    stripePaymentIntentId:
      typeof object.payment_intent === "string" ? object.payment_intent : null,
    amountCents: normalizeBillingAmountCents(object.amount_total),
    currency: normalizeBillingCurrency(object.currency),
    payload: {
      stripeEventId: event.id,
      stripeCheckoutSessionId: typeof object.id === "string" ? object.id : null,
      stripeCustomerId: typeof object.customer === "string" ? object.customer : null,
        stripeSubscriptionId:
          typeof object.subscription === "string" ? object.subscription : null,
        stripePaymentIntentId:
          typeof object.payment_intent === "string" ? object.payment_intent : null,
        reconciliation: paymentReconciliation,
        accessGrant,
        matchedBy: commercialContext.planMapping.matchedBy,
        matchedValue: commercialContext.planMapping.matchedValue,
        revenuePlanCode
      }
    });

  await appendOperatorWorkflowEventRecord({
    eventKey: `operator.reconciliation_complete:${persistedReconciliation.id}`,
    organizationId: commercialContext.organization.id,
    reportId: null,
    paymentReconciliationId: persistedReconciliation.id,
    eventCode: "reconciliation_complete",
    severity: "info",
    message:
      "Stripe checkout reconciliation completed and the workspace was bound to a durable payment record.",
    metadata: paymentReconciliation
  });

  await appendOperatorWorkflowEventRecord({
    eventKey: `operator.access_grant_issued:${persistedReconciliation.id}`,
    organizationId: commercialContext.organization.id,
    reportId: null,
    paymentReconciliationId: persistedReconciliation.id,
    eventCode: "access_grant_issued",
    severity: "info",
    message:
      "Customer report access grant was issued from the reconciled Stripe payment event.",
    metadata: accessGrant
  });
}

async function handleCustomerSubscriptionEvent(event: StripeEvent, requestContext: Prisma.InputJsonValue) {
  const object = event.data.object;
  const metadata = getStripeObjectMetadata(object);
  const organizationId = metadata.organizationId ?? (await findOrganizationIdForStripeObject(object));

  if (!organizationId || !object.customer || !object.id) {
    await recordStripeMissingContextFinding({
      organizationId,
      stripeEventId: event.id,
      stripeEventType: event.type,
      sourceRecordType: "subscription",
      sourceRecordId: typeof object.id === "string" ? object.id : null,
      missing: [
        ...(!organizationId ? ["organizationId"] : []),
        ...(!object.customer ? ["stripeCustomerId"] : []),
        ...(!object.id ? ["stripeSubscriptionId"] : [])
      ],
      metadata: {
        stripeSubscriptionId: object.id ?? null,
        stripeCustomerId: object.customer ?? null
      }
    });
    logServerEvent("warn", "stripe.webhook.subscription_missing_context", {
      event_id: event.id,
      org_id: organizationId,
      status: "missing_context",
      source: "stripe",
      metadata: {
        type: event.type,
        stripeSubscriptionId: object.id ?? null,
        stripeCustomerId: object.customer ?? null
      },
      requestContext
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
    await recordStripeMissingContextFinding({
      organizationId,
      stripeEventId: event.id,
      stripeEventType: event.type,
      sourceRecordType: "invoice",
      sourceRecordId: typeof object.id === "string" ? object.id : null,
      missing: [
        ...(!organizationId ? ["organizationId"] : []),
        ...(!stripeSubscriptionId ? ["stripeSubscriptionId"] : [])
      ],
      metadata: {
        invoiceId: object.id ?? null,
        stripeSubscriptionId: object.subscription ?? null
      }
    });
    logServerEvent("warn", "stripe.webhook.invoice_paid_missing_context", {
      event_id: event.id,
      org_id: organizationId,
      status: "missing_context",
      source: "stripe",
      metadata: {
        invoiceId: object.id ?? null,
        stripeSubscriptionId: object.subscription ?? null
      },
      requestContext
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
    planCodeSnapshot: syncedSubscription.planCodeSnapshot,
    eventSource: "STRIPE",
    eventType: "stripe.invoice.paid",
    idempotencyKey: `stripe.invoice.paid:${event.id}`,
    sourceReference: typeof object.id === "string" ? object.id : stripeSubscriptionId,
    stripeEventId: event.id,
    stripePaymentIntentId:
      typeof object.payment_intent === "string" ? object.payment_intent : null,
    amountCents: normalizeBillingAmountCents(
      object.amount_paid ?? object.amount_due ?? object.total
    ),
    currency: normalizeBillingCurrency(object.currency),
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
    await recordStripeMissingContextFinding({
      organizationId,
      stripeEventId: event.id,
      stripeEventType: event.type,
      sourceRecordType: "invoice",
      sourceRecordId: typeof object.id === "string" ? object.id : null,
      missing: [
        ...(!organizationId ? ["organizationId"] : []),
        ...(!stripeCustomerId ? ["stripeCustomerId"] : []),
        ...(!stripeSubscriptionId ? ["stripeSubscriptionId"] : [])
      ],
      metadata: {
        invoiceId: object.id ?? null,
        stripeSubscriptionId: object.subscription ?? null,
        stripeCustomerId
      }
    });
    logServerEvent("warn", "stripe.webhook.invoice_failed_missing_context", {
      event_id: event.id,
      org_id: organizationId,
      status: "missing_context",
      source: "stripe",
      metadata: {
        invoiceId: object.id ?? null,
        stripeSubscriptionId: object.subscription ?? null
      },
      requestContext
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
      planCodeSnapshot: syncedSubscription.planCodeSnapshot,
      eventSource: "STRIPE",
      eventType: "stripe.invoice.payment_failed",
      idempotencyKey: `stripe.invoice.payment_failed:${event.id}`,
      sourceReference: typeof object.id === "string" ? object.id : stripeSubscriptionId,
      stripeEventId: event.id,
      stripePaymentIntentId:
        typeof object.payment_intent === "string" ? object.payment_intent : null,
      amountCents: normalizeBillingAmountCents(
        object.amount_due ?? object.amount_remaining ?? object.total
      ),
      currency: normalizeBillingCurrency(object.currency),
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
    await recordStripeMissingContextFinding({
      organizationId,
      stripeEventId: event.id,
      stripeEventType: event.type,
      sourceRecordType: "invoice",
      sourceRecordId: typeof object.id === "string" ? object.id : null,
      missing: [
        ...(!organizationId ? ["organizationId"] : []),
        ...(!stripeCustomerId ? ["stripeCustomerId"] : []),
        ...(!stripeSubscriptionId ? ["stripeSubscriptionId"] : [])
      ],
      metadata: {
        invoiceId: object.id ?? null,
        stripeSubscriptionId: object.subscription ?? null,
        stripeCustomerId
      }
    });
    logServerEvent("warn", "stripe.webhook.invoice_action_required_missing_context", {
      event_id: event.id,
      org_id: organizationId,
      status: "missing_context",
      source: "stripe",
      metadata: {
        invoiceId: object.id ?? null,
        stripeSubscriptionId: object.subscription ?? null
      },
      requestContext
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
      planCodeSnapshot: syncedSubscription.planCodeSnapshot,
      eventSource: "STRIPE",
      eventType: "stripe.invoice.payment_action_required",
      idempotencyKey: `stripe.invoice.payment_action_required:${event.id}`,
      sourceReference: typeof object.id === "string" ? object.id : stripeSubscriptionId,
      stripeEventId: event.id,
      stripePaymentIntentId:
        typeof object.payment_intent === "string" ? object.payment_intent : null,
      amountCents: normalizeBillingAmountCents(
        object.amount_due ?? object.amount_remaining ?? object.total
      ),
      currency: normalizeBillingCurrency(object.currency),
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
    await recordStripeMissingContextFinding({
      organizationId,
      stripeEventId: event.id,
      stripeEventType: event.type,
      sourceRecordType: "subscription",
      sourceRecordId: typeof object.id === "string" ? object.id : null,
      missing: [
        ...(!organizationId ? ["organizationId"] : []),
        ...(!object.id ? ["stripeSubscriptionId"] : [])
      ],
      metadata: {
        stripeSubscriptionId: object.id ?? null
      }
    });
    logServerEvent("warn", "stripe.webhook.trial_will_end_missing_context", {
      event_id: event.id,
      org_id: organizationId,
      status: "missing_context",
      source: "stripe",
      metadata: {
        stripeSubscriptionId: object.id ?? null
      }
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
  normalizedEvent: NormalizedStripePaymentEvent,
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
  const { paymentReconciliation } = createStripeAccessIssuance({
    normalizedEvent,
    selectedPlan: normalizedEvent.selectedPlan ?? normalizedEvent.revenuePlanCode,
    organizationId,
    reconciliationStatus: "reconciliation_failed",
    grantStatus: "binding_pending"
  });

  if (!organizationId || !stripeCustomerId || !stripeSubscriptionId) {
    await recordStripeMissingContextFinding({
      organizationId,
      stripeEventId: event.id,
      stripeEventType: event.type,
      sourceRecordType: "checkoutSession",
      sourceRecordId: typeof object.id === "string" ? object.id : null,
      missing: [
        ...(!organizationId ? ["organizationId"] : []),
        ...(!stripeCustomerId ? ["stripeCustomerId"] : []),
        ...(!stripeSubscriptionId ? ["stripeSubscriptionId"] : [])
      ],
      metadata: {
        stripeSubscriptionId,
        stripeCustomerId,
        reconciliation: paymentReconciliation
      }
    });
    logServerEvent("warn", "stripe.webhook.checkout_async_failed_missing_context", {
      event_id: event.id,
      org_id: organizationId,
      status: "missing_context",
      source: "stripe",
      metadata: {
        stripeSubscriptionId,
        stripeCustomerId,
        reconciliation: paymentReconciliation
      },
      requestContext
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    const persistedReconciliation = await upsertPaymentReconciliationRecord({
      db: tx,
      stripeEventId: normalizedEvent.stripeEventId,
      stripeEventType: normalizedEvent.stripeEventType,
      checkoutSessionId: normalizedEvent.checkoutSessionId,
      stripePaymentReference:
        normalizedEvent.stripeSubscriptionId ?? normalizedEvent.stripePaymentIntentId,
      customerEmail: normalizedEvent.customerEmail,
      selectedPlan: normalizedEvent.selectedPlan ?? normalizedEvent.revenuePlanCode,
      organizationId,
      correlationId: normalizedEvent.correlationId,
      reconciliationStatus: paymentReconciliation.reconciliationStatus,
      metadata: paymentReconciliation,
      failedAt: new Date(),
      lastError:
        "Stripe checkout payment did not complete. The customer can retry from billing."
    });

    await appendOperatorWorkflowEventRecord({
      db: tx,
      eventKey: `operator.reconciliation_failed:${persistedReconciliation.id}`,
      organizationId,
      paymentReconciliationId: persistedReconciliation.id,
      eventCode: "delivery_failed",
      severity: "warning",
      message:
        "Stripe checkout reconciliation failed because payment did not complete successfully.",
      metadata: paymentReconciliation
    });

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
      planCodeSnapshot: syncedSubscription.planCodeSnapshot,
      eventSource: "STRIPE",
      eventType: "stripe.checkout.async_payment_failed",
      idempotencyKey: `stripe.checkout.async_payment_failed:${event.id}`,
      sourceReference: stripeSubscriptionId,
      stripeEventId: event.id,
      stripeCheckoutSessionId: typeof object.id === "string" ? object.id : null,
      stripePaymentIntentId:
        typeof object.payment_intent === "string" ? object.payment_intent : null,
      amountCents: normalizeBillingAmountCents(object.amount_total),
      currency: normalizeBillingCurrency(object.currency),
      payload: {
        stripeEventId: event.id,
        checkoutSessionId: typeof object.id === "string" ? object.id : null,
        stripeSubscriptionId,
        stripeCustomerId,
        reconciliation: paymentReconciliation,
        latestInvoiceStatus: syncedSubscription.latestInvoiceStatus,
        status: syncedSubscription.status
      }
    });
  });
}

async function processStripeEvent(
  normalizedEvent: NormalizedStripePaymentEvent,
  event: StripeEvent,
  requestContext: Prisma.InputJsonValue,
  billingEventId: string
) {
  switch (normalizedEvent.kind) {
    case "checkout_completed":
    case "checkout_async_payment_succeeded":
      await handleCheckoutCompleted(
        normalizedEvent,
        event,
        requestContext,
        billingEventId
      );
      return;
    case "checkout_async_payment_failed":
      await handleCheckoutAsyncPaymentFailed(normalizedEvent, event, requestContext);
      return;
    default:
      return;
  }
}


export async function POST(request: Request) {
  const rateLimited = await applyRouteRateLimit(request, {
    key: "stripe-webhook",
    category: "webhook"
  });
  if (rateLimited) {
    return rateLimited;
  }

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  const requestContext = buildAuditRequestContextFromRequest(request);

  if (!signature) {
    logServerEvent("warn", "stripe.webhook.missing_signature", {
      status: "invalid",
      source: "stripe",
      requestContext
    });
    return new NextResponse("Missing stripe-signature header", { status: 400 });
  }

  try {
    // Verify the Stripe signature against the raw request body before any
    // parsing or reconciliation logic runs. Future billing/report binding
    // updates should only happen below this verified boundary.
    const verifiedPayload = verifyStripeWebhookSignature({
      payload,
      signatureHeader: signature,
      webhookSecret: requireEnv("STRIPE_WEBHOOK_SECRET")
    });
    const event = expectObject(verifiedPayload, "stripe event") as StripeEvent;

    if (!event?.id || !event?.type || !event?.data?.object) {
      throw new Error("Stripe webhook payload is missing required event fields.");
    }

    const configuredStripeMode = getConfiguredStripeRuntimeMode();
    if (
      isStripeWebhookLivemodeMismatch({
        configuredMode: configuredStripeMode,
        eventLivemode: event.livemode
      })
    ) {
      logServerEvent("error", "stripe.webhook.mode_mismatch", {
        event_id: event.id,
        status: "failed",
        source: "stripe",
        requestContext,
        metadata: {
          type: event.type,
          configuredStripeMode,
          eventLivemode: event.livemode
        }
      });
      return NextResponse.json(
        {
          error:
            "Stripe webhook livemode does not match the configured Stripe secret key mode."
        },
        { status: 400 }
      );
    }

    const normalizedPaymentEvent = normalizeStripePaymentEvent(event);

    if (!normalizedPaymentEvent) {
      const classification = classifyUnsupportedStripeWebhookEvent();
      logServerEvent("info", "stripe.webhook.ignored", {
        event_id: event.id,
        status: "ignored",
        source: "stripe",
        requestContext,
        metadata: {
          type: event.type,
          classification
        }
      });
      return NextResponse.json({ received: true, ignored: true });
    }

    logServerEvent("info", "stripe.webhook.received", {
      event_id: event.id,
      status: "received",
      source: "stripe",
      requestContext,
      metadata: {
        type: event.type,
        normalizedKind: normalizedPaymentEvent.kind,
        checkoutSessionId: normalizedPaymentEvent.checkoutSessionId
      }
    });

    const claimedEvent = await claimStripeWebhookEventProcessing({
      id: event.id,
      type: event.type,
      payload: event
    });

    if (!claimedEvent.claimed) {
      const classification = classifyDuplicateStripeWebhookEvent();
      logServerEvent("info", "stripe.webhook.deduplicated", {
        event_id: event.id,
        status: claimedEvent.reason === "processed" ? "deduplicated" : "in_flight",
        source: "stripe",
        requestContext,
        metadata: {
          type: event.type,
          reason: claimedEvent.reason,
          classification
        }
      });
      return NextResponse.json({
        received: true,
        deduplicated: claimedEvent.reason === "processed",
        processing: claimedEvent.reason === "in-flight"
      });
    }

    try {
      await processStripeEvent(
        normalizedPaymentEvent,
        event,
        requestContext,
        claimedEvent.billingEvent.id
      );
      const processedResult = await markStripeWebhookEventProcessed(event.id, event);

      if (!processedResult.transitioned) {
        logServerEvent("warn", "stripe.webhook.processed_transition_skipped", {
          event_id: event.id,
          status: "ignored",
          source: "stripe",
          requestContext,
          metadata: {
            type: event.type,
            billingEventStatus: processedResult.billingEvent?.status ?? null
          }
        });

        return NextResponse.json({ received: true, transitioned: false });
      }

      logServerEvent("info", "stripe.webhook.processed", {
        event_id: event.id,
        status: "processed",
        source: "stripe",
        requestContext,
        metadata: {
          type: event.type
        }
      });

      return NextResponse.json({ received: true });
    } catch (processingError) {
      const failedResult = await handleFailedBillingEvent(
        event.id,
        event,
        processingError
      );

      if (!failedResult.transitioned) {
        logServerEvent("warn", "stripe.webhook.failed_transition_skipped", {
          event_id: event.id,
          status: "ignored",
          source: "stripe",
          requestContext,
          metadata: {
            type: event.type,
            billingEventStatus: failedResult.billingEvent?.status ?? null
          }
        });

        return NextResponse.json({ received: true, transitioned: false });
      }

      throw processingError;
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      const classification = classifyStripeWebhookVerificationFailure();
      logServerEvent("warn", "stripe.webhook.invalid_payload", {
        status: "invalid",
        source: "stripe",
        requestContext,
        metadata: {
          message: error.message,
          classification
        }
      });
      return new NextResponse(error.message, { status: 400 });
    }

    const classification = classifyStripeWebhookProcessingFailure(error);
    logServerEvent("error", "stripe.webhook.failed", {
      status: "failed",
      source: "stripe",
      requestContext,
      metadata: {
        message: error instanceof Error ? error.message : "Unknown error",
        classification
      }
    });
    await sendOperationalAlert({
      source: "stripe.webhook",
      title: "Stripe webhook processing failed",
      metadata: {
        message: error instanceof Error ? error.message : "Unknown error",
        classification
      }
    });
    return new NextResponse("Webhook processing failed", { status: 400 });
  }
}
