import { randomUUID } from "node:crypto";
import { getOptionalEnv, getOptionalJsonEnv, getRuntimeEnvironment } from "./runtime-config";

type HeadersLike = Pick<Headers, "get">;

function trimOrNull(value: string | null | undefined, maxLength = 256) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

export function createTraceId(prefix = "intake") {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

export function maskEmail(email: string | null | undefined) {
  const normalized = trimOrNull(email, 320);
  if (!normalized) {
    return null;
  }

  const [localPart, domain] = normalized.split("@");
  if (!localPart || !domain) {
    return normalized.slice(0, 3);
  }

  const visibleLocal = localPart.slice(0, Math.min(localPart.length, 2));
  return `${visibleLocal}***@${domain}`;
}

export function readTraceIdFromHeaders(headersLike: HeadersLike) {
  return (
    trimOrNull(headersLike.get("x-evolve-edge-trace-id")) ??
    trimOrNull(headersLike.get("x-trace-id")) ??
    trimOrNull(headersLike.get("x-correlation-id")) ??
    trimOrNull(headersLike.get("x-request-id")) ??
    trimOrNull(headersLike.get("x-vercel-id"))
  );
}

export function readTraceIdFromPayload(payload: Record<string, unknown>) {
  const candidates = [
    payload.trace_id,
    payload.traceId,
    payload.request_id,
    payload.requestId,
    payload.dispatch_id,
    payload.dispatchId
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim().slice(0, 200);
    }
  }

  return null;
}

export function buildTraceRequestContext(
  requestContext: Record<string, unknown> | null | undefined,
  traceId: string,
  route: string
) {
  return {
    ...(requestContext ?? {}),
    traceId,
    route
  };
}

export function getIntakeEnvPresence() {
  let hasWorkflowDestinations = false;

  try {
    const destinations = getOptionalJsonEnv<unknown[]>("N8N_WORKFLOW_DESTINATIONS");
    hasWorkflowDestinations = Array.isArray(destinations) && destinations.length > 0;
  } catch {
    hasWorkflowDestinations = false;
  }

  return {
    hasN8nWebhookUrl: Boolean(getOptionalEnv("N8N_WEBHOOK_URL")),
    hasWorkflowDestinations,
    hasCallbackSecret: Boolean(
      getOptionalEnv("N8N_CALLBACK_SHARED_SECRET") ?? getOptionalEnv("N8N_CALLBACK_SECRET")
    ),
    hasHubSpotConfig: Boolean(getOptionalEnv("HUBSPOT_ACCESS_TOKEN"))
  };
}

export function maybeAddTraceDebug<T extends Record<string, unknown>>(body: T, traceId: string) {
  return getRuntimeEnvironment() === "production"
    ? body
    : {
        ...body,
        debug: {
          traceId
        }
      };
}
