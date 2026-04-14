import "server-only";

import {
  AuditActorType,
  DeliveryStateStatus,
  OperationsQueueSeverity,
  OperationsQueueSourceSystem,
  OperationsQueueType,
  Prisma,
  prisma
} from "@evolve-edge/db";
import { publishDomainEvent } from "./domain-events";
import { RoutingSnapshotStatus, WorkflowDispatchStatus } from "@evolve-edge/db";
import { writeAuditLog } from "./audit";
import { transitionDeliveryState } from "./delivery-state";
import { buildAuditRequestedPayload, buildN8nSignedHeaders, getN8nWorkflowDestinationByName } from "./n8n";
import { logServerEvent, sendOperationalAlert } from "./monitoring";
import { appendOperatorWorkflowEventRecord } from "./operator-workflow-event-records";
import { recordOperationalFinding } from "./operations-queues";
import { buildCorrelationId, clampTimeoutMs, normalizeExternalError } from "./reliability";
import { isAuthorizedBearerRequest } from "./security-auth";
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
  return (
    getOptionalEnv("N8N_CALLBACK_SHARED_SECRET") ??
    requireEnv("N8N_CALLBACK_SECRET")
  );
}

export function requireWorkflowWritebackSecret() {
  // TODO: If we later need finer-grained separation, this helper is the
  // server-only seam for rotating inbound writeback auth independently.
  return getOptionalEnv("N8N_WRITEBACK_SECRET") ?? requireWorkflowCallbackSecret();
}

