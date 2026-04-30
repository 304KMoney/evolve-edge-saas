import assert from "node:assert/strict";
import {
  businessContextOutputSchema,
  finalReportOutputSchema,
  frameworkMappingOutputSchema,
  remediationRoadmapOutputSchema,
  riskAnalysisOutputSchema,
  riskScoringOutputSchema,
} from "../src/server/ai/providers/types";
import {
  businessContextNode,
  finalReportNode,
  frameworkMapperNode,
  remediationRoadmapNode,
  riskAnalysisNode,
  riskScoringNode,
  type AuditNodeDependencies,
} from "../src/server/ai/workflows/audit/nodes";
import { buildInitialAuditWorkflowState } from "../src/server/ai/workflows/audit/state";
import { smallLawFirmFixture } from "../src/server/ai/evals/fixtures/small-law-firm.fixture";
import { buildMockWorkflowResponses } from "../src/server/ai/evals/mock-responses";
import type { ExecuteAuditWorkflowInput } from "../src/server/ai/providers/types";

function createStateFromFixture() {
  return buildInitialAuditWorkflowState({
    orgId: smallLawFirmFixture.orgId,
    assessmentId: smallLawFirmFixture.assessmentId,
    workflowDispatchId: smallLawFirmFixture.workflowDispatchId,
    dispatchId: smallLawFirmFixture.dispatchId,
    customerEmail: smallLawFirmFixture.customerEmail,
    companyName: smallLawFirmFixture.companyName,
    industry: smallLawFirmFixture.industry,
    companySize: smallLawFirmFixture.companySize,
    planTier: smallLawFirmFixture.planTier,
    selectedFrameworks: smallLawFirmFixture.selectedFrameworks,
    assessmentAnswers: Object.fromEntries(
      smallLawFirmFixture.assessmentAnswers.map(
        (answer: ExecuteAuditWorkflowInput["assessmentAnswers"][number]) => [
        answer.key ?? answer.question,
        {
          question: answer.question,
          answer: answer.answer,
          notes: answer.notes ?? null,
        },
      ])
    ),
    evidenceSummary: smallLawFirmFixture.evidenceSummary,
  });
}

function createDependencies(): AuditNodeDependencies {
  const responses = buildMockWorkflowResponses(smallLawFirmFixture);

  return {
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
  };
}

async function runAiWorkflowNodeRegressionTests() {
  const state = createStateFromFixture();
  const dependencies = createDependencies();

  const businessContextUpdate = await businessContextNode(state, dependencies);
  assert.doesNotThrow(() =>
    businessContextOutputSchema.parse(businessContextUpdate.businessContext)
  );

  const withBusinessContext = {
    ...state,
    ...businessContextUpdate,
  };

  const frameworkMappingUpdate = await frameworkMapperNode(
    withBusinessContext,
    dependencies
  );
  assert.doesNotThrow(() =>
    frameworkMappingOutputSchema.parse(frameworkMappingUpdate.frameworkMapping)
  );

  const withFrameworkMapping = {
    ...withBusinessContext,
    ...frameworkMappingUpdate,
  };

  const riskAnalysisUpdate = await riskAnalysisNode(withFrameworkMapping, dependencies);
  assert.doesNotThrow(() =>
    riskAnalysisOutputSchema.parse(riskAnalysisUpdate.riskAnalysis)
  );

  const withRiskAnalysis = {
    ...withFrameworkMapping,
    ...riskAnalysisUpdate,
  };

  const riskScoringUpdate = await riskScoringNode(withRiskAnalysis, dependencies);
  assert.doesNotThrow(() =>
    riskScoringOutputSchema.parse(riskScoringUpdate.riskScoring)
  );
  assert.equal(riskScoringUpdate.riskScoring?.complianceScore, 26);
  assert.equal(riskScoringUpdate.riskScoring?.riskLevel, "High");
  assert.equal(riskScoringUpdate.riskScoring?.highCount, 1);
  assert.equal(riskScoringUpdate.riskScoring?.moderateCount, 3);

  const withRiskScoring = {
    ...withRiskAnalysis,
    ...riskScoringUpdate,
  };

  const remediationRoadmapUpdate = await remediationRoadmapNode(
    withRiskScoring,
    dependencies
  );
  assert.doesNotThrow(() =>
    remediationRoadmapOutputSchema.parse(remediationRoadmapUpdate.remediationRoadmap)
  );

  const withRemediationRoadmap = {
    ...withRiskScoring,
    ...remediationRoadmapUpdate,
  };

  const finalReportUpdate = await finalReportNode(withRemediationRoadmap, dependencies);
  assert.doesNotThrow(() =>
    finalReportOutputSchema.parse(finalReportUpdate.finalReport)
  );
  assert.match(finalReportUpdate.finalReport?.executiveSummary ?? "", /prioritize/i);
  assert.match(finalReportUpdate.finalReport?.conclusion ?? "", /90-day/i);

  const invalidDependencies: AuditNodeDependencies = {
    defaultModel: "eval-mock-default",
    cheapModel: "eval-mock-cheap",
    strongModel: "eval-mock-strong",
    reasoningModel: null,
    timeoutMs: 5_000,
    callModel: async () => ({
      text: JSON.stringify({ invalid: true }),
    }),
  };

  await assert.rejects(
    () => businessContextNode(state, invalidDependencies),
    /required|invalid/i
  );

  console.log("ai-workflow-node-regression tests passed");
}

void runAiWorkflowNodeRegressionTests();
