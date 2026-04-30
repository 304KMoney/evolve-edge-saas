import "server-only";

import {
  CommercialPlanCode,
  Prisma,
  RoutingSnapshotStatus,
  SubscriptionStatus,
  WorkflowDispatchStatus,
  prisma
} from "@evolve-edge/db";
import {
  computeAndPersistRoutingSnapshot,
  normalizeCommercialPlanCode
} from "./commercial-routing";
import { createDeliveryStateFromPaidRequest } from "./delivery-state";
import { logServerEvent } from "./monitoring";
import {
  resolveCanonicalPlanCode,
  resolveCanonicalPlanCodeFromRevenuePlanCode
} from "./commercial-catalog";
import {
  dispatchWorkflowById,
  queueAuditRequestedDispatch
} from "./workflow-dispatch";
import { getOrganizationAuditReadiness } from "./audit-intake";

type FirstCustomerJourneyDbClient = Prisma.TransactionClient | typeof prisma;

export type FirstCustomerJourneyResumeResult =
  | {
      status: "blocked_intake_incomplete" | "blocked_no_paid_plan";
      reason: string;
    }
  | {
      status:
        | "existing_dispatch"
        | "queued_from_existing_snapshot"
        | "queued_from_subscription";
      routingSnapshotId: string;
      workflowDispatchId: string;
      dispatched: boolean;
    };

export function resolveBillingReturnDestination(input: {
  status: "success" | "cancelled" | "portal" | "processing" | "error";
  intakeComplete: boolean;
  queryString?: string;
}) {
  const query = input.queryString?.trim();

  if (input.status === "cancelled") {
    return `/dashboard/settings${query ? `?${query}` : "?billing=cancelled"}`;
  }

  if (input.status === "portal") {
    return "/dashboard/settings?billing=portal-returned";
  }

  if (!input.intakeComplete) {
    const billingStatus =
      input.status === "success"
        ? "success"
        : input.status === "processing"
          ? "processing"
          : "error";

    return `/onboarding?billing=${billingStatus}`;
  }

  if (input.status === "success") {
    return "/dashboard?billing=success";
  }

  if (input.status === "processing") {
    return "/dashboard/settings?billing=processing";
  }

  return "/dashboard/settings?billing=error";
}

function toCommercialPlanCode(value: string | null | undefined) {
  const canonical =
    resolveCanonicalPlanCode(value) ??
    resolveCanonicalPlanCodeFromRevenuePlanCode(value);

  switch (canonical) {
    case "starter":
      return CommercialPlanCode.STARTER;
    case "enterprise":
      return CommercialPlanCode.ENTERPRISE;
    case "scale":
      return CommercialPlanCode.SCALE;
    default:
      return null;
  }
}

function isPaidOrExternallyBoundSubscription(subscription: {
  status: SubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}) {
  if (!subscription.stripeCustomerId && !subscription.stripeSubscriptionId) {
    return false;
  }

  return subscription.status === SubscriptionStatus.ACTIVE;
}

async function dispatchBestEffort(dispatchId: string, db: FirstCustomerJourneyDbClient) {
  try {
    const delivery = await dispatchWorkflowById(dispatchId, db);
    return Boolean(delivery.delivered);
  } catch (error) {
    logServerEvent("warn", "first_customer_journey.dispatch_deferred", {
      dispatch_id: dispatchId,
      status: "queued",
      source: "backend",
      metadata: {
        message: error instanceof Error ? error.message : "Unknown dispatch error"
      }
    });
    return false;
  }
}

