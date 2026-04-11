import { getOptionalEnv } from "./runtime-config";

export type StripeContextMetadata = {
  organizationId: string | null;
  customerEmail: string | null;
  planKey: string | null;
  planCode: string | null;
  revenuePlanCode: string | null;
  addOns: string[];
  environment: string | null;
  source: string | null;
  workflowType: string | null;
};

type StripeMetadataBuilderInput = {
  organizationId: string;
  customerEmail: string;
  planKey: string | null;
  planCode: string;
  revenuePlanCode?: string | null;
  addOns?: string[] | null;
  source: string;
  workflowType: string;
};

export function getIntegrationEnvironmentLabel() {
  return (
    getOptionalEnv("VERCEL_ENV") ??
    getOptionalEnv("NODE_ENV") ??
    "development"
  );
}

export function buildStripeContextMetadata(
  input: StripeMetadataBuilderInput
) {
  const environment = getIntegrationEnvironmentLabel();

  return {
    org_id: input.organizationId,
    organizationId: input.organizationId,
    customer_email: input.customerEmail,
    customerEmail: input.customerEmail,
    plan_key: input.planKey ?? input.planCode,
    planKey: input.planKey ?? input.planCode,
    plan_code: input.planCode,
    planCode: input.planCode,
    revenue_plan_code: input.revenuePlanCode ?? "",
    revenuePlanCode: input.revenuePlanCode ?? "",
    add_ons:
      input.addOns && input.addOns.length > 0 ? input.addOns.join(",") : "",
    addOns:
      input.addOns && input.addOns.length > 0 ? input.addOns.join(",") : "",
    environment,
    source: input.source,
    workflow_type: input.workflowType,
    workflowType: input.workflowType
  } satisfies Record<string, string>;
}

export function readStripeContextMetadata(
  metadata: unknown
): StripeContextMetadata {
  const record =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};

  const readString = (...keys: string[]) => {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }

    return null;
  };

  return {
    organizationId: readString("org_id", "organizationId", "organization_id"),
    customerEmail: readString("customer_email", "customerEmail", "email"),
    planKey: readString("plan_key", "planKey"),
    planCode: readString("plan_code", "planCode"),
    revenuePlanCode: readString("revenue_plan_code", "revenuePlanCode"),
    addOns: readString("add_ons", "addOns")
      ?.split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0) ?? [],
    environment: readString("environment"),
    source: readString("source"),
    workflowType: readString("workflow_type", "workflowType")
  };
}

export function stripEmptyStringProperties(
  properties: Record<string, string | null | undefined>
) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => {
      if (typeof value !== "string") {
        return value !== null && value !== undefined;
      }

      return value.trim().length > 0;
    })
  );
}

type DifyFinding = {
  title: string;
  summary: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  riskDomain: string;
  impactedFrameworks: string[];
  score?: number | null;
};

type DifyRecommendation = {
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
