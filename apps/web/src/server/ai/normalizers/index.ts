import { z } from "zod";
import {
  businessContextOutputSchema,
  finalReportOutputSchema,
  frameworkMappingOutputSchema,
  remediationRoadmapOutputSchema,
  riskAnalysisOutputSchema,
  riskScoringOutputSchema,
  type BusinessContextOutput,
  type FinalReportOutput,
  type FrameworkMappingOutput,
  type RemediationRoadmapOutput,
  type RiskAnalysisOutput,
  type RiskScoringOutput,
} from "../providers/types";
import { validateAiOutputSafety } from "../safety/guardrails";

const riskScoringDriversOnlySchema = z.object({
  keyDrivers: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
});

function extractCandidatePayload(rawOutput: unknown): unknown {
  if (typeof rawOutput === "string") {
    return rawOutput;
  }

  if (!rawOutput || typeof rawOutput !== "object" || Array.isArray(rawOutput)) {
    return rawOutput;
  }

  const record = rawOutput as Record<string, unknown>;

  if ("answer" in record && record.answer != null) {
    return record.answer;
  }

  if ("text" in record && record.text != null) {
    return record.text;
  }

  if ("output_text" in record && record.output_text != null) {
    return record.output_text;
  }

  return rawOutput;
}

function stripMarkdownCodeFences(value: string) {
  const trimmed = value.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch ? fencedMatch[1]!.trim() : trimmed;
}

function extractJsonString(rawOutput: unknown, label: string) {
  const candidate = extractCandidatePayload(rawOutput);

  if (typeof candidate !== "string") {
    throw new Error(`${label} output did not contain a string payload.`);
  }

  const normalized = stripMarkdownCodeFences(candidate);
  if (!normalized) {
    throw new Error(`${label} output was empty.`);
  }

  return normalized;
}

function parseJsonValue(rawOutput: unknown, label: string) {
  const candidate = extractCandidatePayload(rawOutput);

  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    return candidate;
  }

  const jsonText = extractJsonString(rawOutput, label);

  try {
    return JSON.parse(jsonText) as unknown;
  } catch (error) {
    throw new Error(
      `${label} output contained malformed JSON: ${
        error instanceof Error ? error.message : "Unknown parse error"
      }`
    );
  }
}

function normalizeWithSchema<T>(
  rawOutput: unknown,
  schema: z.ZodType<T>,
  label: string
): T {
  const parsed = parseJsonValue(rawOutput, label);
  const normalized = schema.parse(parsed);
  validateAiOutputSafety(normalized, label);
  return normalized;
}

export function normalizeBusinessContext(rawOutput: unknown): BusinessContextOutput {
  return normalizeWithSchema(rawOutput, businessContextOutputSchema, "business_context");
}

export function normalizeFrameworkMapping(rawOutput: unknown): FrameworkMappingOutput {
  return normalizeWithSchema(rawOutput, frameworkMappingOutputSchema, "framework_mapping");
}

export function normalizeRiskAnalysis(rawOutput: unknown): RiskAnalysisOutput {
  return normalizeWithSchema(rawOutput, riskAnalysisOutputSchema, "risk_analysis");
}

export function normalizeRiskScoring(rawOutput: unknown): RiskScoringOutput {
  const parsed = parseJsonValue(rawOutput, "risk_scoring");

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
    if (
      "keyDrivers" in record &&
      !("complianceScore" in record) &&
      !("riskLevel" in record)
    ) {
      const normalized = riskScoringDriversOnlySchema.parse(record) as RiskScoringOutput;
      validateAiOutputSafety(normalized, "risk_scoring");
      return normalized;
    }
  }

  const normalized = riskScoringOutputSchema.parse(parsed);
  validateAiOutputSafety(normalized, "risk_scoring");
  return normalized;
}

export function normalizeRemediationRoadmap(
  rawOutput: unknown
): RemediationRoadmapOutput {
  return normalizeWithSchema(
    rawOutput,
    remediationRoadmapOutputSchema,
    "remediation_roadmap"
  );
}

export function normalizeFinalReport(rawOutput: unknown): FinalReportOutput {
  return normalizeWithSchema(rawOutput, finalReportOutputSchema, "final_report");
}
