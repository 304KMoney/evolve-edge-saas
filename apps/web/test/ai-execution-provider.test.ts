import assert from "node:assert/strict";
import { getAuditAiExecutionProvider } from "../lib/ai-provider";
import { getAiExecutionProvider } from "../lib/runtime-config";
import { DifyDeprecatedProvider } from "../src/server/ai/providers/dify-deprecated";

async function runAiExecutionProviderTests() {
  delete process.env.AI_EXECUTION_PROVIDER;
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.OPENAI_MODEL = "gpt-4o-2024-08-06";
  assert.equal(getAiExecutionProvider(), "openai_langgraph");
  assert.equal(getAuditAiExecutionProvider().provider, "openai_langgraph");

  process.env.AI_EXECUTION_PROVIDER = "dify";
  assert.equal(getAiExecutionProvider(), "dify");
  assert.equal(getAuditAiExecutionProvider().provider, "dify");

  await assert.rejects(
    () =>
      new DifyDeprecatedProvider().executeAuditWorkflow({
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
        evidenceSummary: "No evidence supplied.",
        planTier: "scale"
      }),
    /deprecated/
  );

  delete process.env.AI_EXECUTION_PROVIDER;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;

  console.log("ai-execution-provider tests passed");
}

void runAiExecutionProviderTests();
