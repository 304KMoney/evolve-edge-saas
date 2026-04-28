import assert from "node:assert/strict";
import { executeAuditWorkflowGraph } from "../src/server/ai/workflows/audit/graph";
import {
  clearWorkflowTrace,
  getWorkflowTraceSnapshot,
  replayWorkflow,
} from "../src/server/ai/observability/workflow-tracker";

function buildWorkflowInput() {
  return {
    orgId: "org_123",
    assessmentId: "asm_123",
    workflowDispatchId: "wd_123",
    dispatchId: "disp_123",
    customerEmail: "buyer@example.com",
    companyName: "Acme Health",
    industry: "Healthcare",
    companySize: "51-200",
    selectedFrameworks: ["SOC 2"],
    assessmentAnswers: [
      {
        question: "Do you have formal security policies?",
        answer: "No",
      },
    ],
    evidenceSummary: "Contact the account owner for missing artifacts.",
    planTier: "scale" as const,
  };
}

function buildResponses() {
  return [
    {
      companyName: "Acme Health",
      industry: "Healthcare",
      companySize: "51-200",
      summary: "Healthcare SaaS company handling moderate-risk workflows.",
      operatingModel: "B2B SaaS",
      businessPriorities: ["Governance"],
      securityMaturitySignals: ["Assumption: policies are incomplete."],
    },
    {
      selectedFrameworks: ["SOC 2"],
      prioritizedFrameworks: ["SOC 2"],
      coverageSummary: "SOC 2 is the primary framework.",
      mappings: [
        {
          framework: "SOC 2",
          rationale: "Core customer trust requirement.",
          applicableAreas: ["Access control"],
        },
      ],
    },
    {
      summary: "Policy and vendor governance gaps are present.",
      findings: [
        {
          title: "Policy gap",
          severity: "High",
          summary: "Formal security policies are incomplete.",
          businessImpact: "Audit readiness is reduced.",
          controlDomain: "governance",
          impactedFrameworks: ["SOC 2"],
          evidence: ["No policy package", "Escalate to the account owner"],
          tags: ["policy"],
        },
      ],
      systemicThemes: ["Governance"],
      notableStrengths: ["Leadership buy-in"],
      riskFlags: {
        noFormalSecurityPolicies: true,
        noAiGovernance: false,
        vendorRiskPresent: true,
        sensitiveDataExposure: false,
      },
    },
    {
      complianceScore: 70,
      riskLevel: "Moderate",
      highCount: 1,
      moderateCount: 0,
      lowCount: 0,
      keyDrivers: ["Policy gap", "Vendor review risk"],
    },
    {
      roadmapSummary: "Start with policy remediation.",
      immediateActions: [
        {
          title: "Approve policies",
          description: "Publish baseline policies.",
          priority: "HIGH",
          ownerRole: "Security Lead",
          targetTimeline: "30 days",
        },
      ],
      nearTermActions: [],
      strategicActions: [],
    },
    {
      reportTitle: "Acme Health Audit",
      reportSubtitle: "Scale plan",
      executiveSummary: "The audit found governance gaps.",
      detailedReport: "Detailed report body",
      conclusion: "Resolve policy gaps first.",
    },
  ];
}

async function runWorkflowObservabilityTests() {
  process.env.AI_DEBUG_MODE = "true";
  clearWorkflowTrace("wd_123");

  const responses = buildResponses();
  const result = await executeAuditWorkflowGraph({
    workflowInput: buildWorkflowInput(),
    dependencies: {
      callModel: async () => ({ text: JSON.stringify(responses.shift()) }),
      defaultModel: "gpt-4o-2024-08-06",
      cheapModel: "gpt-4o-mini",
      strongModel: "o4-mini",
      reasoningModel: "o4-mini",
      timeoutMs: 20_000,
    },
  });

  assert.equal(result.status, "completed");
  const trace = getWorkflowTraceSnapshot("wd_123", { includeDebug: true });
  assert.equal(trace?.status, "completed");
  assert.equal(trace?.nodes.length, 6);
  assert.equal(trace?.nodes[0]?.name, "business_context");
  assert.match(JSON.stringify(trace), /\[REDACTED_EMAIL\]/);

  clearWorkflowTrace("wd_123");
  const failingResponses = buildResponses();
  await assert.rejects(() =>
    executeAuditWorkflowGraph({
      workflowInput: buildWorkflowInput(),
      dependencies: {
        callModel: async ({ schemaName }) => {
          if (schemaName === "risk_analysis") {
            throw new Error("Risk analysis failed for buyer@example.com");
          }
          return { text: JSON.stringify(failingResponses.shift()) };
        },
        defaultModel: "gpt-4o-2024-08-06",
        cheapModel: "gpt-4o-mini",
        strongModel: "o4-mini",
        reasoningModel: "o4-mini",
        timeoutMs: 20_000,
      },
    })
  );

  const failedTrace = getWorkflowTraceSnapshot("wd_123", { includeDebug: true });
  assert.equal(failedTrace?.status, "failed");
  assert.equal(failedTrace?.node, "risk_analysis");
  assert.equal(failedTrace?.reason, "node_execution_failed");
  assert.doesNotMatch(JSON.stringify(failedTrace), /buyer@example\.com/);

  const replayResult = await replayWorkflow("wd_replay", {
    dryRun: true,
    db: {
      analysisJob: {
        async findFirst() {
          return {
            id: "job_123",
            inputPayload: buildWorkflowInput(),
            outputPayload: null,
          };
        },
      },
    } as never,
    provider: {
      async executeAuditWorkflow() {
        return result;
      },
    },
  });

  assert.equal(replayResult.workflowDispatchId, "wd_replay");
  assert.equal(replayResult.dryRun, true);

  delete process.env.AI_DEBUG_MODE;
  console.log("workflow-observability tests passed");
}

void runWorkflowObservabilityTests();
