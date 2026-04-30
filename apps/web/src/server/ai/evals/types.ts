import type { AuditWorkflowOutput, ExecuteAuditWorkflowInput } from "../providers/types";

export type EvalFixture = ExecuteAuditWorkflowInput & {
  fixtureId: string;
  label: string;
};

export type EvalGoldenExpectation = {
  fixtureId: string;
  relevantFrameworks: string[];
  minimumRiskCategories: string[];
  allowedSeverities: Array<"Low" | "Moderate" | "High">;
  expectedScoreRange: {
    min: number;
    max: number;
  };
  requiredReportSections: Array<
    | "executiveSummary"
    | "overallRiskPosture"
    | "complianceScore"
    | "topFindings"
    | "complianceAndGovernanceGaps"
    | "roadmap306090"
    | "executiveBriefingTalkingPoints"
    | "closingAdvisoryNote"
  >;
  prohibitedContent: string[];
};

export type EvalCheckResult = {
  name: string;
  passed: boolean;
  details?: string;
};

export type EvalFixtureResult = {
  fixtureId: string;
  label: string;
  passed: boolean;
  flagged: boolean;
  mode: "mock" | "live";
  provider: string;
  failureCategories: string[];
  checks: EvalCheckResult[];
  output: AuditWorkflowOutput;
};

export type EvalSummary = {
  mode: "mock" | "live";
  total: number;
  passed: number;
  failed: number;
  fixtures: EvalFixtureResult[];
};
