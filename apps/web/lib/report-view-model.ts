import {
  AssessmentStatus,
  JobStatus,
  Prisma,
  ReportStatus,
  prisma
} from "@evolve-edge/db";
import { auditWorkflowOutputSchema, type AuditWorkflowOutput } from "../src/server/ai/providers/types";
import { sanitizeWorkflowErrorMessage } from "../src/server/ai/observability/trace";
import {
  getAuditWorkflowProgressPresentation,
  parseAuditWorkflowProgress,
  type AuditWorkflowProgress,
  type AuditWorkflowProgressState
} from "./customer-runs";

type JsonObject = Record<string, unknown>;

type ReportRecordLike = {
  id: string;
  title: string;
  versionLabel: string;
  createdAt: Date;
  publishedAt: Date | null;
  status: ReportStatus;
  executiveSummary: string | null;
  reportJson: Prisma.JsonValue;
  assessment: {
    id: string;
    name: string;
    status: AssessmentStatus;
  };
};

type OverallRiskPostureLike = {
  score: number | null;
  level: string | null;
  summary: string | null;
};

type WorkflowSnapshot =
  | {
      state: "completed";
      result: AuditWorkflowOutput;
      safeError: null;
      progress: AuditWorkflowProgress | null;
    }
  | {
      state: "failed";
      result: null;
      safeError: string | null;
      progress: AuditWorkflowProgress | null;
    }
  | {
      state: "queued" | "running" | "unavailable";
      result: null;
      safeError: null;
      progress: AuditWorkflowProgress | null;
    };

export type ExecutiveReportRenderState =
  | "ready"
  | "queued"
  | "running"
  | "failed"
  | "unavailable";

export type ExecutiveReportFindingView = {
  title: string;
  severity: string;
  summary: string;
  businessImpact: string | null;
  affectedArea: string | null;
};

export type ExecutiveReportRoadmapActionView = {
  title: string;
  description: string;
  priority: string;
  ownerRole: string | null;
  timeline: string | null;
};

export type ExecutiveReportViewModel = {
  state: ExecutiveReportRenderState;
  workflowProgress: {
    status: AuditWorkflowProgressState | null;
    label: string;
    description: string;
    progressPercent: number;
    updatedAt: string | null;
  } | null;
  title: string;
  subtitle: string | null;
  assessmentName: string;
  versionLabel: string;
  publishedAt: Date;
  executiveSummary: string;
  overallRiskPosture: {
    riskLevel: string | null;
    summary: string;
  };
  complianceScore: number | null;
  topFindings: ExecutiveReportFindingView[];
  complianceAndGovernanceGaps: string[];
  roadmap: {
    days30: ExecutiveReportRoadmapActionView[];
    days60: ExecutiveReportRoadmapActionView[];
    days90: ExecutiveReportRoadmapActionView[];
  };
  executiveBriefingTalkingPoints: string[];
  closingAdvisoryNote: string;
  topConcerns: string[];
  emptyState: {
    title: string;
    description: string;
  } | null;
};

function readJsonObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as JsonObject;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatScore(value: number | null) {
  return typeof value === "number" ? `${value}/100` : "Pending";
}

function getWorkflowSnapshotState(assessmentStatus: AssessmentStatus): WorkflowSnapshot["state"] {
  switch (assessmentStatus) {
    case AssessmentStatus.ANALYSIS_QUEUED:
      return "queued";
    case AssessmentStatus.ANALYSIS_RUNNING:
      return "running";
    default:
      return "unavailable";
  }
}

function parseWorkflowProgressFromContext(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return parseAuditWorkflowProgress(
    (value as Record<string, unknown>).workflowProgress
  );
}

