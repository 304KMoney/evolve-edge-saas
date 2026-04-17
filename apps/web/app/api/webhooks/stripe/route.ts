import { AuditActorType, Prisma } from "@evolve-edge/db";
import { NextResponse } from "next/server";
import { buildAuditRequestContextFromRequest } from "../../../../lib/audit";
import { synchronizeStripeCheckoutSession } from "../../../../lib/billing";
import { logAndCaptureServerError } from "../../../../lib/observability";
import {
  computeAndPersistRoutingSnapshot,
  normalizeCommercialPlanCode,
  resolveCommercialRoutingContextFromCheckout
} from "../../../../lib/commercial-routing";
import { resolveRevenuePlanCodeForCanonicalPlan } from "../../../../lib/commercial-catalog";
import { createDeliveryStateFromPaidRequest } from "../../../../lib/delivery-state";
import { logServerEvent } from "../../../../lib/monitoring";
import { requireEnv } from "../../../../lib/runtime-config";
import { applyRouteRateLimit } from "../../../../lib/security-rate-limit";
import { expectObject, ValidationError } from "../../../../lib/security-validation";
import { verifyStripeWebhookSignature } from "../../../../lib/security-webhooks";
import { queueAuditRequestedDispatch } from "../../../../lib/workflow-dispatch";

export const runtime = "nodejs";

type StripeEvent = {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
};

function parseStripeEvent(rawPayload: unknown) {
  const payload = expectObject(rawPayload);
  const eventId = typeof payload.id === "string" ? payload.id : null;
  const eventType = typeof payload.type === "string" ? payload.type : null;
  const data = payload.data;

  if (!eventId || !eventType || !data || typeof data !== "object" || Array.isArray(data)) {
    throw new ValidationError("Invalid Stripe event payload.");
  }

  const object = (data as Record<string, unknown>).object;
  if (!object || typeof object !== "object" || Array.isArray(object)) {
    throw new ValidationError("Stripe event data.object is required.");
  }

  return {
    id: eventId,
    type: eventType,
    data: {
      object: object as Record<string, unknown>
    }
  } satisfies StripeEvent;
}

export async function POST(request: Request) {
  try {
    const rateLimited = applyRouteRateLimit(request, {
      key: "stripe-webhooks-v2",
      category: "webhook"
    });
    if (rateLimited) {
      return rateLimited;
    }

    const payload = await request.text();
    const signatureHeader = request.headers.get("stripe-signature") ?? "";
    if (!signatureHeader) {
      return NextResponse.json({ error: "Missing Stripe signature header." }, { status: 400 });
    }

    const verified = verifyStripeWebhookSignature({
      payload,
      signatureHeader,
      webhookSecret: requireEnv("STRIPE_WEBHOOK_SECRET")
    });
    const event = parseStripeEvent(verified);

    if (event.type !== "checkout.session.completed") {
      return NextResponse.json({ ok: true, ignored: true, eventType: event.type });
    }

    const checkoutSessionId =
      typeof event.data.object.id === "string" ? event.data.object.id : null;
    if (!checkoutSessionId) {
      throw new ValidationError("Stripe checkout.session.completed payload is missing session id.");
    }

    const requestContext = buildAuditRequestContextFromRequest(request) as Prisma.InputJsonValue;
    const commercialContext = await resolveCommercialRoutingContextFromCheckout({
      stripeObject: event.data.object,
      sourceEventId: event.id
    });
    const normalizedTier = normalizeCommercialPlanCode(commercialContext.planMapping.planCode);
    const revenuePlanCode =
      commercialContext.planMapping.revenuePlanCode ??
      resolveRevenuePlanCodeForCanonicalPlan(normalizedTier);

    const deliveryState = await createDeliveryStateFromPaidRequest({
      organizationId: commercialContext.organization.id,
      userId: commercialContext.user.id,
      sourceSystem: "stripe",
      sourceEventType: event.type,
      sourceEventId: event.id,
      sourceRecordType: "checkoutSession",
      sourceRecordId: checkoutSessionId,
      idempotencyKey: `delivery-state:stripe-checkout-session:${checkoutSessionId}`,
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
      checkoutSessionId,
      fallbackPlanCode: revenuePlanCode,
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
      sourceRecordId: checkoutSessionId,
      planCode: commercialContext.planMapping.planCode,
      idempotencyKey: `routing-snapshot:stripe-checkout-session:${checkoutSessionId}`
    });

    const workflowDispatch = await queueAuditRequestedDispatch({
      routingSnapshotId: routingSnapshot.id
    });

    logServerEvent("info", "stripe.webhook_v2.checkout_completed", {
      event_id: event.id,
      org_id: commercialContext.organization.id,
      user_id: commercialContext.user.id,
      source: "stripe",
      status: "accepted",
      metadata: {
        checkoutSessionId,
        tier: normalizedTier,
        customerEmail: commercialContext.user.email,
        customerName: [commercialContext.user.firstName, commercialContext.user.lastName].filter(Boolean).join(" ") || null,
        deliveryStateId: deliveryState.id,
        routingSnapshotId: routingSnapshot.id,
        workflowDispatchId: workflowDispatch.id
      }
    });

    return NextResponse.json({
      ok: true,
      eventId: event.id,
      sessionId: checkoutSessionId,
      email: commercialContext.user.email,
      name: [commercialContext.user.firstName, commercialContext.user.lastName].filter(Boolean).join(" ") || null,
      tier: normalizedTier,
      organizationId: commercialContext.organization.id,
      deliveryStateId: deliveryState.id,
      routingSnapshotId: routingSnapshot.id,
      workflowDispatchId: workflowDispatch.id
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await logAndCaptureServerError({
      route: "api.webhooks.stripe",
      event: "webhooks.stripe.failed",
      error,
      request
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown webhook error"
      },
      { status: 500 }
    );
  }
}
