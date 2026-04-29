import { CommercialPlanCode, prisma } from "@evolve-edge/db";
import { NextResponse } from "next/server";
import {
  computeAndPersistRoutingSnapshot,
  normalizeCommercialPlanCode
} from "../../../../../lib/commercial-routing";
import { sendOperationalAlert } from "../../../../../lib/monitoring";
import { isAuthorizedBearerRequest } from "../../../../../lib/security-auth";
import {
  expectObject,
  parseJsonRequestBody,
  readOptionalString,
  ValidationError
} from "../../../../../lib/security-validation";
import {
  dispatchWorkflowById,
  queueAuditRequestedDispatch
} from "../../../../../lib/workflow-dispatch";
import { requireOutboundDispatchSecret } from "../../../../../lib/webhook-dispatcher";
import { getOrganizationAuditReadiness } from "../../../../../lib/audit-intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
        "plan_code, purchased_tier, or purchased_plan_code must resolve to starter, scale, or enterprise."
      );
  }
}

function readBootstrapPayload(payload: Record<string, unknown>) {
  const organizationId =
    readOptionalString(payload, "organization_id", { maxLength: 200 }) ??
    readOptionalString(payload, "app_org_id", { maxLength: 200 });
  if (!organizationId) {
    throw new ValidationError("organization_id or app_org_id is required.");
  }

  const sourceEventId =
    readOptionalString(payload, "source_event_id", { maxLength: 200 }) ??
    readOptionalString(payload, "request_id", { maxLength: 200 });
  if (!sourceEventId) {
    throw new ValidationError("source_event_id or request_id is required.");
  }

  const planCodeValue =
    readOptionalString(payload, "plan_code", { maxLength: 120 }) ??
    readOptionalString(payload, "purchased_tier", { maxLength: 120 }) ??
    readOptionalString(payload, "purchased_plan_code", { maxLength: 120 });
  if (!planCodeValue) {
    throw new ValidationError(
      "plan_code, purchased_tier, or purchased_plan_code is required."
    );
  }

  return {
    organizationId,
    userId:
      readOptionalString(payload, "user_id", { maxLength: 200 }) ??
      readOptionalString(payload, "app_customer_id", { maxLength: 200 }),
    billingEventId: readOptionalString(payload, "billing_event_id", {
      maxLength: 200
    }),
    sourceSystem:
      readOptionalString(payload, "source_system", { maxLength: 120 }) ??
      "internal",
    sourceEventType:
      readOptionalString(payload, "source_event_type", { maxLength: 120 }) ??
      "manual.dispatch.bootstrap",
    sourceEventId,
    sourceRecordType: readOptionalString(payload, "source_record_type", {
      maxLength: 120
    }),
    sourceRecordId:
      readOptionalString(payload, "source_record_id", { maxLength: 200 }) ??
      sourceEventId,
    idempotencyKey:
      readOptionalString(payload, "idempotency_key", { maxLength: 240 }) ??
      `manual-dispatch:${sourceEventId}`,
    planCode: toCommercialPlanCode(planCodeValue)
  };
}

export async function POST(request: Request) {
  try {
    if (!isAuthorizedBearerRequest(request, requireOutboundDispatchSecret())) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = expectObject(await parseJsonRequestBody(request));
    const normalized = readBootstrapPayload(payload);
    const readiness = await getOrganizationAuditReadiness({
      organizationId: normalized.organizationId
    });

    if (!readiness.readyForAudit) {
      return NextResponse.json(
        {
          error:
            "Required onboarding intake must be completed before workflow dispatch."
        },
        { status: 409 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const routingSnapshot = await computeAndPersistRoutingSnapshot({
        organizationId: normalized.organizationId,
        userId: normalized.userId,
        billingEventId: normalized.billingEventId,
        sourceSystem: normalized.sourceSystem,
        sourceEventType: normalized.sourceEventType,
        sourceEventId: normalized.sourceEventId,
        sourceRecordType: normalized.sourceRecordType,
        sourceRecordId: normalized.sourceRecordId,
        planCode: normalized.planCode,
        idempotencyKey: normalized.idempotencyKey,
        db: tx
      });

      const dispatch = await queueAuditRequestedDispatch({
        routingSnapshotId: routingSnapshot.id,
        db: tx
      });

      return {
        routingSnapshot,
        dispatch
      };
    });

    const delivery = await dispatchWorkflowById(result.dispatch.id);

    return NextResponse.json({
      ok: true,
      routing_snapshot_id: result.routingSnapshot.id,
      workflow_dispatch_id: result.dispatch.id,
      dispatch_status: result.dispatch.status,
      delivered: delivery.delivered,
      skipped: delivery.skipped
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "Unknown error";

    await sendOperationalAlert({
      source: "api.internal.workflows.bootstrap-dispatch",
      title: "Workflow bootstrap dispatch API failed",
      metadata: {
        message
      }
    });

    return NextResponse.json(
      {
        error: message
      },
      { status: 500 }
    );
  }
}
