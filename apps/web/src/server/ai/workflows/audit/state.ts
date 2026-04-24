import { Annotation } from "@langchain/langgraph";
import { z } from "zod";
import {
  businessContextOutputSchema,
  finalReportOutputSchema,
  frameworkMappingOutputSchema,
  planTierSchema,
  remediationRoadmapOutputSchema,
  riskAnalysisOutputSchema,
  riskScoringOutputSchema,
} from "../../providers/types";

export const auditWorkflowStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
]);

export const auditWorkflowStateSchema = z
  .object({
    orgId: z.string().trim().min(1).max(200),
    assessmentId: z.string().trim().min(1).max(200),
    workflowDispatchId: z.string().trim().min(1).max(200),
    dispatchId: z.string().trim().min(1).max(200),
    customerEmail: z.string().trim().email().nullable(),
    companyName: z.string().trim().min(1).max(300),
    industry: z.string().trim().min(1).max(200).nullable(),
    companySize: z.string().trim().min(1).max(200).nullable(),
    planTier: planTierSchema,
    selectedFrameworks: z.array(z.string().trim().min(1).max(200)).min(1).max(25),
    assessmentAnswers: z.record(z.string(), z.unknown()),
    evidenceSummary: z.string().trim().max(16_000).nullable().optional(),
    businessContext: businessContextOutputSchema.optional(),
    frameworkMapping: frameworkMappingOutputSchema.optional(),
    riskAnalysis: riskAnalysisOutputSchema.optional(),
    riskScoring: riskScoringOutputSchema.optional(),
    remediationRoadmap: remediationRoadmapOutputSchema.optional(),
    finalReport: finalReportOutputSchema.optional(),
    status: auditWorkflowStatusSchema,
    errors: z.array(z.string().trim().min(1).max(2_000)).optional(),
    nodeTimingsMs: z.record(z.string(), z.number().int().min(0)).default({}),
  })
  .strict();

export const completedAuditWorkflowStateSchema = auditWorkflowStateSchema.extend({
  businessContext: businessContextOutputSchema,
  frameworkMapping: frameworkMappingOutputSchema,
  riskAnalysis: riskAnalysisOutputSchema,
  riskScoring: riskScoringOutputSchema,
  remediationRoadmap: remediationRoadmapOutputSchema,
  finalReport: finalReportOutputSchema,
  status: z.literal("completed"),
});

export const successfulAuditWorkflowStateSchema = completedAuditWorkflowStateSchema;

export type AuditWorkflowState = z.infer<typeof auditWorkflowStateSchema>;
export type CompletedAuditWorkflowState = z.infer<
  typeof completedAuditWorkflowStateSchema
>;

export const AuditWorkflowStateAnnotation = Annotation.Root({
  orgId: Annotation<string>,
  assessmentId: Annotation<string>,
  workflowDispatchId: Annotation<string>,
  dispatchId: Annotation<string>,
  customerEmail: Annotation<string | null>,
  companyName: Annotation<string>,
  industry: Annotation<string | null>,
  companySize: Annotation<string | null>,
  planTier: Annotation<"starter" | "scale" | "enterprise">,
  selectedFrameworks: Annotation<string[]>,
  assessmentAnswers: Annotation<Record<string, unknown>>,
  evidenceSummary: Annotation<string | null | undefined>,
  businessContext: Annotation<AuditWorkflowState["businessContext"] | undefined>,
  frameworkMapping: Annotation<AuditWorkflowState["frameworkMapping"] | undefined>,
  riskAnalysis: Annotation<AuditWorkflowState["riskAnalysis"] | undefined>,
  riskScoring: Annotation<AuditWorkflowState["riskScoring"] | undefined>,
  remediationRoadmap: Annotation<
    AuditWorkflowState["remediationRoadmap"] | undefined
  >,
  finalReport: Annotation<AuditWorkflowState["finalReport"] | undefined>,
  status: Annotation<AuditWorkflowState["status"]>,
  errors: Annotation<AuditWorkflowState["errors"] | undefined>,
  nodeTimingsMs: Annotation<Record<string, number>>,
});

export function buildInitialAuditWorkflowState(input: {
  orgId: string;
  assessmentId: string;
  workflowDispatchId: string;
  dispatchId: string;
  customerEmail: string | null;
  companyName: string;
  industry: string | null;
  companySize: string | null;
  planTier: "starter" | "scale" | "enterprise";
  selectedFrameworks: string[];
  assessmentAnswers: Record<string, unknown>;
  evidenceSummary?: string | null;
}): AuditWorkflowState {
  return auditWorkflowStateSchema.parse({
    ...input,
    businessContext: undefined,
    frameworkMapping: undefined,
    riskAnalysis: undefined,
    riskScoring: undefined,
    remediationRoadmap: undefined,
    finalReport: undefined,
    status: "pending",
    errors: [],
    nodeTimingsMs: {},
  });
}

export function validateAuditWorkflowStateForPersistence(
  state: AuditWorkflowState
): CompletedAuditWorkflowState {
  return completedAuditWorkflowStateSchema.parse(state);
}
