import { z } from "zod";

export const AI_EXECUTION_PROVIDER_VALUES = ["openai_langgraph", "dify"] as const;

export type AiExecutionProvider = (typeof AI_EXECUTION_PROVIDER_VALUES)[number];

export const aiFindingSchema = z.object({
  title: z.string().trim().min(1).max(300),
  summary: z.string().trim().min(1).max(4000),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  riskDomain: z.string().trim().min(1).max(200),
  impactedFrameworks: z.array(z.string().trim().min(1).max(200)).max(25).default([]),
  score: z.number().min(0).max(100).nullable().optional()
});

export const aiRecommendationSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(4000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  ownerRole: z.string().trim().min(1).max(200).nullable().optional(),
  effort: z.string().trim().min(1).max(200).nullable().optional(),
  targetTimeline: z.string().trim().min(1).max(200).nullable().optional()
});

export const aiBusinessContextSchema = z.object({
  companyName: z.string().trim().min(1).max(300),
  industry: z.string().trim().min(1).max(200).nullable(),
  companyProfile: z.string().trim().min(1).max(4000),
  operatingContext: z.string().trim().min(1).max(4000),
  priorityThemes: z.array(z.string().trim().min(1).max(300)).min(1).max(10)
});

export const aiFrameworkMappingSchema = z.object({
  mappedFrameworks: z.array(z.string().trim().min(1).max(200)).min(1).max(25),
  rationale: z.string().trim().min(1).max(4000),
  coverageNotes: z.array(z.string().trim().min(1).max(500)).max(15)
});

export const aiRiskAnalysisSchema = z.object({
  executiveSummary: z.string().trim().min(1).max(8000),
  findings: z.array(aiFindingSchema).min(1).max(25),
  topConcerns: z.array(z.string().trim().min(1).max(500)).min(1).max(10)
});

export const aiRiskScoringSchema = z.object({
  postureScore: z.number().min(0).max(100),
  riskLevel: z.string().trim().min(1).max(100),
  scoringRationale: z.string().trim().min(1).max(4000)
});

export const aiRemediationRoadmapSchema = z.object({
  roadmap: z.array(aiRecommendationSchema).min(1).max(25),
  implementationNotes: z.array(z.string().trim().min(1).max(500)).max(15)
});

export const aiFinalReportMetadataSchema = z.object({
  finalReport: z.string().trim().min(1).max(12000),
  reportSummary: z.string().trim().min(1).max(4000),
  reportTitle: z.string().trim().min(1).max(300),
  reportSubtitle: z.string().trim().min(1).max(300).nullable().optional()
});

export const aiWorkflowExecutionInputSchema = z.object({
  contractVersion: z.string().trim().min(1).max(100),
  workflowVersion: z.string().trim().min(1).max(100),
  assessment: z.object({
    id: z.string().trim().min(1).max(200),
    organizationId: z.string().trim().min(1).max(200),
    name: z.string().trim().min(1).max(300),
    submittedAt: z.string().trim().min(1).max(100).nullable(),
    intakeVersion: z.number().int().nonnegative()
  }),
  sections: z.array(
    z.object({
      key: z.string().trim().min(1).max(200),
      title: z.string().trim().min(1).max(300),
      status: z.string().trim().min(1).max(100),
      notes: z.string().trim().max(8000)
    })
  ).min(1).max(100),
  reportUrl: z.string().trim().url(),
  commercialContext: z.object({
    companyName: z.string().trim().min(1).max(300),
    contactName: z.string().trim().min(1).max(200).nullable(),
    contactEmail: z.string().trim().email().nullable(),
    industry: z.string().trim().min(1).max(200).nullable(),
    frameworks: z.array(z.string().trim().min(1).max(200)).max(25),
    planCode: z.string().trim().min(1).max(100).nullable(),
    workflowCode: z.string().trim().min(1).max(100).nullable(),
    reportTemplate: z.string().trim().min(1).max(200),
    processingDepth: z.string().trim().min(1).max(100),
    topConcerns: z.array(z.string().trim().min(1).max(500)).max(10)
  }),
  routingContext: z.object({
    routingDecisionId: z.string().trim().min(1).max(200).nullable(),
    workflowFamily: z.string().trim().min(1).max(100),
    routeKey: z.string().trim().min(1).max(200),
    processingTier: z.string().trim().min(1).max(100),
    reportTemplate: z.string().trim().min(1).max(200),
    workflowCode: z.string().trim().min(1).max(100),
    processingDepth: z.string().trim().min(1).max(100)
  }).nullable().optional(),
  workflowRouting: z.object({
    decisionId: z.string().trim().min(1).max(200).nullable(),
    workflowFamily: z.string().trim().min(1).max(100),
    routeKey: z.string().trim().min(1).max(200),
    processingTier: z.string().trim().min(1).max(100),
    reportDepth: z.string().trim().min(1).max(100),
    analysisDepth: z.string().trim().min(1).max(100),
    monitoringMode: z.string().trim().min(1).max(100),
    controlScoringMode: z.string().trim().min(1).max(100),
    featureFlags: z.record(z.string(), z.boolean())
  }).nullable().optional()
});

