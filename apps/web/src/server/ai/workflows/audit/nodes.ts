import type { AuditWorkflowState } from "./state";
import type {
  BusinessContextOutput,
  ExecuteAuditWorkflowInput,
  FinalReportOutput,
  FrameworkMappingOutput,
  RemediationRoadmapOutput,
  RiskAnalysisOutput,
  RiskScoringOutput,
} from "../../providers/types";
import {
  computeComplianceScore,
  countFindings,
  determineRiskLevel,
} from "../../providers/risk-scoring";
import { buildBusinessContextPrompt } from "../../prompts/business-context.prompt";
import { buildFrameworkMapperPrompt } from "../../prompts/framework-mapper.prompt";
import { buildRiskAnalysisPrompt } from "../../prompts/risk-analysis.prompt";
import { buildRiskScoringPrompt } from "../../prompts/risk-scoring.prompt";
import { buildRemediationRoadmapPrompt } from "../../prompts/remediation-roadmap.prompt";
import { buildFinalReportPrompt } from "../../prompts/final-report.prompt";
import {
  normalizeBusinessContext,
  normalizeFinalReport,
  normalizeFrameworkMapping,
  normalizeRemediationRoadmap,
  normalizeRiskAnalysis,
  normalizeRiskScoring,
} from "../../normalizers";

export type AuditNodeModelCall = (input: {
  schemaName: string;
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  timeoutMs?: number;
}) => Promise<unknown>;

export type AuditNodeDependencies = {
  callModel: AuditNodeModelCall;
  defaultModel: string;
  reasoningModel: string | null;
  cheapModel: string;
  strongModel: string;
  timeoutMs: number;
};

export async function businessContextNode(
  state: AuditWorkflowState,
  dependencies: AuditNodeDependencies
) {
  const prompt = buildBusinessContextPrompt(mapStateToExecutionInput(state));
  const response = await dependencies.callModel({
    schemaName: "business_context",
    systemPrompt: prompt.system,
    userPrompt: prompt.user,
    model: dependencies.cheapModel,
    timeoutMs: dependencies.timeoutMs,
  });
  const businessContext = normalizeBusinessContext(response);

  return {
    businessContext,
    status: "running" as const,
  };
}

export async function frameworkMapperNode(
  state: AuditWorkflowState,
  dependencies: AuditNodeDependencies
) {
  const businessContext = requireStateValue(state.businessContext, "businessContext");
  const prompt = buildFrameworkMapperPrompt({
    input: mapStateToExecutionInput(state),
    businessContext,
  });
  const response = await dependencies.callModel({
    schemaName: "framework_mapping",
    systemPrompt: prompt.system,
    userPrompt: prompt.user,
    model: dependencies.cheapModel,
    timeoutMs: dependencies.timeoutMs,
  });
  const frameworkMapping = normalizeFrameworkMapping(response);

  return {
    frameworkMapping,
    status: "running" as const,
  };
}

export async function riskAnalysisNode(
  state: AuditWorkflowState,
  dependencies: AuditNodeDependencies
) {
  const prompt = buildRiskAnalysisPrompt({
    input: mapStateToExecutionInput(state),
    businessContext: requireStateValue(state.businessContext, "businessContext"),
    frameworkMapping: requireStateValue(state.frameworkMapping, "frameworkMapping"),
  });
  const response = await dependencies.callModel({
    schemaName: "risk_analysis",
    systemPrompt: prompt.system,
    userPrompt: prompt.user,
    model: dependencies.strongModel,
    timeoutMs: dependencies.timeoutMs,
  });
  const riskAnalysis = normalizeRiskAnalysis(response);

  return {
    riskAnalysis,
    status: "running" as const,
  };
}

