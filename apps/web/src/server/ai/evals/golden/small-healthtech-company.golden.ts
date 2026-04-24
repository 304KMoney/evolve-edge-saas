import type { EvalGoldenExpectation } from "../types";

export const smallHealthtechCompanyGolden: EvalGoldenExpectation = {
  fixtureId: "small-healthtech-company",
  relevantFrameworks: ["SOC 2", "NIST CSF", "HIPAA", "AI governance"],
  minimumRiskCategories: [
    "data_handling",
    "vendor_management",
    "access_control",
    "documentation",
  ],
  allowedSeverities: ["Moderate", "High"],
  expectedScoreRange: {
    min: 30,
    max: 75,
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
    "guaranteed hipaa compliance",
    "legal advice",
    "api_key",
    "prompt template",
    "assessmentId",
  ],
};
