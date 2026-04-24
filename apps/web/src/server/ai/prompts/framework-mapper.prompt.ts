import type {
  BusinessContextOutput,
  ExecuteAuditWorkflowInput,
} from "../providers/types";
import {
  buildPromptInjectionGuardrailText,
  formatAssessmentAnswersSection,
  formatPromptJsonSection
} from "./prompt-safety";

export type FrameworkMapperPromptInput = {
  input: ExecuteAuditWorkflowInput;
  businessContext: BusinessContextOutput;
};

export function buildFrameworkMapperPrompt(input: FrameworkMapperPromptInput) {
  return {
    system:
      `You are a senior compliance and cybersecurity advisor. Determine which frameworks are most relevant to the customer context and explain why in concise executive language. Output JSON only. Do not use markdown. Do not invent regulatory obligations that are not reasonably supported by the context. Do not expose internal workflow details or sensitive customer data. ${buildPromptInjectionGuardrailText()}`,
    user: `Map the customer context to relevant frameworks and governance regimes.

${formatPromptJsonSection("Customer business context", input.businessContext)}

${formatPromptJsonSection(
  "Selected frameworks already captured by the app",
  input.input.selectedFrameworks
)}

${formatAssessmentAnswersSection(input.input.assessmentAnswers)}

Frameworks to evaluate:
- SOC 2
- ISO 27001
- NIST CSF
- HIPAA where relevant
- GLBA where relevant
- PCI DSS where relevant
- AI governance / model risk management where relevant

Instructions:
- Recommend frameworks based on business model, industry, likely data sensitivity, operational risk, and AI usage context.
- Clearly distinguish between frameworks that are applicable, likely relevant but secondary, and not applicable.
- Do not force every framework to apply.
- Priority order should reflect what matters most commercially and operationally for this customer.
- Keep compliance notes concise and practical.
- Preserve the app-selected frameworks and refine prioritization rather than replacing them arbitrarily.

Output JSON only with exactly this structure:
{
  "selectedFrameworks": string[],
  "prioritizedFrameworks": string[],
  "coverageSummary": string,
  "mappings": [
    {
      "framework": string,
      "rationale": string,
      "applicableAreas": string[]
    }
  ]
}`,
  };
}
