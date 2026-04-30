import { redactSecrets } from "../../../../lib/security-redaction";

export type WorkflowNodeTraceStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";

export type WorkflowTraceStatus = "running" | "completed" | "failed";

export type WorkflowNodeTrace = {
  name: string;
  status: WorkflowNodeTraceStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  output?: unknown;
  error?: string;
};

export type WorkflowTrace = {
  workflowDispatchId: string;
  dispatchId: string;
  assessmentId: string;
  orgId: string;
  startedAt: string;
  finishedAt: string | null;
  status: WorkflowTraceStatus;
  nodes: WorkflowNodeTrace[];
  error?: string;
  reason?: "node_execution_failed";
  node?: string;
};

export type WorkflowTraceRecord = WorkflowTrace & {
  updatedAt: string;
  internalErrorStack?: string;
};

const EMAIL_PATTERN =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const API_KEY_PATTERN =
  /\b(?:sk|rk|pk|api)[-_][A-Za-z0-9_-]{8,}\b/g;

function sanitizeString(value: string) {
  return value
    .replace(EMAIL_PATTERN, "[REDACTED_EMAIL]")
    .replace(API_KEY_PATTERN, "[REDACTED_SECRET]");
}

export function sanitizeWorkflowErrorMessage(value: string) {
  return sanitizeString(value).slice(0, 500);
}

export function sanitizeWorkflowValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeString(value).slice(0, 1_000);
  }

  if (typeof value === "number" || typeof value === "boolean" || value == null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => sanitizeWorkflowValue(item));
  }

  if (typeof value !== "object") {
    return String(value);
  }

  const redacted = redactSecrets(value as Record<string, unknown>);

  return Object.fromEntries(
    Object.entries(redacted).slice(0, 20).map(([key, nestedValue]) => [
      key,
      sanitizeWorkflowValue(nestedValue),
    ])
  );
}

export function createWorkflowTraceRecord(input: {
  workflowDispatchId: string;
  dispatchId: string;
  assessmentId: string;
  orgId: string;
}): WorkflowTraceRecord {
  const now = new Date().toISOString();
  return {
    workflowDispatchId: input.workflowDispatchId,
    dispatchId: input.dispatchId,
    assessmentId: input.assessmentId,
    orgId: input.orgId,
    startedAt: now,
    finishedAt: null,
    updatedAt: now,
    status: "running",
    nodes: [],
  };
}

export function cloneWorkflowTrace(
  trace: WorkflowTraceRecord,
  options?: { includeDebug?: boolean; includeInternal?: boolean }
): WorkflowTraceRecord {
  const includeDebug = options?.includeDebug ?? false;
  const includeInternal = options?.includeInternal ?? false;

  return {
    ...trace,
    nodes: trace.nodes.map((node) => ({
      ...node,
      ...(includeDebug && node.output !== undefined ? { output: node.output } : {}),
      ...(includeDebug && node.error ? { error: node.error } : {}),
      ...(includeDebug ? {} : { output: undefined, error: undefined }),
    })),
    ...(includeInternal && trace.internalErrorStack
      ? { internalErrorStack: trace.internalErrorStack }
      : { internalErrorStack: undefined }),
  };
}

export function buildSafeWorkflowFailure(trace: WorkflowTrace) {
  return {
    status: "failed" as const,
    reason: "node_execution_failed" as const,
    ...(trace.node ? { node: trace.node } : {}),
  };
}

