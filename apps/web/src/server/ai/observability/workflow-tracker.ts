import { prisma, type Prisma } from "@evolve-edge/db";
import { executeAuditWorkflowInputSchema } from "../providers/types";
import {
  AUDIT_WORKFLOW_NODE_SEQUENCE,
  createPrismaAuditWorkflowCheckpointStore,
} from "../workflows/audit/checkpoints";
import {
  buildSafeWorkflowFailure,
  cloneWorkflowTrace,
  createWorkflowTraceRecord,
  sanitizeWorkflowErrorMessage,
  sanitizeWorkflowValue,
  type WorkflowNodeTrace,
  type WorkflowTrace,
  type WorkflowTraceRecord,
} from "./trace";

const workflowTraceStore = new Map<string, WorkflowTraceRecord>();

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function touchTrace(trace: WorkflowTraceRecord) {
  trace.updatedAt = new Date().toISOString();
  workflowTraceStore.set(trace.workflowDispatchId, trace);
}

export function clearWorkflowTracesOlderThan(cutoff: Date) {
  let cleared = 0;

  for (const [workflowDispatchId, trace] of workflowTraceStore.entries()) {
    const updatedAt = Date.parse(trace.updatedAt);
    if (!Number.isFinite(updatedAt) || updatedAt >= cutoff.getTime()) {
      continue;
    }

    workflowTraceStore.delete(workflowDispatchId);
    cleared += 1;
  }

  return cleared;
}

function findOrCreateNode(
  trace: WorkflowTraceRecord,
  nodeName: string
): WorkflowNodeTrace {
  const existing = trace.nodes.find((node) => node.name === nodeName);
  if (existing) {
    return existing;
  }

  const node: WorkflowNodeTrace = {
    name: nodeName,
    status: "pending",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: null,
  };
  trace.nodes.push(node);
  return node;
}

export function startWorkflowTrace(input: {
  workflowDispatchId: string;
  dispatchId: string;
  assessmentId: string;
  orgId: string;
}) {
  const trace = createWorkflowTraceRecord(input);
  workflowTraceStore.set(input.workflowDispatchId, trace);
  return trace;
}

export function recordNodeStarted(input: {
  workflowDispatchId: string;
  nodeName: string;
}) {
  const trace = workflowTraceStore.get(input.workflowDispatchId);
  if (!trace) {
    return null;
  }

  const node = findOrCreateNode(trace, input.nodeName);
  node.status = "running";
  node.startedAt = new Date().toISOString();
  node.finishedAt = null;
  node.durationMs = null;
  node.error = undefined;
  touchTrace(trace);
  return trace;
}

export function recordNodeCompleted(input: {
  workflowDispatchId: string;
  nodeName: string;
  durationMs: number;
  output?: unknown;
  includeDebug?: boolean;
}) {
  const trace = workflowTraceStore.get(input.workflowDispatchId);
  if (!trace) {
    return null;
  }

  const node = findOrCreateNode(trace, input.nodeName);
  node.status = "completed";
  node.finishedAt = new Date().toISOString();
  node.durationMs = input.durationMs;
  if (input.includeDebug && input.output !== undefined) {
    node.output = sanitizeWorkflowValue(input.output);
  }
  touchTrace(trace);
  return trace;
}

export function recordNodeFailed(input: {
  workflowDispatchId: string;
  nodeName: string;
  durationMs: number;
  error: string;
  stack?: string;
}) {
  const trace = workflowTraceStore.get(input.workflowDispatchId);
  if (!trace) {
    return null;
  }

  const node = findOrCreateNode(trace, input.nodeName);
  node.status = "failed";
  node.finishedAt = new Date().toISOString();
  node.durationMs = input.durationMs;
  node.error = sanitizeWorkflowErrorMessage(input.error);
  trace.status = "failed";
  trace.finishedAt = new Date().toISOString();
  trace.reason = "node_execution_failed";
  trace.node = input.nodeName;
  trace.error = node.error;
  trace.internalErrorStack = input.stack?.slice(0, 8_000);
  touchTrace(trace);
  return trace;
}

export function completeWorkflowTrace(input: { workflowDispatchId: string }) {
  const trace = workflowTraceStore.get(input.workflowDispatchId);
  if (!trace) {
    return null;
  }

  trace.status = "completed";
  trace.finishedAt = new Date().toISOString();
  touchTrace(trace);
  return trace;
}

export function failWorkflowTrace(input: {
  workflowDispatchId: string;
  error: string;
  node?: string;
  stack?: string;
}) {
  const trace = workflowTraceStore.get(input.workflowDispatchId);
  if (!trace) {
    return null;
  }

  trace.status = "failed";
  trace.finishedAt = new Date().toISOString();
  trace.reason = "node_execution_failed";
  trace.node = input.node ?? trace.node;
  trace.error = sanitizeWorkflowErrorMessage(input.error);
  trace.internalErrorStack = input.stack?.slice(0, 8_000);
  touchTrace(trace);
  return trace;
}