export const normalizedAuditWorkflowResultSchema = z.object({
  finalReport: z.string().trim().min(1).max(12000).nullable(),
  executiveSummary: z.string().trim().min(1).max(8000),
  postureScore: z.number().min(0).max(100),
  riskLevel: z.string().trim().min(1).max(100),
  topConcerns: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
  findings: z.array(aiFindingSchema).min(1).max(25),
  roadmap: z.array(aiRecommendationSchema).min(1).max(25),
  recommendations: z.array(aiRecommendationSchema).min(1).max(25),
  businessContext: aiBusinessContextSchema,
  frameworkMapping: aiFrameworkMappingSchema,
  riskAnalysis: aiRiskAnalysisSchema,
  riskScoring: aiRiskScoringSchema,
  remediationRoadmap: aiRemediationRoadmapSchema,
  finalReportMetadata: aiFinalReportMetadataSchema
});

export type AiFinding = z.infer<typeof aiFindingSchema>;
export type AiRecommendation = z.infer<typeof aiRecommendationSchema>;
export type AiBusinessContext = z.infer<typeof aiBusinessContextSchema>;
export type AiFrameworkMapping = z.infer<typeof aiFrameworkMappingSchema>;
export type AiRiskAnalysis = z.infer<typeof aiRiskAnalysisSchema>;
export type AiRiskScoring = z.infer<typeof aiRiskScoringSchema>;
export type AiRemediationRoadmap = z.infer<typeof aiRemediationRoadmapSchema>;
export type AiFinalReportMetadata = z.infer<typeof aiFinalReportMetadataSchema>;
export type AiWorkflowExecutionInput = z.infer<typeof aiWorkflowExecutionInputSchema>;
export type NormalizedAuditWorkflowResult = z.infer<
  typeof normalizedAuditWorkflowResultSchema
>;

export function normalizeAuditWorkflowResultShape(input: {
  finalReport?: string | null;
  executiveSummary: string;
  postureScore: number;
  riskLevel: string;
  topConcerns?: string[] | null;
  findings: AiFinding[];
  roadmap: AiRecommendation[];
  recommendations?: AiRecommendation[] | null;
  businessContext: AiBusinessContext;
  frameworkMapping: AiFrameworkMapping;
  riskAnalysis: AiRiskAnalysis;
  riskScoring: AiRiskScoring;
  remediationRoadmap: AiRemediationRoadmap;
  finalReportMetadata: AiFinalReportMetadata;
}) {
  const topConcerns =
    input.topConcerns && input.topConcerns.length > 0
      ? input.topConcerns
      : input.riskAnalysis.topConcerns;
  const recommendations = input.recommendations ?? input.roadmap;

  return normalizedAuditWorkflowResultSchema.parse({
    finalReport: input.finalReport ?? input.finalReportMetadata.finalReport,
    executiveSummary: input.executiveSummary,
    postureScore: input.postureScore,
    riskLevel: input.riskLevel,
    topConcerns,
    findings: input.findings,
    roadmap: input.roadmap,
    recommendations,
    businessContext: input.businessContext,
    frameworkMapping: input.frameworkMapping,
    riskAnalysis: input.riskAnalysis,
    riskScoring: input.riskScoring,
    remediationRoadmap: input.remediationRoadmap,
    finalReportMetadata: input.finalReportMetadata
  });
}

export function validateNormalizedAuditWorkflowResult(input: unknown) {
  return normalizedAuditWorkflowResultSchema.parse(input);
}
