import {
  Prisma,
  prisma,
} from "@evolve-edge/db";
import type { EvalCheckResult } from "../evals/types";
import { logServerEvent } from "../../../../lib/monitoring";
import { redactSecrets } from "../../../../lib/security-redaction";

type AiFeedbackDbClient = Prisma.TransactionClient | typeof prisma;

export const AI_WORKFLOW_FEEDBACK_TYPES = {
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  EDITED: "EDITED",
  REGENERATED: "REGENERATED",
  FLAGGED: "FLAGGED",
  CUSTOMER_FEEDBACK: "CUSTOMER_FEEDBACK",
} as const;

export type AiWorkflowFeedbackType =
  (typeof AI_WORKFLOW_FEEDBACK_TYPES)[keyof typeof AI_WORKFLOW_FEEDBACK_TYPES];

type FeedbackCategory =
  | "approval"
  | "review_rejected"
  | "regeneration_requested"
  | "framework_mapping"
  | "risk_analysis"
  | "risk_scoring"
  | "roadmap_detail"
  | "final_report_quality"
  | "accuracy"
  | "evidence_basis"
  | "structured_output"
  | "sensitive_content"
  | "customer_feedback"
  | "eval_flagged";

const FAILURE_ALERT_THRESHOLDS = new Set([3, 5, 10]);
const NEGATIVE_FEEDBACK_TYPES = [
  AI_WORKFLOW_FEEDBACK_TYPES.REJECTED,
  AI_WORKFLOW_FEEDBACK_TYPES.REGENERATED,
  AI_WORKFLOW_FEEDBACK_TYPES.FLAGGED,
] as const;

const CATEGORY_PATTERNS: Array<{
  category: FeedbackCategory;
  pattern: RegExp;
}> = [
  { category: "framework_mapping", pattern: /\bframework|soc 2|iso|nist|hipaa|glba|pci\b/i },
  { category: "risk_analysis", pattern: /\bgovernance|access|vendor|incident|documentation|monitoring|data handling|gap\b/i },
  { category: "risk_scoring", pattern: /\bscore|scoring|severity|risk level\b/i },
  { category: "roadmap_detail", pattern: /\broadmap|remediation|owner|timeline|30\/60\/90|quick win\b/i },
  { category: "final_report_quality", pattern: /\breport|executive summary|briefing|generic|tone|filler\b/i },
  { category: "accuracy", pattern: /\bwrong|incorrect|inaccurate|hallucinat|invent|unsupported\b/i },
  { category: "evidence_basis", pattern: /\bevidence|support|basis|justification|source\b/i },
  { category: "structured_output", pattern: /\bjson|schema|format|missing section|required section\b/i },
  { category: "sensitive_content", pattern: /\bsensitive|secret|email|prompt|internal\b/i },
];

const EVAL_CHECK_CATEGORY_MAP: Array<{
  checkName: string;
  category: FeedbackCategory;
}> = [
  { checkName: "valid structured output", category: "structured_output" },
  { checkName: "required report sections exist", category: "final_report_quality" },
  { checkName: "risk score is within expected range", category: "risk_scoring" },
  { checkName: "framework mapping is relevant", category: "framework_mapping" },
  { checkName: "minimum risk categories are covered", category: "risk_analysis" },
  { checkName: "finding severities stay in expected range", category: "risk_scoring" },
  { checkName: "sensitive fixture data is not reproduced unnecessarily", category: "sensitive_content" },
  { checkName: "internal implementation details are not exposed", category: "sensitive_content" },
  { checkName: "no hallucinated legal guarantees appear", category: "accuracy" },
  { checkName: "final report is executive ready", category: "final_report_quality" },
];

export function sanitizeAiFeedbackNotes(notes?: string | null) {
  const trimmed = notes?.trim();
  if (!trimmed) {
    return null;
  }

  const sanitized = redactSecrets({ notes: trimmed }).notes;
  return typeof sanitized === "string" ? sanitized.slice(0, 2_000) : null;
}

export function extractWorkflowDispatchIdFromReportJson(reportJson: Prisma.JsonValue) {
  if (!reportJson || typeof reportJson !== "object" || Array.isArray(reportJson)) {
    return null;
  }

  const workflowMetadata = (reportJson as Record<string, unknown>).workflowMetadata;
  if (!workflowMetadata || typeof workflowMetadata !== "object" || Array.isArray(workflowMetadata)) {
    return null;
  }

  const workflowDispatchId = (workflowMetadata as Record<string, unknown>).workflowDispatchId;
  return typeof workflowDispatchId === "string" && workflowDispatchId.trim().length > 0
    ? workflowDispatchId
    : null;
}

