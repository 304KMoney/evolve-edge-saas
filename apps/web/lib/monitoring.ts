import { createHmac } from "node:crypto";
import { getOptionalEnv } from "./runtime-config";

type LogLevel = "info" | "warn" | "error";
type OperationalAlertSeverity = "warn" | "error";

type OperationalAlertInput = {
  source: string;
  title: string;
  severity?: OperationalAlertSeverity;
  metadata?: Record<string, unknown>;
};

function getOpsAlertWebhookUrl() {
  return getOptionalEnv("OPS_ALERT_WEBHOOK_URL");
}

function getOpsAlertWebhookSecret() {
  return getOptionalEnv("OPS_ALERT_WEBHOOK_SECRET");
}

export function logServerEvent(
  level: LogLevel,
  event: string,
  metadata?: Record<string, unknown>
) {
  const payload = {
    level,
    event,
    metadata: metadata ?? {},
    timestamp: new Date().toISOString()
  };

  if (level === "error") {
    console.error(payload);
    return;
  }

  if (level === "warn") {
    console.warn(payload);
    return;
  }

  console.info(payload);
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
    metadata: input.metadata ?? {},
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
