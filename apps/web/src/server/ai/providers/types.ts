import { z } from "zod";
import {
  isAllowedFrameworkName,
  KNOWN_FRAMEWORKS,
  normalizeFrameworkName,
} from "../safety/guardrails";
import { validateAiOutputSafety } from "../safety/guardrails";

export const AI_EXECUTION_PROVIDER_VALUES = ["openai_langgraph", "dify"] as const;

export type AiExecutionProvider = (typeof AI_EXECUTION_PROVIDER_VALUES)[number];

export const planTierSchema = z.enum(["starter", "scale", "enterprise"]);
const frameworkNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => isAllowedFrameworkName(normalizeFrameworkName(value)), {
    message: `Framework must be one of: ${KNOWN_FRAMEWORKS.join(", ")}`,
  });

export const commercialRoutingPolicySchema = z.object({
  planTier: planTierSchema,
  workflowCode: z.string().trim().min(1).max(100),
  entitlementSource: z.enum(["subscription", "trial", "override", "blocked"]),
  reportDepth: z.enum(["concise", "standard", "enhanced", "custom"]),
  maxFindings: z.number().int().min(1).max(25),
  roadmapDetail: z.enum(["standard", "detailed", "full"]),
  executiveBriefingEligible: z.boolean(),
  monitoringAddOnEligible: z.boolean(),
  addOnEligible: z.boolean(),
  immutable: z.literal(true)
});

export const assessmentAnswerSchema = z.object({
  key: z.string().trim().min(1).max(200).optional(),
  question: z.string().trim().min(1).max(1_000),
  answer: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
    z.record(z.string(), z.unknown())
  ]),
  notes: z.string().trim().max(8_000).optional()
});

export const executeAuditWorkflowInputSchema = z.object({
  orgId: z.string().trim().min(1).max(200),
  assessmentId: z.string().trim().min(1).max(200),
  workflowDispatchId: z.string().trim().min(1).max(200),
  dispatchId: z.string().trim().min(1).max(200),
  customerEmail: z.string().trim().email().nullable(),
  companyName: z.string().trim().min(1).max(300),
  industry: z.string().trim().min(1).max(200).nullable(),
  companySize: z.string().trim().min(1).max(200).nullable(),
  selectedFrameworks: z.array(frameworkNameSchema).min(1).max(25),
  assessmentAnswers: z.array(assessmentAnswerSchema).min(1).max(250),
  evidenceSummary: z.string().trim().max(16_000).nullable(),
  planTier: planTierSchema,
  commercialRouting: commercialRoutingPolicySchema.optional()
});

export const businessContextOutputSchema = z.object({
  companyName: z.string().trim().min(1).max(300),
  industry: z.string().trim().min(1).max(200).nullable(),
  companySize: z.string().trim().min(1).max(200).nullable(),
  summary: z.string().trim().min(1).max(6_000),
  operatingModel: z.string().trim().min(1).max(4_000),
  businessPriorities: z.array(z.string().trim().min(1).max(300)).min(1).max(10),
  securityMaturitySignals: z.array(z.string().trim().min(1).max(500)).min(1).max(10)
}).superRefine((value, ctx) => {
  try {
    validateAiOutputSafety(value, "business_context");
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : "Unsafe business context content.",
    });
  }
});

export const frameworkMappingItemSchema = z.object({
  framework: frameworkNameSchema,
  rationale: z.string().trim().min(1).max(2_000),
  applicableAreas: z.array(z.string().trim().min(1).max(200)).min(1).max(15)
});

export const frameworkMappingOutputSchema = z.object({
  selectedFrameworks: z.array(frameworkNameSchema).min(1).max(25),
  prioritizedFrameworks: z.array(frameworkNameSchema).min(1).max(25),
  coverageSummary: z.string().trim().min(1).max(4_000),
  mappings: z.array(frameworkMappingItemSchema).min(1).max(25)
}).superRefine((value, ctx) => {
  try {
    validateAiOutputSafety(value, "framework_mapping");
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : "Unsafe framework mapping content.",
    });
  }
});

export const riskFindingSeveritySchema = z.enum(["Low", "Moderate", "High"]);

export const riskFindingSchema = z.object({
  title: z.string().trim().min(1).max(300),
  severity: riskFindingSeveritySchema,
  summary: z.string().trim().min(1).max(4_000),
  businessImpact: z.string().trim().min(1).max(2_000),
  controlDomain: z.string().trim().min(1).max(200),
  impactedFrameworks: z.array(frameworkNameSchema).min(1).max(25),
  evidence: z.array(z.string().trim().min(1).max(1_000)).max(10),
  tags: z.array(z.string().trim().min(1).max(100)).max(10)
});

export const riskFlagsSchema = z.object({
  noFormalSecurityPolicies: z.boolean(),
  noAiGovernance: z.boolean(),
  vendorRiskPresent: z.boolean(),
  sensitiveDataExposure: z.boolean()
});

export const riskAnalysisOutputSchema = z.object({
  summary: z.string().trim().min(1).max(8_000),
  findings: z.array(riskFindingSchema).min(1).max(25),
  systemicThemes: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
  notableStrengths: z.array(z.string().trim().min(1).max(500)).max(10),
  riskFlags: riskFlagsSchema
}).superRefine((value, ctx) => {
  try {
    validateAiOutputSafety(value, "risk_analysis");
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : "Unsafe risk analysis content.",
    });
  }
});

export const riskScoringOutputSchema = z.object({
  complianceScore: z.number().int().min(0).max(100),
  riskLevel: z.enum(["Low", "Moderate", "High"]),
  highCount: z.number().int().min(0).max(25),
  moderateCount: z.number().int().min(0).max(25),
  lowCount: z.number().int().min(0).max(25),
  keyDrivers: z.array(z.string().trim().min(1).max(500)).min(1).max(10)
}).superRefine((value, ctx) => {
  try {
    validateAiOutputSafety(value, "risk_scoring");
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : "Unsafe risk scoring content.",
    });
  }
});

