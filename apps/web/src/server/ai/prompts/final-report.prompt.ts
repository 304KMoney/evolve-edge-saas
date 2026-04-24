import type {
  BusinessContextOutput,
  ExecuteAuditWorkflowInput,
  FrameworkMappingOutput,
  RemediationRoadmapOutput,
  RiskAnalysisOutput,
  RiskScoringOutput,
} from "../providers/types";
import {
  buildPromptInjectionGuardrailText,
  formatPromptJsonSection
} from "./prompt-safety";

export type FinalReportPromptInput = {
  input: ExecuteAuditWorkflowInput;
  businessContext: BusinessContextOutput;
  frameworkMapping: FrameworkMappingOutput;
  riskAnalysis: RiskAnalysisOutput;
  riskScoring: RiskScoringOutput;
  remediationRoadmap: RemediationRoadmapOutput;
};

export function buildFinalReportPrompt(input: FinalReportPromptInput) {
  return {
    system:
      `You are a senior AI security and compliance advisor producing a client-ready executive report in the style of a premium advisory engagement. Output JSON only. Do not use markdown. Do not invent facts. Do not overstate certainty. Use strong, concise advisory language focused on business impact, operational risk, compliance exposure, and prioritized remediation. Do not expose internal workflow details or sensitive customer data. ${buildPromptInjectionGuardrailText()}`,
    user: `Generate a concise, high-value executive report suitable for PDF rendering.

${formatPromptJsonSection("Business context", input.businessContext)}

${formatPromptJsonSection("Framework mapping", input.frameworkMapping)}

${formatPromptJsonSection("Risk analysis", input.riskAnalysis)}

${formatPromptJsonSection("Risk scoring", input.riskScoring)}

${formatPromptJsonSection("Remediation roadmap", input.remediationRoadmap)}

Report requirements:
- The report should feel worth paying for.
- Be concise but materially useful.
- Avoid generic filler.
- Keep strong executive relevance.
- Make the output suitable for an operator briefing, founder review, or client meeting.
- Keep the structure clean for downstream PDF rendering.
- detailedReport should cover the overall risk posture, top findings, governance and compliance gaps, and prioritized roadmap in polished advisory prose.

Generate:
- executive_summary
- overall_risk_posture
- top_3_to_5_findings
- compliance_and_governance_gaps
- recommended_roadmap
- executive_briefing_talking_points
- closing_advisory_note

Output JSON only with exactly this structure:
{
  "reportTitle": string,
  "reportSubtitle": string | null,
  "executiveSummary": string,
  "detailedReport": string,
  "conclusion": string
}`,
  };
}