export function getWorkflowTraceSnapshot(
  workflowDispatchId: string,
  options?: { includeDebug?: boolean; includeInternal?: boolean }
) {
  const trace = workflowTraceStore.get(workflowDispatchId);
  if (!trace) {
    return null;
  }

  return cloneWorkflowTrace(trace, options);
}

export function clearWorkflowTrace(workflowDispatchId: string) {
  workflowTraceStore.delete(workflowDispatchId);
}

function readPersistedTraceValue(outputPayload: Prisma.JsonValue | null | undefined) {
  if (!outputPayload || typeof outputPayload !== "object" || Array.isArray(outputPayload)) {
    return null;
  }

  const record = outputPayload as Record<string, unknown>;
  const trace = record.trace;
  if (!trace || typeof trace !== "object" || Array.isArray(trace)) {
    return null;
  }

  return trace as WorkflowTrace;
}

async function buildTraceFromPersistedCheckpoints(
  workflowDispatchId: string,
  options?: { includeDebug?: boolean; includeInternal?: boolean }
) {
  const checkpointStore = createPrismaAuditWorkflowCheckpointStore();
  const checkpoints = await checkpointStore.listCheckpoints(workflowDispatchId);
  if (checkpoints.length === 0) {
    return null;
  }

  const latestByNode = new Map<string, (typeof checkpoints)[number]>();
  for (const checkpoint of checkpoints) {
    latestByNode.set(checkpoint.nodeName, checkpoint);
  }

  const latestCheckpoint = checkpoints[checkpoints.length - 1];
  const trace = createWorkflowTraceRecord({
    workflowDispatchId,
    dispatchId: latestCheckpoint.dispatchId,
    assessmentId: latestCheckpoint.assessmentId,
    orgId: latestCheckpoint.orgId,
  });

  trace.nodes = AUDIT_WORKFLOW_NODE_SEQUENCE.flatMap((nodeName) => {
    const checkpoint = latestByNode.get(nodeName);
    if (!checkpoint) {
      return [];
    }

    const nodeStatus =
      checkpoint.status === "FAILED"
        ? "failed"
        : checkpoint.status === "RUNNING"
          ? "running"
          : "completed";

    return [
      {
        name: nodeName,
        status: nodeStatus,
        startedAt: checkpoint.createdAt,
        finishedAt: nodeStatus === "running" ? null : checkpoint.createdAt,
        durationMs:
          checkpoint.stateSnapshot.nodeTimingsMs?.[nodeName] ?? null,
        output:
          options?.includeDebug && checkpoint.status !== "FAILED"
            ? sanitizeWorkflowValue({
                status: checkpoint.stateSnapshot.status,
                businessContext: checkpoint.stateSnapshot.businessContext,
                frameworkMapping: checkpoint.stateSnapshot.frameworkMapping,
                riskAnalysis: checkpoint.stateSnapshot.riskAnalysis,
                riskScoring: checkpoint.stateSnapshot.riskScoring,
                remediationRoadmap: checkpoint.stateSnapshot.remediationRoadmap,
                finalReport: checkpoint.stateSnapshot.finalReport,
              })
            : undefined,
        error:
          options?.includeDebug && checkpoint.errorMessage
            ? sanitizeWorkflowErrorMessage(checkpoint.errorMessage)
            : undefined,
      } satisfies WorkflowNodeTrace,
    ];
  });

  trace.status =
    latestCheckpoint.status === "FAILED"
      ? "failed"
      : latestCheckpoint.status === "RUNNING"
        ? "running"
        : "completed";
  trace.finishedAt =
    latestCheckpoint.status === "RUNNING" ? null : latestCheckpoint.createdAt;
  if (latestCheckpoint.status === "FAILED") {
    trace.reason = "node_execution_failed";
    trace.node = latestCheckpoint.nodeName;
    trace.error = latestCheckpoint.errorMessage
      ? sanitizeWorkflowErrorMessage(latestCheckpoint.errorMessage)
      : undefined;
  }

  return cloneWorkflowTrace(
    {
      ...trace,
      updatedAt: latestCheckpoint.createdAt,
    },
    options
  );
}

export async function persistWorkflowTraceSnapshot(input: {
  jobId: string;
  outputPayload?: Prisma.JsonValue | null;
}) {
  const trace = getWorkflowTraceSnapshot(input.jobId) ?? getWorkflowTraceSnapshot(input.jobId, {
    includeDebug: true,
    includeInternal: true,
  });
  return trace ?? readPersistedTraceValue(input.outputPayload);
}