export const remediationActionSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(4_000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  ownerRole: z.string().trim().min(1).max(200).nullable(),
  targetTimeline: z.string().trim().min(1).max(200).nullable()
});

export const remediationRoadmapOutputSchema = z.object({
  roadmapSummary: z.string().trim().min(1).max(6_000),
  immediateActions: z.array(remediationActionSchema).min(1).max(10),
  nearTermActions: z.array(remediationActionSchema).max(10),
  strategicActions: z.array(remediationActionSchema).max(10)
}).superRefine((value, ctx) => {
  try {
    validateAiOutputSafety(value, "remediation_roadmap");
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : "Unsafe remediation roadmap content.",
    });
  }
});

export const finalReportOutputSchema = z.object({
  reportTitle: z.string().trim().min(1).max(300),
  reportSubtitle: z.string().trim().min(1).max(300).nullable(),
  executiveSummary: z.string().trim().min(1).max(8_000),
  detailedReport: z.string().trim().min(1).max(20_000),
  conclusion: z.string().trim().min(1).max(4_000)
}).superRefine((value, ctx) => {
  try {
    validateAiOutputSafety(value, "final_report");
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : "Unsafe final report content.",
    });
  }
});

export const auditWorkflowMetadataSchema = z.object({
  model: z.string().trim().min(1).max(200),
  reasoningModel: z.string().trim().min(1).max(200).nullable(),
  timeoutMs: z.number().int().min(1),
  executionMs: z.number().int().min(0),
  nodeTimingsMs: z.record(z.string(), z.number().int().min(0)),
  contractVersion: z.string().trim().min(1).max(100)
});

export const auditWorkflowOutputSchema = z.object({
  provider: z.literal("openai_langgraph"),
  workflowDispatchId: z.string().trim().min(1).max(200),
  status: z.enum(["completed", "failed"]),
  businessContext: businessContextOutputSchema,
  frameworkMapping: frameworkMappingOutputSchema,
  riskAnalysis: riskAnalysisOutputSchema,
  riskScoring: riskScoringOutputSchema,
  remediationRoadmap: remediationRoadmapOutputSchema,
  finalReport: finalReportOutputSchema,
  metadata: auditWorkflowMetadataSchema,
  executiveSummary: z.string().trim().min(1).max(8_000),
  postureScore: z.number().int().min(0).max(100),
  riskLevel: z.string().trim().min(1).max(100),
  topConcerns: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
  findings: z.array(
    z.object({
      title: z.string().trim().min(1).max(300),
      summary: z.string().trim().min(1).max(4_000),
      severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
      riskDomain: z.string().trim().min(1).max(200),
      impactedFrameworks: z.array(z.string().trim().min(1).max(200)).max(25),
      score: z.number().int().min(0).max(100).nullable()
    })
  ).min(1).max(25),
  recommendations: z.array(
    z.object({
      title: z.string().trim().min(1).max(300),
      description: z.string().trim().min(1).max(4_000),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
      ownerRole: z.string().trim().min(1).max(200).nullable(),
      effort: z.string().trim().min(1).max(200).nullable(),
      targetTimeline: z.string().trim().min(1).max(200).nullable()
    })
  ).min(1).max(30),
  roadmap: z.array(
    z.object({
      title: z.string().trim().min(1).max(300),
      description: z.string().trim().min(1).max(4_000),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
      ownerRole: z.string().trim().min(1).max(200).nullable(),
      effort: z.string().trim().min(1).max(200).nullable(),
      targetTimeline: z.string().trim().min(1).max(200).nullable()
    })
  ).min(1).max(30),
  finalReportText: z.string().trim().min(1).max(20_000)
}).superRefine((value, ctx) => {
  try {
    validateAiOutputSafety(value, "audit_workflow_output");
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : "Unsafe audit workflow content.",
    });
  }
});

export type ExecuteAuditWorkflowInput = z.infer<typeof executeAuditWorkflowInputSchema>;
export type CommercialRoutingPolicy = z.infer<typeof commercialRoutingPolicySchema>;
export type BusinessContextOutput = z.infer<typeof businessContextOutputSchema>;
export type FrameworkMappingOutput = z.infer<typeof frameworkMappingOutputSchema>;
export type RiskAnalysisOutput = z.infer<typeof riskAnalysisOutputSchema>;
export type RiskScoringOutput = z.infer<typeof riskScoringOutputSchema>;
export type RemediationRoadmapOutput = z.infer<typeof remediationRoadmapOutputSchema>;
export type FinalReportOutput = z.infer<typeof finalReportOutputSchema>;
export type AuditWorkflowMetadata = z.infer<typeof auditWorkflowMetadataSchema>;
export type AuditWorkflowOutput = z.infer<typeof auditWorkflowOutputSchema>;

export type ExecuteAuditWorkflowOptions = {
  updateProgress?: (input: {
    assessmentId: string;
    workflowDispatchId: string;
    dispatchId: string;
    status:
      | "queued"
      | "preparing_context"
      | "mapping_frameworks"
      | "analyzing_risks"
      | "scoring_risk"
      | "building_roadmap"
      | "generating_report"
      | "pending_review"
      | "completed"
      | "failed";
  }) => Promise<void>;
};

export interface AuditWorkflowProvider {
  readonly provider: AiExecutionProvider;
  executeAuditWorkflow(
    input: ExecuteAuditWorkflowInput,
    options?: ExecuteAuditWorkflowOptions
  ): Promise<AuditWorkflowOutput>;
}
