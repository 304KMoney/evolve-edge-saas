import type {
  AuditWorkflowOutput,
  BusinessContextOutput,
  ExecuteAuditWorkflowOptions,
  ExecuteAuditWorkflowInput,
  FinalReportOutput,
  FrameworkMappingOutput,
  RemediationRoadmapOutput,
  RiskAnalysisOutput,
  RiskScoringOutput
} from "../src/server/ai/providers/types";
import { getAuditWorkflowProvider } from "../src/server/ai/providers";

export type ExecuteAuditWorkflowInputCompat = ExecuteAuditWorkflowInput;

export interface AuditAiExecutionProvider {
  readonly provider: "openai_langgraph" | "dify";
  executeAuditWorkflow(
    input: ExecuteAuditWorkflowInput,
    options?: ExecuteAuditWorkflowOptions
  ): Promise<AuditWorkflowOutput>;
}

export type AiBusinessContext = BusinessContextOutput;
export type AiFrameworkMapping = FrameworkMappingOutput;
export type AiRiskAnalysis = RiskAnalysisOutput;
export type AiRiskScoring = RiskScoringOutput;
export type AiRemediationRoadmap = RemediationRoadmapOutput;
export type AiFinalReportMetadata = FinalReportOutput;

export function getAuditAiExecutionProvider(): AuditAiExecutionProvider {
  return getAuditWorkflowProvider();
}
