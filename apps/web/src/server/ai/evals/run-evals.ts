import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { auditEvalFixtures } from "./fixtures";
import { auditEvalGoldens } from "./golden";
import { buildMockWorkflowResponses } from "./mock-responses";
import type {
  EvalCheckResult,
  EvalFixture,
  EvalFixtureResult,
  EvalGoldenExpectation,
  EvalSummary,
} from "./types";
import { auditWorkflowOutputSchema, type AuditWorkflowOutput } from "../providers/types";
import { executeAuditWorkflowGraph } from "../workflows/audit/graph";
import { OpenAiLangGraphProvider } from "../providers/openai-langgraph";
import { buildEvalFeedbackSignal } from "../feedback";
import {
  getAiExecutionEnterpriseMaxInputChars,
  getAiExecutionMaxInputChars,
  getAiExecutionScaleMaxInputChars,
  getAiExecutionStarterMaxInputChars,
  getAiExecutionTimeoutMs,
  getOpenAIApiKey,
  getOpenAICheapModel,
  getOpenAICheapModelInputCostPer1M,
  getOpenAICheapModelOutputCostPer1M,
  getOpenAIModel,
  getOpenAIReasoningModel,
  getOpenAIStrongModel,
  getOpenAIStrongModelInputCostPer1M,
  getOpenAIStrongModelOutputCostPer1M,
} from "../../../../lib/runtime-config";

const INTERNAL_DETAIL_PATTERNS = [
  /langgraph/i,
  /openai api key/i,
  /internal prompt/i,
  /workflowdispatchid/i,
  /dispatchid/i,
  /assessmentid/i,
  /org_eval_/i,
];

const LEGAL_OVERCLAIM_PATTERNS = [
  /guaranteed compliance/i,
  /guaranteed certification/i,
  /fully compliant/i,
  /no risk remains/i,
  /legal advice/i,
];

const EXECUTIVE_TONE_PATTERNS = [
  /risk/i,
  /governance/i,
  /compliance/i,
  /remediation/i,
  /operational/i,
  /executive/i,
];

type RunEvalOptions = {
  live?: boolean;
};

export async function runAuditEvals(options: RunEvalOptions = {}): Promise<EvalSummary> {
  const mode: "mock" | "live" = options.live ? "live" : "mock";
  const results: EvalFixtureResult[] = [];

  for (const fixture of auditEvalFixtures) {
    const golden = getGoldenExpectation(fixture.fixtureId);
    const output = await executeFixtureWorkflow(fixture, mode);
    const checks = evaluateWorkflowOutput({
      fixture,
      golden,
      output,
    });
    const feedbackSignal = buildEvalFeedbackSignal(checks);

    results.push({
      fixtureId: fixture.fixtureId,
      label: fixture.label,
      passed: checks.every((check) => check.passed),
      flagged: feedbackSignal.flagged,
      mode,
      provider: output.provider,
      failureCategories: feedbackSignal.failureCategories,
      checks,
      output,
    });
  }

  return {
    mode,
    total: results.length,
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    fixtures: results,
  };
}

