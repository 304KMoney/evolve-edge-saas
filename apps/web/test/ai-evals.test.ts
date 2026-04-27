import assert from "node:assert/strict";
import { smallLawFirmFixture } from "../src/server/ai/evals/fixtures/small-law-firm.fixture";
import { smallLawFirmGolden } from "../src/server/ai/evals/golden/small-law-firm.golden";
import {
  evaluateWorkflowOutput,
  runAuditEvals,
} from "../src/server/ai/evals/run-evals";
import { buildMockWorkflowResponses } from "../src/server/ai/evals/mock-responses";
import { executeAuditWorkflowGraph } from "../src/server/ai/workflows/audit/graph";

async function buildMockedOutput() {
  const responses = buildMockWorkflowResponses(smallLawFirmFixture);

  return executeAuditWorkflowGraph({
    workflowInput: smallLawFirmFixture,
    dependencies: {
      defaultModel: "eval-mock-default",
      cheapModel: "eval-mock-cheap",
      strongModel: "eval-mock-strong",
      reasoningModel: "eval-mock-reasoning",
      timeoutMs: 5_000,
      callModel: async ({ schemaName }) => ({
        text: JSON.stringify(
          responses[schemaName as keyof typeof responses] ?? { invalid: true }
        ),
      }),
    },
  });
}

async function runAiEvalTests() {
  const summary = await runAuditEvals();
  assert.equal(summary.mode, "mock");
  assert.equal(summary.failed, 0);
  assert.equal(summary.passed, summary.total);
  assert.equal(summary.total, 3);
  assert.ok(summary.fixtures.every((fixture) => fixture.provider === "openai_langgraph"));

  const validOutput = await buildMockedOutput();
  const validChecks = evaluateWorkflowOutput({
    fixture: smallLawFirmFixture,
    golden: smallLawFirmGolden,
    output: validOutput,
  });
  assert.ok(validChecks.every((check) => check.passed));

  const degradedOutput = {
    ...validOutput,
    finalReport: {
      ...validOutput.finalReport,
      executiveSummary: "Short summary.",
      detailedReport: "Brief note only.",
      conclusion: "",
    },
    topConcerns: [],
  };

  const degradedChecks = evaluateWorkflowOutput({
    fixture: smallLawFirmFixture,
    golden: smallLawFirmGolden,
    output: degradedOutput,
  });

  const failedCheckNames = degradedChecks
    .filter((check) => !check.passed)
    .map((check) => check.name);

  assert.ok(failedCheckNames.includes("required report sections exist"));
  assert.ok(failedCheckNames.includes("final report is executive ready"));

  console.log("ai-evals tests passed");
}

void runAiEvalTests();