export function deriveFeedbackCategories(input: {
  feedbackType: AiWorkflowFeedbackType;
  notes?: string | null;
}) {
  const categories = new Set<FeedbackCategory>();
  const notes = sanitizeAiFeedbackNotes(input.notes);

  switch (input.feedbackType) {
    case AI_WORKFLOW_FEEDBACK_TYPES.APPROVED:
      categories.add("approval");
      break;
    case AI_WORKFLOW_FEEDBACK_TYPES.REJECTED:
      categories.add("review_rejected");
      break;
    case AI_WORKFLOW_FEEDBACK_TYPES.EDITED:
      categories.add("final_report_quality");
      break;
    case AI_WORKFLOW_FEEDBACK_TYPES.REGENERATED:
      categories.add("regeneration_requested");
      break;
    case AI_WORKFLOW_FEEDBACK_TYPES.FLAGGED:
      categories.add("eval_flagged");
      break;
    case AI_WORKFLOW_FEEDBACK_TYPES.CUSTOMER_FEEDBACK:
      categories.add("customer_feedback");
      break;
  }

  if (notes) {
    for (const matcher of CATEGORY_PATTERNS) {
      if (matcher.pattern.test(notes)) {
        categories.add(matcher.category);
      }
    }
  }

  return Array.from(categories);
}

export async function recordAiWorkflowFeedback(input: {
  workflowDispatchId: string;
  organizationId: string;
  reportId?: string | null;
  feedbackType: AiWorkflowFeedbackType;
  notes?: string | null;
  metadata?: Prisma.InputJsonValue;
  db?: AiFeedbackDbClient;
}) {
  const db = input.db ?? prisma;
  const sanitizedNotes = sanitizeAiFeedbackNotes(input.notes);
  const categories = deriveFeedbackCategories({
    feedbackType: input.feedbackType,
    notes: sanitizedNotes,
  });

  const record = await (db as any).aiWorkflowFeedback.create({
    data: {
      workflowDispatchId: input.workflowDispatchId,
      organizationId: input.organizationId,
      reportId: input.reportId ?? null,
      feedbackType: input.feedbackType,
      notes: sanitizedNotes,
      metadataJson: {
        categories,
        ...(input.metadata && typeof input.metadata === "object"
          ? (input.metadata as Prisma.JsonObject)
          : {}),
      },
    },
  });

  await maybeAlertRepeatedFailures({
    db,
    organizationId: input.organizationId,
    workflowDispatchId: input.workflowDispatchId,
    feedbackType: input.feedbackType,
    reportId: input.reportId ?? null,
  });

  return record;
}

async function maybeAlertRepeatedFailures(input: {
  db: AiFeedbackDbClient;
  organizationId: string;
  workflowDispatchId: string;
  feedbackType: AiWorkflowFeedbackType;
  reportId: string | null;
}) {
  if (!NEGATIVE_FEEDBACK_TYPES.includes(input.feedbackType as (typeof NEGATIVE_FEEDBACK_TYPES)[number])) {
    return;
  }

  const lookbackStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const failureCount = await (input.db as any).aiWorkflowFeedback.count({
    where: {
      organizationId: input.organizationId,
      feedbackType: {
        in: [...NEGATIVE_FEEDBACK_TYPES],
      },
      createdAt: {
        gte: lookbackStart,
      },
    },
  });

  if (!FAILURE_ALERT_THRESHOLDS.has(failureCount)) {
    return;
  }

  logServerEvent("warn", "ai.feedback.repeated_failures", {
    org_id: input.organizationId,
    resource_id: input.reportId,
    source: "ai.feedback",
    metadata: {
      workflowDispatchId: input.workflowDispatchId,
      failureCount,
      lookbackDays: 30,
    },
  });

  await (input.db as any).notification.create({
    data: {
      organizationId: input.organizationId,
      type: "ai.feedback.alert",
      title: "AI workflow quality review needed",
      body: `Detected ${failureCount} flagged, rejected, or regenerated AI report events in the last 30 days.`,
      actionUrl: "/dashboard/reports",
    },
  });
}

function readCategories(metadataJson: Prisma.JsonValue | null | undefined) {
  if (!metadataJson || typeof metadataJson !== "object" || Array.isArray(metadataJson)) {
    return [] as string[];
  }

  const categories = (metadataJson as Record<string, unknown>).categories;
  return Array.isArray(categories)
    ? categories.filter((value): value is string => typeof value === "string")
    : [];
}