export function isAuthorizedWorkflowWritebackRequest(request: Request) {
  return isAuthorizedBearerRequest(request, requireWorkflowWritebackSecret());
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
    logServerEvent("debug", "workflow.dispatch.already_queued", {
      dispatch_id: existing.id,
      routing_snapshot_id: existing.routingSnapshotId,
      workflow_code: "audit_requested",
      status: existing.status,
      source: "backend"
    });
    return existing;
  }

  const snapshot = await db.routingSnapshot.findUniqueOrThrow({
    where: { id: input.routingSnapshotId },
    include: {
      organization: true,
      user: true
    }
  });
  const billingEventLog = snapshot.sourceRecordId
    ? await db.billingEventLog.findFirst({
        where: {
          organizationId: snapshot.organizationId,
          stripeCheckoutSessionId: snapshot.sourceRecordId
        },
        orderBy: { createdAt: "desc" }
      })
    : null;
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
    organization: snapshot.organization,
    user: snapshot.user,
    billingEventLog,
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

  await transitionDeliveryState({
    db,
    sourceSystem: snapshot.sourceSystem,
    sourceEventId: snapshot.sourceEventId,
    organizationId: snapshot.organizationId,
    actorUserId: snapshot.userId ?? null,
    actorType: AuditActorType.SYSTEM,
    actorLabel: "workflow-dispatch",
    toStatus: DeliveryStateStatus.ROUTED,
    reasonCode: "delivery.routed",
    linkages: {
      userId: snapshot.userId ?? null,
      routingSnapshotId: snapshot.id,
      workflowDispatchId: dispatch.id,
      entitlementsJson: snapshot.entitlementsJson as Prisma.InputJsonValue,
      routingHintsJson: snapshot.normalizedHintsJson as Prisma.InputJsonValue,
      statusReasonJson: snapshot.routingReasonJson as Prisma.InputJsonValue
    }
  });

  logServerEvent("info", "workflow.dispatch.queued", {
    dispatch_id: dispatch.id,
    routing_snapshot_id: snapshot.id,
    org_id: snapshot.organizationId,
    user_id: snapshot.userId ?? null,
    workflow_code: snapshot.workflowCode,
    status: RoutingSnapshotStatus.DISPATCH_QUEUED,
    source: "backend",
    correlation_id: correlationId,
    metadata: {
      eventType: dispatch.eventType,
      destination: dispatch.destination
    }
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
    where: { id: dispatchId },
    include: {
      routingSnapshot: true
    }
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

    await recordOperationalFinding(
      {
        organizationId: dispatch.routingSnapshot.organizationId,
        queueType: OperationsQueueType.SUCCESS_RISK,
        ruleCode: "success.workflow_dispatch_failed",
        severity: OperationsQueueSeverity.HIGH,
        sourceSystem: OperationsQueueSourceSystem.APP,
        sourceRecordType: "workflowDispatch",
        sourceRecordId: dispatch.id,
        title: "Workflow dispatch failed before orchestration started",
        summary:
          "The app could not deliver a normalized workflow request to n8n after exhausting retry attempts.",
        recommendedAction:
          "Review the configured destination, dispatch logs, and retry state before replaying the workflow handoff.",
        metadata: {
          routingSnapshotId: dispatch.routingSnapshotId,
          eventType: dispatch.eventType,
          destination: dispatch.destination,
          attemptCount: dispatch.attemptCount + 1,
          message
        }
      },
      db
    );
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
      dispatch_id: refreshed.id,
      routing_snapshot_id: refreshed.routingSnapshotId,
      org_id: refreshed.routingSnapshot.organizationId,
      user_id: refreshed.routingSnapshot.userId ?? null,
      workflow_code: refreshed.routingSnapshot.workflowCode,
      status: WorkflowDispatchStatus.DISPATCHED,
      source: "n8n.dispatch",
      correlation_id: refreshed.correlationId,
      metadata: {
        destination: destination.name,
        responseStatus: response.status
      }
    });

    return { delivered: true as const, skipped: false as const, dispatch: updated };
  } catch (error) {
    const failedDispatch = await markDispatchFailure(db, refreshed.id, error);
    const normalizedError = normalizeExternalError(error, "Workflow dispatch failed.");
    logServerEvent("warn", "workflow.dispatch.failed", {
      dispatch_id: refreshed.id,
      routing_snapshot_id: refreshed.routingSnapshotId,
      org_id: refreshed.routingSnapshot.organizationId,
      user_id: refreshed.routingSnapshot.userId ?? null,
      workflow_code: refreshed.routingSnapshot.workflowCode,
      status: failedDispatch.status,
      source: "n8n.dispatch",
      correlation_id: refreshed.correlationId,
      retryable: normalizedError.retryable,
      metadata: {
        destination: destination.name,
        message: normalizedError.message
      }
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

  logServerEvent("info", "workflow.callback.status_recorded", {
    dispatch_id: dispatch.id,
    routing_snapshot_id: dispatch.routingSnapshotId,
    org_id: dispatch.routingSnapshot.organizationId,
    user_id: dispatch.routingSnapshot.userId ?? null,
    workflow_code: dispatch.routingSnapshot.workflowCode,
    status: input.status,
    source: "n8n.callback",
    correlation_id: dispatch.correlationId,
    requestContext: input.requestContext ?? undefined,
    metadata: {
      externalExecutionId: input.externalExecutionId ?? null,
      message: input.message ?? null
    }
  });

  if (input.status === "acknowledged" || input.status === "running") {
    await appendOperatorWorkflowEventRecord({
      db,
      eventKey: `operator.report_processing:${dispatch.id}:${input.status}`,
      organizationId: dispatch.routingSnapshot.organizationId,
      eventCode: "report_processing",
      severity: "info",
      message:
        input.status === "running"
          ? "Report workflow execution is actively processing."
          : "Report workflow execution was acknowledged by orchestration.",
      metadata: {
        dispatchId: dispatch.id,
        routingSnapshotId: dispatch.routingSnapshotId,
        externalExecutionId: input.externalExecutionId ?? null,
        callbackStatus: input.status
      }
    });

    await transitionDeliveryState({
      db,
      organizationId: dispatch.routingSnapshot.organizationId,
      actorUserId: dispatch.routingSnapshot.userId ?? null,
      actorType: AuditActorType.INTERNAL_API,
      actorLabel: "n8n-callback",
      toStatus: DeliveryStateStatus.PROCESSING,
      reasonCode: "delivery.processing",
      linkages: {
        workflowDispatchId: dispatch.id,
        routingSnapshotId: dispatch.routingSnapshotId,
        latestExecutionResultJson: input.metadata ?? null
      },
      metadata: input.metadata ?? undefined
    });
  }

  if (input.status === "failed") {
    await appendOperatorWorkflowEventRecord({
      db,
      eventKey: `operator.delivery_failed:${dispatch.id}`,
      organizationId: dispatch.routingSnapshot.organizationId,
      eventCode: "delivery_failed",
      severity: "critical",
      message:
        input.message ?? "Report workflow execution failed before a customer-ready report was produced.",
      metadata: {
        dispatchId: dispatch.id,
        routingSnapshotId: dispatch.routingSnapshotId,
        externalExecutionId: input.externalExecutionId ?? null,
        callbackStatus: input.status,
        payload: input.metadata ?? null
      }
    });

    await recordOperationalFinding(
      {
        organizationId: dispatch.routingSnapshot.organizationId,
        queueType: OperationsQueueType.SUCCESS_RISK,
        ruleCode: "success.workflow_execution_failed",
        severity: OperationsQueueSeverity.HIGH,
        sourceSystem: OperationsQueueSourceSystem.APP,
        sourceRecordType: "workflowDispatch",
        sourceRecordId: dispatch.id,
        title: "Workflow execution failed after orchestration started",
        summary:
          "The workflow was accepted for orchestration, but execution failed before a customer-ready result was produced.",
        recommendedAction:
          "Inspect the execution metadata, recover the failed step safely, and replay only after verifying downstream side effects.",
        metadata: {
          dispatchId: dispatch.id,
          routingSnapshotId: dispatch.routingSnapshotId,
          externalExecutionId: input.externalExecutionId ?? null,
          callbackStatus: input.status,
          message: input.message ?? "Workflow execution failed."
        }
      },
      db
    );

    await transitionDeliveryState({
      db,
      organizationId: dispatch.routingSnapshot.organizationId,
      actorUserId: dispatch.routingSnapshot.userId ?? null,
      actorType: AuditActorType.INTERNAL_API,
      actorLabel: "n8n-callback",
      toStatus: DeliveryStateStatus.FAILED,
      reasonCode: "delivery.processing_failed",
      note: input.message ?? null,
      linkages: {
        workflowDispatchId: dispatch.id,
        routingSnapshotId: dispatch.routingSnapshotId,
        latestExecutionResultJson: input.metadata ?? null,
        lastError: input.message ?? "Workflow execution failed."
      },
      metadata: input.metadata ?? undefined
    });
  }

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

  logServerEvent("info", "workflow.callback.report_ready", {
    dispatch_id: dispatch.id,
    routing_snapshot_id: dispatch.routingSnapshotId,
    org_id: dispatch.routingSnapshot.organizationId,
    user_id: dispatch.routingSnapshot.userId ?? null,
    workflow_code: dispatch.routingSnapshot.workflowCode,
    status: WorkflowDispatchStatus.SUCCEEDED,
    source: "n8n.callback",
    correlation_id: dispatch.correlationId,
    requestContext: input.requestContext ?? undefined,
    resource_id: input.reportReference ?? null,
    metadata: {
      externalExecutionId: input.externalExecutionId ?? null,
      reportUrl: input.reportUrl ?? null,
      riskLevel: input.riskLevel ?? null
    }
  });

  await transitionDeliveryState({
    db,
    organizationId: dispatch.routingSnapshot.organizationId,
    actorUserId: dispatch.routingSnapshot.userId ?? null,
    actorType: AuditActorType.INTERNAL_API,
    actorLabel: "n8n-callback",
    toStatus: DeliveryStateStatus.REPORT_GENERATED,
    reasonCode: "delivery.report_generated",
    linkages: {
      workflowDispatchId: dispatch.id,
      routingSnapshotId: dispatch.routingSnapshotId,
      externalResultReference: input.reportReference ?? null,
      latestExecutionResultJson: reportPayload
    },
    metadata: reportPayload
  });

  await appendOperatorWorkflowEventRecord({
    db,
    eventKey: `operator.report_ready:${dispatch.id}`,
    organizationId: dispatch.routingSnapshot.organizationId,
    eventCode: "report_ready",
    severity: "info",
    message: "A workflow callback marked the report output as ready for operator review and delivery.",
    metadata: {
      dispatchId: dispatch.id,
      routingSnapshotId: dispatch.routingSnapshotId,
      reportReference: input.reportReference ?? null,
      reportUrl: input.reportUrl ?? null,
      externalExecutionId: input.externalExecutionId ?? null,
      riskLevel: input.riskLevel ?? null
    }
  });

  return updatedDispatch;
}
