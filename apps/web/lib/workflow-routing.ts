import {
  BillingAccessState,
  CanonicalPlanKey,
  Prisma,
  SubscriptionStatus,
  WorkflowRoutingDecision,
  WorkflowRoutingDisposition,
  WorkflowRoutingFamily,
  prisma
} from "@evolve-edge/db";
import {
  mapCanonicalPlanKeyToCanonicalPlanCode,
  resolveCanonicalPlanCodeFromRevenuePlanCode,
  type CanonicalPlanCode
} from "./commercial-catalog";
import { type EntitlementSnapshot, getOrganizationEntitlements } from "./entitlements";
import { getIntegrationEnvironmentLabel } from "./integration-contracts";
import { getOrganizationSubscriptionSnapshot } from "./subscription-domain";
import {
  getOrganizationUsageMeteringSnapshot,
  getUsageMetricSnapshot,
  type OrganizationUsageMeteringSnapshot,
  type UsageMetricKey,
  type UsageMetricSnapshot
} from "./usage-metering";

// Workflow routing is the in-app workflow-family routing layer. It uses the current
// commercial state plus usage posture to choose assessment-analysis and
// report-pipeline execution hints for dashboard actions.
//
// This is distinct from `commercial-routing.ts`, which computes checkout/billing
// routing snapshots for paid request orchestration. Do not treat the two modules as
// interchangeable even though they share entitlement and plan inputs.

type WorkflowRoutingDbClient = Prisma.TransactionClient | typeof prisma;

export const WORKFLOW_ROUTING_DECISION_VERSION = "phase-61-v1";

export type WorkflowRoutingFamilyKey =
  | "assessment_analysis"
  | "report_pipeline";

export type WorkflowProcessingTier =
  | "starter"
  | "standard"
  | "enhanced"
  | "custom";

export type WorkflowRoutingQuotaState = {
  key: UsageMetricKey;
  used: number;
  limit: number | null;
  remaining: number | null;
  status: UsageMetricSnapshot["status"];
  enforcement: UsageMetricSnapshot["enforcement"];
};

export type NormalizedWorkflowHints = {
  workflowFamily: WorkflowRoutingFamilyKey;
  routeKey: string;
  processingTier: WorkflowProcessingTier;
  routeDisposition:
    | "standard"
    | "upgraded"
    | "throttled"
    | "blocked"
    | "trial"
    | "fallback";
  reportDepth: "concise" | "standard" | "enhanced" | "custom";
  analysisDepth: "concise" | "standard" | "enhanced" | "custom";
  monitoringMode: "disabled" | "standard" | "enhanced" | "custom";
  controlScoringMode: "disabled" | "manual" | "enhanced";
  entitlementSummary: {
    workspaceAccess: boolean;
    reportsGenerate: boolean;
    monitoringManage: boolean;
    customFrameworks: boolean;
    prioritySupport: boolean;
    apiAccess: boolean;
  };
  quotaState: Record<string, WorkflowRoutingQuotaState>;
  featureFlags: {
    monitoringEnabled: boolean;
    controlScoringEnabled: boolean;
    customFrameworksEnabled: boolean;
    enterpriseOverrideActive: boolean;
    demoSafeguardsActive: boolean;
  };
};

export type WorkflowCommercialState = {
  organizationId: string;
  canonicalPlanKey: CanonicalPlanKey | null;
  planCode: string;
  workspaceMode: EntitlementSnapshot["workspaceMode"];
  subscriptionStatus: EntitlementSnapshot["subscriptionStatus"];
  billingAccessState: EntitlementSnapshot["billingAccessState"];
  featureAccess: EntitlementSnapshot["featureAccess"];
  limits: EntitlementSnapshot["limits"];
  appliedOverrides: EntitlementSnapshot["appliedOverrides"];
  usageMetering: OrganizationUsageMeteringSnapshot;
  environment: string;
  addOnKeys: string[];
};