export async function getOrganizationAiFeedbackSummary(input: {
  organizationId: string;
  lookbackDays?: number;
  db?: AiFeedbackDbClient;
}) {
  const db = input.db ?? prisma;
  const lookbackStart = new Date(
    Date.now() - (input.lookbackDays ?? 30) * 24 * 60 * 60 * 1000
  );
  const feedback = await (db as any).aiWorkflowFeedback.findMany({
    where: {
      organizationId: input.organizationId,
      createdAt: {
        gte: lookbackStart,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 250,
  });

  const approvedCount = feedback.filter(
    (entry: { feedbackType: AiWorkflowFeedbackType }) =>
      entry.feedbackType === AI_WORKFLOW_FEEDBACK_TYPES.APPROVED
  ).length;
  const rejectedCount = feedback.filter(
    (entry: { feedbackType: AiWorkflowFeedbackType }) =>
      entry.feedbackType === AI_WORKFLOW_FEEDBACK_TYPES.REJECTED
  ).length;
  const flaggedCount = feedback.filter(
    (entry: { feedbackType: AiWorkflowFeedbackType }) =>
      entry.feedbackType === AI_WORKFLOW_FEEDBACK_TYPES.FLAGGED
  ).length;
  const editedCount = feedback.filter(
    (entry: { feedbackType: AiWorkflowFeedbackType }) =>
      entry.feedbackType === AI_WORKFLOW_FEEDBACK_TYPES.EDITED
  ).length;
  const regeneratedCount = feedback.filter(
    (entry: { feedbackType: AiWorkflowFeedbackType }) =>
      entry.feedbackType === AI_WORKFLOW_FEEDBACK_TYPES.REGENERATED
  ).length;
  const reviewedCount = approvedCount + rejectedCount;
  const categoryCounts = new Map<string, number>();

  for (const entry of feedback) {
    for (const category of readCategories(entry.metadataJson)) {
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    }
  }

  const topFailureCategories = Array.from(categoryCounts.entries())
    .filter(([category]) => category !== "approval")
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([category, count]) => ({ category, count }));

  const promptWeaknesses = topFailureCategories
    .map((entry) => ({
      ...entry,
      ...mapCategoryToPromptWeakness(entry.category),
    }))
    .filter(
      (
        entry
      ): entry is typeof entry & {
        node: string;
        promptFile: string;
        reason: string;
      } => entry.node !== null && entry.promptFile !== null && entry.reason !== null
    )
    .slice(0, 3);

  const modelFailureSignals = topFailureCategories
    .map((entry) => ({
      signal: mapCategoryToModelSignal(entry.category),
      count: entry.count,
    }))
    .filter((entry): entry is { signal: string; count: number } => entry.signal !== null)
    .slice(0, 3);

  return {
    lookbackDays: input.lookbackDays ?? 30,
    reviewedCount,
    approvalRate:
      reviewedCount > 0 ? Math.round((approvedCount / reviewedCount) * 100) : 0,
    rejectionRate:
      reviewedCount > 0 ? Math.round((rejectedCount / reviewedCount) * 100) : 0,
    approvedCount,
    rejectedCount,
    flaggedCount,
    editedCount,
    regeneratedCount,
    topFailureCategories,
    promptWeaknesses,
    modelFailureSignals,
  };
}

function mapCategoryToPromptWeakness(category: string) {
  switch (category) {
    case "framework_mapping":
      return {
        node: "framework_mapper",
        promptFile: "src/server/ai/prompts/framework-mapper.prompt.ts",
        reason: "Framework relevance is drifting from expected industry fit.",
      };
    case "risk_analysis":
    case "accuracy":
    case "evidence_basis":
      return {
        node: "risk_analysis",
        promptFile: "src/server/ai/prompts/risk-analysis.prompt.ts",
        reason: "Findings need stronger evidence grounding or more reliable gap analysis.",
      };
    case "risk_scoring":
      return {
        node: "risk_scoring",
        promptFile: "src/server/ai/prompts/risk-scoring.prompt.ts",
        reason: "Risk scoring or severity framing is not aligning with policy.",
      };
    case "roadmap_detail":
      return {
        node: "remediation_roadmap",
        promptFile: "src/server/ai/prompts/remediation-roadmap.prompt.ts",
        reason: "Remediation guidance may be too generic or not operational enough.",
      };
    case "final_report_quality":
    case "structured_output":
      return {
        node: "final_report",
        promptFile: "src/server/ai/prompts/final-report.prompt.ts",
        reason: "The final report is missing sections or not meeting executive-quality expectations.",
      };
    default:
      return {
        node: null,
        promptFile: null,
        reason: null,
      };
  }
}

function mapCategoryToModelSignal(category: string) {
  switch (category) {
    case "structured_output":
      return "structured_output_drift";
    case "accuracy":
    case "evidence_basis":
      return "factual_reliability";
    case "final_report_quality":
      return "executive_report_quality";
    case "framework_mapping":
      return "framework_relevance";
    case "risk_scoring":
      return "scoring_alignment";
    default:
      return null;
  }
}

export function buildEvalFeedbackSignal(checks: EvalCheckResult[]) {
  const failedChecks = checks.filter((check) => !check.passed);
  const categories = new Set<FeedbackCategory>();

  for (const failedCheck of failedChecks) {
    const match = EVAL_CHECK_CATEGORY_MAP.find(
      (candidate) => candidate.checkName === failedCheck.name
    );
    if (match) {
      categories.add(match.category);
    }
  }

  if (failedChecks.length > 0) {
    categories.add("eval_flagged");
  }

  return {
    flagged: failedChecks.length > 0,
    failureCategories: Array.from(categories),
  };
}
