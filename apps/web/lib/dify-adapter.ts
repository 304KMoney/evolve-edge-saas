export type DifyFinding = {
  title: string;
  summary: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  riskDomain: string;
  impactedFrameworks: string[];
  score?: number | null;
};

export type DifyRecommendation = {
  title: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  ownerRole?: string | null;
  effort?: string | null;
  targetTimeline?: string | null;
};

export type NormalizedDifyContract = {
  finalReport: string | null;
  executiveSummary: string;
  postureScore: number;
  riskLevel: string;
  topConcerns: string[];
  findings: DifyFinding[];
  roadmap: DifyRecommendation[];
  recommendations: DifyRecommendation[];
};

export type DifyAssessmentPayload = {
  contractVersion: string;
  workflowVersion: string;
  assessment: {
    id: string;
    organizationId: string;
    name: string;
    submittedAt: string | null;
    intakeVersion: number;
  };
  sections: Array<{
    key: string;
    title: string;
    status: string;
    notes: string;
  }>;
  reportUrl: string;
  commercial_context?: {
    company_name: string | null;
    contact_name: string | null;
    contact_email: string | null;
    industry: string | null;
    frameworks: string[];
    plan_code: string | null;
    workflow_code: string | null;
    report_template: string;
    processing_depth: string;
    top_concerns: string[];
  };
  routing_context?: {
    routing_decision_id: string | null;
    workflow_family: string;
    route_key: string;
    processing_tier: string;
    report_template: string;
    workflow_code: string;
    processing_depth: string;
  };
  workflowRouting?: {
    decisionId: string | null;
    workflowFamily: string;
    routeKey: string;
    processingTier: string;
    reportDepth: string;
    analysisDepth: string;
    monitoringMode: string;
    controlScoringMode: string;
    featureFlags: Record<string, boolean>;
  };
};

export type DifyRunResponse = {
  request_id?: string;
  workflow_run_id?: string;
  data?: {
    id?: string;
    outputs?: Record<string, unknown>;
    status?: string;
    error?: string | null;
  };
};


export type NormalizedDifyReportSections = {
  executive_summary: string;
  risk_analysis: DifyFinding[];
  risk_scoring: {
    posture_score: number;
    risk_level: string;
  };
  remediation_roadmap: DifyRecommendation[];
};

export function normalizeDifyReportSections(
  outputs: Record<string, unknown>
): NormalizedDifyReportSections {
  const normalized = normalizeDifyWorkflowOutputs(outputs);

  return {
    executive_summary: normalized.executiveSummary,
    risk_analysis: normalized.findings,
    risk_scoring: {
      posture_score: normalized.postureScore,
      risk_level: normalized.riskLevel
    },
    remediation_roadmap: normalized.roadmap
  };
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function readFirstString(
  record: Record<string, unknown>,
  keys: string[],
  fallback?: string | null
) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return fallback ?? null;
}

export function buildTopConcernsFromFindings(findings: DifyFinding[]) {
  return findings
    .slice(0, 3)
    .map((finding) => `${finding.title}: ${finding.summary}`)
    .filter((value) => value.trim().length > 0);
}

export function normalizeDifyContractShape(input: {
  finalReport?: string | null;
  executiveSummary: string;
  postureScore: number;
  riskLevel: string;
  findings: DifyFinding[];
  recommendations: DifyRecommendation[];
  topConcerns?: string[] | null;
  roadmap?: DifyRecommendation[] | null;
}) {
  const recommendations = input.roadmap ?? input.recommendations;
  const topConcerns =
    input.topConcerns && input.topConcerns.length > 0
      ? input.topConcerns
      : buildTopConcernsFromFindings(input.findings);

  return {
    finalReport: input.finalReport ?? null,
    executiveSummary: input.executiveSummary,
    postureScore: input.postureScore,
    riskLevel: input.riskLevel,
    topConcerns,
    findings: input.findings,
    roadmap: recommendations,
    recommendations
  } satisfies NormalizedDifyContract;
}

export function normalizeDifyWorkflowOutputs(
  outputs: Record<string, unknown>
): NormalizedDifyContract {
  const executiveSummary =
    readFirstString(outputs, ["executiveSummary", "executive_summary"]) ?? "";
  const postureScore = outputs.postureScore;
  const riskLevel = readFirstString(outputs, ["riskLevel", "risk_level"]) ?? "";
  const finalReport = readFirstString(outputs, ["finalReport", "final_report"]);
  const findings = outputs.findings;
  const topConcernsValue = outputs.topConcerns ?? outputs.top_concerns;
  const recommendations = outputs.recommendations ?? outputs.roadmap;

  if (executiveSummary.trim().length === 0) {
    throw new Error("Dify response missing executiveSummary.");
  }

  if (
    typeof postureScore !== "number" ||
    Number.isNaN(postureScore) ||
    postureScore < 0 ||
    postureScore > 100
  ) {
    throw new Error("Dify response postureScore must be a number between 0 and 100.");
  }

  if (riskLevel.trim().length === 0) {
    throw new Error("Dify response missing riskLevel.");
  }

  if (!Array.isArray(findings) || findings.length === 0) {
    throw new Error("Dify response must include findings.");
  }

  if (!Array.isArray(recommendations) || recommendations.length === 0) {
    throw new Error("Dify response must include recommendations.");
  }

  const normalizedFindings = findings.map((finding, index) => {
    if (!finding || typeof finding !== "object" || Array.isArray(finding)) {
      throw new Error(`Invalid Dify finding at index ${index}.`);
    }

    const record = finding as Record<string, unknown>;
    if (
      typeof record.title !== "string" ||
      typeof record.summary !== "string" ||
      typeof record.severity !== "string" ||
      typeof record.riskDomain !== "string"
    ) {
      throw new Error(`Incomplete Dify finding at index ${index}.`);
    }

    return {
      title: record.title.trim(),
      summary: record.summary.trim(),
      severity: record.severity as DifyFinding["severity"],
      riskDomain: record.riskDomain.trim(),
      impactedFrameworks: asStringArray(record.impactedFrameworks),
      score:
        typeof record.score === "number" && Number.isFinite(record.score)
          ? record.score
          : null
    };
  });

  const normalizedRecommendations = recommendations.map((recommendation, index) => {
    if (!recommendation || typeof recommendation !== "object" || Array.isArray(recommendation)) {
      throw new Error(`Invalid Dify recommendation at index ${index}.`);
    }

    const record = recommendation as Record<string, unknown>;
    if (
      typeof record.title !== "string" ||
      typeof record.description !== "string" ||
      typeof record.priority !== "string"
    ) {
      throw new Error(`Incomplete Dify recommendation at index ${index}.`);
    }

    return {
      title: record.title.trim(),
      description: record.description.trim(),
      priority: record.priority as DifyRecommendation["priority"],
      ownerRole: typeof record.ownerRole === "string" ? record.ownerRole.trim() : null,
      effort: typeof record.effort === "string" ? record.effort.trim() : null,
      targetTimeline:
        typeof record.targetTimeline === "string"
          ? record.targetTimeline.trim()
          : null
    };
  });

  return normalizeDifyContractShape({
    finalReport,
    executiveSummary: executiveSummary.trim(),
    postureScore,
    riskLevel: riskLevel.trim(),
    topConcerns: asStringArray(topConcernsValue),
    findings: normalizedFindings,
    recommendations: normalizedRecommendations
  });
}