export function evaluateWorkflowOutput(input: {
  fixture: EvalFixture;
  golden: EvalGoldenExpectation;
  output: AuditWorkflowOutput;
}): EvalCheckResult[] {
  const checks: EvalCheckResult[] = [];
  const outputJson = JSON.stringify(input.output);
  const customerVisibleText = buildCustomerVisibleText(input.output);
  const lowerVisibleText = customerVisibleText.toLowerCase();
  const prioritizedFrameworks = input.output.frameworkMapping.prioritizedFrameworks;
  const findings = input.output.riskAnalysis.findings;
  const allFindingSeverities = findings.map(
    (finding: AuditWorkflowOutput["riskAnalysis"]["findings"][number]) => finding.severity
  );
  const allFindingDomains = findings.map(
    (finding: AuditWorkflowOutput["riskAnalysis"]["findings"][number]) =>
      finding.controlDomain.toLowerCase()
  );
  const reportSections = buildRenderedSectionPresence(input.output);
  const sensitiveTokens = [
    input.fixture.customerEmail ?? "",
    input.fixture.workflowDispatchId,
    input.fixture.dispatchId,
    input.fixture.orgId,
    input.fixture.assessmentId,
  ]
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  const parsedJson = auditWorkflowOutputSchema.safeParse(JSON.parse(outputJson));
  checks.push({
    name: "valid structured output",
    passed: parsedJson.success,
    details: parsedJson.success ? undefined : parsedJson.error.message,
  });

  checks.push({
    name: "required report sections exist",
    passed: input.golden.requiredReportSections.every((section) => reportSections.has(section)),
    details: input.golden.requiredReportSections
      .filter((section) => !reportSections.has(section))
      .join(", "),
  });

  checks.push({
    name: "risk score is within expected range",
    passed:
      input.output.riskScoring.complianceScore >= input.golden.expectedScoreRange.min &&
      input.output.riskScoring.complianceScore <= input.golden.expectedScoreRange.max,
    details: `score=${input.output.riskScoring.complianceScore}`,
  });

  checks.push({
    name: "framework mapping is relevant",
    passed: input.golden.relevantFrameworks.every((framework) =>
      prioritizedFrameworks.some(
        (value: string) => value.toLowerCase() === framework.toLowerCase()
      )
    ),
    details: prioritizedFrameworks.join(", "),
  });

  checks.push({
    name: "minimum risk categories are covered",
    passed: input.golden.minimumRiskCategories.every((category) =>
      allFindingDomains.includes(category.toLowerCase())
    ),
    details: allFindingDomains.join(", "),
  });

  checks.push({
    name: "finding severities stay in expected range",
    passed: allFindingSeverities.every((severity: "Low" | "Moderate" | "High") =>
      input.golden.allowedSeverities.includes(severity)
    ),
    details: allFindingSeverities.join(", "),
  });

  checks.push({
    name: "sensitive fixture data is not reproduced unnecessarily",
    passed: sensitiveTokens.every((token) => !lowerVisibleText.includes(token.toLowerCase())),
    details: sensitiveTokens
      .filter((token) => lowerVisibleText.includes(token.toLowerCase()))
      .join(", "),
  });

  checks.push({
    name: "internal implementation details are not exposed",
    passed: INTERNAL_DETAIL_PATTERNS.every((pattern) => !pattern.test(customerVisibleText)),
    details: INTERNAL_DETAIL_PATTERNS.filter((pattern) => pattern.test(customerVisibleText))
      .map((pattern) => pattern.source)
      .join(", "),
  });

  checks.push({
    name: "no hallucinated legal guarantees appear",
    passed:
      LEGAL_OVERCLAIM_PATTERNS.every((pattern) => !pattern.test(customerVisibleText)) &&
      input.golden.prohibitedContent.every(
        (value) => !lowerVisibleText.includes(value.toLowerCase())
      ),
    details: input.golden.prohibitedContent
      .filter((value) => lowerVisibleText.includes(value.toLowerCase()))
      .join(", "),
  });

  checks.push({
    name: "final report is executive ready",
    passed: isExecutiveReady(input.output),
    details: input.output.finalReport.executiveSummary,
  });

  return checks;
}

async function executeFixtureWorkflow(
  fixture: EvalFixture,
  mode: "mock" | "live"
): Promise<AuditWorkflowOutput> {
  if (mode === "live") {
    const provider = new OpenAiLangGraphProvider({
      apiKey: getOpenAIApiKey(),
      model: getOpenAIModel(),
      cheapModel: getOpenAICheapModel(),
      strongModel: getOpenAIStrongModel(),
      reasoningModel: getOpenAIReasoningModel(),
      timeoutMs: getAiExecutionTimeoutMs(),
      maxInputChars: getAiExecutionMaxInputChars(),
      planInputCharLimits: {
        starter: getAiExecutionStarterMaxInputChars(),
        scale: getAiExecutionScaleMaxInputChars(),
        enterprise: getAiExecutionEnterpriseMaxInputChars(),
      },
      pricing: {
        cheapInputPer1M: getOpenAICheapModelInputCostPer1M(),
        cheapOutputPer1M: getOpenAICheapModelOutputCostPer1M(),
        strongInputPer1M: getOpenAIStrongModelInputCostPer1M(),
        strongOutputPer1M: getOpenAIStrongModelOutputCostPer1M(),
      },
    });
    return provider.executeAuditWorkflow(fixture);
  }

  const mockedResponses = buildMockWorkflowResponses(fixture);
  return executeAuditWorkflowGraph({
    workflowInput: fixture,
    dependencies: {
      defaultModel: "eval-mock-default",
      cheapModel: "eval-mock-cheap",
      strongModel: "eval-mock-strong",
      reasoningModel: "eval-mock-reasoning",
      timeoutMs: 5_000,
      callModel: async ({ schemaName }) => {
        const response = mockedResponses[schemaName as keyof typeof mockedResponses];
        assert.ok(response, `No mocked response exists for schema ${schemaName}.`);
        return {
          text: JSON.stringify(response),
        };
      },
    },
  });
}

