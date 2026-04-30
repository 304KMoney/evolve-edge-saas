import assert from "node:assert/strict";
import {
  computeComplianceScore,
  countFindings,
  determineRiskLevel
} from "../src/server/ai/providers/risk-scoring";

function runRiskScoringTests() {
  const counts = countFindings({
    summary: "Summary",
    findings: [
      {
        title: "High risk",
        severity: "High",
        summary: "Summary",
        businessImpact: "Impact",
        controlDomain: "governance",
        impactedFrameworks: ["SOC 2"],
        evidence: ["Evidence"],
        tags: ["policy"]
      },
      {
        title: "Moderate risk",
        severity: "Moderate",
        summary: "Summary",
        businessImpact: "Impact",
        controlDomain: "vendor",
        impactedFrameworks: ["SOC 2"],
        evidence: ["Evidence"],
        tags: ["vendor"]
      },
      {
        title: "Low risk",
        severity: "Low",
        summary: "Summary",
        businessImpact: "Impact",
        controlDomain: "awareness",
        impactedFrameworks: ["SOC 2"],
        evidence: ["Evidence"],
        tags: ["training"]
      }
    ],
    systemicThemes: ["Governance"],
    notableStrengths: [],
    riskFlags: {
      noFormalSecurityPolicies: true,
      noAiGovernance: true,
      vendorRiskPresent: true,
      sensitiveDataExposure: true
    }
  });

  assert.deepEqual(counts, {
    highCount: 1,
    moderateCount: 1,
    lowCount: 1
  });

  const score = computeComplianceScore({
    ...counts,
    noFormalSecurityPolicies: true,
    noAiGovernance: true,
    vendorRiskPresent: true,
    sensitiveDataExposure: true
  });

  assert.equal(score, 39);
  assert.equal(determineRiskLevel(score, counts.highCount), "High");

  console.log("risk-scoring tests passed");
}

runRiskScoringTests();