function buildWorkflowProgressViewModel(input: {
  workflowSnapshot: WorkflowSnapshot;
  reportStatus: ReportStatus;
}) {
  const snapshotProgress = input.workflowSnapshot.progress;

  if (snapshotProgress) {
    return {
      status: snapshotProgress.status,
      label: snapshotProgress.label,
      description: snapshotProgress.description,
      progressPercent: snapshotProgress.progressPercent,
      updatedAt: snapshotProgress.updatedAt
    };
  }

  if (
    input.workflowSnapshot.state === "completed" &&
    (input.reportStatus === ReportStatus.PENDING_REVIEW ||
      input.reportStatus === ReportStatus.GENERATED)
  ) {
    const presentation = getAuditWorkflowProgressPresentation("pending_review");
    return {
      status: "pending_review" as const,
      label: presentation.label,
      description: presentation.description,
      progressPercent: presentation.progressPercent,
      updatedAt: null
    };
  }

  if (
    input.workflowSnapshot.state === "completed" &&
    (input.reportStatus === ReportStatus.APPROVED ||
      input.reportStatus === ReportStatus.DELIVERED ||
      input.reportStatus === ReportStatus.READY)
  ) {
    const presentation = getAuditWorkflowProgressPresentation("completed");
    return {
      status: "completed" as const,
      label: presentation.label,
      description: presentation.description,
      progressPercent: presentation.progressPercent,
      updatedAt: null
    };
  }

  if (input.workflowSnapshot.state === "completed") {
    const presentation = getAuditWorkflowProgressPresentation("completed");
    return {
      status: "completed" as const,
      label: presentation.label,
      description: presentation.description,
      progressPercent: presentation.progressPercent,
      updatedAt: null
    };
  }

  if (input.workflowSnapshot.state === "failed") {
    const presentation = getAuditWorkflowProgressPresentation("failed");
    return {
      status: "failed" as const,
      label: presentation.label,
      description: presentation.description,
      progressPercent: presentation.progressPercent,
      updatedAt: null
    };
  }

  return null;
}

function mapLegacyFindings(reportJson: JsonObject | null): ExecutiveReportFindingView[] {
  const findings = Array.isArray(reportJson?.findings)
    ? (reportJson?.findings as Array<Record<string, unknown>>)
    : [];

  return findings.slice(0, 5).map((finding) => ({
    title: String(finding.title ?? "Untitled finding"),
    severity: String(finding.severity ?? "Unknown"),
    summary: String(finding.summary ?? "No finding summary is available."),
    businessImpact: null,
    affectedArea: readString(finding.riskDomain)
  }));
}

function mapLegacyRoadmap(reportJson: JsonObject | null) {
  const roadmap = Array.isArray(reportJson?.roadmap)
    ? (reportJson?.roadmap as Array<Record<string, unknown>>)
    : [];

  const actions = roadmap.map((item) => ({
    title: String(item.title ?? "Untitled action"),
    description: String(item.description ?? "No roadmap detail is available."),
    priority: String(item.priority ?? "Unknown"),
    ownerRole: readString(item.ownerRole),
    timeline: readString(item.timeline ?? item.targetTimeline)
  }));

  return {
    days30: actions.slice(0, 3),
    days60: actions.slice(3, 6),
    days90: actions.slice(6, 9)
  };
}

function buildWorkflowSnapshotEmptyState(state: ExecutiveReportRenderState) {
  switch (state) {
    case "queued":
      return {
        title: "Report queued for generation",
        description:
          "We have accepted the audit workflow and queued the executive report build. Refresh shortly to view the completed report."
      };
    case "running":
      return {
        title: "Report is being prepared",
        description:
          "The backend is running the LangGraph audit workflow and validating structured output. The report will appear here as soon as processing completes."
      };
    case "failed":
      return {
        title: "Report generation needs review",
        description:
          "This report is temporarily unavailable because workflow validation or execution failed. An operator can safely replay the workflow after reviewing the trace."
      };
    case "unavailable":
      return {
        title: "Report unavailable",
        description:
          "We do not have a validated report snapshot for this assessment yet. Check the assessment status or replay the workflow after confirming input readiness."
      };
    default:
      return null;
  }
}

