import {
  CustomerRunStatus,
  WorkflowDispatchStatus,
  prisma
} from "@evolve-edge/db";
import {
  buildFulfillmentVisibilitySummary,
  listFulfillmentVisibilityEntries
} from "./fulfillment-visibility";
import {
  getN8nWorkflowDestinationByName,
  getN8nWorkflowEvents,
  N8N_WORKFLOW_NAMES,
  type N8nWorkflowName
} from "./n8n";
import { requireEnv } from "./runtime-config";

export function isAuthorizedFulfillmentHealthRequest(request: Request) {
  const expected = requireEnv("OPS_READINESS_SECRET");
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  return provided === expected;
}

export async function getFulfillmentHealthSnapshot() {
  const [
    pendingCustomerRuns,
    actionRequiredCustomerRuns,
    failedCustomerRuns,
    pendingWorkflowDispatches,
    latestWorkflowDispatch,
    fulfillmentVisibilityEntries
  ] = await Promise.all([
    prisma.customerRun.count({
      where: {
        status: {
          in: [CustomerRunStatus.PENDING, CustomerRunStatus.RUNNING]
        }
      }
    }),
    prisma.customerRun.count({
      where: { status: CustomerRunStatus.ACTION_REQUIRED }
    }),
    prisma.customerRun.count({
      where: { status: CustomerRunStatus.FAILED }
    }),
    prisma.workflowDispatch.count({
      where: {
        status: {
          in: [WorkflowDispatchStatus.PENDING, WorkflowDispatchStatus.FAILED]
        }
      }
    }),
    prisma.workflowDispatch.findFirst({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        status: true,
        destination: true,
        updatedAt: true,
        lastError: true
      }
    }),
    listFulfillmentVisibilityEntries({
      db: prisma,
      limit: 12
    })
  ]);
  const visibilitySummary = buildFulfillmentVisibilitySummary(
    fulfillmentVisibilityEntries
  );

  return {
    ok: true as const,
    route: "/api/fulfillment/health",
    checkedAt: new Date().toISOString(),
    status:
      actionRequiredCustomerRuns > 0 ||
      failedCustomerRuns > 0 ||
      visibilitySummary.counts.attention > 0
        ? "attention"
        : "live",
    pipeline: {
      customerRuns: {
        pendingOrRunning: pendingCustomerRuns,
        actionRequired: actionRequiredCustomerRuns,
        failed: failedCustomerRuns
      },
      workflowDispatches: {
        pendingOrFailed: pendingWorkflowDispatches,
        latestStatus: latestWorkflowDispatch
          ? {
              id: latestWorkflowDispatch.id,
              status: latestWorkflowDispatch.status,
              destination: latestWorkflowDispatch.destination,
              updatedAt: latestWorkflowDispatch.updatedAt.toISOString(),
              lastError: latestWorkflowDispatch.lastError
            }
          : null
      }
    },
    reconciliation: {
      counts: visibilitySummary.counts,
      recentAttention: visibilitySummary.recentAttention,
      recentRecovered: visibilitySummary.recentRecovered
    }
  };
}

