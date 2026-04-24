import assert from "node:assert/strict";
import {
  AI_WORKFLOW_FEEDBACK_TYPES,
  buildEvalFeedbackSignal,
  extractWorkflowDispatchIdFromReportJson,
  getOrganizationAiFeedbackSummary,
  recordAiWorkflowFeedback,
  sanitizeAiFeedbackNotes,
} from "../src/server/ai/feedback";

async function runAiFeedbackTests() {
  {
    const sanitized = sanitizeAiFeedbackNotes(
      "Email buyer@example.com and use sk-test-secret to fix the score."
    );

    assert.equal(sanitized?.includes("buyer@example.com"), false);
    assert.equal(sanitized?.includes("sk-test-secret"), false);
    assert.match(sanitized ?? "", /\[REDACTED_EMAIL\]/);
    assert.match(sanitized ?? "", /\[REDACTED_SECRET\]/);
  }

  {
    let createdNotificationCount = 0;
    const recorded = await recordAiWorkflowFeedback({
      workflowDispatchId: "wd_123",
      organizationId: "org_123",
      reportId: "rpt_123",
      feedbackType: AI_WORKFLOW_FEEDBACK_TYPES.REJECTED,
      notes: "Customer email buyer@example.com says the roadmap and score are wrong.",
      db: {
        aiWorkflowFeedback: {
          create: async ({ data }: { data: Record<string, unknown> }) => ({
            id: "fb_123",
            ...data,
          }),
          count: async () => 3,
        },
        notification: {
          create: async () => {
            createdNotificationCount += 1;
            return { id: "ntf_123" };
          },
        },
      } as any,
    });

    assert.equal(recorded.workflowDispatchId, "wd_123");
    assert.equal(recorded.organizationId, "org_123");
    assert.equal(recorded.reportId, "rpt_123");
    assert.equal(recorded.feedbackType, AI_WORKFLOW_FEEDBACK_TYPES.REJECTED);
    assert.equal(String(recorded.notes).includes("buyer@example.com"), false);
    assert.equal(createdNotificationCount, 1);
  }

  {
    const workflowDispatchId = extractWorkflowDispatchIdFromReportJson({
      workflowMetadata: {
        workflowDispatchId: "wd_linked",
      },
    });

    assert.equal(workflowDispatchId, "wd_linked");
  }

  {
    const evalSignal = buildEvalFeedbackSignal([
      {
        name: "valid structured output",
        passed: false,
      },
      {
        name: "final report is executive ready",
        passed: false,
      },
      {
        name: "framework mapping is relevant",
        passed: true,
      },
    ]);

    assert.equal(evalSignal.flagged, true);
    assert.deepEqual(evalSignal.failureCategories.sort(), [
      "eval_flagged",
      "final_report_quality",
      "structured_output",
    ]);
  }

  {
    const summary = await getOrganizationAiFeedbackSummary({
      organizationId: "org_123",
      db: {
        aiWorkflowFeedback: {
          findMany: async () => [
            {
              feedbackType: AI_WORKFLOW_FEEDBACK_TYPES.APPROVED,
              metadataJson: {
                categories: ["approval"],
              },
              createdAt: new Date(),
            },
            {
              feedbackType: AI_WORKFLOW_FEEDBACK_TYPES.REJECTED,
              metadataJson: {
                categories: ["review_rejected", "risk_scoring"],
              },
              createdAt: new Date(),
            },
            {
              feedbackType: AI_WORKFLOW_FEEDBACK_TYPES.FLAGGED,
              metadataJson: {
                categories: ["eval_flagged", "final_report_quality"],
              },
              createdAt: new Date(),
            },
          ],
        },
      } as any,
    });

    assert.equal(summary.approvalRate, 50);
    assert.equal(summary.rejectionRate, 50);
    assert.equal(summary.flaggedCount, 1);
    assert.equal(summary.topFailureCategories[0]?.category, "review_rejected");
    assert.ok(
      summary.promptWeaknesses.some((entry) => entry.node === "final_report")
    );
  }

  console.log("ai-feedback tests passed");
}

void runAiFeedbackTests();