function buildComplianceAndGovernanceGaps(result: AuditWorkflowOutput | null, reportJson: JsonObject | null) {
  if (!result) {
    return asStringArray(reportJson?.gaps).slice(0, 6);
  }

  const gaps = new Set<string>();
  const riskFlags = result.riskAnalysis.riskFlags;

  if (riskFlags.noFormalSecurityPolicies) {
    gaps.add("Formal security policies are incomplete or not consistently enforced.");
  }
  if (riskFlags.noAiGovernance) {
    gaps.add("AI governance and model oversight controls are not formally established.");
  }
  if (riskFlags.vendorRiskPresent) {
    gaps.add("Third-party vendor review and ongoing risk management need stronger discipline.");
  }
  if (riskFlags.sensitiveDataExposure) {
    gaps.add("Sensitive data handling safeguards need tighter control and monitoring.");
  }

  for (const theme of result.riskAnalysis.systemicThemes.slice(0, 4)) {
    gaps.add(theme);
  }

  return Array.from(gaps).slice(0, 6);
}

function buildTalkingPoints(result: AuditWorkflowOutput | null, posture: OverallRiskPostureLike, topFindings: ExecutiveReportFindingView[]) {
  if (!result) {
    const legacyPoints = [];
    if (posture.level) {
      legacyPoints.push(`Overall posture is currently assessed as ${posture.level}.`);
    }
    if (typeof posture.score === "number") {
      legacyPoints.push(`Current compliance score is ${posture.score}/100.`);
    }
    if (topFindings[0]) {
      legacyPoints.push(`Leadership attention should start with ${topFindings[0].title}.`);
    }
    return legacyPoints;
  }

  const points = [
    `Overall posture is ${result.riskScoring.riskLevel} at ${result.riskScoring.complianceScore}/100.`,
    `Highest-priority exposure: ${topFindings[0]?.title ?? "leadership review of top audit findings"}.`,
    `Priority frameworks: ${result.frameworkMapping.prioritizedFrameworks.slice(0, 3).join(", ")}.`,
    `Immediate focus for the next 30 days: ${result.remediationRoadmap.immediateActions[0]?.title ?? "stabilize governance and policy controls"}.`
  ];

  if (result.riskScoring.keyDrivers[0]) {
    points.push(`Primary score driver: ${result.riskScoring.keyDrivers[0]}.`);
  }

  return points.slice(0, 5);
}

function buildLegacyOverallRiskSummary(reportJson: JsonObject | null, posture: OverallRiskPostureLike) {
  return (
    posture.summary ??
    readString(reportJson?.riskSummary) ??
    "Validated risk posture details are not yet available for this report."
  );
}

function buildWorkflowSnapshotResult(outputPayload: Prisma.JsonValue | null): AuditWorkflowOutput | null {
  const payload = readJsonObject(outputPayload);
  const rawResult = payload ? payload.result : null;
  const parsed = auditWorkflowOutputSchema.safeParse(rawResult);
  return parsed.success ? parsed.data : null;
}

function buildFailedSnapshotError(outputPayload: Prisma.JsonValue | null, fallback: string | null) {
  const payload = readJsonObject(outputPayload);
  const failure = readJsonObject(payload?.failure);
  const reason = readString(failure?.reason);
  const node = readString(failure?.node);
  const message = readString(fallback);

  if (node) {
    return sanitizeWorkflowErrorMessage(`Workflow failed during ${node}.`);
  }

  if (reason) {
    return sanitizeWorkflowErrorMessage(reason);
  }

  return message ? sanitizeWorkflowErrorMessage(message) : null;
}