export async function getFulfillmentDispatchHealthSnapshot() {
  const dispatchTarget = getN8nWorkflowDestinationByName("auditRequested");
  const webhookWorkflowNames = N8N_WORKFLOW_NAMES.filter(
    (workflow) => workflow !== "auditRequested"
  );
  const latestDispatch = await prisma.workflowDispatch.findFirst({
    where: {
      destination: "auditRequested"
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      status: true,
      responseStatus: true,
      lastError: true,
      lastAttemptAt: true,
      dispatchedAt: true,
      deliveredAt: true,
      updatedAt: true
    }
  });
  const latestWebhookDeliveries = await prisma.webhookDelivery.findMany({
    where: {
      destination: {
        in: webhookWorkflowNames
      }
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      destination: true,
      status: true,
      responseStatus: true,
      lastError: true,
      lastAttemptAt: true,
      deliveredAt: true,
      updatedAt: true,
      event: {
        select: {
          type: true,
          aggregateType: true
        }
      }
    },
    take: webhookWorkflowNames.length * 5
  });
  const latestWebhookDeliveryByDestination = new Map<
    string,
    (typeof latestWebhookDeliveries)[number]
  >();

  for (const delivery of latestWebhookDeliveries) {
    if (!latestWebhookDeliveryByDestination.has(delivery.destination)) {
      latestWebhookDeliveryByDestination.set(delivery.destination, delivery);
    }
  }

  const readDestinationUrlHost = (url: string | null | undefined) => {
    if (!url) {
      return null;
    }

    try {
      return new URL(url).host;
    } catch {
      return null;
    }
  };

  const workflowDestinations = N8N_WORKFLOW_NAMES.map((workflow) => {
    const destination = getN8nWorkflowDestinationByName(workflow);

    if (workflow === "auditRequested") {
      return {
        workflow,
        dispatchChannel: "workflow_dispatch" as const,
        expectedEvents: getN8nWorkflowEvents(workflow),
        configured: Boolean(destination),
        provider: destination?.provider ?? null,
        urlHost: readDestinationUrlHost(destination?.url),
        latestOutcome: latestDispatch
          ? {
              recordType: "workflowDispatch" as const,
              recordId: latestDispatch.id,
              status: latestDispatch.status,
              responseStatus: latestDispatch.responseStatus,
              lastError: latestDispatch.lastError,
              lastAttemptAt: latestDispatch.lastAttemptAt?.toISOString() ?? null,
              dispatchedAt: latestDispatch.dispatchedAt?.toISOString() ?? null,
              deliveredAt: latestDispatch.deliveredAt?.toISOString() ?? null,
              updatedAt: latestDispatch.updatedAt.toISOString()
            }
          : null
      };
    }

    const latestDelivery = latestWebhookDeliveryByDestination.get(workflow);

    return {
      workflow,
      dispatchChannel: "webhook_delivery" as const,
      expectedEvents: getN8nWorkflowEvents(workflow),
      configured: Boolean(destination),
      provider: destination?.provider ?? null,
      urlHost: readDestinationUrlHost(destination?.url),
      latestOutcome: latestDelivery
        ? {
            recordType: "webhookDelivery" as const,
            recordId: latestDelivery.id,
            status: latestDelivery.status,
            responseStatus: latestDelivery.responseStatus,
            lastError: latestDelivery.lastError,
            lastAttemptAt: latestDelivery.lastAttemptAt?.toISOString() ?? null,
            deliveredAt: latestDelivery.deliveredAt?.toISOString() ?? null,
            updatedAt: latestDelivery.updatedAt.toISOString(),
            eventType: latestDelivery.event.type,
            aggregateType: latestDelivery.event.aggregateType
          }
        : null
    };
  });

  return {
    ok: true as const,
    route: "/api/fulfillment/dispatch-health",
    checkedAt: new Date().toISOString(),
    dispatchTarget: {
      workflow: "auditRequested",
      configured: Boolean(dispatchTarget),
      provider: dispatchTarget?.provider ?? null,
      urlHost: dispatchTarget
        ? readDestinationUrlHost(dispatchTarget.url)
        : null
    },
    workflowDestinations,
    recentOutcome: latestDispatch
      ? {
          dispatchId: latestDispatch.id,
          status: latestDispatch.status,
          responseStatus: latestDispatch.responseStatus,
          lastError: latestDispatch.lastError,
          lastAttemptAt: latestDispatch.lastAttemptAt?.toISOString() ?? null,
          dispatchedAt: latestDispatch.dispatchedAt?.toISOString() ?? null,
          deliveredAt: latestDispatch.deliveredAt?.toISOString() ?? null,
          updatedAt: latestDispatch.updatedAt.toISOString()
        }
      : null
  };
}
