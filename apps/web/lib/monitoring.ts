import { createHmac } from "node:crypto";
import { getLogLevel, getOptionalEnv, type AppLogLevel } from "./runtime-config";
import { redactSecrets } from "./security-redaction";

type LogLevel = "debug" | "info" | "warn" | "error";
type OperationalAlertSeverity = "warn" | "error";
type CanonicalLogField =
  | "request_id"
  | "routing_snapshot_id"
  | "org_id"
  | "user_id"
  | "workflow_code"
  | "status"
  | "source"
  | "correlation_id"
  | "dispatch_id"
  | "event_id"
  | "resource_id";
type StructuredLogMetadata = Record<string, unknown>;

type OperationalAlertInput = {
  source: string;
  title: string;
  severity?: OperationalAlertSeverity;
  metadata?: Record<string, unknown>;
};

const LOG_LEVEL_PRIORITY: Record<AppLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const CANONICAL_LOG_FIELDS = [
  "request_id",
  "routing_snapshot_id",
  "org_id",
  "user_id",
  "workflow_code",
  "status",
  "source",
  "correlation_id",
  "dispatch_id",
  "event_id",
  "resource_id"
] as const satisfies readonly CanonicalLogField[];

type CanonicalLogContext = Record<CanonicalLogField, string | null>;

function getOpsAlertWebhookUrl() {
  return getOptionalEnv("OPS_ALERT_WEBHOOK_URL");
}

function getOpsAlertWebhookSecret() {
  return getOptionalEnv("OPS_ALERT_WEBHOOK_SECRET");
}

function readObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as StructuredLogMetadata;
}

function readStringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return null;
}

function readCanonicalLogContext(
  metadata: StructuredLogMetadata
): CanonicalLogContext {
  const requestContext = readObject(metadata.requestContext);

  return {
    request_id: readStringValue(
      metadata.request_id,
      metadata.requestId,
      requestContext?.requestId,
      requestContext?.request_id
    ),
    routing_snapshot_id: readStringValue(
      metadata.routing_snapshot_id,
      metadata.routingSnapshotId
    ),
    org_id: readStringValue(
      metadata.org_id,
      metadata.orgId,
      metadata.organizationId
    ),
    user_id: readStringValue(metadata.user_id, metadata.userId),
    workflow_code: readStringValue(
      metadata.workflow_code,
      metadata.workflowCode
    ),
    status: readStringValue(metadata.status),
    source: readStringValue(
      metadata.source,
      metadata.sourceSystem,
      metadata.eventSource
    ),
    correlation_id: readStringValue(
      metadata.correlation_id,
      metadata.correlationId
    ),
    dispatch_id: readStringValue(metadata.dispatch_id, metadata.dispatchId),
    event_id: readStringValue(metadata.event_id, metadata.eventId),
    resource_id: readStringValue(metadata.resource_id, metadata.resourceId)
  };
}

function buildResidualMetadata(metadata: StructuredLogMetadata) {
  const residualEntries = Object.entries(metadata).filter(([key]) => {
    if (key === "requestContext") {
      return true;
    }

    return !CANONICAL_LOG_FIELDS.includes(key as CanonicalLogField) && ![
      "requestId",
      "routingSnapshotId",
      "orgId",
      "organizationId",
      "userId",
      "workflowCode",
      "sourceSystem",
      "eventSource",
      "correlationId",
      "dispatchId",
      "eventId",
      "resourceId"
    ].includes(key);
  });

  return Object.fromEntries(residualEntries);
}

function shouldLog(level: LogLevel) {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[getLogLevel()];
}

function emitLog(level: LogLevel, payload: Record<string, unknown>) {
  switch (level) {
    case "debug":
      console.debug(payload);
      return;
    case "error":
      console.error(payload);
      return;
    case "warn":
      console.warn(payload);
      return;
    case "info":
    default:
      console.info(payload);
  }
}

export function logServerEvent(
  level: LogLevel,
  event: string,
  metadata?: Record<string, unknown>
) {
  if (!shouldLog(level)) {
    return;
  }

  const safeMetadata = redactSecrets(metadata ?? {});
  const context = readCanonicalLogContext(safeMetadata);
  const residualMetadata = buildResidualMetadata(safeMetadata);
  const payload = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...context,
    metadata: residualMetadata
  };

  emitLog(level, payload);
}

function buildOpsAlertHeaders(body: string) {
  const secret = getOpsAlertWebhookSecret();
  if (!secret) {
    return {} as Record<string, string>;
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  return {
    "x-evolve-edge-timestamp": timestamp,
    "x-evolve-edge-signature": signature
  } as Record<string, string>;
}

export async function sendOperationalAlert(input: OperationalAlertInput) {
  const webhookUrl = getOpsAlertWebhookUrl();
  if (!webhookUrl) {
    return;
  }

  const body = JSON.stringify({
    source: "evolve-edge",
    version: "2026-04-10",
    severity: input.severity ?? "error",
    title: input.title,
    eventSource: input.source,
    metadata: redactSecrets(input.metadata ?? {}),
    occurredAt: new Date().toISOString()
  });

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildOpsAlertHeaders(body)
      },
      body,
      signal: AbortSignal.timeout(10_000)
    });

    if (!response.ok) {
      logServerEvent("warn", "ops.alert.delivery_failed", {
        source: input.source,
        status: response.status
      });
    }
  } catch (error) {
    logServerEvent("warn", "ops.alert.delivery_failed", {
      source: input.source,
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