function getGoldenExpectation(fixtureId: string): EvalGoldenExpectation {
  const golden = auditEvalGoldens.find((entry) => entry.fixtureId === fixtureId);
  assert.ok(golden, `No golden expectation found for fixture ${fixtureId}.`);
  return golden;
}

function buildRenderedSectionPresence(output: AuditWorkflowOutput) {
  const sections = new Set<string>();

  if (output.finalReport.executiveSummary.trim()) {
    sections.add("executiveSummary");
  }
  if (output.riskScoring.riskLevel.trim() && output.riskAnalysis.summary.trim()) {
    sections.add("overallRiskPosture");
  }
  if (Number.isFinite(output.riskScoring.complianceScore)) {
    sections.add("complianceScore");
  }
  if (output.riskAnalysis.findings.length > 0) {
    sections.add("topFindings");
  }
  if (
    output.riskAnalysis.systemicThemes.length > 0 ||
    Object.values(output.riskAnalysis.riskFlags).some(Boolean)
  ) {
    sections.add("complianceAndGovernanceGaps");
  }
  if (
    output.remediationRoadmap.immediateActions.length > 0 &&
    output.remediationRoadmap.nearTermActions.length >= 0 &&
    output.remediationRoadmap.strategicActions.length >= 0
  ) {
    sections.add("roadmap306090");
  }
  if (output.topConcerns.length > 0) {
    sections.add("executiveBriefingTalkingPoints");
  }
  if (output.finalReport.conclusion.trim()) {
    sections.add("closingAdvisoryNote");
  }

  return sections;
}

function buildCustomerVisibleText(output: AuditWorkflowOutput) {
  return [
    output.finalReport.reportTitle,
    output.finalReport.reportSubtitle ?? "",
    output.finalReport.executiveSummary,
    output.finalReport.detailedReport,
    output.finalReport.conclusion,
    output.riskAnalysis.summary,
    ...output.riskAnalysis.findings.flatMap((finding) => [
      finding.title,
      finding.summary,
      finding.businessImpact,
      ...finding.evidence,
    ]),
    ...output.riskScoring.keyDrivers,
    ...output.topConcerns,
    ...output.remediationRoadmap.immediateActions.flatMap((action) => [
      action.title,
      action.description,
    ]),
    ...output.remediationRoadmap.nearTermActions.flatMap((action) => [
      action.title,
      action.description,
    ]),
    ...output.remediationRoadmap.strategicActions.flatMap((action) => [
      action.title,
      action.description,
    ]),
  ].join(" ");
}

function isExecutiveReady(output: AuditWorkflowOutput) {
  const reportText = [
    output.finalReport.reportTitle,
    output.finalReport.executiveSummary,
    output.finalReport.detailedReport,
    output.finalReport.conclusion,
    output.riskAnalysis.summary,
  ].join(" ");

  const patternCount = EXECUTIVE_TONE_PATTERNS.filter((pattern) =>
    pattern.test(reportText)
  ).length;

  return (
    output.finalReport.reportTitle.trim().length >= 10 &&
    output.finalReport.executiveSummary.trim().length >= 80 &&
    output.finalReport.detailedReport.trim().length >= 180 &&
    output.finalReport.conclusion.trim().length >= 60 &&
    output.riskAnalysis.findings.length >= 3 &&
    patternCount >= 4
  );
}

export function formatEvalSummary(summary: EvalSummary) {
  const lines = [
    `AI evaluation mode: ${summary.mode}`,
    `Fixtures: ${summary.passed}/${summary.total} passed`,
  ];

  for (const fixture of summary.fixtures) {
    lines.push(
      `- ${fixture.label} (${fixture.fixtureId}): ${fixture.passed ? "PASS" : "FAIL"}${fixture.flagged ? ` [flagged: ${fixture.failureCategories.join(", ")}]` : ""}`
    );
    for (const check of fixture.checks) {
      lines.push(
        `  - ${check.passed ? "PASS" : "FAIL"} ${check.name}${check.details ? ` (${check.details})` : ""}`
      );
    }
  }

  return lines.join("\n");
}

async function main() {
  const live = process.argv.includes("--live") || process.env.AI_EVAL_LIVE === "true";
  const summary = await runAuditEvals({ live });
  console.log(formatEvalSummary(summary));

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