export async function getLatestAssessmentWorkflowSnapshot(
  assessmentId: string,
  db: Pick<typeof prisma, "analysisJob" | "customerRun"> = prisma
): Promise<WorkflowSnapshot> {
  const latestRun = await db.customerRun.findFirst({
    where: { assessmentId },
    orderBy: { createdAt: "desc" },
    select: {
      contextJson: true
    }
  });
  const progress = parseWorkflowProgressFromContext(latestRun?.contextJson ?? null);
  const completedJob = await db.analysisJob.findFirst({
    where: {
      assessmentId,
      provider: "openai_langgraph",
      status: JobStatus.SUCCEEDED
    },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    select: {
      outputPayload: true
    }
  });

  const completedResult = buildWorkflowSnapshotResult(completedJob?.outputPayload ?? null);
  if (completedResult) {
    return {
      state: "completed",
      result: completedResult,
      safeError: null,
      progress
    };
  }

  const failedJob = await db.analysisJob.findFirst({
    where: {
      assessmentId,
      provider: "openai_langgraph",
      status: JobStatus.FAILED
    },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    select: {
      outputPayload: true,
      errorMessage: true
    }
  });

  if (failedJob) {
    return {
      state: "failed",
      result: null,
      safeError: buildFailedSnapshotError(
        failedJob.outputPayload ?? null,
        readString(failedJob.errorMessage)
      ),
      progress
    };
  }

  return {
    state:
      progress?.status === "queued"
        ? "queued"
        : progress
          ? "running"
          : "unavailable",
    result: null,
    safeError: null,
    progress
  };
}

export function buildExecutiveReportViewModel(input: {
  report: ReportRecordLike;
  overallRiskPosture: OverallRiskPostureLike;
  workflowSnapshot: WorkflowSnapshot;
}): ExecutiveReportViewModel {
  const reportJson = readJsonObject(input.report.reportJson);
  const workflowState =
    input.workflowSnapshot.state === "unavailable"
      ? getWorkflowSnapshotState(input.report.assessment.status)
      : input.workflowSnapshot.state;
  const result = input.workflowSnapshot.result;
  const state: ExecutiveReportRenderState =
    workflowState === "completed"
      ? "ready"
      : workflowState === "failed"
        ? "failed"
        : workflowState;
  const workflowProgress = buildWorkflowProgressViewModel({
    workflowSnapshot: input.workflowSnapshot,
    reportStatus: input.report.status
  });
  const topFindings = result
    ? result.riskAnalysis.findings.slice(0, 5).map((finding) => ({
        title: finding.title,
        severity: finding.severity,
        summary: finding.summary,
        businessImpact: finding.businessImpact,
        affectedArea: finding.controlDomain
      }))
    : mapLegacyFindings(reportJson);
  const roadmap = result
    ? {
        days30: result.remediationRoadmap.immediateActions.map((action) => ({
          title: action.title,
          description: action.description,
          priority: action.priority,
          ownerRole: action.ownerRole,
          timeline: action.targetTimeline
        })),
        days60: result.remediationRoadmap.nearTermActions.map((action) => ({
          title: action.title,
          description: action.description,
          priority: action.priority,
          ownerRole: action.ownerRole,
          timeline: action.targetTimeline
        })),
        days90: result.remediationRoadmap.strategicActions.map((action) => ({
          title: action.title,
          description: action.description,
          priority: action.priority,
          ownerRole: action.ownerRole,
          timeline: action.targetTimeline
        }))
      }
    : mapLegacyRoadmap(reportJson);

  return {
    state,
    workflowProgress,
    title: result?.finalReport.reportTitle ?? input.report.title,
    subtitle: result?.finalReport.reportSubtitle ?? null,
    assessmentName: input.report.assessment.name,
    versionLabel: input.report.versionLabel,
    publishedAt: input.report.publishedAt ?? input.report.createdAt,
    executiveSummary:
      result?.finalReport.executiveSummary ??
      readString(input.report.executiveSummary) ??
      readString(reportJson?.executiveSummary) ??
      "Validated executive commentary is not available yet.",
    overallRiskPosture: {
      riskLevel: result?.riskScoring.riskLevel ?? input.overallRiskPosture.level,
      summary:
        result?.riskAnalysis.summary ??
        buildLegacyOverallRiskSummary(reportJson, input.overallRiskPosture)
    },
    complianceScore: result?.riskScoring.complianceScore ?? input.overallRiskPosture.score,
    topFindings,
    complianceAndGovernanceGaps: buildComplianceAndGovernanceGaps(result, reportJson),
    roadmap,
    executiveBriefingTalkingPoints: buildTalkingPoints(
      result,
      input.overallRiskPosture,
      topFindings
    ),
    closingAdvisoryNote:
      result?.finalReport.conclusion ??
      "Prioritize governance, remediation ownership, and measurable control adoption before the next customer-facing review cycle.",
    topConcerns: result?.topConcerns ?? asStringArray(reportJson?.topConcerns).slice(0, 5),
    emptyState:
      state === "ready"
        ? null
        : {
            ...buildWorkflowSnapshotEmptyState(state)!,
            description:
              state === "failed" && input.workflowSnapshot.safeError
                ? `${buildWorkflowSnapshotEmptyState(state)!.description} Last safe error: ${input.workflowSnapshot.safeError}`
                : workflowProgress?.description ??
                  buildWorkflowSnapshotEmptyState(state)!.description
          }
  };
}

