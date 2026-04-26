import { AuditActorType, Prisma, prisma } from "@evolve-edge/db";
import { NextResponse } from "next/server";
import { buildAuditRequestContextFromRequest, writeAuditLog } from "../../../../lib/audit";
import { requireCurrentSession } from "../../../../lib/auth";
import { publishDomainEvent } from "../../../../lib/domain-events";
import { enforceTrustedOrigin } from "../../../../lib/route-security";
import { applyRouteRateLimit } from "../../../../lib/security-rate-limit";
import {
  expectObject,
  parseJsonRequestBody,
  readRequiredString,
  ValidationError
} from "../../../../lib/security-validation";

type UpsellTrackRequest = {
  eventId?: string;
  eventType?: "impression" | "click";
  offerKey?: string;
  offerType?: string;
  placement?: string;
  trigger?: string;
  accountMaturity?: string;
  ctaKind?: string;
  ctaTarget?: string;
};

function trim(value: string | undefined, maxLength = 120) {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

export async function POST(request: Request) {
  const invalidOrigin = enforceTrustedOrigin(request);
  if (invalidOrigin) {
    return invalidOrigin;
  }

  const rateLimited = applyRouteRateLimit(request, {
    key: "upsell-track",
    category: "api"
  });
  if (rateLimited) {
    return rateLimited;
  }

  const session = await requireCurrentSession({ requireOrganization: true });
  let body: UpsellTrackRequest;

  try {
    body = expectObject(await parseJsonRequestBody(request)) as UpsellTrackRequest;
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    throw error;
  }

  const rawEventType = readRequiredString(body as Record<string, unknown>, "eventType", {
    maxLength: 20
  });
  const eventType =
    rawEventType === "click"
      ? "click"
      : rawEventType === "impression"
        ? "impression"
        : null;
  const offerKey = trim(
    readRequiredString(body as Record<string, unknown>, "offerKey", { maxLength: 120 })
  );
  const eventId = trim(
    readRequiredString(body as Record<string, unknown>, "eventId", { maxLength: 200 }),
    200
  );

  if (!eventType || !offerKey || !eventId) {
    return NextResponse.json(
      {
        error: "Invalid upsell tracking payload."
      },
      { status: 400 }
    );
  }

  const organizationId = session.organization!.id;
  const userId = session.user.id;
  const requestContext = buildAuditRequestContextFromRequest(request);
  const metadata = {
    placement: trim(body.placement),
    offerType: trim(body.offerType),
    trigger: trim(body.trigger, 200),
    accountMaturity: trim(body.accountMaturity),
    ctaKind: trim(body.ctaKind),
    ctaTarget: trim(body.ctaTarget, 200)
  } satisfies Prisma.InputJsonValue;

  await prisma.$transaction(async (tx) => {
    await publishDomainEvent(tx, {
      type: eventType === "click" ? "upsell.clicked" : "upsell.impression",
      aggregateType: "upsellOffer",
      aggregateId: offerKey,
      orgId: organizationId,
      userId,
      idempotencyKey: `upsell:${eventType}:${organizationId}:${userId}:${eventId}`,
      payload: {
        organizationId,
        userId,
        offerKey,
        ...metadata
      } satisfies Prisma.InputJsonValue
    });

    await writeAuditLog(tx, {
      organizationId,
      userId,
      actorType: AuditActorType.USER,
      actorLabel: session.user.email,
      action: eventType === "click" ? "upsell.clicked" : "upsell.impression",
      entityType: "upsellOffer",
      entityId: offerKey,
      metadata,
      requestContext
    });
  });

  return NextResponse.json({ ok: true });
}
