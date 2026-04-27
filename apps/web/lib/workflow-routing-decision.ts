import {
  CanonicalPlanKey,
  WorkflowRoutingDisposition,
  WorkflowRoutingFamily
} from "@evolve-edge/db";
import {
  mapCanonicalPlanKeyToCanonicalPlanCode,
  resolveCanonicalPlanCodeFromRevenuePlanCode,
  type CanonicalPlanCode
} from "./commercial-catalog";
import {
  type NormalizedWorkflowHints,
  type WorkflowProcessingTier,
  type WorkflowRoutingFamilyKey
} from "./workflow-routing-hints";
import {
  getUsageMetricSnapshot,
  type OrganizationUsageMeteringSnapshot,
  type UsageMetricKey,
  type UsageMetricSnapshot
} from "./usage-metering";

type WorkflowCommercialTier =
  | "starter"
  | "scale_standard"
  | "scale"
  | "enterprise";

export type WorkflowRoutingQuotaState = {
  key: UsageMetricKey;
  used: number;
  limit: number | null;
  remaining: number | null;
  status: UsageMetricSnapshot["status"];
  enforcement: UsageMetricSnapshot["enforcement"];
};

export type WorkflowCommercialState = {
  organizationId: string;
  canonicalPlanKey: CanonicalPlanKey | null;
  planCode: string;
  workspaceMode: "TRIAL" | "SUBSCRIPTION" | "INACTIVE";
  subscriptionStatus: string;
  billingAccessState: string;
  featureAccess: Record<string, boolean>;
  limits: Record<string, number | null>;
  appliedOverrides: Array<{
    key: string;
    source: string;
    reason: string;
    expiresAt: string | Date | null;
  }>;
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
  subscriptionStatus: string;
  billingAccessState: string;
  workspaceMode: WorkflowCommercialState["workspaceMode"];
  reasonCodes: string[];
  matchedRules: string[];
  entitlementSummary: NormalizedWorkflowHints["entitlementSummary"];
  quotaState: Record<string, WorkflowRoutingQuotaState>;
  workflowHints: NormalizedWorkflowHints;
  metadata: {
    environment: string;
    addOnsLive: boolean;
    addOnKeys: string[];
    overrideKeys: string[];
  };
};

export const WORKFLOW_ROUTING_DECISION_VERSION = "phase-61-v1";

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
  const canonicalPlanCode = resolveCanonicalPlanCodeForWorkflowState(state);
  const commercialTier = resolveWorkflowCommercialTier(state);
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