export type ComputedWorkflowRoutingDecision = {
  workflowFamily: WorkflowRoutingFamily;
  workflowFamilyKey: WorkflowRoutingFamilyKey;
  routeKey: string;
  processingTier: WorkflowProcessingTier;
  disposition: WorkflowRoutingDisposition;
  decisionVersion: string;
  canonicalPlanKey: CanonicalPlanKey | null;
  planCode: string;
  subscriptionStatus: SubscriptionStatus | "NONE";
  billingAccessState: BillingAccessState | "NONE";
  workspaceMode: EntitlementSnapshot["workspaceMode"];
  reasonCodes: string[];
  matchedRules: string[];
  entitlementSummary: NormalizedWorkflowHints["entitlementSummary"];
  quotaState: Record<string, WorkflowRoutingQuotaState>;
  workflowHints: NormalizedWorkflowHints;
  metadata: {
    environment: string;
    addOnsLive: false;
    addOnKeys: string[];
    overrideKeys: string[];
  };
};

export type PersistedWorkflowRoutingDecision = WorkflowRoutingDecision & {
  workflowHints: Prisma.JsonValue;
  quotaState: Prisma.JsonValue;
  entitlementSummary: Prisma.JsonValue;
  reasonCodes: Prisma.JsonValue;
  matchedRules: Prisma.JsonValue | null;
  metadata: Prisma.JsonValue | null;
};

type PersistWorkflowRoutingInput = {
  organizationId: string;
  actorUserId?: string | null;
  workflowFamily: WorkflowRoutingFamilyKey;
  sourceRecordType: string;
  sourceRecordId: string;
  idempotencyKey: string;
  metadata?: Prisma.InputJsonValue | null;
  db?: WorkflowRoutingDbClient;
};

type WorkflowCommercialTier =
  | "starter"
  | "scale_standard"
  | "scale"
  | "enterprise";

function toDispositionLabel(value: WorkflowRoutingDisposition) {
  return value.toLowerCase() as NormalizedWorkflowHints["routeDisposition"];
}

function resolveCanonicalPlanCodeForWorkflowState(
  state: Pick<WorkflowCommercialState, "canonicalPlanKey" | "planCode">
): CanonicalPlanCode {
  return (
    resolveCanonicalPlanCodeFromRevenuePlanCode(state.planCode) ??
    mapCanonicalPlanKeyToCanonicalPlanCode(state.canonicalPlanKey)
  );
}

function resolveWorkflowCommercialTier(
  state: Pick<WorkflowCommercialState, "canonicalPlanKey" | "planCode">
): WorkflowCommercialTier {
  const canonicalPlanCode = resolveCanonicalPlanCodeForWorkflowState(state);

  if (canonicalPlanCode === "enterprise") {
    return "enterprise";
  }

  if (canonicalPlanCode === "scale") {
    // Legacy growth-era revenue plans still normalize into the canonical scale
    // commercial model, but this workflow layer preserves a narrower
    // `scale_standard` compatibility tier so older in-app report/analysis routes
    // do not silently jump to enhanced handling.
    return state.planCode.startsWith("scale") || state.canonicalPlanKey === CanonicalPlanKey.SCALE
      ? "scale"
      : "scale_standard";
  }

  return "starter";
}

function getPlanRank(tier: WorkflowCommercialTier) {
  switch (tier) {
    case "enterprise":
      return 4;
    case "scale":
      return 3;
    case "scale_standard":
      return 2;
    case "starter":
    default:
      return 1;
  }
}

function getProcessingTier(tier: WorkflowCommercialTier): WorkflowProcessingTier {
  switch (tier) {
    case "enterprise":
      return "custom";
    case "scale":
      return "enhanced";
    case "scale_standard":
      return "standard";
    case "starter":
    default:
      return "starter";
  }
}

function readUsageQuotaState(
  usageMetering: OrganizationUsageMeteringSnapshot,
  key: UsageMetricKey
): WorkflowRoutingQuotaState {
  const metric = getUsageMetricSnapshot(usageMetering, key);
  return {
    key,
    used: metric?.used ?? 0,
    limit: metric?.limit ?? null,
    remaining: metric?.remaining ?? null,
    status: metric?.status ?? "ok",
    enforcement: metric?.enforcement ?? "visibility"
  };
}

