import { randomUUID } from "node:crypto";
import { CommercialPlanCode, Prisma, prisma } from "@evolve-edge/db";
import { recordAuditLifecycleTransition } from "./audit-lifecycle";
import { requirePlanCapability } from "./plan-enforcement";
import type {
  ExecutiveReportFindingView,
  ExecutiveReportRoadmapActionView,
  ExecutiveReportViewModel
} from "./report-view-model";

export type ExecutiveBriefingSectionKey =
  | "context_overview"
  | "current_risk_posture"
  | "top_findings"
  | "business_impact"
  | "immediate_actions"
  | "stabilization_plan"
  | "strategic_recommendations"
  | "closing_advisory_note";

export type ExecutiveBriefingSection = {
  key: ExecutiveBriefingSectionKey;
  title: string;
  body: string;
  bullets: string[];
};

export type ExecutiveBriefingDraft = {
  summary: string;
  structuredSections: ExecutiveBriefingSection[];
};

export type ExecutiveBriefingRecord = {
  id: string;
  reportId: string;
  organizationId: string;
  summary: string;
  structuredSections: ExecutiveBriefingSection[];
  createdAt: Date;
  reportTitle: string;
  assessmentName: string;
};

type BriefingDb = Prisma.TransactionClient | typeof prisma;
type JsonRecord = Record<string, unknown>;

function readRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as JsonRecord;
}

function asRecordArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is JsonRecord =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item)
      )
    : [];
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function normalizePlanTier(planCode: CommercialPlanCode | null | undefined) {
  switch (planCode) {
    case CommercialPlanCode.ENTERPRISE:
      return "enterprise" as const;
    case CommercialPlanCode.SCALE:
      return "scale" as const;
    default:
      return null;
  }
}

function severityRank(value: string) {
  switch (value.trim().toUpperCase()) {
    case "CRITICAL":
      return 4;
    case "HIGH":
      return 3;
    case "MEDIUM":
    case "MODERATE":
      return 2;
    case "LOW":
      return 1;
    default:
      return 0;
  }
}

export function isExecutiveBriefingEligiblePlan(
  planCode: CommercialPlanCode | null | undefined
) {
  return normalizePlanTier(planCode) !== null;
}

