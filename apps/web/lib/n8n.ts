import { createHmac } from "node:crypto";
import {
  Prisma,
  type BillingEventLog,
  type DomainEvent,
  type Organization,
  type RoutingSnapshot,
  type User,
  type WebhookDelivery
} from "@evolve-edge/db";
import {
  getCanonicalProcessingDepthForPlan,
  getCanonicalReportTemplateForPlan,
  resolveCanonicalPlanCode
} from "./commercial-catalog";
import { getIntegrationEnvironmentLabel } from "./integration-contracts";
import { getAppUrl, getOptionalEnv, getOptionalJsonEnv } from "./runtime-config";
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
    // Generic n8n envelopes intentionally forward the allowlisted domain-event
    // payload as published. Keep those event payloads operationally useful, but
    // avoid secrets, raw evidence blobs, or broader customer state than the
    // downstream workflow actually needs.
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
  callbacks: {
    status_url: string;
    report_ready_url: string;
    failure_url: string;
    report_writeback_url: string;
    auth_scheme: "bearer";
  };
  callback_urls: {
    status_update_url: string;
    report_ready_url: string;
    failure_url: string;
  };
  workflowDispatchId: string;
  dispatchId: string;
  organizationId: string;
  deliveryStateRecordId: string;
  routingSnapshotId: string;
  callbackToken: string;
  callback_token: string;
  callbackBaseUrl: string;
  statusCallbackPath: string;
  reportReadyCallbackPath: string;
  correlationId: string;
  tier: string;
  workflowType: string;
  analysisProvider: string | null;
  analysisModel: string | null;
  synthesisProvider: string | null;
  synthesisModel: string | null;
  synthesisAllowed: boolean | null;
  privateMode: boolean | null;
  businessContext: Prisma.JsonValue;
  intakeSummary: Prisma.JsonValue;
  executionStartedAt: string;
  executionStatus: "acknowledged";
  executionStage: "intake_received";
  request_id: string;
  app_customer_id: string | null;
  app_org_id: string;
  customer_email: string | null;
  customer_name: string | null;
  company_name: string | null;
  purchased_tier: string;
  purchased_plan_code: string;
  stripe_session_id: string | null;
  amount_paid: number | null;
  currency: string | null;
  top_concerns: string[];
  uses_ai_tools: boolean | null;
  company_size: string | null;
  industry: string | null;
  additional_notes: string | null;
  website: string | null;
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

// Evolve Edge currently sends two intentionally different n8n payload families:
// 1. `AuditRequestedN8nPayload` for the dedicated paid-request orchestration flow
//    owned by `workflow-dispatch.ts`
// 2. `N8nEnvelope` for selected domain-event deliveries owned by
//    `webhook-dispatcher.ts`
//
// They are not interchangeable. The audit-request contract is a normalized
// execution handoff built from a `RoutingSnapshot`, while the generic envelope
// preserves the underlying domain event plus any extracted workflow-routing hints.

function buildWorkflowCallbackUrls() {
  const appUrl = getAppUrl();

  return {
    status_url: `${appUrl}/api/internal/workflows/status`,
    report_ready_url: `${appUrl}/api/internal/workflows/report-ready`,
    failure_url: `${appUrl}/api/internal/workflows/failed`,
    report_writeback_url: `${appUrl}/api/internal/workflows/report-writeback`,
    auth_scheme: "bearer" as const
  };
}

function buildCompactWorkflowCallbackUrls() {
  const callbacks = buildWorkflowCallbackUrls();

  return {
    status_update_url: callbacks.status_url,
    report_ready_url: callbacks.report_ready_url,
    failure_url: callbacks.failure_url
  };
}

const DEFAULT_CALLBACK_BASE_URL = "https://evolveedgeai.com";

function deriveCallbackParts(urlValue: string | null | undefined, fallbackPath: string) {
  if (typeof urlValue !== "string" || urlValue.trim().length === 0) {
    return {
      baseUrl: DEFAULT_CALLBACK_BASE_URL,
      path: fallbackPath
    };
  }

  try {
    const parsed = new URL(urlValue);
    return {
      baseUrl: parsed.origin,
      path: `${parsed.pathname}${parsed.search}` || fallbackPath
    };
  } catch {
    return {
      baseUrl: DEFAULT_CALLBACK_BASE_URL,
      path: fallbackPath
    };
  }
}

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