function createEntitlementSummary(state: WorkflowCommercialState) {
  return {
    workspaceAccess: state.featureAccess["workspace.access"],
    reportsGenerate: state.featureAccess["reports.generate"],
    monitoringManage: state.featureAccess["monitoring.manage"],
    customFrameworks: state.featureAccess["custom.frameworks"],
    prioritySupport: state.featureAccess["priority.support"],
    apiAccess: state.featureAccess["api.access"]
  };
}

function createQuotaState(
  state: WorkflowCommercialState,
  workflowFamily: WorkflowRoutingFamilyKey
) {
  const base: Record<string, WorkflowRoutingQuotaState> = {
    ai_processing_runs: readUsageQuotaState(state.usageMetering, "aiProcessingRuns"),
    reports_generated: readUsageQuotaState(state.usageMetering, "reportsGenerated")
  };

  if (workflowFamily === "report_pipeline") {
    base.monitoring_assets = readUsageQuotaState(state.usageMetering, "monitoredAssets");
  }

  return base;
}

function createBaseDecision(
  workflowFamily: WorkflowRoutingFamilyKey,
  state: WorkflowCommercialState
) {
  const commercialTier = resolveWorkflowCommercialTier(state);
  const canonicalPlanCode = resolveCanonicalPlanCodeForWorkflowState(state);
  const processingTier = getProcessingTier(commercialTier);
  const entitlementSummary = createEntitlementSummary(state);
  const quotaState = createQuotaState(state, workflowFamily);
  const overrideKeys = state.appliedOverrides.map((override) => override.key);

  return {
    canonicalPlanCode,
    commercialTier,
    processingTier,
    entitlementSummary,
    quotaState,
    overrideKeys,
    hasEnterpriseOverrides: overrideKeys.length > 0
  };
}

function resolveAssessmentAnalysisRoute(
  state: WorkflowCommercialState
): ComputedWorkflowRoutingDecision {
  const base = createBaseDecision("assessment_analysis", state);
  const reasonCodes = [`plan.${base.canonicalPlanCode}`];
  const matchedRules = ["routing.assessment_analysis.plan_tier"];
  let disposition: WorkflowRoutingDisposition = WorkflowRoutingDisposition.STANDARD;
  let routeKey = "analysis.starter_concise";
  let reportDepth: NormalizedWorkflowHints["reportDepth"] = "concise";
  let analysisDepth: NormalizedWorkflowHints["analysisDepth"] = "concise";

  if (!base.entitlementSummary.workspaceAccess || !state.featureAccess["assessments.create"]) {
    disposition = WorkflowRoutingDisposition.BLOCKED;
    routeKey = "analysis.blocked";
    reasonCodes.push("entitlement.assessments_create.missing");
    matchedRules.push("routing.assessment_analysis.blocked_by_entitlement");
  } else {
    switch (base.commercialTier) {
      case "scale_standard":
        routeKey = "analysis.scale_standard";
        reportDepth = "standard";
        analysisDepth = "standard";
        break;
      case "scale":
        routeKey = "analysis.scale_enhanced";
        reportDepth = "enhanced";
        analysisDepth = "enhanced";
        disposition = WorkflowRoutingDisposition.UPGRADED;
        reasonCodes.push("entitlement.executive_reviews.enabled");
        matchedRules.push("routing.assessment_analysis.enhanced");
        break;
      case "enterprise":
        routeKey = "analysis.enterprise_custom";
        reportDepth = "custom";
        analysisDepth = "custom";
        disposition = WorkflowRoutingDisposition.UPGRADED;
        reasonCodes.push("entitlement.enterprise_overrides.available");
        matchedRules.push("routing.assessment_analysis.enterprise");
        break;
      case "starter":
      default:
        break;
    }
  }

  if (base.quotaState.ai_processing_runs.status === "warning") {
    reasonCodes.push("quota.ai_processing_runs.near_limit");
    matchedRules.push("routing.assessment_analysis.quota_warning");
  }
  if (base.quotaState.ai_processing_runs.status === "exceeded") {
    reasonCodes.push("quota.ai_processing_runs.soft_limit_reached");
    if (disposition !== WorkflowRoutingDisposition.BLOCKED) {
      disposition = WorkflowRoutingDisposition.THROTTLED;
    }
    matchedRules.push("routing.assessment_analysis.throttled_by_quota");
  }

  if (
    state.workspaceMode === "TRIAL" &&
    disposition !== WorkflowRoutingDisposition.BLOCKED &&
    disposition !== WorkflowRoutingDisposition.THROTTLED
  ) {
    disposition = WorkflowRoutingDisposition.TRIAL;
    reasonCodes.push("workspace.trial");
    matchedRules.push("routing.assessment_analysis.trial_mode");
  }

  const controlScoringEnabled = getPlanRank(base.commercialTier) >= 3;
  const workflowHints: NormalizedWorkflowHints = {
    workflowFamily: "assessment_analysis",
    routeKey,
    processingTier: base.processingTier,
    routeDisposition: toDispositionLabel(disposition),
    reportDepth,
    analysisDepth,
    monitoringMode: base.entitlementSummary.monitoringManage ? "standard" : "disabled",
    controlScoringMode: controlScoringEnabled ? "enhanced" : "disabled",
    entitlementSummary: base.entitlementSummary,
    quotaState: base.quotaState,
    featureFlags: {
      monitoringEnabled: base.entitlementSummary.monitoringManage,
      controlScoringEnabled,
      customFrameworksEnabled: base.entitlementSummary.customFrameworks,
      enterpriseOverrideActive: base.hasEnterpriseOverrides,
      demoSafeguardsActive: state.environment !== "production"
    }
  };

  return {
    workflowFamily: WorkflowRoutingFamily.ASSESSMENT_ANALYSIS,
    workflowFamilyKey: "assessment_analysis",
    routeKey,
    processingTier: base.processingTier,
    disposition,
    decisionVersion: WORKFLOW_ROUTING_DECISION_VERSION,
    canonicalPlanKey: state.canonicalPlanKey,
    planCode: state.planCode,
    subscriptionStatus: state.subscriptionStatus,
    billingAccessState: state.billingAccessState,
    workspaceMode: state.workspaceMode,
    reasonCodes,
    matchedRules,
    entitlementSummary: base.entitlementSummary,
    quotaState: base.quotaState,
    workflowHints,
    metadata: {
      environment: state.environment,
      addOnsLive: false,
      addOnKeys: state.addOnKeys,
      overrideKeys: base.overrideKeys
    }
  };
}

