import { createHmac } from "node:crypto";
import { Prisma, type DomainEvent, type RoutingSnapshot, type WebhookDelivery } from "@evolve-edge/db";
import {
  getCanonicalProcessingDepthForPlan,
  getCanonicalReportTemplateForPlan,
  resolveCanonicalPlanCode
} from "./commercial-catalog";
import { getIntegrationEnvironmentLabel } from "./integration-contracts";
import { getOptionalEnv, getOptionalJsonEnv } from "./runtime-config";
import { extractNormalizedWorkflowHints } from "./workflow-routing";

export type N8nWorkflowName =
  | "auditRequested"
  | "leadPipeline"
  | "customerOnboarding"
  | "onboardingVisibility"
  | "customerSuccess"
  | "reportReady"
  | "renewalAlert"
  | "expansionSignal"
  | "billingRecovery";

type N8nWorkflowConfig = {
  name: N8nWorkflowName;
  url: string;
  secret?: string | null;
  events?: string[];
};

export type N8nEnvelope = {
  source: "evolve-edge";
  provider: "n8n";
  version: "2026-04-10";
  environment: string;
  correlationId: string;
  destination: {
    workflow: string;
  };
  delivery: {
    id: string;
    attemptCount: number;
    occurredAt: string;
  };
  event: {
    id: string;
    idempotencyKey: string;
    type: string;
    aggregateType: string;
    aggregateId: string;
    orgId: string | null;
    userId: string | null;
    occurredAt: string;
    payload: unknown;
  };
  routing?: {
    decisionId: string | null;
    workflowFamily: string;
    routeKey: string;
    processingTier: string;
    routeDisposition: string;
    entitlementSummary: unknown;
    quotaState: unknown;
    featureFlags: unknown;
    reasonCodes: string[];
  };
};

export type AuditRequestedN8nPayload = {
  source: "evolve-edge";
  provider: "n8n";
  version: "2026-04-10";
  event_type: "audit.requested";
  routing_snapshot_id: string;
  dispatch_id: string;
  correlation_id: string;
  execution_context: {
    organization_id: string;
    user_id: string | null;
    source_system: string;
    source_event_type: string;
    source_event_id: string;
    source_record_type: string | null;
    source_record_id: string | null;
    environment: string;
  };
  routing: {
    plan_code: string;
    workflow_code: string;
    report_template: string;
    processing_depth: string;
    status: string;
    entitlement_summary: Prisma.JsonValue;
    quota_state: Prisma.JsonValue;
    feature_flags: Prisma.JsonValue;
    reason: Prisma.JsonValue;
  };
};

export type N8nDestination = {
  name: string;
  url: string;
  secret?: string | null;
  provider: "n8n";
  timeoutMs: number;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_WORKFLOW_EVENT_MAP: Record<N8nWorkflowName, string[]> = {
  auditRequested: ["audit.requested"],
  leadPipeline: ["lead.captured", "lead.converted", "customer_account.stage_changed"],
  customerOnboarding: ["org.created", "onboarding.completed"],
  onboardingVisibility: ["onboarding.started"],
  customerSuccess: ["assessment.created"],
  reportReady: ["report.generated"],
  renewalAlert: ["payment.failed"],
  expansionSignal: ["usage.threshold.crossed"],
  billingRecovery: ["payment.failed"]
};

// n8n is the orchestration layer for selected downstream workflows, not the
// system of record. The app should dispatch only the event families that n8n
// needs to orchestrate externally, for example:
// - customerOnboarding -> org.created / onboarding.completed
// - onboardingVisibility -> onboarding.started
// - customerSuccess -> first assessment.created
// - reportReady -> report.generated
// - renewalAlert / billingRecovery -> payment.failed
// - expansionSignal -> usage.threshold.crossed

function coerceTimeoutMs(value: string | null) {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function getDefaultN8nSecret() {
  return getOptionalEnv("N8N_WEBHOOK_SECRET");
}

function getDefaultN8nTimeoutMs() {
  return coerceTimeoutMs(getOptionalEnv("N8N_WEBHOOK_TIMEOUT_MS"));
}

export function getN8nWorkflowDestinations(): N8nDestination[] {
  const configured =
    getOptionalJsonEnv<N8nWorkflowConfig[]>("N8N_WORKFLOW_DESTINATIONS");

  if (Array.isArray(configured) && configured.length > 0) {
    return configured
      .filter((destination) => Boolean(destination?.name?.trim()) && Boolean(destination?.url?.trim()))
      .map((destination) => ({
        name: destination.name,
        url: destination.url,
        secret: destination.secret ?? getDefaultN8nSecret(),
        provider: "n8n" as const,
        timeoutMs: getDefaultN8nTimeoutMs()
      }));
  }

  const legacyUrl = getOptionalEnv("N8N_WEBHOOK_URL");
  if (!legacyUrl) {
    return [];
  }

  return [
    {
      name: "customerOnboarding",
      url: legacyUrl,
      secret: getDefaultN8nSecret(),
      provider: "n8n",
      timeoutMs: getDefaultN8nTimeoutMs()
    }
  ];
}

export function getN8nWorkflowDestinationByName(name: N8nWorkflowName) {
  return getN8nWorkflowDestinations().find((destination) => destination.name === name) ?? null;
}

function readEventPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }

  return payload as Record<string, unknown>;
}

