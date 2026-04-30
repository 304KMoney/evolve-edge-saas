import type {
  ExecuteAuditWorkflowInput,
  FrameworkMappingOutput,
  RiskAnalysisOutput,
  RiskScoringOutput,
} from "../providers/types";
import {
  buildPromptInjectionGuardrailText,
  formatPromptJsonSection
} from "./prompt-safety";

export type RemediationRoadmapPromptInput = {
  input: ExecuteAuditWorkflowInput;
  riskAnalysis: RiskAnalysisOutput;
  riskScoring: RiskScoringOutput;
  frameworkMapping: FrameworkMappingOutput;
};

export function buildRemediationRoadmapPrompt(
  input: RemediationRoadmapPromptInput
) {
  return {
    system:
      `You are a senior cybersecurity and compliance advisor preparing a prioritized 90-day remediation roadmap for executive review. Output JSON only. Do not use markdown. Do not invent projects unrelated to the identified findings. Focus on pragmatic, commercially credible actions that align to a paid advisory deliverable. ${buildPromptInjectionGuardrailText()}`,
    user: `Create a phased remediation roadmap.

Customer context:
Company: ${input.input.companyName}
Industry: ${input.input.industry ?? "Unknown"}
Company size: ${input.input.companySize ?? "Unknown"}
Plan tier: ${input.input.planTier}

${formatPromptJsonSection("Framework mapping", input.frameworkMapping)}

${formatPromptJsonSection("Risk analysis", input.riskAnalysis)}

${formatPromptJsonSection("Risk scoring", input.riskScoring)}

Instructions:
- Organize actions into 0-30 days, 31-60 days, and 61-90 days.
- Prioritize actions that reduce business risk, improve trust posture, and address likely compliance exposure.
- Include practical owner recommendations by function or role.
- Identify dependencies where sequencing matters.
- Highlight quick wins that create visible improvement quickly.
- Expected business outcomes should reflect reduced risk, improved readiness, or stronger buyer confidence.
- Keep the roadmap concise, specific, and executive-usable.
- roadmapSummary should synthesize the strategic posture of the plan.
- Each action must be concrete and suitable for a customer-facing remediation plan.
- ownerRole and targetTimeline may be null when not supportable from the evidence.

Output JSON only with exactly this structure:
{
  "roadmapSummary": string,
  "immediateActions": [
    {
      "title": string,
      "description": string,
      "priority": "LOW" | "MEDIUM" | "HIGH" | "URGENT",
      "ownerRole": string | null,
      "targetTimeline": string | null
    }
  ],
  "nearTermActions": [
    {
      "title": string,
      "description": string,
      "priority": "LOW" | "MEDIUM" | "HIGH" | "URGENT",
      "ownerRole": string | null,
      "targetTimeline": string | null
    }
  ],
  "strategicActions": [
    {
      "title": string,
      "description": string,
      "priority": "LOW" | "MEDIUM" | "HIGH" | "URGENT",
      "ownerRole": string | null,
      "targetTimeline": string | null
    }
  ]
}`,
  };
}
