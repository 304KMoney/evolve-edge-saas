import {
  CustomerRunStatus,
  WorkflowDispatchStatus,
  prisma
} from "@evolve-edge/db";
import { getN8nWorkflowDestinationByName } from "./n8n";
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
    latestWorkflowDispatch
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
    })
  ]);

  return {
    ok: true as const,
    route: "/api/fulfillment/health",
    checkedAt: new Date().toISOString(),
    status:
      actionRequiredCustomerRuns > 0 || failedCustomerRuns > 0
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
    }
  };
}

export async function getFulfillmentDispatchHealthSnapshot() {
  const dispatchTarget = getN8nWorkflowDestinationByName("auditRequested");
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

  return {
    ok: true as const,
    route: "/api/fulfillment/dispatch-health",
    checkedAt: new Date().toISOString(),
    dispatchTarget: {
      workflow: "auditRequested",
      configured: Boolean(dispatchTarget),
      provider: dispatchTarget?.provider ?? null,
      urlHost: dispatchTarget
        ? new URL(dispatchTarget.url).host
        : null
    },
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
