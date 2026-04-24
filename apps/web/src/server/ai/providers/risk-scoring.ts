import type { RiskAnalysisOutput } from "./types";

export function countFindings(riskAnalysis: RiskAnalysisOutput) {
  let highCount = 0;
  let moderateCount = 0;
  let lowCount = 0;

  for (const finding of riskAnalysis.findings) {
    if (finding.severity === "High") {
      highCount += 1;
      continue;
    }
    if (finding.severity === "Moderate") {
      moderateCount += 1;
      continue;
    }
    lowCount += 1;
  }

  return { highCount, moderateCount, lowCount };
}

export function computeComplianceScore(input: {
  highCount: number;
  moderateCount: number;
  lowCount: number;
  noFormalSecurityPolicies: boolean;
  noAiGovernance: boolean;
  vendorRiskPresent: boolean;
  sensitiveDataExposure: boolean;
}) {
  let score = 100;
  score -= input.highCount * 15;
  score -= input.moderateCount * 8;
  score -= input.lowCount * 3;
  if (input.noFormalSecurityPolicies) {
    score -= 10;
  }
  if (input.noAiGovernance) {
    score -= 10;
  }
  if (input.vendorRiskPresent) {
    score -= 5;
  }
  if (input.sensitiveDataExposure) {
    score -= 10;
  }
  return Math.max(0, score);
}

export function determineRiskLevel(complianceScore: number, highCount: number) {
  if (complianceScore < 55 || highCount >= 3) {
    return "High" as const;
  }
  if (complianceScore < 80 || highCount > 0) {
    return "Moderate" as const;
  }
  return "Low" as const;
}