export async function riskScoringNode(
  state: AuditWorkflowState,
  dependencies: AuditNodeDependencies
) {
  const riskAnalysis = requireStateValue(state.riskAnalysis, "riskAnalysis");
  const counts = countFindings(riskAnalysis);
  const complianceScore = computeComplianceScore({
    highCount: counts.highCount,
    moderateCount: counts.moderateCount,
    lowCount: counts.lowCount,
    ...riskAnalysis.riskFlags,
  });
  const riskLevel = determineRiskLevel(complianceScore, counts.highCount);
  const prompt = buildRiskScoringPrompt({
    input: mapStateToExecutionInput(state),
    riskAnalysis,
    complianceScore,
    riskLevel,
  });
  const response = await dependencies.callModel({
    schemaName: "risk_scoring",
    systemPrompt: prompt.system,
    userPrompt: prompt.user,
    model: dependencies.cheapModel,
    timeoutMs: dependencies.timeoutMs,
  });
  const normalizedDrivers = normalizeRiskScoring(response);
  const riskScoring: RiskScoringOutput = {
    complianceScore,
    riskLevel,
    highCount: counts.highCount,
    moderateCount: counts.moderateCount,
    lowCount: counts.lowCount,
    keyDrivers: normalizedDrivers.keyDrivers,
  };

  return {
    riskScoring,
    status: "running" as const,
  };
}

export async function remediationRoadmapNode(
  state: AuditWorkflowState,
  dependencies: AuditNodeDependencies
) {
  const prompt = buildRemediationRoadmapPrompt({
    input: mapStateToExecutionInput(state),
    riskAnalysis: requireStateValue(state.riskAnalysis, "riskAnalysis"),
    riskScoring: requireStateValue(state.riskScoring, "riskScoring"),
    frameworkMapping: requireStateValue(state.frameworkMapping, "frameworkMapping"),
  });
  const response = await dependencies.callModel({
    schemaName: "remediation_roadmap",
    systemPrompt: prompt.system,
    userPrompt: prompt.user,
    model: dependencies.strongModel,
    timeoutMs: dependencies.timeoutMs,
  });
  const remediationRoadmap = normalizeRemediationRoadmap(response);

  return {
    remediationRoadmap,
    status: "running" as const,
  };
}

export async function finalReportNode(
  state: AuditWorkflowState,
  dependencies: AuditNodeDependencies
) {
  const prompt = buildFinalReportPrompt({
    input: mapStateToExecutionInput(state),
    businessContext: requireStateValue(state.businessContext, "businessContext"),
    frameworkMapping: requireStateValue(state.frameworkMapping, "frameworkMapping"),
    riskAnalysis: requireStateValue(state.riskAnalysis, "riskAnalysis"),
    riskScoring: requireStateValue(state.riskScoring, "riskScoring"),
    remediationRoadmap: requireStateValue(state.remediationRoadmap, "remediationRoadmap"),
  });
  const response = await dependencies.callModel({
    schemaName: "final_report",
    systemPrompt: prompt.system,
    userPrompt: prompt.user,
    model: dependencies.strongModel,
    timeoutMs: dependencies.timeoutMs,
  });
  const finalReport = normalizeFinalReport(response);

  return {
    finalReport,
    status: "completed" as const,
  };
}

function requireStateValue<T>(value: T | undefined, label: string): T {
  if (value == null) {
    throw new Error(`LangGraph state is missing ${label}.`);
  }
  return value;
}

function mapRecordToAssessmentAnswers(
  assessmentAnswers: Record<string, unknown>
): ExecuteAuditWorkflowInput["assessmentAnswers"] {
  return Object.entries(assessmentAnswers).map(([key, value]) => {
    const record =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

    return {
      key,
      question:
        typeof record.question === "string" && record.question.trim().length > 0
          ? record.question
          : key,
      answer:
        typeof record.answer === "string" ||
        typeof record.answer === "number" ||
        typeof record.answer === "boolean" ||
        (Array.isArray(record.answer) &&
          record.answer.every((item) => typeof item === "string")) ||
        (record.answer &&
          typeof record.answer === "object" &&
          !Array.isArray(record.answer))
          ? (record.answer as
              | string
              | number
              | boolean
              | string[]
              | Record<string, unknown>)
          : "",
      notes: typeof record.notes === "string" ? record.notes : undefined,
    };
  });
}

function mapStateToExecutionInput(state: AuditWorkflowState): ExecuteAuditWorkflowInput {
  return {
    orgId: state.orgId,
    assessmentId: state.assessmentId,
    workflowDispatchId: state.workflowDispatchId,
    dispatchId: state.dispatchId,
    customerEmail: state.customerEmail,
    companyName: state.companyName,
    industry: state.industry,
    companySize: state.companySize,
    planTier: state.planTier,
    selectedFrameworks: state.selectedFrameworks,
    assessmentAnswers: mapRecordToAssessmentAnswers(state.assessmentAnswers),
    evidenceSummary: state.evidenceSummary ?? null,
  };
}