function resolveReportPipelineRoute(
  state: WorkflowCommercialState
): ComputedWorkflowRoutingDecision {
  const base = createBaseDecision("report_pipeline", state);
  const reasonCodes = [`plan.${base.canonicalPlanCode}`];
  const matchedRules = ["routing.report_pipeline.plan_tier"];
  let disposition: WorkflowRoutingDisposition = WorkflowRoutingDisposition.STANDARD;
  let routeKey = "report.starter_snapshot";
  let reportDepth: NormalizedWorkflowHints["reportDepth"] = "concise";
  let analysisDepth: NormalizedWorkflowHints["analysisDepth"] = "concise";
  let monitoringMode: NormalizedWorkflowHints["monitoringMode"] = "disabled";
  let controlScoringMode: NormalizedWorkflowHints["controlScoringMode"] = "disabled";

  if (!base.entitlementSummary.workspaceAccess || !base.entitlementSummary.reportsGenerate) {
    disposition = WorkflowRoutingDisposition.BLOCKED;
    routeKey = "report.blocked";
    reasonCodes.push("entitlement.reports_generate.missing");
    matchedRules.push("routing.report_pipeline.blocked_by_entitlement");
  } else {
    switch (base.commercialTier) {
      case "scale_standard":
        routeKey = "report.scale_standard";
        reportDepth = "standard";
        analysisDepth = "standard";
        monitoringMode = base.entitlementSummary.monitoringManage ? "standard" : "disabled";
        controlScoringMode = "manual";
        break;
      case "scale":
        routeKey = "report.scale_enhanced";
        reportDepth = "enhanced";
        analysisDepth = "enhanced";
        monitoringMode = "enhanced";
        controlScoringMode = "enhanced";
        disposition = WorkflowRoutingDisposition.UPGRADED;
        reasonCodes.push("entitlement.priority_support.enabled");
        matchedRules.push("routing.report_pipeline.enhanced");
        break;
      case "enterprise":
        routeKey = "report.enterprise_custom";
        reportDepth = "custom";
        analysisDepth = "custom";
        monitoringMode = "custom";
        controlScoringMode = "enhanced";
        disposition = WorkflowRoutingDisposition.UPGRADED;
        reasonCodes.push("entitlement.enterprise_overrides.available");
        matchedRules.push("routing.report_pipeline.enterprise");
        break;
      case "starter":
      default:
        break;
    }
  }

  if (base.quotaState.reports_generated.status === "warning") {
    reasonCodes.push("quota.reports_generated.near_limit");
    matchedRules.push("routing.report_pipeline.quota_warning");
  }
  if (base.quotaState.reports_generated.status === "exceeded") {
    reasonCodes.push("quota.reports_generated.soft_limit_reached");
    if (disposition !== WorkflowRoutingDisposition.BLOCKED) {
      disposition = WorkflowRoutingDisposition.THROTTLED;
    }
    matchedRules.push("routing.report_pipeline.throttled_by_quota");
  }

  if (!base.entitlementSummary.monitoringManage && disposition !== WorkflowRoutingDisposition.BLOCKED) {
    reasonCodes.push("entitlement.monitoring_manage.disabled");
    matchedRules.push("routing.report_pipeline.monitoring_disabled");
  }

  if (
    state.workspaceMode === "TRIAL" &&
    disposition !== WorkflowRoutingDisposition.BLOCKED &&
    disposition !== WorkflowRoutingDisposition.THROTTLED
  ) {
    disposition = WorkflowRoutingDisposition.TRIAL;
    reasonCodes.push("workspace.trial");
    matchedRules.push("routing.report_pipeline.trial_mode");
  }

  const workflowHints: NormalizedWorkflowHints = {
    workflowFamily: "report_pipeline",
    routeKey,
    processingTier: base.processingTier,
    routeDisposition: toDispositionLabel(disposition),
    reportDepth,
    analysisDepth,
    monitoringMode,
    controlScoringMode,
    entitlementSummary: base.entitlementSummary,
    quotaState: base.quotaState,
    featureFlags: {
      monitoringEnabled: monitoringMode !== "disabled",
      controlScoringEnabled: controlScoringMode === "enhanced",
      customFrameworksEnabled: base.entitlementSummary.customFrameworks,
      enterpriseOverrideActive: base.hasEnterpriseOverrides,
      demoSafeguardsActive: state.environment !== "production"
    }
  };

  return {
    workflowFamily: WorkflowRoutingFamily.REPORT_PIPELINE,
    workflowFamilyKey: "report_pipeline",
    routeKey,
    processingTier: base.processingTier,
    disposition,
    decisionVersion: WORKFLOW_ROUTING_DECISION_VERSION,
    canonicalPlanKey: state.canonicalPlanKey,
    planCode: state.planCode,
    subscriptionStatus: state.subscriptionStatus,
    billingAccessState: state.billingAccessState,
    workspaceMode: state.workspaceMode,
    reasonCodes,
    matchedRules,
    entitlementSummary: base.entitlementSummary,
    quotaState: base.quotaState,
    workflowHints,
    metadata: {
      environment: state.environment,
      addOnsLive: false,
      addOnKeys: state.addOnKeys,
      overrideKeys: base.overrideKeys
    }
  };
}