function buildActionCards(actions: ExecutiveReportRoadmapActionView[], emptyMessage: string) {
  if (actions.length === 0) {
    return `<p class="empty">${escapeHtml(emptyMessage)}</p>`;
  }

  return actions
    .map(
      (action) => `<article class="card">
  <h3>${escapeHtml(action.title)}</h3>
  <p class="meta">${escapeHtml(action.priority)}${action.ownerRole ? ` · ${escapeHtml(action.ownerRole)}` : ""}${action.timeline ? ` · ${escapeHtml(action.timeline)}` : ""}</p>
  <p>${escapeHtml(action.description)}</p>
</article>`
    )
    .join("");
}

function buildFindingCards(findings: ExecutiveReportFindingView[]) {
  if (findings.length === 0) {
    return `<p class="empty">No validated findings are available yet.</p>`;
  }

  return findings
    .map(
      (finding) => `<article class="card">
  <h3>${escapeHtml(finding.title)}</h3>
  <p class="meta">${escapeHtml(finding.severity)}${finding.affectedArea ? ` · ${escapeHtml(finding.affectedArea)}` : ""}</p>
  <p>${escapeHtml(finding.summary)}</p>
  ${finding.businessImpact ? `<p class="meta" style="margin-top: 10px;">Business impact: ${escapeHtml(finding.businessImpact)}</p>` : ""}
</article>`
    )
    .join("");
}

function buildSimpleList(items: string[], emptyMessage: string) {
  if (items.length === 0) {
    return `<p class="empty">${escapeHtml(emptyMessage)}</p>`;
  }

  return `<ul>${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("")}</ul>`;
}