export function buildExecutiveBriefingOutput(input: {
  reportId: string;
  reportTitle: string;
  assessmentName: string;
  versionLabel: string;
  planCode: CommercialPlanCode | null | undefined;
  reportJson: unknown;
}): Prisma.JsonObject | null {
  const planTier = normalizePlanTier(input.planCode);
  if (!planTier) {
    return null;
  }

  const reportJson = readRecord(input.reportJson);
  const riskLevel = readString(reportJson.riskLevel, "Moderate");
  const postureScore =
    typeof reportJson.postureScore === "number" && Number.isFinite(reportJson.postureScore)
      ? reportJson.postureScore
      : null;
  const findings = asRecordArray(reportJson.findings)
    .map((finding) => {
      const severity = readString(finding.severity, "Unknown");
      return {
        title: readString(finding.title, "Untitled risk"),
        severity,
        businessImpact: readString(
          finding.businessImpact,
          readString(
            finding.summary,
            "This risk introduces operational and customer trust friction."
          )
        ),
        urgency:
          severityRank(severity) >= 3 ||
          riskLevel.toUpperCase() === "HIGH" ||
          (typeof postureScore === "number" && postureScore <= 60)
            ? "Immediate executive attention"
            : "Track in the next operating cycle"
      };
    })
    .sort((left, right) => severityRank(right.severity) - severityRank(left.severity))
    .slice(0, 5);
  const roadmapHighlights = asRecordArray(reportJson.roadmap)
    .slice(0, 4)
    .map((item) =>
      `${readString(item.title, "Roadmap action")}: ${readString(
        item.timeline ?? item.targetTimeline,
        "timeline pending"
      )}`
    );
  const executiveSummary = readString(
    reportJson.executiveSummary,
    "Leadership should align remediation ownership, timing, and executive sponsorship."
  );
  const businessImpact =
    findings.length > 0
      ? Array.from(new Set(findings.map((finding) => finding.businessImpact)))
          .slice(0, 3)
          .join(" ")
      : executiveSummary;
  const urgencyFraming =
    findings.some((finding) => severityRank(finding.severity) >= 3) ||
    riskLevel.toUpperCase() === "HIGH"
      ? "Leadership should treat the next 30 days as the decisive window for reducing operational and compliance exposure."
      : "Use the upcoming planning cycle to address remaining issues before they accumulate into broader governance burden.";

  return {
    formatVersion: "executive-briefing.v1",
    reportId: input.reportId,
    reportTitle: input.reportTitle,
    assessmentName: input.assessmentName,
    versionLabel: input.versionLabel,
    planTier,
    summary: {
      keyRisks: findings,
      businessImpact,
      urgencyFraming,
      roadmapHighlights
    },
    talkingPoints: [
      `Overall posture is ${riskLevel}${typeof postureScore === "number" ? ` at ${postureScore}/100` : ""}.`,
      ...findings.slice(0, 3).map(
        (finding) =>
          `${finding.title} is a ${finding.severity.toLowerCase()} priority because ${finding.businessImpact}`
      ),
      roadmapHighlights[0]
        ? `The first roadmap milestone is ${roadmapHighlights[0].replace(":", ",")}.`
        : "The next roadmap milestone should assign clear executive ownership to remediation."
    ].slice(0, 5),
    slideReadyBullets: [
      {
        title: "Key Risks",
        bullets:
          findings.length > 0
            ? findings.map(
                (finding) => `${finding.title} (${finding.severity}) - ${finding.urgency}`
              )
            : ["Validated key risks are not yet available."]
      },
      {
        title: "Business Impact",
        bullets: [businessImpact, urgencyFraming]
      },
      {
        title: "Roadmap Highlights",
        bullets:
          roadmapHighlights.length > 0
            ? roadmapHighlights
            : ["Roadmap highlights will appear after remediation sequencing is finalized."]
      }
    ],
    meetingScript: {
      opening:
        `${input.reportTitle} gives leadership a concise view of the highest-risk issues, the business exposure they create, and the first actions that will reduce pressure fastest.`,
      riskWalkthrough:
        findings.length > 0
          ? findings.map(
              (finding) =>
                `Start with ${finding.title}. This matters because ${finding.businessImpact} The urgency is ${finding.urgency.toLowerCase()}.`
            )
          : [executiveSummary],
      close:
        roadmapHighlights[0]
          ? `Close by aligning owners to the roadmap, starting with ${roadmapHighlights[0]}.`
          : "Close by assigning executive owners and dates to the first remediation milestones."
    }
  } as Prisma.JsonObject;
}

function compactText(value: string | null | undefined, fallback: string) {
  const cleaned = value?.replace(/\s+/g, " ").trim() ?? "";
  return cleaned.length > 0 ? cleaned : fallback;
}