export function getN8nWorkflowEvents(workflow: N8nWorkflowName) {
  const configured =
    getOptionalJsonEnv<N8nWorkflowConfig[]>("N8N_WORKFLOW_DESTINATIONS") ?? [];
  const configuredWorkflow = configured.find((item) => item.name === workflow);

  if (configuredWorkflow?.events && configuredWorkflow.events.length > 0) {
    return configuredWorkflow.events;
  }

  return DEFAULT_WORKFLOW_EVENT_MAP[workflow] ?? [];
}

export function shouldDispatchEventToN8nWorkflow(input: {
  workflow: N8nWorkflowName;
  eventType: string;
  payload: unknown;
}) {
  const workflowEvents = getN8nWorkflowEvents(input.workflow);
  if (!workflowEvents.includes(input.eventType)) {
    return false;
  }

  const payload = readEventPayload(input.payload);

  if (input.workflow === "customerSuccess" && input.eventType === "assessment.created") {
    return payload.isFirstAssessment === true;
  }

  if (
    input.workflow === "expansionSignal" &&
    input.eventType === "usage.threshold.crossed"
  ) {
    const thresholdPercent = Number(payload.thresholdPercent ?? 0);
    return Number.isFinite(thresholdPercent) && thresholdPercent >= 80;
  }

  return true;
}

export function buildN8nEnvelope(input: {
  delivery: Pick<WebhookDelivery, "id" | "attemptCount">;
  event: Pick<
    DomainEvent,
    "id" | "idempotencyKey" | "type" | "aggregateType" | "aggregateId" | "orgId" | "userId" | "occurredAt" | "payload"
  >;
  workflow: string;
  correlationId: string;
}): N8nEnvelope {
  const routing = extractNormalizedWorkflowHints(input.event.payload);

  return {
    source: "evolve-edge",
    provider: "n8n",
    version: "2026-04-10",
    environment: getIntegrationEnvironmentLabel(),
    correlationId: input.correlationId,
    destination: {
      workflow: input.workflow
    },
    delivery: {
      id: input.delivery.id,
      attemptCount: input.delivery.attemptCount,
      occurredAt: new Date().toISOString()
    },
    event: {
      id: input.event.id,
      idempotencyKey: input.event.idempotencyKey,
      type: input.event.type,
      aggregateType: input.event.aggregateType,
      aggregateId: input.event.aggregateId,
      orgId: input.event.orgId,
      userId: input.event.userId,
      occurredAt: input.event.occurredAt.toISOString(),
      payload: input.event.payload
    },
    routing: routing.workflowHints
      ? {
          decisionId: routing.decisionId,
          workflowFamily: routing.workflowHints.workflowFamily,
          routeKey: routing.workflowHints.routeKey,
          processingTier: routing.workflowHints.processingTier,
          routeDisposition: routing.workflowHints.routeDisposition,
          entitlementSummary: routing.workflowHints.entitlementSummary,
          quotaState: routing.workflowHints.quotaState,
          featureFlags: routing.workflowHints.featureFlags,
          reasonCodes: routing.reasonCodes
        }
      : undefined
  };
}