export function computeWorkflowRoutingDecision(input: {
  workflowFamily: WorkflowRoutingFamilyKey;
  commercialState: WorkflowCommercialState;
}) {
  return input.workflowFamily === "assessment_analysis"
    ? resolveAssessmentAnalysisRoute(input.commercialState)
    : resolveReportPipelineRoute(input.commercialState);
}

export async function getWorkflowCommercialState(
  organizationId: string,
  db: WorkflowRoutingDbClient = prisma
): Promise<WorkflowCommercialState> {
  const [entitlements, subscriptionSnapshot] = await Promise.all([
    getOrganizationEntitlements(organizationId, db),
    getOrganizationSubscriptionSnapshot(organizationId, db)
  ]);
  const usageMetering = await getOrganizationUsageMeteringSnapshot(
    organizationId,
    entitlements.planCode,
    db
  );

  return {
    organizationId,
    canonicalPlanKey: entitlements.canonicalPlanKey,
    planCode: entitlements.planCode,
    workspaceMode: entitlements.workspaceMode,
    subscriptionStatus: entitlements.subscriptionStatus,
    billingAccessState: entitlements.billingAccessState,
    featureAccess: entitlements.featureAccess,
    limits: entitlements.limits,
    appliedOverrides: entitlements.appliedOverrides,
    usageMetering,
    environment: getIntegrationEnvironmentLabel(),
    addOnKeys:
      subscriptionSnapshot.subscription?.billingMetadata &&
      typeof subscriptionSnapshot.subscription.billingMetadata === "object" &&
      !Array.isArray(subscriptionSnapshot.subscription.billingMetadata) &&
      Array.isArray(
        (subscriptionSnapshot.subscription.billingMetadata as Record<string, unknown>).addOnKeys
      )
        ? (
            (subscriptionSnapshot.subscription.billingMetadata as Record<string, unknown>)
              .addOnKeys as unknown[]
          ).filter((value): value is string => typeof value === "string")
        : []
  };
}

