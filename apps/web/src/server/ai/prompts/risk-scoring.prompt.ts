import type { ExecuteAuditWorkflowInput, RiskAnalysisOutput } from "../providers/types";
import {
  buildPromptInjectionGuardrailText,
  formatPromptJsonSection
} from "./prompt-safety";

export type RiskScoringPromptInput = {
  input: ExecuteAuditWorkflowInput;
  riskAnalysis: RiskAnalysisOutput;
  complianceScore: number;
  riskLevel: "Low" | "Moderate" | "High";
};

export function buildRiskScoringPrompt(input: RiskScoringPromptInput) {
  return {
    system:
      `You are a senior risk advisor explaining a deterministic compliance score to an executive audience. Output JSON only. Do not use markdown. Do not recalculate the score. Do not change the provided score or risk level. Do not invent drivers that are not supported by the findings and flags. Do not expose internal scoring logic beyond the requested interpretation. ${buildPromptInjectionGuardrailText()}`,
    user: `Explain the executive meaning of the provided deterministic score.

Customer context:
Company: ${input.input.companyName}
Industry: ${input.input.industry ?? "Unknown"}
Company size: ${input.input.companySize ?? "Unknown"}
Plan tier: ${input.input.planTier}

Computed score inputs:
Compliance score: ${input.complianceScore}
Risk level: ${input.riskLevel}

${formatPromptJsonSection("Risk analysis", input.riskAnalysis)}

Deterministic scoring rules already applied by the backend:
- Start at 100.
- High finding: -15 each.
- Moderate finding: -8 each.
- Low finding: -3 each.
- No formal security policies: -10.
- No AI governance: -10.
- Vendor risk present: -5.
- Sensitive data exposure: -10.
- Minimum score: 0.

Instructions:
- Summarize the score drivers in plain executive language.
- Explain what the score means for business readiness, trust, and operational exposure.
- Keep the interpretation commercially relevant and concise.
- Do not restate backend mechanics in a technical way.

Output JSON only with exactly this structure:
{
  "complianceScore": number,
  "riskLevel": "Low" | "Moderate" | "High",
  "highCount": number,
  "moderateCount": number,
  "lowCount": number,
  "keyDrivers": string[],
  "executive_interpretation": string
}`,
  };
}