export function buildN8nSignedHeaders(body: string, secret?: string | null) {
  if (!secret) {
    return {} as Record<string, string>;
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  return {
    "x-evolve-edge-provider": "n8n",
    "x-evolve-edge-timestamp": timestamp,
    "x-evolve-edge-signature": signature
  } as Record<string, string>;
}

export function buildAuditRequestedPayload(input: {
  routingSnapshot: Pick<
    RoutingSnapshot,
    | "id"
    | "organizationId"
    | "userId"
    | "sourceSystem"
    | "sourceEventType"
    | "sourceEventId"
    | "sourceRecordType"
    | "sourceRecordId"
    | "planCode"
    | "workflowCode"
    | "status"
    | "normalizedHintsJson"
    | "routingReasonJson"
  >;
  dispatchId?: string | null;
  correlationId?: string | null;
}): AuditRequestedN8nPayload {
  const normalizedHints =
    input.routingSnapshot.normalizedHintsJson &&
    typeof input.routingSnapshot.normalizedHintsJson === "object" &&
    !Array.isArray(input.routingSnapshot.normalizedHintsJson)
      ? input.routingSnapshot.normalizedHintsJson
      : {};
  const routingReason =
    input.routingSnapshot.routingReasonJson &&
    typeof input.routingSnapshot.routingReasonJson === "object" &&
    !Array.isArray(input.routingSnapshot.routingReasonJson)
      ? input.routingSnapshot.routingReasonJson
      : {};

  return {
    source: "evolve-edge",
    provider: "n8n",
    version: "2026-04-10",
    event_type: "audit.requested",
    routing_snapshot_id: input.routingSnapshot.id,
    dispatch_id: input.dispatchId ?? "",
    correlation_id: input.correlationId ?? "",
    execution_context: {
      organization_id: input.routingSnapshot.organizationId,
      user_id: input.routingSnapshot.userId ?? null,
      source_system: input.routingSnapshot.sourceSystem,
      source_event_type: input.routingSnapshot.sourceEventType,
      source_event_id: input.routingSnapshot.sourceEventId,
      source_record_type: input.routingSnapshot.sourceRecordType ?? null,
      source_record_id: input.routingSnapshot.sourceRecordId ?? null,
      environment: getIntegrationEnvironmentLabel()
    },
    routing: {
      plan_code: String(input.routingSnapshot.planCode).toLowerCase(),
      workflow_code: String(input.routingSnapshot.workflowCode).toLowerCase(),
      report_template: getCanonicalReportTemplateForPlan(
        resolveCanonicalPlanCode(String(input.routingSnapshot.planCode).toLowerCase())
      ),
      processing_depth: getCanonicalProcessingDepthForPlan(
        resolveCanonicalPlanCode(String(input.routingSnapshot.planCode).toLowerCase())
      ),
      status: String(input.routingSnapshot.status).toLowerCase(),
      entitlement_summary:
        typeof normalizedHints === "object" && !Array.isArray(normalizedHints)
          ? (normalizedHints as Record<string, unknown>).entitlement_summary ?? {}
          : {},
      quota_state:
        typeof normalizedHints === "object" && !Array.isArray(normalizedHints)
          ? (normalizedHints as Record<string, unknown>).quota_state ?? {}
          : {},
      feature_flags:
        typeof normalizedHints === "object" && !Array.isArray(normalizedHints)
          ? (normalizedHints as Record<string, unknown>).feature_flags ?? {}
          : {},
      reason: routingReason
    }
  };
}