export async function resumeFirstCustomerJourneyAfterReadiness(input: {
  organizationId: string;
  userId?: string | null;
  source: "billing_return" | "onboarding_completed";
  db?: FirstCustomerJourneyDbClient;
}): Promise<FirstCustomerJourneyResumeResult> {
  const db = input.db ?? prisma;
  const readiness = await getOrganizationAuditReadiness({
    organizationId: input.organizationId,
    db
  });

  if (!readiness.readyForAudit) {
    return {
      status: "blocked_intake_incomplete",
      reason: "Required app-owned intake is incomplete."
    };
  }

  const existingDispatch = await db.workflowDispatch.findFirst({
    where: {
      routingSnapshot: {
        organizationId: input.organizationId
      },
      eventType: "audit.requested",
      destination: "auditRequested",
      status: {
        in: [
          WorkflowDispatchStatus.PENDING,
          WorkflowDispatchStatus.DISPATCHING,
          WorkflowDispatchStatus.DISPATCHED,
          WorkflowDispatchStatus.ACKNOWLEDGED,
          WorkflowDispatchStatus.SUCCEEDED
        ]
      }
    },
    include: {
      routingSnapshot: true
    },
    orderBy: { createdAt: "desc" }
  });

  if (existingDispatch) {
    const dispatched =
      existingDispatch.status === WorkflowDispatchStatus.PENDING
        ? await dispatchBestEffort(existingDispatch.id, db)
        : existingDispatch.status !== WorkflowDispatchStatus.FAILED;

    return {
      status: "existing_dispatch",
      routingSnapshotId: existingDispatch.routingSnapshotId,
      workflowDispatchId: existingDispatch.id,
      dispatched
    };
  }

  const existingSnapshot = await db.routingSnapshot.findFirst({
    where: {
      organizationId: input.organizationId,
      status: {
        in: [RoutingSnapshotStatus.PENDING, RoutingSnapshotStatus.FAILED]
      },
      workflowDispatches: {
        none: {
          eventType: "audit.requested",
          destination: "auditRequested"
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  if (existingSnapshot) {
    const dispatch = await queueAuditRequestedDispatch({
      db,
      routingSnapshotId: existingSnapshot.id
    });
    const dispatched = await dispatchBestEffort(dispatch.id, db);

    return {
      status: "queued_from_existing_snapshot",
      routingSnapshotId: existingSnapshot.id,
      workflowDispatchId: dispatch.id,
      dispatched
    };
  }

  const subscription = await db.subscription.findFirst({
    where: {
      organizationId: input.organizationId
    },
    include: {
      plan: true
    },
    orderBy: { updatedAt: "desc" }
  });

  if (!subscription || !isPaidOrExternallyBoundSubscription(subscription)) {
    return {
      status: "blocked_no_paid_plan",
      reason: "No active Stripe-backed subscription is available for audit execution."
    };
  }

  const commercialPlanCode = toCommercialPlanCode(
    subscription.plan.code ?? subscription.planCodeSnapshot
  );

  if (!commercialPlanCode) {
    return {
      status: "blocked_no_paid_plan",
      reason: "The active subscription does not map to a canonical audit plan."
    };
  }

  const sourceEventId =
    subscription.stripeSubscriptionId ??
    subscription.stripeCustomerId ??
    subscription.id;

  const createAndQueueFromSubscription = async (tx: FirstCustomerJourneyDbClient) => {
    const deliveryState = await createDeliveryStateFromPaidRequest({
      db: tx,
      organizationId: input.organizationId,
      userId: input.userId ?? null,
      sourceSystem: "app_first_customer_journey",
      sourceEventType: `${input.source}.resume_after_intake`,
      sourceEventId,
      sourceRecordType: subscription.stripeSubscriptionId
        ? "stripe.subscription"
        : "subscription",
      sourceRecordId: sourceEventId,
      idempotencyKey: `first-customer-journey:${input.organizationId}:${sourceEventId}:delivery-state`,
      planCode: commercialPlanCode,
      statusReasonJson: {
        source: input.source,
        reason: "resume_after_intake",
        normalizedPlanCode: normalizeCommercialPlanCode(commercialPlanCode)
      }
    });

    const routingSnapshot = await computeAndPersistRoutingSnapshot({
      db: tx,
      organizationId: input.organizationId,
      userId: input.userId ?? null,
      sourceSystem: "app_first_customer_journey",
      sourceEventType: `${input.source}.resume_after_intake`,
      sourceEventId,
      sourceRecordType: subscription.stripeSubscriptionId
        ? "stripe.subscription"
        : "subscription",
      sourceRecordId: sourceEventId,
      planCode: commercialPlanCode,
      idempotencyKey: `first-customer-journey:${input.organizationId}:${sourceEventId}:routing`
    });

    const dispatch = await queueAuditRequestedDispatch({
      db: tx,
      routingSnapshotId: routingSnapshot.id,
      deliveryStateRecordId: deliveryState.id
    });

    return {
      routingSnapshot,
      dispatch
    };
  };

  const result = input.db
    ? await createAndQueueFromSubscription(db)
    : await prisma.$transaction(createAndQueueFromSubscription);

  const dispatched = await dispatchBestEffort(result.dispatch.id, db);

  return {
    status: "queued_from_subscription",
    routingSnapshotId: result.routingSnapshot.id,
    workflowDispatchId: result.dispatch.id,
    dispatched
  };
}
