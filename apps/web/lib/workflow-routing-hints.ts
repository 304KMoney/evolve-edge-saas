export type WorkflowRoutingFamilyKey =
  | "assessment_analysis"
  | "report_pipeline";

export type WorkflowProcessingTier =
  | "starter"
  | "standard"
  | "enhanced"
  | "custom";

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
  quotaState: Record<
    string,
    {
      key: string;
      used: number;
      limit: number | null;
      remaining: number | null;
      status: string;
      enforcement: string;
    }
  >;
  featureFlags: {
    monitoringEnabled: boolean;
    controlScoringEnabled: boolean;
    customFrameworksEnabled: boolean;
    enterpriseOverrideActive: boolean;
    demoSafeguardsActive: boolean;
  };
};

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