export function isLegacyN8nWebhookFallbackActive() {
  const configured =
    getOptionalJsonEnv<N8nWorkflowConfig[]>("N8N_WORKFLOW_DESTINATIONS");

  return (!Array.isArray(configured) || configured.length === 0) &&
    Boolean(getOptionalEnv("N8N_WEBHOOK_URL"));
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

  // Compatibility-only fallback for older environments. First-customer launch
  // should cut over to explicit per-workflow destinations in
  // N8N_WORKFLOW_DESTINATIONS instead of relying on one shared webhook URL.
  return [
    {
      name: "auditRequested",
      url: legacyUrl,
      secret: getDefaultN8nSecret(),
      provider: "n8n",
      timeoutMs: getDefaultN8nTimeoutMs()
    },
    {
      name: "leadPipeline",
      url: legacyUrl,
      secret: getDefaultN8nSecret(),
      provider: "n8n",
      timeoutMs: getDefaultN8nTimeoutMs()
    },
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

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeOptionalStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function readJsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function buildCustomerName(user?: Pick<User, "firstName" | "lastName"> | null) {
  const fullName = [user?.firstName?.trim(), user?.lastName?.trim()]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .trim();

  return fullName.length > 0 ? fullName : null;
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
  organization?: Pick<Organization, "name" | "industry" | "sizeBand" | "aiUsageSummary"> | null;
  user?: Pick<User, "email" | "firstName" | "lastName"> | null;
  billingEventLog?: Pick<BillingEventLog, "amountCents" | "currency"> | null;
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
  const normalizedHintRecord =
    typeof normalizedHints === "object" && !Array.isArray(normalizedHints)
      ? (normalizedHints as Record<string, unknown>)
      : {};
  const rawPlanCode = String(input.routingSnapshot.planCode).toLowerCase();
  const canonicalPlanCode = resolveCanonicalPlanCode(rawPlanCode) ?? "starter";
  const normalizedPlanCode = resolveCanonicalPlanCode(rawPlanCode) ?? rawPlanCode;
  const reportTemplate =
    typeof normalizedHintRecord.report_template === "string" &&
    normalizedHintRecord.report_template.trim().length > 0
      ? normalizedHintRecord.report_template
      : getCanonicalReportTemplateForPlan(canonicalPlanCode);
  const processingDepth =
    typeof normalizedHintRecord.processing_depth === "string" &&
    normalizedHintRecord.processing_depth.trim().length > 0
      ? normalizedHintRecord.processing_depth
      : getCanonicalProcessingDepthForPlan(canonicalPlanCode);
  const callbacks = buildWorkflowCallbackUrls();
  const callbackUrls = buildCompactWorkflowCallbackUrls();
  const statusCallbackParts = deriveCallbackParts(
    callbackUrls.status_update_url,
    "/api/internal/workflows/status"
  );
  const reportReadyCallbackParts = deriveCallbackParts(
    callbackUrls.report_ready_url,
    "/api/internal/workflows/report-ready"
  );
  const callbackToken =
    getOptionalEnv("N8N_CALLBACK_SHARED_SECRET") ??
    getOptionalEnv("N8N_CALLBACK_SECRET") ??
    "";
  const routingReasonRecord = readJsonObject(routingReason);
  const hintedTopConcerns = normalizeOptionalStringArray(normalizedHintRecord.top_concerns);
  const topConcerns =
    hintedTopConcerns.length > 0
      ? hintedTopConcerns
      : normalizeOptionalStringArray(
          routingReasonRecord.top_concerns ?? routingReasonRecord.reasonCodes
        );
  const amountPaid =
    typeof input.billingEventLog?.amountCents === "number"
      ? input.billingEventLog.amountCents
      : null;
  const customerName = buildCustomerName(input.user);
  const customerEmail = normalizeOptionalString(input.user?.email);
  const companyName = normalizeOptionalString(input.organization?.name);
  const usesAiTools =
    typeof normalizedHintRecord.uses_ai_tools === "boolean"
      ? normalizedHintRecord.uses_ai_tools
      : input.organization?.aiUsageSummary
        ? true
        : null;
  const workflowType =
    typeof normalizedHintRecord.workflow_type === "string"
      ? normalizedHintRecord.workflow_type.trim()
      : "";
  const businessContext = readJsonObject(
    normalizedHintRecord.business_context
  ) as Prisma.JsonObject;
  const intakeSummary = readJsonObject(
    normalizedHintRecord.intake_summary
  ) as Prisma.JsonObject;
  const analysisProvider =
    typeof normalizedHintRecord.analysis_provider === "string"
      ? normalizedHintRecord.analysis_provider.trim()
      : null;
  const analysisModel =
    typeof normalizedHintRecord.analysis_model === "string"
      ? normalizedHintRecord.analysis_model.trim()
      : null;
  const synthesisProvider =
    typeof normalizedHintRecord.synthesis_provider === "string"
      ? normalizedHintRecord.synthesis_provider.trim()
      : null;
  const synthesisModel =
    typeof normalizedHintRecord.synthesis_model === "string"
      ? normalizedHintRecord.synthesis_model.trim()
      : null;
  const synthesisAllowed =
    typeof normalizedHintRecord.synthesis_allowed === "boolean"
      ? normalizedHintRecord.synthesis_allowed
      : null;
  const privateMode =
    typeof normalizedHintRecord.private_mode === "boolean"
      ? normalizedHintRecord.private_mode
      : null;

  return {
    source: "evolve-edge",
    provider: "n8n",
    version: "2026-04-10",
    event_type: "audit.requested",
    routing_snapshot_id: input.routingSnapshot.id,
    dispatch_id: input.dispatchId ?? "",
    correlation_id: input.correlationId ?? "",
    request_id: input.dispatchId ?? "",
    app_customer_id: input.routingSnapshot.userId ?? null,
    app_org_id: input.routingSnapshot.organizationId,
    customer_email: customerEmail,
    customer_name: customerName,
    company_name: companyName,
    purchased_tier: normalizedPlanCode,
    purchased_plan_code: normalizedPlanCode,
    stripe_session_id: input.routingSnapshot.sourceRecordId ?? null,
    amount_paid: amountPaid,
    currency: normalizeOptionalString(input.billingEventLog?.currency) ?? null,
    top_concerns: topConcerns,
    uses_ai_tools: usesAiTools,
    company_size: normalizeOptionalString(input.organization?.sizeBand) ?? null,
    industry: normalizeOptionalString(input.organization?.industry) ?? null,
    additional_notes: normalizeOptionalString(input.organization?.aiUsageSummary) ?? null,
    website: null,
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
    callbacks,
    callback_urls: callbackUrls,
    workflowDispatchId: input.dispatchId ?? "",
    dispatchId: input.dispatchId ?? "",
    organizationId: input.routingSnapshot.organizationId,
    deliveryStateRecordId: input.routingSnapshot.sourceRecordId ?? "",
    routingSnapshotId: input.routingSnapshot.id,
    callbackToken,
    callback_token: callbackToken,
    callbackBaseUrl: statusCallbackParts.baseUrl,
    statusCallbackPath: statusCallbackParts.path,
    reportReadyCallbackPath: reportReadyCallbackParts.path,
    correlationId: input.correlationId ?? "",
    tier: normalizedPlanCode,
    workflowType,
    analysisProvider,
    analysisModel,
    synthesisProvider,
    synthesisModel,
    synthesisAllowed,
    privateMode,
    businessContext,
    intakeSummary,
    executionStartedAt: new Date().toISOString(),
    executionStatus: "acknowledged",
    executionStage: "intake_received",
    routing: {
      plan_code: String(input.routingSnapshot.planCode).toLowerCase(),
      workflow_code: String(input.routingSnapshot.workflowCode).toLowerCase(),
      report_template: reportTemplate,
      processing_depth: processingDepth,
      status: String(input.routingSnapshot.status).toLowerCase(),
      entitlement_summary: normalizedHintRecord.entitlement_summary ?? {},
      quota_state: normalizedHintRecord.quota_state ?? {},
      feature_flags: normalizedHintRecord.feature_flags ?? {},
      reason: routingReason
    }
  };
}
