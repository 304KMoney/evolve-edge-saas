import type { EvalGoldenExpectation } from "../types";

export const earlyFintechStartupGolden: EvalGoldenExpectation = {
  fixtureId: "early-fintech-startup",
  relevantFrameworks: ["SOC 2", "NIST CSF", "PCI DSS", "AI governance"],
  minimumRiskCategories: [
    "incident_response",
    "ai_governance",
    "monitoring",
    "data_handling",
  ],
  allowedSeverities: ["Moderate", "High"],
  expectedScoreRange: {
    min: 20,
    max: 70,
  },
  requiredReportSections: [
    "executiveSummary",
    "overallRiskPosture",
    "complianceScore",
    "topFindings",
    "complianceAndGovernanceGaps",
    "roadmap306090",
    "executiveBriefingTalkingPoints",
    "closingAdvisoryNote",
  ],
  prohibitedContent: [
    "guaranteed certification",
    "no risk remains",
    "internal prompt",
    "dispatchId",
    "workflow_run_id",
  ],
};