export async function getWorkflowTraceByDispatchId(
  workflowDispatchId: string,
  options?: {
    includeDebug?: boolean;
    includeInternal?: boolean;
    organizationId?: string | null;
    db?: Pick<typeof prisma, "analysisJob">;
  }
) {
  const inMemory = getWorkflowTraceSnapshot(workflowDispatchId, options);
  if (inMemory) {
    if (options?.organizationId && inMemory.orgId !== options.organizationId) {
      return null;
    }
    return inMemory;
  }

  const persistedCheckpointTrace = await buildTraceFromPersistedCheckpoints(
    workflowDispatchId,
    options
  );
  if (persistedCheckpointTrace) {
    if (
      options?.organizationId &&
      persistedCheckpointTrace.orgId !== options.organizationId
    ) {
      return null;
    }
    return persistedCheckpointTrace;
  }

  const db = options?.db ?? prisma;
  const job = await db.analysisJob.findFirst({
    where: {
      jobType: "assessment_analysis",
      inputPayload: {
        path: ["workflowDispatchId"],
        equals: workflowDispatchId,
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      outputPayload: true,
      errorMessage: true,
      status: true,
      inputPayload: true,
    },
  });

  const persisted = readPersistedTraceValue(job?.outputPayload);
  if (persisted) {
    if (options?.organizationId && persisted.orgId !== options.organizationId) {
      return null;
    }
    const persistedRecord = {
      ...persisted,
      updatedAt: persisted.finishedAt ?? persisted.startedAt,
    } satisfies WorkflowTraceRecord;
    return cloneWorkflowTrace(persistedRecord, options);
  }

  if (!job) {
    return null;
  }

  const inputPayload =
    job.inputPayload && typeof job.inputPayload === "object" && !Array.isArray(job.inputPayload)
      ? (job.inputPayload as Record<string, unknown>)
      : {};
  const minimalTrace = createWorkflowTraceRecord({
    workflowDispatchId,
    dispatchId:
      typeof inputPayload.dispatchId === "string"
        ? inputPayload.dispatchId
        : workflowDispatchId,
    assessmentId:
      typeof inputPayload.assessmentId === "string"
        ? inputPayload.assessmentId
        : "unknown",
    orgId: typeof inputPayload.orgId === "string" ? inputPayload.orgId : "unknown",
  });
  minimalTrace.status =
    job.status === "SUCCEEDED"
      ? "completed"
      : job.status === "FAILED" || job.status === "CANCELED"
        ? "failed"
        : "running";
  minimalTrace.finishedAt = new Date().toISOString();
  if (job.errorMessage) {
    minimalTrace.error = sanitizeWorkflowErrorMessage(job.errorMessage);
  }

  if (options?.organizationId && minimalTrace.orgId !== options.organizationId) {
    return null;
  }

  return cloneWorkflowTrace(minimalTrace, options);
}

export async function replayWorkflow(
  workflowDispatchId: string,
  options?: {
    dryRun?: boolean;
    persistResult?: boolean;
    db?: Pick<typeof prisma, "analysisJob">;
    provider?: {
      executeAuditWorkflow: (
        input: ReturnType<typeof executeAuditWorkflowInputSchema.parse>
      ) => Promise<unknown>;
    };
  }
) {
  const db = options?.db ?? prisma;
  const job = await db.analysisJob.findFirst({
    where: {
      jobType: "assessment_analysis",
      inputPayload: {
        path: ["workflowDispatchId"],
        equals: workflowDispatchId,
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      inputPayload: true,
      outputPayload: true,
    },
  });

  if (!job) {
    throw new Error(`Workflow ${workflowDispatchId} was not found for replay.`);
  }

  const payload = executeAuditWorkflowInputSchema.parse(job.inputPayload);
  const provider =
    options?.provider ??
    (await import("../../../../lib/ai-provider")).getAuditAiExecutionProvider();
  const result = await provider.executeAuditWorkflow(payload);
  const trace = getWorkflowTraceSnapshot(workflowDispatchId, {
    includeDebug: true,
    includeInternal: false,
  });
  const safeFailure = trace?.status === "failed" ? buildSafeWorkflowFailure(trace) : null;

  if (!options?.persistResult) {
    return {
      dryRun: options?.dryRun ?? true,
      workflowDispatchId,
      result,
      trace,
      ...(safeFailure ?? {}),
    };
  }

  await db.analysisJob.update({
    where: { id: job.id },
    data: {
      outputPayload: toJsonValue({
        ...(job.outputPayload && typeof job.outputPayload === "object" && !Array.isArray(job.outputPayload)
          ? (job.outputPayload as Record<string, unknown>)
          : {}),
        replay: {
          replayedAt: new Date().toISOString(),
          dryRun: options?.dryRun ?? false,
          trace,
        },
      }),
    },
  });

  return {
    dryRun: options?.dryRun ?? false,
    workflowDispatchId,
    result,
    trace,
    ...(safeFailure ?? {}),
  };
}
