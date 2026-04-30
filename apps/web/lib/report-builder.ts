import { Prisma } from "@evolve-edge/db";
import {
  normalizedAuditExecutionOutputSchema
} from "../src/server/ai/providers/types";

type JsonObject = Record<string, unknown>;
type NormalizedReportItem = {
  title: string;
  summary?: string;
  severity?: string;
  priority?: string;
  owner?: string | null;
  timeline?: string | null;
  frameworks?: string[];
};

export type NormalizedAuditReportInput = {
  executive_summary: string;
  risk_level: string;
  compliance_score: number;
  top_risks: NormalizedReportItem[];
  governance_gaps: string[];
  priority_actions: NormalizedReportItem[];
  roadmap_30_60_90: {
    days_30: NormalizedReportItem[];
    days_60: NormalizedReportItem[];
    days_90: NormalizedReportItem[];
  };
  assumptions: string[];
  limitations: string[];
};

export type AuditReportSnapshot = {
  snapshotId: string | null;
  workflowCode: string | null;
  organizationId: string;
  organizationName: string | null;
  assessmentId: string;
  assessmentName: string;
  generatedAt: Date;
  selectedPlan?: "starter" | "scale" | "enterprise" | null;
};

export type BuiltAuditReport = {
  title: string;
  status: "ready";
  executiveSummary: string;
  riskLevel: string;
  complianceScore: number;
  topRisks: NormalizedReportItem[];
  governanceGaps: string[];
  priorityActions: NormalizedReportItem[];
  roadmap: NormalizedAuditReportInput["roadmap_30_60_90"];
  advisoryNote: string;
  reportJson: Prisma.InputJsonValue;
  artifactMetadataJson: Prisma.InputJsonValue;
};

function compactText(value: string, fallback: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

function compactList<T>(items: T[], limit: number) {
  return items.slice(0, limit);
}

function stripSensitiveTokenLikeText(value: string) {
  return value
    .replace(/\b(?:sk|pk|rk|whsec|ghp|github_pat|xox[baprs])-[\w-]{8,}\b/gi, "[redacted secret]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[redacted identifier]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[redacted payment data]");
}

function safeText(value: string, fallback: string) {
  return stripSensitiveTokenLikeText(compactText(value, fallback));
}

function normalizeReportItem(item: NormalizedReportItem): NormalizedReportItem {
  return Object.fromEntries(
    Object.entries(item)
      .filter((entry) => entry[1] !== undefined)
      .map(([key, value]) => [
        key,
        typeof value === "string" ? safeText(value, "") : value
      ])
  ) as NormalizedReportItem;
}

function flattenRoadmap(roadmap: NormalizedAuditReportInput["roadmap_30_60_90"]) {
  return [
    ...roadmap.days_30.map((item) => ({ ...item, timeline: item.timeline ?? "0-30 days" })),
    ...roadmap.days_60.map((item) => ({ ...item, timeline: item.timeline ?? "31-60 days" })),
    ...roadmap.days_90.map((item) => ({ ...item, timeline: item.timeline ?? "61-90 days" }))
  ];
}

export function buildAuditReport(
  normalizedAiOutput: NormalizedAuditReportInput,
  snapshot: AuditReportSnapshot
): BuiltAuditReport {
  const normalized = normalizedAuditExecutionOutputSchema.parse(
    normalizedAiOutput
  ) as NormalizedAuditReportInput;
  const generatedAt = snapshot.generatedAt.toISOString();
  const topRisks = compactList(normalized.top_risks, 10).map(normalizeReportItem);
  const governanceGaps = compactList(normalized.governance_gaps, 12).map((gap) =>
    safeText(gap, "Governance gap requires review.")
  );
  const priorityActions = compactList(normalized.priority_actions, 12).map(normalizeReportItem);
  const roadmap = {
    days_30: compactList(normalized.roadmap_30_60_90.days_30, 8).map(normalizeReportItem),
    days_60: compactList(normalized.roadmap_30_60_90.days_60, 8).map(normalizeReportItem),
    days_90: compactList(normalized.roadmap_30_60_90.days_90, 8).map(normalizeReportItem)
  };
  const advisoryNote =
    "This report is advisory guidance for executive planning and control improvement. It does not guarantee compliance, certification, or a specific regulatory outcome.";
  const title = `${snapshot.assessmentName} Executive Audit Report`;
  const executiveSummary = safeText(
    normalized.executive_summary,
    "Executive summary requires review."
  );
  const riskLevel = safeText(normalized.risk_level, "Unscored");
  const complianceScore = normalized.compliance_score;
  const reportJson = {
    schemaVersion: "evolve-edge.audit-report.v1",
    source: "validated_ai_output",
    snapshotId: snapshot.snapshotId,
    workflowCode: snapshot.workflowCode,
    organizationId: snapshot.organizationId,
    assessmentId: snapshot.assessmentId,
    organizationName: snapshot.organizationName,
    generatedAt,
    status: "ready",
    sections: [
      "Executive Summary",
      "Overall Risk Posture",
      "Top Risks",
      "Governance & Compliance Gaps",
      "Priority Actions",
      "30-90 Day Roadmap",
      "Advisory Note"
    ],
    executiveSummary,
    riskLevel,
    postureScore: complianceScore,
    complianceScore,
    riskSummary: `Overall risk posture is ${riskLevel} with a compliance score of ${complianceScore}/100.`,
    topRisks,
    findings: topRisks.map((risk) => ({
      title: risk.title,
      severity: risk.severity ?? "Unknown",
      summary: risk.summary ?? "Risk summary requires review.",
      riskDomain: "governance",
      impactedFrameworks: risk.frameworks ?? []
    })),
    governanceGaps,
    gaps: governanceGaps,
    priorityActions,
    actions: priorityActions.map((action) => action.title),
    roadmap_30_60_90: roadmap,
    roadmap: flattenRoadmap(roadmap).map((item) => ({
      title: item.title,
      priority: item.priority ?? "MEDIUM",
      description: item.summary ?? "Action detail requires review.",
      ownerRole: item.owner ?? null,
      timeline: item.timeline ?? null,
      effort: null
    })),
    assumptions: normalized.assumptions.map((item) => safeText(item, "Assumption requires review.")),
    limitations: normalized.limitations.map((item) => safeText(item, "Limitation requires review.")),
    advisoryNote,
    deliveryStatus: "generated",
    workflowMetadata: {
      source: "validated_normalized_ai_output",
      reportBuilderVersion: "audit-report-builder.v1",
      generatedAt
    }
  } as Prisma.InputJsonValue;

  return {
    title,
    status: "ready",
    executiveSummary,
    riskLevel,
    complianceScore,
    topRisks,
    governanceGaps,
    priorityActions,
    roadmap,
    advisoryNote,
    reportJson,
    artifactMetadataJson: {
      downloadStatus: "ready",
      source: "structured_audit_report",
      artifactType: "html",
      pdfStatus: "deferred",
      availableAt: generatedAt
    } as Prisma.InputJsonValue
  };
}