export async function computeAndPersistWorkflowRoutingDecision(
  input: PersistWorkflowRoutingInput
) {
  const db = input.db ?? prisma;
  const existing = await db.workflowRoutingDecision.findUnique({
    where: { idempotencyKey: input.idempotencyKey }
  });

  if (existing) {
    return existing;
  }

  const commercialState = await getWorkflowCommercialState(input.organizationId, db);
  const decision = computeWorkflowRoutingDecision({
    workflowFamily: input.workflowFamily,
    commercialState
  });

  return db.workflowRoutingDecision.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId ?? null,
      workflowFamily: decision.workflowFamily,
      sourceRecordType: input.sourceRecordType,
      sourceRecordId: input.sourceRecordId,
      routeKey: decision.routeKey,
      processingTier: decision.processingTier,
      disposition: decision.disposition,
      decisionVersion: decision.decisionVersion,
      sourceSystem: "app",
      idempotencyKey: input.idempotencyKey,
      canonicalPlanKey: decision.canonicalPlanKey,
      planCode: decision.planCode,
      subscriptionStatus:
        decision.subscriptionStatus === "NONE" ? null : decision.subscriptionStatus,
      billingAccessState:
        decision.billingAccessState === "NONE" ? null : decision.billingAccessState,
      workspaceMode: decision.workspaceMode,
      reasonCodes: decision.reasonCodes,
      matchedRules: decision.matchedRules,
      entitlementSummary: decision.entitlementSummary,
      quotaState: decision.quotaState,
      workflowHints: decision.workflowHints,
      metadata: input.metadata ?? decision.metadata
    }
  });
}

export async function listOrganizationWorkflowRoutingDecisions(
  organizationId: string,
  options?: {
    limit?: number;
    db?: WorkflowRoutingDbClient;
  }
) {
  const db = options?.db ?? prisma;
  return db.workflowRoutingDecision.findMany({
    where: { organizationId },
    orderBy: [{ createdAt: "desc" }],
    take: options?.limit ?? 12
  });
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

export function extractNormalizedWorkflowHints(value: unknown): {
  decisionId: string | null;
  workflowHints: NormalizedWorkflowHints | null;
  reasonCodes: string[];
} {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const decisionId =
    typeof record.workflowRoutingDecisionId === "string"
      ? record.workflowRoutingDecisionId
      : null;
  const workflowHints =
    record.workflowRouting &&
    typeof record.workflowRouting === "object" &&
    !Array.isArray(record.workflowRouting)
      ? (record.workflowRouting as NormalizedWorkflowHints)
      : null;
  const reasonCodes = asStringArray(record.workflowRoutingReasonCodes);

  return {
    decisionId,
    workflowHints,
    reasonCodes
  };
}

export function formatWorkflowRoutingDisposition(
  disposition: WorkflowRoutingDisposition | string | null | undefined
) {
  if (!disposition) {
    return "Unknown";
  }

  return String(disposition)
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