export function buildExecutiveReportHtml(model: ExecutiveReportViewModel) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(model.title)}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; background: #f3efe6; color: #13202c; }
      main { max-width: 1080px; margin: 0 auto; padding: 32px 20px 48px; }
      .panel { background: #fffdfa; border: 1px solid #e6ddd1; border-radius: 28px; padding: 32px; }
      .eyebrow { color: #0f766e; text-transform: uppercase; letter-spacing: 0.08em; font-size: 12px; font-weight: 700; }
      h1 { margin: 12px 0 6px; font-size: 34px; line-height: 1.2; }
      h2 { margin: 0 0 14px; font-size: 21px; }
      h3 { margin: 0 0 8px; font-size: 16px; }
      p { line-height: 1.7; margin: 0; }
      ul { margin: 0; padding-left: 20px; }
      li { margin: 0 0 10px; line-height: 1.6; }
      .meta { color: #5f6b77; font-size: 14px; }
      .grid { display: grid; gap: 16px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 24px; }
      .section-grid { display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 24px; }
      .stat, .section, .card, .empty-state { border: 1px solid #e6ddd1; border-radius: 22px; padding: 20px; }
      .stat, .card { background: #fcfaf6; }
      .section { background: #fff; margin-top: 24px; }
      .card { margin-top: 12px; }
      .empty-state { margin-top: 24px; background: #fff6e8; }
      .empty { color: #5f6b77; }
      @media (max-width: 900px) { .grid, .section-grid { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main>
      <div class="panel">
        <p class="eyebrow">Evolve Edge Executive Report</p>
        <h1>${escapeHtml(model.title)}</h1>
        <p class="meta">${escapeHtml(model.assessmentName)} · ${escapeHtml(model.versionLabel)} · Published ${escapeHtml(formatDate(model.publishedAt))}</p>
        ${model.subtitle ? `<p class="meta" style="margin-top: 8px;">${escapeHtml(model.subtitle)}</p>` : ""}
        ${model.emptyState ? `<section class="empty-state"><h2>${escapeHtml(model.emptyState.title)}</h2><p>${escapeHtml(model.emptyState.description)}</p></section>` : ""}
        <div class="grid">
          <div class="stat">
            <p class="meta">Overall Risk Posture</p>
            <h2>${escapeHtml(model.overallRiskPosture.riskLevel ?? "Pending")}</h2>
            <p class="meta">${escapeHtml(model.overallRiskPosture.summary)}</p>
          </div>
          <div class="stat">
            <p class="meta">Compliance Score</p>
            <h2>${escapeHtml(formatScore(model.complianceScore))}</h2>
          </div>
          <div class="stat">
            <p class="meta">Top Concerns</p>
            <h2>${escapeHtml(model.topConcerns.length > 0 ? `${model.topConcerns.length} priorities` : "Pending")}</h2>
            <p class="meta">${escapeHtml(model.topConcerns[0] ?? "Validated executive concerns will appear here once report generation completes.")}</p>
          </div>
        </div>

        <section class="section">
          <h2>Executive Summary</h2>
          <p>${escapeHtml(model.executiveSummary)}</p>
        </section>

        <section class="section-grid">
          <section class="section">
            <h2>Top Findings</h2>
            ${buildFindingCards(model.topFindings)}
          </section>
          <section class="section">
            <h2>Compliance &amp; Governance Gaps</h2>
            ${buildSimpleList(
              model.complianceAndGovernanceGaps,
              "No material compliance and governance gaps are currently summarized."
            )}
          </section>
        </section>

        <section class="section">
          <h2>30/60/90 Day Roadmap</h2>
          <div class="section-grid" style="margin-top: 0;">
            <section class="card">
              <h3>0-30 Days</h3>
              ${buildActionCards(
                model.roadmap.days30,
                "No immediate actions are currently available."
              )}
            </section>
            <section class="card">
              <h3>31-60 Days</h3>
              ${buildActionCards(
                model.roadmap.days60,
                "No stabilization actions are currently available."
              )}
            </section>
            <section class="card">
              <h3>61-90 Days</h3>
              ${buildActionCards(
                model.roadmap.days90,
                "No maturity actions are currently available."
              )}
            </section>
          </div>
        </section>

        <section class="section-grid">
          <section class="section">
            <h2>Executive Briefing Talking Points</h2>
            ${buildSimpleList(
              model.executiveBriefingTalkingPoints,
              "Briefing talking points will appear after validated report assembly."
            )}
          </section>
          <section class="section">
            <h2>Closing Advisory Note</h2>
            <p>${escapeHtml(model.closingAdvisoryNote)}</p>
          </section>
        </section>
      </div>
    </main>
  </body>
</html>`;
}
