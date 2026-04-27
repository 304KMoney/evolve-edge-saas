import assert from "node:assert/strict";
import { executeAuditWorkflowGraph } from "../src/server/ai/workflows/audit/graph";
import {
  AUDIT_WORKFLOW_NODE_SEQUENCE,
  buildAuditWorkflowResumePlan,
  createInMemoryAuditWorkflowCheckpointStore,
  createPrismaAuditWorkflowCheckpointStore,
} from "../src/server/ai/workflows/audit/checkpoints";
import { buildInitialAuditWorkflowState } from "../src/server/ai/workflows/audit/state";

function buildWorkflowInput(workflowDispatchId = "wd_checkpoint") {
  return {
    orgId: "org_123",
    assessmentId: "asm_123",
    workflowDispatchId,
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
    evidenceSummary: "Evidence is partial.",
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
          evidence: ["No policy package"],
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

async function runAuditWorkflowCheckpointTests() {
  {
    const { store, checkpoints } = createInMemoryAuditWorkflowCheckpointStore();
    const responses = buildResponses();
    const result = await executeAuditWorkflowGraph({
      workflowInput: buildWorkflowInput("wd_success"),
      dependencies: {
        checkpointStore: store,
        callModel: async () => ({ text: JSON.stringify(responses.shift()) }),
        defaultModel: "gpt-4o-2024-08-06",
        cheapModel: "gpt-4o-mini",
        strongModel: "o4-mini",
        reasoningModel: "o4-mini",
        timeoutMs: 20_000,
      },
    });

    assert.equal(result.status, "completed");
    assert.equal(checkpoints.length, AUDIT_WORKFLOW_NODE_SEQUENCE.length * 2);
    for (const nodeName of AUDIT_WORKFLOW_NODE_SEQUENCE) {
      assert.equal(
        checkpoints.some(
          (checkpoint) =>
            checkpoint.nodeName === nodeName && checkpoint.status === "RUNNING"
        ),
        true
      );
    }
    assert.equal(
      checkpoints.some(
        (checkpoint) =>
          checkpoint.nodeName === "final_report" &&
          checkpoint.status === "PAUSED_FOR_REVIEW"
      ),
      true
    );
  }

  {
    const { store, checkpoints } = createInMemoryAuditWorkflowCheckpointStore();
    const responses = buildResponses();
    await assert.rejects(() =>
      executeAuditWorkflowGraph({
        workflowInput: buildWorkflowInput("wd_failed"),
        dependencies: {
          checkpointStore: store,
          callModel: async ({ schemaName }) => {
            if (schemaName === "risk_analysis") {
              throw new Error("Risk analysis failed for buyer@example.com");
            }
            return { text: JSON.stringify(responses.shift()) };
          },
          defaultModel: "gpt-4o-2024-08-06",
          cheapModel: "gpt-4o-mini",
          strongModel: "o4-mini",
          reasoningModel: "o4-mini",
          timeoutMs: 20_000,
        },
      })
    );

    const failedCheckpoint = checkpoints[checkpoints.length - 1];
    assert.equal(failedCheckpoint.nodeName, "risk_analysis");
    assert.equal(failedCheckpoint.status, "FAILED");
    assert.doesNotMatch(JSON.stringify(failedCheckpoint), /buyer@example\.com/);
  }

  {
    const { store } = createInMemoryAuditWorkflowCheckpointStore();
    const attemptedNodes: string[] = [];
    const failedResponses = buildResponses();

    await assert.rejects(() =>
      executeAuditWorkflowGraph({
        workflowInput: buildWorkflowInput("wd_resume"),
        dependencies: {
          checkpointStore: store,
          callModel: async ({ schemaName }) => {
            attemptedNodes.push(schemaName);
            if (schemaName === "risk_analysis") {
              throw new Error("Resume me");
            }
            return { text: JSON.stringify(failedResponses.shift()) };
          },
          defaultModel: "gpt-4o-2024-08-06",
          cheapModel: "gpt-4o-mini",
          strongModel: "o4-mini",
          reasoningModel: "o4-mini",
          timeoutMs: 20_000,
        },
      })
    );

    const resumePlan = await buildAuditWorkflowResumePlan({
      workflowInput: buildWorkflowInput("wd_resume"),
      checkpointStore: store,
    });
    assert.equal(resumePlan.mode, "resume_failed");
    assert.equal(resumePlan.nextNodeIndex, 2);

    const resumedNodes: string[] = [];
    const resumedResponses = buildResponses().slice(2);
    const resumedResult = await executeAuditWorkflowGraph({
      workflowInput: buildWorkflowInput("wd_resume"),
      dependencies: {
        checkpointStore: store,
        callModel: async ({ schemaName }) => {
          resumedNodes.push(schemaName);
          return { text: JSON.stringify(resumedResponses.shift()) };
        },
        defaultModel: "gpt-4o-2024-08-06",
        cheapModel: "gpt-4o-mini",
        strongModel: "o4-mini",
        reasoningModel: "o4-mini",
        timeoutMs: 20_000,
      },
    });

    assert.equal(resumedResult.status, "completed");
    assert.deepEqual(resumedNodes, [
      "risk_analysis",
      "risk_scoring",
      "remediation_roadmap",
      "final_report",
    ]);
  }

  {
    const schemaDriftError = Object.assign(
      new Error("The table `public.AuditWorkflowCheckpoint` does not exist in the current database."),
      {
        name: "PrismaClientKnownRequestError",
        code: "P2021",
      }
    );

    const store = createPrismaAuditWorkflowCheckpointStore({
      analysisJob: {
        findFirst: async () => ({ id: "job_123" }),
      },
      auditWorkflowCheckpoint: {
        create: async () => {
          throw schemaDriftError;
        },
        findMany: async () => {
          throw schemaDriftError;
        },
      },
    } as any);

    const listedBeforeWrite = await store.listCheckpoints("wd_schema_drift");
    assert.deepEqual(listedBeforeWrite, []);

    const writtenCheckpoint = await store.writeCheckpoint({
      workflowDispatchId: "wd_schema_drift",
      dispatchId: "disp_123",
      orgId: "org_123",
      assessmentId: "asm_123",
      nodeName: "business_context",
      status: "RUNNING",
      state: buildInitialAuditWorkflowState({
        orgId: "org_123",
        assessmentId: "asm_123",
        workflowDispatchId: "wd_schema_drift",
        dispatchId: "disp_123",
        customerEmail: "buyer@example.com",
        companyName: "Acme Health",
        industry: "Healthcare",
        companySize: "51-200",
        planTier: "scale",
        selectedFrameworks: ["SOC 2"],
        assessmentAnswers: {},
        evidenceSummary: null,
      }),
    });

    assert.equal(writtenCheckpoint.nodeName, "business_context");
    assert.equal(writtenCheckpoint.status, "RUNNING");

    const listedAfterWrite = await store.listCheckpoints("wd_schema_drift");
    assert.equal(listedAfterWrite.length, 1);
    assert.equal(listedAfterWrite[0]?.nodeName, "business_context");
  }

  console.log("audit-workflow-checkpoints tests passed");
}

void runAuditWorkflowCheckpointTests();
