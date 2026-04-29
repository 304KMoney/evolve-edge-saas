import {
  AuditActorType,
  CommercialPlanCode,
  DeliveryStateStatus,
  Prisma,
  UserRole,
  prisma
} from "@evolve-edge/db";
import { NextResponse } from "next/server";
import {
  createTraceId,
  getIntakeEnvPresence,
  maskEmail,
  maybeAddTraceDebug,
  readTraceIdFromHeaders,
  readTraceIdFromPayload
} from "../../../../lib/intake-observability";
import { getOptionalEnv, getRuntimeEnvironment } from "../../../../lib/runtime-config";
import {
  computeAndPersistRoutingSnapshot,
  normalizeCommercialPlanCode,
  resolveOrCreateCommercialUser
} from "../../../../lib/commercial-routing";
import {
  createDeliveryStateFromPaidRequest,
  transitionDeliveryState
} from "../../../../lib/delivery-state";
import { logServerEvent, sendOperationalAlert } from "../../../../lib/monitoring";
import { applyRouteRateLimit } from "../../../../lib/security-rate-limit";
import { isAuthorizedBearerRequest } from "../../../../lib/security-auth";
import {
  expectObject,
  parseJsonRequestBody,
  readOptionalJsonValue,
  readOptionalString,
  readOptionalStringArray,
  readRequiredString,
  ValidationError
} from "../../../../lib/security-validation";
import {
  dispatchWorkflowById,
  queueAuditRequestedDispatch
} from "../../../../lib/workflow-dispatch";
import { getOrganizationAuditReadiness } from "../../../../lib/audit-intake";
import { resolveAppOwnedPaidPlanForDispatch } from "../../../../lib/public-app-dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_METHODS = "POST";
const ROUTE = "api.automation.intake-to-app-dispatch";
const SOURCE_SYSTEM = "app_public_intake";
const SOURCE_EVENT_TYPE = "automation.intake.received";

type PublicIntakePayload = ReturnType<typeof normalizePayload>;

function methodNotAllowedResponse() {
  return NextResponse.json(
    {
      error: "Method not allowed. Use POST with a JSON body.",
      allowed_methods: [ALLOWED_METHODS],
      minimum_payload_fields: ["request_id", "customer_email", "purchased_tier"]
    },
    {
      status: 405,
      headers: {
        Allow: ALLOWED_METHODS
      }
    }
  );
}

function readOptionalBoolean(payload: Record<string, unknown>, field: string) {
  const value = payload[field];
  if (value == null) {
    return null;
  }

  if (typeof value !== "boolean") {
    throw new ValidationError(`${field} must be a boolean.`);
  }

  return value;
}

function readOptionalNumber(payload: Record<string, unknown>, field: string) {
  const value = payload[field];
  if (value == null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValidationError(`${field} must be a finite number.`);
  }

  return value;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizePayload(payload: Record<string, unknown>) {
  const requestId = readRequiredString(payload, "request_id", { maxLength: 200 });
  const customerEmail = readRequiredString(payload, "customer_email", {
    maxLength: 320
  });
  const purchasedTier =
    readOptionalString(payload, "purchased_tier", { maxLength: 120 }) ??
    readOptionalString(payload, "purchased_plan_code", { maxLength: 120 });

  if (!purchasedTier) {
    throw new ValidationError("purchased_tier or purchased_plan_code is required.");
  }

  return {
    request_id: requestId,
    app_customer_id:
      readOptionalString(payload, "app_customer_id", { maxLength: 200 }) ??
      readOptionalString(payload, "user_id", { maxLength: 200 }),
    app_org_id:
      readOptionalString(payload, "app_org_id", { maxLength: 200 }) ??
      readOptionalString(payload, "organization_id", { maxLength: 200 }),
    customer_email: normalizeEmail(customerEmail),
    customer_name: readOptionalString(payload, "customer_name", {
      maxLength: 200
    }),
    first_name: readOptionalString(payload, "first_name", { maxLength: 120 }),
    last_name: readOptionalString(payload, "last_name", { maxLength: 120 }),
    company_name: readOptionalString(payload, "company_name", { maxLength: 200 }),
    phone: readOptionalString(payload, "phone", { maxLength: 60 }),
    purchased_tier: purchasedTier,
    purchased_plan_code:
      readOptionalString(payload, "purchased_plan_code", { maxLength: 120 }) ??
      purchasedTier,
    amount_paid: readOptionalNumber(payload, "amount_paid"),
    currency: readOptionalString(payload, "currency", { maxLength: 16 }),
    stripe_session_id: readOptionalString(payload, "stripe_session_id", {
      maxLength: 200
    }),
    stripe_payment_intent: readOptionalString(payload, "stripe_payment_intent", {
      maxLength: 200
    }),
    stripe_customer_id: readOptionalString(payload, "stripe_customer_id", {
      maxLength: 200
    }),
    order_id: readOptionalString(payload, "order_id", { maxLength: 200 }),
    lead_source_detail: readOptionalString(payload, "lead_source_detail", {
      maxLength: 200
    }),
    top_concerns: readOptionalStringArray(payload, "top_concerns", {
      maxItems: 25,
      maxItemLength: 500
    }),
    uses_ai_tools: readOptionalBoolean(payload, "uses_ai_tools"),
    company_size: readOptionalString(payload, "company_size", {
      maxLength: 120
    }),
    industry: readOptionalString(payload, "industry", { maxLength: 120 }),
    additional_notes: readOptionalString(payload, "additional_notes", {
      maxLength: 8000,
      allowEmpty: true
    }),
    website: readOptionalString(payload, "website", { maxLength: 500 }),
    intake_answers: readOptionalJsonValue(payload, "intake_answers"),
    purchase_timestamp: readOptionalString(payload, "purchase_timestamp", {
      maxLength: 100
    })
  };
}

function toCommercialPlanCode(value: string) {
  switch (normalizeCommercialPlanCode(value as CommercialPlanCode)) {
    case "starter":
      return CommercialPlanCode.STARTER;
    case "enterprise":
      return CommercialPlanCode.ENTERPRISE;
    case "scale":
      return CommercialPlanCode.SCALE;
    default:
      throw new ValidationError(
        "purchased_tier or purchased_plan_code must resolve to starter, scale, or enterprise."
      );
  }
}

function splitCustomerName(payload: PublicIntakePayload) {
  if (payload.first_name || payload.last_name) {
    return {
      firstName: payload.first_name,
      lastName: payload.last_name
    };
  }

  if (!payload.customer_name) {
    return {
      firstName: null,
      lastName: null
    };
  }

  const parts = payload.customer_name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    firstName: parts[0] ?? null,
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null
  };
}

