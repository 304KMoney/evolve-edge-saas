import assert from "node:assert/strict";
import {
  auditWorkflowOutputSchema,
  executeAuditWorkflowInputSchema
} from "../src/server/ai/providers/types";

function runAiExecutionContractsTests() {
  const input = executeAuditWorkflowInputSchema.parse({
    orgId: "org_123",
    assessmentId: "asm_123",
    workflowDispatchId: "wd_123",
    dispatchId: "disp_123",
    customerEmail: "buyer@example.com",
    companyName: "Acme Health",
    industry: "Healthcare",
    companySize: "51-200",
    selectedFrameworks: ["SOC 2", "HIPAA"],
    assessmentAnswers: [
      {
        question: "Are security policies formalized?",
        answer: "No"
      }
    ],
    evidenceSummary: "Policies are partial and vendor review is informal.",
    planTier: "scale",
    commercialRouting: {
      planTier: "scale",
      workflowCode: "audit_scale",
      entitlementSource: "subscription",
      reportDepth: "enhanced",
      maxFindings: 10,
      roadmapDetail: "detailed",
      executiveBriefingEligible: true,
      monitoringAddOnEligible: true,
      addOnEligible: true,
      immutable: true
    }
  });

  assert.equal(input.planTier, "scale");
  assert.equal(input.commercialRouting?.maxFindings, 10);
  assert.deepEqual(input.selectedFrameworks, ["SOC 2", "HIPAA"]);

  assert.throws(
    () =>
      executeAuditWorkflowInputSchema.parse({
        ...input,
        selectedFrameworks: ["Unknown Framework"]
      }),
    /Framework must be one of/
  );

  const output = auditWorkflowOutputSchema.parse({
    provider: "openai_langgraph",
    workflowDispatchId: "wd_123",
    status: "completed",
    businessContext: {
      companyName: "Acme Health",
      industry: "Healthcare",
      companySize: "51-200",
      summary: "Healthcare SaaS provider with moderate governance maturity.",
      operatingModel: "B2B SaaS platform serving healthcare operations teams.",
      businessPriorities: ["Governance", "Vendor oversight"],
      securityMaturitySignals: ["Some control ownership exists"]
    },
    frameworkMapping: {
      selectedFrameworks: ["SOC 2", "HIPAA"],
      prioritizedFrameworks: ["SOC 2", "HIPAA"],
      coverageSummary: "Selected frameworks align with healthcare and SaaS controls.",
      mappings: [
        {
          framework: "SOC 2",
          rationale: "Customer trust and baseline control expectations.",
          applicableAreas: ["Access control"]
        }
      ]
    },
    riskAnalysis: {
      summary: "Governance and vendor review controls need work.",
      findings: [
        {
          title: "Missing policy baseline",
          severity: "High",
          summary: "Formal security policies are incomplete.",
          businessImpact: "Control ownership and audit readiness suffer.",
          controlDomain: "governance",
          impactedFrameworks: ["SOC 2"],
          evidence: ["No formal policy set"],
          tags: ["policy"]
        }
      ],
      systemicThemes: ["Governance"],
      notableStrengths: ["Leadership is engaged"],
      riskFlags: {
        noFormalSecurityPolicies: true,
        noAiGovernance: false,
        vendorRiskPresent: true,
        sensitiveDataExposure: false
      }
    },
    riskScoring: {
      complianceScore: 70,
      riskLevel: "Moderate",
      highCount: 1,
      moderateCount: 0,
      lowCount: 0,
      keyDrivers: ["Missing policy baseline", "Vendor review gaps"]
    },
    remediationRoadmap: {
      roadmapSummary: "Prioritize policy and vendor governance controls.",
      immediateActions: [
        {
          title: "Approve baseline policies",
          description: "Publish a formal policy baseline.",
          priority: "HIGH",
          ownerRole: "Security Lead",
          targetTimeline: "30 days"
        }
      ],
      nearTermActions: [],
      strategicActions: []
    },
    finalReport: {
      reportTitle: "Acme Health AI Audit",
      reportSubtitle: "Scale plan",
      executiveSummary: "Governance gaps remain but are remediable.",
      detailedReport: "Detailed report body",
      conclusion: "Focus on policy and vendor risk first."
    },
    metadata: {
      model: "gpt-4o-2024-08-06",
      reasoningModel: "o4-mini",
      timeoutMs: 20000,
      executionMs: 1200,
      nodeTimingsMs: {
        business_context: 100
      },
      contractVersion: "langgraph-audit.v1"
    },
    executiveSummary: "Governance gaps remain but are remediable.",
    postureScore: 70,
    riskLevel: "Moderate",
    topConcerns: ["Missing policy baseline"],
    findings: [
      {
        title: "Missing policy baseline",
        summary: "Formal security policies are incomplete.",
        severity: "HIGH",
        riskDomain: "governance",
        impactedFrameworks: ["SOC 2"],
        score: 35
      }
    ],
    recommendations: [
      {
        title: "Approve baseline policies",
        description: "Publish a formal policy baseline.",
        priority: "HIGH",
        ownerRole: "Security Lead",
        effort: "Medium",
        targetTimeline: "30 days"
      }
    ],
    roadmap: [
      {
        title: "Approve baseline policies",
        description: "Publish a formal policy baseline.",
        priority: "HIGH",
        ownerRole: "Security Lead",
        effort: "Medium",
        targetTimeline: "30 days"
      }
    ],
    finalReportText: "Detailed report body"
  });

  assert.equal(output.provider, "openai_langgraph");
  assert.equal(output.postureScore, 70);

  assert.throws(
    () =>
      auditWorkflowOutputSchema.parse({
        ...output,
        riskScoring: {
          ...output.riskScoring,
          complianceScore: 120
        }
      }),
    /less than or equal to 100/
  );

  assert.throws(
    () =>
      auditWorkflowOutputSchema.parse({
        ...output,
        finalReport: {
          ...output.finalReport,
          executiveSummary: "The client is fully compliant and guaranteed certification."
        }
      }),
    /unsafe content|guaranteed outcomes|absolute compliance claims/i
  );

  console.log("ai-execution-contracts tests passed");
}

runAiExecutionContractsTests();
