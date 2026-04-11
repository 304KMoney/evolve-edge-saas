import {
  AuditActorType,
  Prisma,
  prisma
} from "@evolve-edge/db";
import { publishDomainEvent } from "./domain-events";
import { RoutingSnapshotStatus, WorkflowDispatchStatus } from "@evolve-edge/db";
import { writeAuditLog } from "./audit";
import { buildAuditRequestedPayload, buildN8nSignedHeaders, getN8nWorkflowDestinationByName } from "./n8n";
import { logServerEvent, sendOperationalAlert } from "./monitoring";
import { buildCorrelationId, clampTimeoutMs, normalizeExternalError } from "./reliability";
import { getOptionalEnv, requireEnv } from "./runtime-config";

type WorkflowDispatchDbClient = Prisma.TransactionClient | typeof prisma;

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_DISPATCH_ATTEMPTS = 5;
const RETRY_DELAY_MINUTES = [1, 5, 15, 60];

function getWorkflowDispatchTimeoutMs() {
  const parsed = Number(getOptionalEnv("WORKFLOW_DISPATCH_TIMEOUT_MS") ?? "");
  return clampTimeoutMs(
    Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS
  );
}

function getRetryDelayMinutes(attemptCount: number) {
  return RETRY_DELAY_MINUTES[Math.min(attemptCount - 1, RETRY_DELAY_MINUTES.length - 1)];
}

export function requireWorkflowCallbackSecret() {
  return requireEnv("N8N_CALLBACK_SECRET");
}

export async function queueAuditRequestedDispatch(input: {
  routingSnapshotId: string;
  db?: WorkflowDispatchDbClient;
}) {
  const db = input.db ?? prisma;
  const existing = await db.workflowDispatch.findUnique({
    where: {
      routingSnapshotId_eventType_destination: {
        routingSnapshotId: input.routingSnapshotId,
        eventType: "audit.requested",
        destination: "auditRequested"
      }
    }
  });

  if (existing) {
    return existing;
  }

  const snapshot = await db.routingSnapshot.findUniqueOrThrow({
    where: { id: input.routingSnapshotId },
    include: {
      organization: true,
      user: true
    }
  });
  const correlationId = buildCorrelationId("audit");

  const created = await db.workflowDispatch.create({
    data: {
      routingSnapshotId: snapshot.id,
      eventType: "audit.requested",
      destination: "auditRequested",
      idempotencyKey: `workflow-dispatch:${snapshot.id}:audit.requested`,
      correlationId,
      requestPayload: {}
    }
  });

  const requestPayload = buildAuditRequestedPayload({
    routingSnapshot: snapshot,
    dispatchId: created.id,
    correlationId
  });

  const dispatch = await db.workflowDispatch.update({
    where: { id: created.id },
    data: {
      requestPayload
    }
  });

  await db.routingSnapshot.update({
    where: { id: snapshot.id },
    data: { status: RoutingSnapshotStatus.DISPATCH_QUEUED }
  });

  return dispatch;
}

async function markDispatchFailure(
  db: WorkflowDispatchDbClient,
  dispatchId: string,
  error: unknown
) {
  const message = error instanceof Error ? error.message : "Unknown dispatch error";
  const dispatch = await db.workflowDispatch.findUniqueOrThrow({
    where: { id: dispatchId }
  });
  const shouldRetry =
    dispatch.attemptCount < MAX_DISPATCH_ATTEMPTS &&
    normalizeExternalError(error, message).retryable;

  const updated = await db.workflowDispatch.update({
    where: { id: dispatchId },
    data: {
      status: shouldRetry ? WorkflowDispatchStatus.PENDING : WorkflowDispatchStatus.FAILED,
      nextRetryAt: shouldRetry
        ? new Date(Date.now() + getRetryDelayMinutes(dispatch.attemptCount) * 60 * 1000)
        : null,
      lastError: message
    }
  });

  if (!shouldRetry) {
    await db.routingSnapshot.update({
      where: { id: dispatch.routingSnapshotId },
      data: { status: RoutingSnapshotStatus.FAILED }
    });
  }

  return updated;
}

