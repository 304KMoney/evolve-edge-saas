import assert from "node:assert/strict";
import { handleAiExecutionDispatch } from "../lib/ai-execution-route";

async function runAiExecuteRouteTests() {
  const createdJobs: Array<Record<string, unknown>> = [];
  const updatedAssessments: Array<Record<string, unknown>> = [];
  let dispatchLookupCount = 0;

  const mockDb = {
    assessment: {
      async findUnique() {
        return {
          id: "asm_123",
          organizationId: "org_123"
        };
      },
      async update(input: Record<string, unknown>) {
        updatedAssessments.push(input);
        return input;
      }
    },
    analysisJob: {
      async findFirst(input?: Record<string, unknown>) {
        dispatchLookupCount += 1;
        if (dispatchLookupCount === 1) {
          return null;
        }
        if (
          input?.where &&
          JSON.stringify(input.where).includes("workflowDispatchId")
        ) {
          return {
            id: "job_existing",
            status: "QUEUED"
          };
        }
        return null;
      },
      async create(input: Record<string, unknown>) {
        createdJobs.push(input);
        return input;
      },
      async update(input: Record<string, unknown>) {
        createdJobs.push(input);
        return input;
      }
    },
    workflowDispatch: {
      async findUnique() {
        return {
          routingSnapshot: {
            id: "rs_123",
            organizationId: "org_123",
            workflowCode: "audit_scale",
            status: "DISPATCHED",
            normalizedHintsJson: {
              workflow_code: "audit_scale",
              entitlement_source: "subscription",
              capability_profile: {
                report_depth: "enhanced",
                max_findings: 10,
                roadmap_detail: "detailed",
                executive_briefing_eligible: true,
                monitoring_add_on_eligible: true,
                add_on_eligible: true
              }
            }
          }
        };
      }
    }
  };

  const result = await handleAiExecutionDispatch(
    {
      orgId: "org_123",
      assessmentId: "asm_123",
      workflowDispatchId: "wd_123",
      dispatchId: "disp_123",
      customerEmail: "buyer@example.com",
      companyName: "Acme",
      industry: "Healthcare",
      companySize: "51-200",
      selectedFrameworks: ["SOC 2"],
      assessmentAnswers: [
        {
          question: "Do you have formal policies?",
          answer: "No"
        }
      ],
      evidenceSummary: "No policy artifacts were provided.",
      planTier: "scale"
    },
    {
      db: mockDb as never,
      auditReadinessOverride: true
    }
  );

  assert.equal(result.accepted, true);
  assert.equal(result.provider, "openai_langgraph");
  assert.equal(result.status, "queued");
  assert.equal(result.nextCallbackExpected, true);
  assert.equal(createdJobs.length, 1);
  assert.equal(updatedAssessments.length, 1);
  assert.equal(
    ((createdJobs[0]?.data as Record<string, unknown>)?.inputPayload as Record<string, unknown>)
      ?.commercialRouting
      ? true
      : false,
    true
  );
  assert.equal(
    ((createdJobs[0]?.data as Record<string, unknown>)?.inputPayload as Record<string, unknown>)
      ?.routingSnapshotId,
    "rs_123"
  );

  const duplicateResult = await handleAiExecutionDispatch(
    {
      orgId: "org_123",
      assessmentId: "asm_123",
      workflowDispatchId: "wd_123",
      dispatchId: "disp_123",
      customerEmail: "buyer@example.com",
      companyName: "Acme",
      industry: "Healthcare",
      companySize: "51-200",
      selectedFrameworks: ["SOC 2"],
      assessmentAnswers: [
        {
          question: "Do you have formal policies?",
          answer: "No"
        }
      ],
      evidenceSummary: "No policy artifacts were provided.",
      planTier: "scale"
    },
    {
      db: mockDb as never,
      auditReadinessOverride: true
    }
  );

  assert.equal(duplicateResult.status, "queued");
  assert.equal(createdJobs.length, 1);
  assert.equal(updatedAssessments.length, 1);

  await assert.rejects(
    () =>
      handleAiExecutionDispatch(
        {
          orgId: "org_123",
          assessmentId: "asm_123",
          workflowDispatchId: "",
          dispatchId: "disp_123",
          customerEmail: "buyer@example.com",
          companyName: "Acme",
          industry: "Healthcare",
          companySize: "51-200",
          selectedFrameworks: ["SOC 2"],
          assessmentAnswers: [
            {
              question: "Do you have formal policies?",
              answer: "No"
            }
          ],
          evidenceSummary: "No policy artifacts were provided.",
          planTier: "scale"
        } as never,
        {
          db: mockDb as never,
          auditReadinessOverride: true
        }
      ),
    /String must contain at least 1 character/
  );

  const blockedResult = await handleAiExecutionDispatch(
    {
      orgId: "org_123",
      assessmentId: "asm_123",
      workflowDispatchId: "wd_blocked",
      dispatchId: "disp_blocked",
      customerEmail: "buyer@example.com",
      companyName: "Acme",
      industry: "Healthcare",
      companySize: "51-200",
      selectedFrameworks: ["SOC 2"],
      assessmentAnswers: [
        {
          question: "Do you have formal policies?",
          answer: "No"
        }
      ],
      evidenceSummary: "No policy artifacts were provided.",
      planTier: "scale"
    },
    {
      db: mockDb as never,
      auditReadinessOverride: false
    }
  );

  assert.equal(blockedResult.accepted, false);
  assert.equal(blockedResult.status, "blocked");
  assert.equal(blockedResult.code, "intake_incomplete");

  console.log("ai-execute-route tests passed");
}

void runAiExecuteRouteTests();
