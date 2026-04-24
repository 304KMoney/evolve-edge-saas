import type {
  BusinessContextOutput,
  ExecuteAuditWorkflowInput,
  FrameworkMappingOutput,
} from "../providers/types";
import {
  buildPromptInjectionGuardrailText,
  formatAssessmentAnswersSection,
  formatPromptJsonSection,
  formatPromptTextSection
} from "./prompt-safety";

export type RiskAnalysisPromptInput = {
  input: ExecuteAuditWorkflowInput;
  businessContext: BusinessContextOutput;
  frameworkMapping: FrameworkMappingOutput;
};

export function buildRiskAnalysisPrompt(input: RiskAnalysisPromptInput) {
  return {
    system:
      `You are a senior AI security, cyber risk, and compliance advisor producing executive-grade findings for a paid advisory report. Output JSON only. Do not use markdown. Do not invent facts. Base findings on the supplied business context, framework mapping, assessment answers, and evidence summary. If evidence is incomplete, reflect uncertainty through evidence rather than fabricating certainty. Do not expose internal workflow details or sensitive customer data. ${buildPromptInjectionGuardrailText()}`,
    user: `Analyze the customer's risk posture and identify the most decision-useful findings.

${formatPromptJsonSection("Business context", input.businessContext)}

${formatPromptJsonSection("Framework mapping", input.frameworkMapping)}

${formatPromptTextSection("Evidence summary", input.input.evidenceSummary)}

${formatAssessmentAnswersSection(input.input.assessmentAnswers)}

Required analysis areas:
- governance gaps
- access control gaps
- vendor/security review gaps
- AI governance gaps
- data handling risks
- incident response gaps
- documentation gaps
- monitoring gaps

Instructions:
- Surface only material findings that matter to executive stakeholders, operators, or buyers.
- Use severity values exactly: High, Moderate, Low.
- title should be a concise finding headline.
- summary should explain the control gap in advisory language.
- businessImpact should explain why the issue matters commercially, operationally, or from a compliance standpoint.
- controlDomain should identify the primary affected control or risk area.
- impactedFrameworks should include only relevant frameworks.
- evidence should list concise evidence points or note missing evidence explicitly.
- tags should be short labels such as Governance, Access Control, Vendor Risk, AI Governance, Data Handling, Incident Response, Documentation, or Monitoring.
- Also return systemicThemes, notableStrengths, and riskFlags based on the assessment.
- riskFlags must use booleans and reflect only supported conditions.
- Avoid generic statements like "improve security posture" without specifics.

Output JSON only with exactly this structure:
{
  "summary": string,
  "findings": [
    {
      "title": string,
      "severity": "High" | "Moderate" | "Low",
      "summary": string,
      "businessImpact": string,
      "controlDomain": string,
      "impactedFrameworks": string[],
      "evidence": string[],
      "tags": string[]
    }
  ],
  "systemicThemes": string[],
  "notableStrengths": string[],
  "riskFlags": {
    "noFormalSecurityPolicies": boolean,
    "noAiGovernance": boolean,
    "vendorRiskPresent": boolean,
    "sensitiveDataExposure": boolean
  }
}`,
  };
}