function sentence(value: string | null | undefined, fallback: string) {
  const text = compactText(value, fallback);
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function actionLabel(action: ExecutiveReportRoadmapActionView) {
  const owner = action.ownerRole ? ` Owner: ${action.ownerRole}.` : "";
  const timeline = action.timeline ? ` Timing: ${action.timeline}.` : "";
  return `${action.title}: ${sentence(action.description, "Action detail requires review")}${owner}${timeline}`;
}

function findingLabel(finding: ExecutiveReportFindingView) {
  return `${finding.title} (${finding.severity}): ${sentence(
    finding.summary,
    "Finding detail requires review"
  )}`;
}

function businessImpactFromFinding(finding: ExecutiveReportFindingView) {
  if (finding.businessImpact) {
    return `${finding.title}: ${sentence(finding.businessImpact, "Business impact requires review")}`;
  }

  return `${finding.title}: leadership should treat this as a business risk because it can weaken audit readiness, customer trust, or operating discipline.`;
}

function section(
  key: ExecutiveBriefingSectionKey,
  title: string,
  body: string,
  bullets: string[]
): ExecutiveBriefingSection {
  return {
    key,
    title,
    body: sentence(body, "Briefing detail requires review"),
    bullets: bullets.map((item) => sentence(item, "Briefing item requires review")).slice(0, 6)
  };
}

export function generateExecutiveBriefing(
  report: ExecutiveReportViewModel
): ExecutiveBriefingDraft {
  if (report.state !== "ready") {
    throw new Error("Executive briefing requires a finalized report.");
  }

  const topFindings = report.topFindings.slice(0, 5);
  const immediateActions = report.roadmap.days30.slice(0, 5);
  const stabilizationActions = [
    ...report.roadmap.days60,
    ...report.roadmap.days90
  ].slice(0, 6);
  const strategicRecommendations = [
    ...report.executiveBriefingTalkingPoints,
    ...report.topConcerns.map((concern) => `Keep leadership focus on ${concern}`)
  ].slice(0, 5);

  const summary = sentence(
    report.executiveSummary,
    "The audit report is ready for an executive briefing"
  );

  return {
    summary,
    structuredSections: [
      section(
        "context_overview",
        "Context Overview",
        `${report.assessmentName} has been converted into a leadership briefing for report walkthrough and decision support.`,
        [
          `Report: ${report.title}`,
          `Assessment: ${report.assessmentName}`,
          `Published: ${report.publishedAt.toISOString().slice(0, 10)}`
        ]
      ),
      section(
        "current_risk_posture",
        "Current Risk Posture",
        report.overallRiskPosture.summary,
        [
          `Risk level: ${report.overallRiskPosture.riskLevel ?? "Pending"}`,
          `Compliance score: ${
            typeof report.complianceScore === "number"
              ? `${report.complianceScore}/100`
              : "Pending"
          }`
        ]
      ),
      section(
        "top_findings",
        "Top 3-5 Findings",
        "Use these findings to focus the discussion on the issues most likely to affect trust, readiness, and execution.",
        topFindings.length > 0
          ? topFindings.map(findingLabel)
          : ["No validated findings are available in the report."]
      ),
      section(
        "business_impact",
        "Business Impact",
        "The briefing translates audit detail into leadership-level operating risk.",
        topFindings.length > 0
          ? topFindings.map(businessImpactFromFinding)
          : report.complianceAndGovernanceGaps.slice(0, 5)
      ),
      section(
        "immediate_actions",
        "Immediate Actions (0-30 days)",
        "The first 30 days should reduce the most visible governance and readiness risks.",
        immediateActions.length > 0
          ? immediateActions.map(actionLabel)
          : ["No immediate actions are currently available in the report."]
      ),
      section(
        "stabilization_plan",
        "Stabilization Plan (30-90 days)",
        "The 30-90 day plan should convert quick wins into repeatable operating controls.",
        stabilizationActions.length > 0
          ? stabilizationActions.map(actionLabel)
          : ["No stabilization actions are currently available in the report."]
      ),
      section(
        "strategic_recommendations",
        "Strategic Recommendations",
        "These recommendations should guide leadership alignment after the immediate remediation window.",
        strategicRecommendations.length > 0
          ? strategicRecommendations
          : ["Continue improving governance ownership, remediation cadence, and measurable control adoption."]
      ),
      section(
        "closing_advisory_note",
        "Closing Advisory Note",
        report.closingAdvisoryNote,
        [
          report.disclaimers.advisoryOnly,
          report.disclaimers.noGuarantee
        ]
      )
    ]
  };
}

function normalizeSections(value: unknown): ExecutiveBriefingSection[] {
  if (typeof value === "string") {
    try {
      return normalizeSections(JSON.parse(value));
    } catch {
      return [];
    }
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      return {
        key: String(record.key ?? "context_overview") as ExecutiveBriefingSectionKey,
        title: compactText(String(record.title ?? ""), "Briefing Section"),
        body: compactText(String(record.body ?? ""), "Briefing detail requires review."),
        bullets: Array.isArray(record.bullets)
          ? record.bullets
              .map((bullet) => compactText(String(bullet ?? ""), ""))
              .filter(Boolean)
          : []
      };
    })
    .filter((item): item is ExecutiveBriefingSection => Boolean(item));
}

function mapBriefingRow(row: {
  id: string;
  reportId: string;
  organizationId: string;
  summary: string;
  structuredSections: unknown;
  createdAt: Date;
  reportTitle: string;
  assessmentName: string;
}): ExecutiveBriefingRecord {
  return {
    ...row,
    structuredSections: normalizeSections(row.structuredSections)
  };
}

export async function getExecutiveBriefingById(
  briefingId: string,
  db: BriefingDb = prisma
): Promise<ExecutiveBriefingRecord | null> {
  const rows = await db.$queryRaw<Array<{
    id: string;
    reportId: string;
    organizationId: string;
    summary: string;
    structuredSections: unknown;
    createdAt: Date;
    reportTitle: string;
    assessmentName: string;
  }>>(Prisma.sql`
    SELECT
      b."id",
      b."reportId",
      b."organizationId",
      b."summary",
      b."structuredSections",
      b."createdAt",
      r."title" AS "reportTitle",
      a."name" AS "assessmentName"
    FROM "Briefing" b
    INNER JOIN "Report" r ON r."id" = b."reportId"
    INNER JOIN "Assessment" a ON a."id" = r."assessmentId"
    WHERE b."id" = ${briefingId}
    LIMIT 1
  `);

  return rows[0] ? mapBriefingRow(rows[0]) : null;
}