async function dispatchWorkflow(dispatchId: string, db: WorkflowDispatchDbClient = prisma) {
  const dispatch = await db.workflowDispatch.findUnique({
    where: { id: dispatchId },
    include: {
      routingSnapshot: {
        include: {
          organization: true,
          user: true
        }
      }
    }
  });

  if (!dispatch) {
    return { delivered: false, skipped: true as const };
  }

  const destination = getN8nWorkflowDestinationByName("auditRequested");
  if (!destination) {
    throw new Error("Missing n8n destination configuration for auditRequested.");
  }

  const claimed = await db.workflowDispatch.updateMany({
    where: {
      id: dispatch.id,
      status: {
        in: [WorkflowDispatchStatus.PENDING, WorkflowDispatchStatus.FAILED]
      },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }]
    },
    data: {
      status: WorkflowDispatchStatus.DISPATCHING,
      attemptCount: { increment: 1 },
      lastAttemptAt: new Date()
    }
  });

  if (claimed.count === 0) {
    return { delivered: false, skipped: true as const };
  }

  const refreshed = await db.workflowDispatch.findUniqueOrThrow({
    where: { id: dispatch.id },
    include: {
      routingSnapshot: {
        include: {
          organization: true,
          user: true
        }
      }
    }
  });

  const body = JSON.stringify(refreshed.requestPayload);
  const headers = buildN8nSignedHeaders(body, destination.secret);
  try {
    const response = await fetch(destination.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-evolve-edge-correlation-id": refreshed.correlationId,
        "x-evolve-edge-routing-snapshot-id": refreshed.routingSnapshotId,
        "x-evolve-edge-dispatch-id": refreshed.id,
        "x-evolve-edge-idempotency-key": refreshed.idempotencyKey,
        ...headers
      },
      body,
      signal: AbortSignal.timeout(getWorkflowDispatchTimeoutMs())
    });

    if (!response.ok) {
      throw new Error(`n8n workflow returned ${response.status}.`);
    }

    const responseText = await response.text();
    let responsePayload: Prisma.InputJsonValue = { acknowledged: true };
    if (responseText.trim().length > 0) {
      try {
        responsePayload = JSON.parse(responseText) as Prisma.InputJsonValue;
      } catch {
        responsePayload = { text: responseText };
      }
    }

    const updated = await db.workflowDispatch.update({
      where: { id: refreshed.id },
      data: {
        status: WorkflowDispatchStatus.DISPATCHED,
        dispatchedAt: new Date(),
        responseStatus: response.status,
        responsePayload,
        nextRetryAt: null,
        lastError: null
      }
    });

    await db.routingSnapshot.update({
      where: { id: refreshed.routingSnapshotId },
      data: { status: RoutingSnapshotStatus.DISPATCHED }
    });

    logServerEvent("info", "workflow.dispatch.delivered", {
      dispatchId: refreshed.id,
      routingSnapshotId: refreshed.routingSnapshotId,
      destination: destination.name,
      correlationId: refreshed.correlationId
    });

    return { delivered: true as const, skipped: false as const, dispatch: updated };
  } catch (error) {
    await markDispatchFailure(db, refreshed.id, error);
    const normalizedError = normalizeExternalError(error, "Workflow dispatch failed.");
    logServerEvent("warn", "workflow.dispatch.failed", {
      dispatchId: refreshed.id,
      routingSnapshotId: refreshed.routingSnapshotId,
      destination: destination.name,
      correlationId: refreshed.correlationId,
      retryable: normalizedError.retryable,
      message: normalizedError.message
    });
    await sendOperationalAlert({
      source: "workflow.dispatch",
      title: "Workflow dispatch failed",
      severity: normalizedError.retryable ? "warn" : "error",
      metadata: {
        dispatchId: refreshed.id,
        routingSnapshotId: refreshed.routingSnapshotId,
        correlationId: refreshed.correlationId,
        destination: destination.name,
        retryable: normalizedError.retryable,
        message: normalizedError.message
      }
    });

    return { delivered: false as const, skipped: false as const };
  }
}

export async function dispatchPendingWorkflowDispatches(options?: { limit?: number }) {
  const limit = options?.limit ?? 20;
  const pending = await prisma.workflowDispatch.findMany({
    where: {
      status: {
        in: [WorkflowDispatchStatus.PENDING, WorkflowDispatchStatus.FAILED]
      },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }]
    },
    orderBy: { createdAt: "asc" },
    take: limit
  });

  let delivered = 0;
  let failed = 0;

  for (const dispatch of pending) {
    const result = await dispatchWorkflow(dispatch.id);
    if (result.skipped) {
      continue;
    }
    if (result.delivered) {
      delivered += 1;
    } else {
      failed += 1;
    }
  }

  return {
    processed: pending.length,
    delivered,
    failed
  };
}

