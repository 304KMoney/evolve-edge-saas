import type { EvalGoldenExpectation } from "../types";

export const smallLawFirmGolden: EvalGoldenExpectation = {
  fixtureId: "small-law-firm",
  relevantFrameworks: ["SOC 2", "NIST CSF", "AI governance"],
  minimumRiskCategories: ["governance", "access_control", "vendor_management"],
  allowedSeverities: ["Moderate", "High"],
  expectedScoreRange: {
    min: 20,
    max: 40,
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
    "guaranteed compliance",
    "fully compliant",
    "LangGraph",
    "OpenAI API key",
    "workflowDispatchId",
  ],
};