async function getBriefingByReportId(
  reportId: string,
  db: BriefingDb = prisma
) {
  const rows = await db.$queryRaw<Array<{
    id: string;
    reportId: string;
    organizationId: string;
    summary: string;
    structuredSections: unknown;
    createdAt: Date;
    reportTitle: string;
    assessmentName: string;
  }>>(Prisma.sql`
    SELECT
      b."id",
      b."reportId",
      b."organizationId",
      b."summary",
      b."structuredSections",
      b."createdAt",
      r."title" AS "reportTitle",
      a."name" AS "assessmentName"
    FROM "Briefing" b
    INNER JOIN "Report" r ON r."id" = b."reportId"
    INNER JOIN "Assessment" a ON a."id" = r."assessmentId"
    WHERE b."reportId" = ${reportId}
    LIMIT 1
  `);

  return rows[0] ? mapBriefingRow(rows[0]) : null;
}

export async function ensureExecutiveBriefingForReport(input: {
  reportId: string;
  organizationId: string;
  assessmentId: string;
  report: ExecutiveReportViewModel;
  db?: BriefingDb;
}): Promise<ExecutiveBriefingRecord> {
  const db = input.db ?? prisma;
  await requirePlanCapability({
    organizationId: input.organizationId,
    capability: "executive_briefing",
    db
  });

  const existing = await getBriefingByReportId(input.reportId, db);

  if (existing) {
    return existing;
  }

  const draft = generateExecutiveBriefing(input.report);
  const briefingId = `briefing_${randomUUID()}`;
  const rows = await db.$queryRaw<Array<{
    id: string;
    reportId: string;
    organizationId: string;
    summary: string;
    structuredSections: unknown;
    createdAt: Date;
    reportTitle: string;
    assessmentName: string;
  }>>(Prisma.sql`
    INSERT INTO "Briefing" (
      "id",
      "reportId",
      "organizationId",
      "summary",
      "structuredSections"
    )
    VALUES (
      ${briefingId},
      ${input.reportId},
      ${input.organizationId},
      ${draft.summary},
      ${JSON.stringify(draft.structuredSections)}::jsonb
    )
    ON CONFLICT ("reportId") DO NOTHING
    RETURNING
      "id",
      "reportId",
      "organizationId",
      "summary",
      "structuredSections",
      "createdAt",
      ${input.report.title} AS "reportTitle",
      ${input.report.assessmentName} AS "assessmentName"
  `);

  if (rows[0]) {
    const created = mapBriefingRow(rows[0]);
    await recordAuditLifecycleTransition({
      db,
      organizationId: input.organizationId,
      assessmentId: input.assessmentId,
      toStatus: "briefing_ready",
      actorType: "SYSTEM",
      actorLabel: "briefing-generator",
      reasonCode: "briefing.ready",
      linkages: {
        reportId: input.reportId,
        briefingId: created.id
      },
      evidence: {
        briefingId: created.id
      },
      metadata: {
        source: "executive_briefing"
      }
    });
    return created;
  }

  const createdByConcurrentRequest = await getBriefingByReportId(input.reportId, db);
  if (!createdByConcurrentRequest) {
    throw new Error("Executive briefing could not be created.");
  }

  return createdByConcurrentRequest;
}

export function briefingToMarkdown(briefing: Pick<
  ExecutiveBriefingRecord,
  "summary" | "structuredSections" | "reportTitle" | "assessmentName"
>) {
  const sections = briefing.structuredSections
    .map((sectionItem) => {
      const bullets = sectionItem.bullets
        .map((bullet) => `- ${bullet}`)
        .join("\n");
      return `## ${sectionItem.title}\n\n${sectionItem.body}${
        bullets ? `\n\n${bullets}` : ""
      }`;
    })
    .join("\n\n");

  return `# Executive Briefing: ${briefing.reportTitle}\n\nAssessment: ${briefing.assessmentName}\n\n${briefing.summary}\n\n${sections}\n`;
}