export async function recordWorkflowStatusCallback(input: {
  dispatchId: string;
  status: "acknowledged" | "running" | "succeeded" | "failed";
  externalExecutionId?: string | null;
  message?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  requestContext?: Prisma.InputJsonValue | null;
  db?: WorkflowDispatchDbClient;
}) {
  const db = input.db ?? prisma;
  const dispatch = await db.workflowDispatch.findUniqueOrThrow({
    where: { id: input.dispatchId },
    include: { routingSnapshot: true }
  });

  const nextStatus =
    input.status === "acknowledged"
      ? WorkflowDispatchStatus.ACKNOWLEDGED
      : input.status === "succeeded"
        ? WorkflowDispatchStatus.SUCCEEDED
        : input.status === "failed"
          ? WorkflowDispatchStatus.FAILED
          : WorkflowDispatchStatus.ACKNOWLEDGED;

  const updatedDispatch = await db.workflowDispatch.update({
    where: { id: dispatch.id },
    data: {
      status: nextStatus,
      externalExecutionId: input.externalExecutionId ?? dispatch.externalExecutionId ?? null,
      responsePayload: input.metadata ?? dispatch.responsePayload ?? Prisma.JsonNull,
      lastError:
        input.status === "failed"
          ? input.message ?? dispatch.lastError ?? "Workflow execution failed."
          : null,
      deliveredAt:
        input.status === "succeeded" ? new Date() : dispatch.deliveredAt,
      metadata: input.metadata ?? dispatch.metadata ?? Prisma.JsonNull
    }
  });

  await db.routingSnapshot.update({
    where: { id: dispatch.routingSnapshotId },
    data: {
      status:
        input.status === "succeeded"
          ? RoutingSnapshotStatus.STATUS_UPDATED
          : input.status === "failed"
            ? RoutingSnapshotStatus.FAILED
            : RoutingSnapshotStatus.STATUS_UPDATED
    }
  });

  await writeAuditLog(db, {
    organizationId: dispatch.routingSnapshot.organizationId,
    userId: dispatch.routingSnapshot.userId,
    actorType: AuditActorType.INTERNAL_API,
    actorLabel: "n8n-callback",
    action: "workflow_dispatch.status_updated",
    entityType: "workflowDispatch",
    entityId: dispatch.id,
    metadata: {
      status: input.status,
      externalExecutionId: input.externalExecutionId ?? null,
      message: input.message ?? null
    },
    requestContext: input.requestContext ?? null
  });

  return updatedDispatch;
}

export async function recordWorkflowReportReady(input: {
  dispatchId: string;
  reportReference?: string | null;
  reportUrl?: string | null;
  externalExecutionId?: string | null;
  executiveSummary?: string | null;
  riskLevel?: string | null;
  topConcerns?: string[] | null;
  metadata?: Prisma.InputJsonValue | null;
  requestContext?: Prisma.InputJsonValue | null;
  db?: WorkflowDispatchDbClient;
}) {
  const db = input.db ?? prisma;
  const dispatch = await db.workflowDispatch.findUniqueOrThrow({
    where: { id: input.dispatchId },
    include: { routingSnapshot: true }
  });

  const reportPayload = {
    reportReference: input.reportReference ?? null,
    reportUrl: input.reportUrl ?? null,
    executiveSummary: input.executiveSummary ?? null,
    riskLevel: input.riskLevel ?? null,
    topConcerns: input.topConcerns ?? [],
    metadata: input.metadata ?? null
  } satisfies Prisma.InputJsonValue;

  const updatedDispatch = await db.workflowDispatch.update({
    where: { id: dispatch.id },
    data: {
      status: WorkflowDispatchStatus.SUCCEEDED,
      externalExecutionId: input.externalExecutionId ?? dispatch.externalExecutionId ?? null,
      responsePayload: reportPayload,
      deliveredAt: new Date(),
      lastError: null
    }
  });

  await db.routingSnapshot.update({
    where: { id: dispatch.routingSnapshotId },
    data: { status: RoutingSnapshotStatus.REPORT_READY }
  });

  await publishDomainEvent(db, {
    type: "report.ready",
    aggregateType: "routingSnapshot",
    aggregateId: dispatch.routingSnapshotId,
    orgId: dispatch.routingSnapshot.organizationId,
    userId: dispatch.routingSnapshot.userId,
    idempotencyKey: `report.ready:${dispatch.id}:${input.reportReference ?? "none"}`,
    payload: {
      dispatchId: dispatch.id,
      routingSnapshotId: dispatch.routingSnapshotId,
      workflowCode: dispatch.routingSnapshot.workflowCode,
      reportReference: input.reportReference ?? null,
      reportUrl: input.reportUrl ?? null,
      executiveSummary: input.executiveSummary ?? null,
      riskLevel: input.riskLevel ?? null,
      topConcerns: input.topConcerns ?? []
    }
  });

  await writeAuditLog(db, {
    organizationId: dispatch.routingSnapshot.organizationId,
    userId: dispatch.routingSnapshot.userId,
    actorType: AuditActorType.INTERNAL_API,
    actorLabel: "n8n-callback",
    action: "workflow_dispatch.report_ready",
    entityType: "workflowDispatch",
    entityId: dispatch.id,
    metadata: {
      reportReference: input.reportReference ?? null,
      reportUrl: input.reportUrl ?? null,
      externalExecutionId: input.externalExecutionId ?? null
    },
    requestContext: input.requestContext ?? null
  });

  return updatedDispatch;
}