function slugifyCompanyName(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

  return normalized.length > 0 ? normalized : "workspace";
}

async function buildUniqueOrganizationSlug(
  baseSlug: string,
  db: Prisma.TransactionClient
) {
  let slug = baseSlug;
  let attempt = 1;

  while (await db.organization.findUnique({ where: { slug } })) {
    attempt += 1;
    slug = `${baseSlug}-${attempt}`;
  }

  return slug;
}

async function ensureOwnerMembership(input: {
  organizationId: string;
  userId: string;
  db: Prisma.TransactionClient;
}) {
  const existing = await input.db.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.userId
      }
    }
  });

  if (existing) {
    return existing;
  }

  return input.db.organizationMember.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      role: UserRole.OWNER,
      isBillingAdmin: true
    }
  });
}

async function resolveOrganizationForIntake(input: {
  payload: PublicIntakePayload;
  userId: string;
  db: Prisma.TransactionClient;
}) {
  if (input.payload.app_org_id) {
    const existing = await input.db.organization.findUnique({
      where: { id: input.payload.app_org_id }
    });

    if (!existing) {
      throw new ValidationError("app_org_id or organization_id was not found.");
    }

    await ensureOwnerMembership({
      organizationId: existing.id,
      userId: input.userId,
      db: input.db
    });

    return existing;
  }

  const existingMembership = await input.db.organizationMember.findFirst({
    where: {
      userId: input.userId
    },
    include: {
      organization: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  if (existingMembership?.organization) {
    return existingMembership.organization;
  }

  const companyName =
    input.payload.company_name ??
    input.payload.customer_name ??
    input.payload.customer_email.split("@")[0].replace(/[._-]+/g, " ") ??
    "Customer workspace";
  const baseSlug = slugifyCompanyName(companyName);
  const slug = await buildUniqueOrganizationSlug(baseSlug, input.db);

  const created = await input.db.organization.create({
    data: {
      name: companyName,
      slug,
      createdByUserId: input.userId,
      billingOwnerUserId: input.userId,
      industry: input.payload.industry,
      sizeBand: input.payload.company_size
    }
  });

  await ensureOwnerMembership({
    organizationId: created.id,
    userId: input.userId,
    db: input.db
  });

  return created;
}

async function resolvePublicIntakeContext(input: {
  payload: PublicIntakePayload;
  db: Prisma.TransactionClient;
}) {
  const { firstName, lastName } = splitCustomerName(input.payload);
  const user =
    input.payload.app_customer_id
      ? await input.db.user.findUnique({
          where: {
            id: input.payload.app_customer_id
          }
        })
      : await resolveOrCreateCommercialUser({
          email: input.payload.customer_email,
          firstName,
          lastName,
          db: input.db
        });

  if (!user) {
    throw new ValidationError("app_customer_id or user_id was not found.");
  }

  const organization = await resolveOrganizationForIntake({
    payload: input.payload,
    userId: user.id,
    db: input.db
  });

  return {
    user,
    organization
  };
}

function buildSourceRecordMetadata(payload: PublicIntakePayload) {
  if (payload.stripe_session_id) {
    return {
      sourceRecordType: "stripe.checkout.session",
      sourceRecordId: payload.stripe_session_id
    };
  }

  if (payload.order_id) {
    return {
      sourceRecordType: "commerce.order",
      sourceRecordId: payload.order_id
    };
  }

  return {
    sourceRecordType: "public_intake_request",
    sourceRecordId: payload.request_id
  };
}

function toOptional<T>(value: T | null) {
  return value ?? undefined;
}

function normalizeInputJsonValue(
  value: Prisma.InputJsonValue | null
): Prisma.JsonValue | undefined {
  if (value == null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeInputJsonValue(item) ?? null) as Prisma.JsonArray;
  }

  if (typeof value === "object") {
    const normalized: Prisma.JsonObject = {};
    for (const [key, nestedValue] of Object.entries(
      value as Record<string, Prisma.InputJsonValue | null>
    )) {
      const normalizedValue = normalizeInputJsonValue(nestedValue);
      if (normalizedValue !== undefined) {
        normalized[key] = normalizedValue;
      }
    }
    return normalized;
  }

  return value;
}

function buildIntakeStatusReason(payload: PublicIntakePayload) {
  const metadata: Prisma.InputJsonObject = {
    requestId: payload.request_id,
    customerEmail: payload.customer_email,
    purchasedTier: payload.purchased_tier,
    purchasedPlanCode: payload.purchased_plan_code,
    amountPaid: payload.amount_paid ?? undefined,
    currency: payload.currency ?? undefined,
    stripeSessionId: payload.stripe_session_id ?? undefined,
    stripePaymentIntent: payload.stripe_payment_intent ?? undefined,
    stripeCustomerId: payload.stripe_customer_id ?? undefined,
    orderId: payload.order_id ?? undefined,
    topConcerns: payload.top_concerns,
    usesAiTools: payload.uses_ai_tools ?? undefined,
    companySize: payload.company_size ?? undefined,
    industry: payload.industry ?? undefined,
    additionalNotes: payload.additional_notes ?? undefined,
    website: payload.website ?? undefined,
    purchaseTimestamp: payload.purchase_timestamp ?? undefined,
    ...(payload.intake_answers != null
      ? { intakeAnswers: payload.intake_answers as Prisma.InputJsonValue }
      : {})
  };

  return metadata;
}

export async function GET() {
  return methodNotAllowedResponse();
}

export async function POST(request: Request) {
  const rateLimited = await applyRouteRateLimit(request, {
    key: "automation-intake-to-app-dispatch",
    category: "api"
  });
  if (rateLimited) {
    return rateLimited;
  }

  const intakeSecret =
    getOptionalEnv("PUBLIC_INTAKE_SHARED_SECRET") ??
    getOptionalEnv("OUTBOUND_DISPATCH_SECRET");
  if (!intakeSecret && getRuntimeEnvironment() === "production") {
    return NextResponse.json(
      { error: "Public intake is not configured for production." },
      { status: 503 }
    );
  }

  if (intakeSecret && !isAuthorizedBearerRequest(request, intakeSecret)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const envPresence = getIntakeEnvPresence();
  let traceId =
    readTraceIdFromHeaders(request.headers) ?? createTraceId("app-owned-intake");
  let requestId: string | null = null;
  let customerEmail: string | null = null;
  let purchasedTier: string | null = null;
  let organizationId: string | null = null;

  try {
    logServerEvent("info", "automation.intake_to_app_dispatch.request_received", {
      traceId,
      route: ROUTE,
      status: "received",
      source: ROUTE,
      metadata: envPresence
    });

    const payload = expectObject(await parseJsonRequestBody(request));
    traceId = readTraceIdFromPayload(payload) ?? traceId;

    const normalized = normalizePayload(payload);
    traceId = readTraceIdFromPayload(normalized) ?? traceId;
    requestId = normalized.request_id;
    customerEmail = normalized.customer_email;
    purchasedTier = normalized.purchased_tier;

    logServerEvent("info", "automation.intake_to_app_dispatch.payload_validated", {
      traceId,
      route: ROUTE,
      request_id: requestId,
      customer_email: maskEmail(customerEmail),
      purchased_tier: purchasedTier,
      status: "validated",
      source: ROUTE,
      metadata: {
        ...envPresence,
        payloadKeys: Object.keys(payload).slice(0, 20)
      }
    });

    const sourceRecord = buildSourceRecordMetadata(normalized);
    const statusReasonJson = buildIntakeStatusReason(normalized);

    const result = await prisma.$transaction(async (tx) => {
      const context = await resolvePublicIntakeContext({
        payload: normalized,
        db: tx
      });
      organizationId = context.organization.id;

      const readiness = await getOrganizationAuditReadiness({
        organizationId: context.organization.id,
        db: tx
      });

      if (!readiness.readyForAudit) {
        throw new ValidationError(
          "Required app onboarding intake must be completed before workflow dispatch."
        );
      }

      const paidPlan = await resolveAppOwnedPaidPlanForDispatch({
        organizationId: context.organization.id,
        db: tx
      });

      const deliveryState = await createDeliveryStateFromPaidRequest({
        db: tx,
        organizationId: context.organization.id,
        userId: context.user.id,
        sourceSystem: SOURCE_SYSTEM,
        sourceEventType: SOURCE_EVENT_TYPE,
        sourceEventId: normalized.request_id,
        sourceRecordType: sourceRecord.sourceRecordType,
        sourceRecordId: sourceRecord.sourceRecordId,
        idempotencyKey: `public-app-intake:${normalized.request_id}:delivery-state`,
        planCode: paidPlan.planCode,
        statusReasonJson
      });

      const routingSnapshot = await computeAndPersistRoutingSnapshot({
        db: tx,
        organizationId: context.organization.id,
        userId: context.user.id,
        sourceSystem: SOURCE_SYSTEM,
        sourceEventType: SOURCE_EVENT_TYPE,
        sourceEventId: normalized.request_id,
        sourceRecordType: sourceRecord.sourceRecordType,
        sourceRecordId: sourceRecord.sourceRecordId,
        planCode: paidPlan.planCode,
        idempotencyKey: `public-app-intake:${normalized.request_id}:routing`
      });

      const dispatch = await queueAuditRequestedDispatch({
        db: tx,
        routingSnapshotId: routingSnapshot.id,
        deliveryStateRecordId: deliveryState.id
      });

      await transitionDeliveryState({
        db: tx,
        deliveryStateId: deliveryState.id,
        sourceSystem: SOURCE_SYSTEM,
        sourceEventId: normalized.request_id,
        organizationId: context.organization.id,
        actorUserId: context.user.id,
        actorType: AuditActorType.SYSTEM,
        actorLabel: "public-app-intake",
        toStatus: DeliveryStateStatus.ROUTED,
        reasonCode: "delivery.routed",
        linkages: {
          userId: context.user.id,
          routingSnapshotId: routingSnapshot.id,
          workflowDispatchId: dispatch.id,
          entitlementsJson: routingSnapshot.entitlementsJson as Prisma.InputJsonValue,
          routingHintsJson: routingSnapshot.normalizedHintsJson as Prisma.InputJsonValue,
          statusReasonJson: routingSnapshot.routingReasonJson as Prisma.InputJsonValue
        }
      });

      return {
        context,
        deliveryState,
        routingSnapshot,
        dispatch
      };
    });

    const delivery = await dispatchWorkflowById(result.dispatch.id);

    logServerEvent("info", "automation.intake_to_app_dispatch.accepted", {
      traceId,
      route: ROUTE,
      request_id: requestId,
      org_id: result.context.organization.id,
      user_id: result.context.user.id,
      customer_email: maskEmail(customerEmail),
      purchased_tier: purchasedTier,
      status: "accepted",
      source: ROUTE,
      metadata: {
        routingSnapshotId: result.routingSnapshot.id,
        workflowDispatchId: result.dispatch.id,
        deliveryStateId: result.deliveryState.id,
        delivered: delivery.delivered,
        skipped: delivery.skipped
      }
    });

    return NextResponse.json(
      maybeAddTraceDebug(
        {
          ok: true,
          accepted: true,
          request_id: requestId
        },
        traceId
      )
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json(
        maybeAddTraceDebug({ error: error.message }, traceId),
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";

    logServerEvent("error", "automation.intake_to_app_dispatch.failed", {
      traceId,
      route: ROUTE,
      request_id: requestId,
      org_id: organizationId,
      customer_email: maskEmail(customerEmail),
      purchased_tier: purchasedTier,
      status: "failed",
      source: ROUTE,
      metadata: {
        ...envPresence,
        message
      }
    });

    await sendOperationalAlert({
      source: ROUTE,
      title: "Public app-owned intake dispatch failed",
      metadata: {
        requestId,
        organizationId,
        customerEmail: maskEmail(customerEmail),
        purchasedTier,
        traceId,
        message
      }
    });

    return NextResponse.json(
      maybeAddTraceDebug(
        { error: "Intake request could not be processed. Please retry shortly." },
        traceId
      ),
      { status: 500 }
    );
  }
}
