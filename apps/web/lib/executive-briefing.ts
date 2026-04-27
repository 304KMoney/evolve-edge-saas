import { CommercialPlanCode, Prisma } from "@evolve-edge/db";

type JsonRecord = Record<string, unknown>;

type BriefingRiskView = {
  title: string;
  severity: string;
  businessImpact: string;
  urgency: string;
};

export type ExecutiveBriefingOutput = {
  formatVersion: "executive-briefing.v1";
  reportId: string;
  reportTitle: string;
  assessmentName: string;
  versionLabel: string;
  planTier: "scale" | "enterprise";
  summary: {
    keyRisks: BriefingRiskView[];
    businessImpact: string;
    urgencyFraming: string;
    roadmapHighlights: string[];
  };
  talkingPoints: string[];
  slideReadyBullets: Array<{
    title: string;
    bullets: string[];
  }>;
  meetingScript: {
    opening: string;
    riskWalkthrough: string[];
    close: string;
  };
};

function readRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as JsonRecord;
}

function asRecordArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
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

function urgencyForFinding(severity: string, riskLevel: string, postureScore: number | null) {
  const normalizedSeverity = severity.trim().toUpperCase();
  if (normalizedSeverity === "CRITICAL" || normalizedSeverity === "HIGH") {
    return "Immediate executive attention";
  }

  if (riskLevel.toUpperCase() === "HIGH" || (typeof postureScore === "number" && postureScore <= 60)) {
    return "Prioritize this quarter";
  }

  return "Track in the next operating cycle";
}

function buildBusinessImpactSummary(risks: BriefingRiskView[], executiveSummary: string) {
  if (risks.length === 0) {
    return executiveSummary;
  }

  const distinctImpacts = Array.from(new Set(risks.map((risk) => risk.businessImpact))).slice(0, 3);
  return distinctImpacts.join(" ");
}

function buildUrgencyFraming(riskLevel: string, postureScore: number | null, keyRisks: BriefingRiskView[]) {
  const severeCount = keyRisks.filter((risk) => severityRank(risk.severity) >= 3).length;

  if (riskLevel.toUpperCase() === "HIGH" || severeCount >= 2) {
    return "Leadership should treat the next 30 days as the decisive window for reducing operational and compliance exposure.";
  }

  if (typeof postureScore === "number" && postureScore < 75) {
    return "The next quarter should focus on closing control gaps before they become audit friction or customer trust issues.";
  }

  return "Use the upcoming planning cycle to address the remaining issues before they accumulate into a broader governance burden.";
}

export function isExecutiveBriefingEligiblePlan(planCode: CommercialPlanCode | null | undefined) {
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
  const findings = asRecordArray(reportJson.findings)
    .map((finding) => {
      const severity = readString(finding.severity, "Unknown");
      return {
        title: readString(finding.title, "Untitled risk"),
        severity,
        businessImpact: readString(
          finding.businessImpact,
          readString(finding.summary, "This risk introduces operational and customer trust friction.")
        ),
        urgency: urgencyForFinding(
          severity,
          readString(reportJson.riskLevel, "Moderate"),
          typeof reportJson.postureScore === "number" ? reportJson.postureScore : null
        )
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
    "Leadership should use this briefing to align remediation ownership, timing, and executive sponsorship."
  );
  const riskLevel = readString(reportJson.riskLevel, "Moderate");
  const postureScore =
    typeof reportJson.postureScore === "number" && Number.isFinite(reportJson.postureScore)
      ? reportJson.postureScore
      : null;
  const businessImpact = buildBusinessImpactSummary(findings, executiveSummary);
  const urgencyFraming = buildUrgencyFraming(riskLevel, postureScore, findings);

  const talkingPoints = [
    `Overall posture is ${riskLevel}${typeof postureScore === "number" ? ` at ${postureScore}/100` : ""}.`,
    ...findings.slice(0, 3).map(
      (risk) => `${risk.title} is a ${risk.severity.toLowerCase()} priority because ${risk.businessImpact}`
    ),
    roadmapHighlights[0]
      ? `The first roadmap milestone is ${roadmapHighlights[0].replace(":", ",")}.`
      : "The next roadmap milestone should assign clear executive ownership to remediation."
  ].slice(0, 5);

  const slideReadyBullets = [
    {
      title: "Key Risks",
      bullets:
        findings.length > 0
          ? findings.map((risk) => `${risk.title} (${risk.severity}) - ${risk.urgency}`)
          : ["Validated key risks are not yet available."]
    },
    {
      title: "Business Impact",
      bullets: [
        businessImpact,
        urgencyFraming
      ]
    },
    {
      title: "Roadmap Highlights",
      bullets:
        roadmapHighlights.length > 0
          ? roadmapHighlights
          : ["Roadmap highlights will appear after remediation sequencing is finalized."]
    }
  ];

  const meetingScript = {
    opening:
      `${input.reportTitle} gives leadership a concise view of the highest-risk issues, the business exposure they create, and the first actions that will reduce pressure fastest.`,
    riskWalkthrough:
      findings.length > 0
        ? findings.map(
            (risk) =>
              `Start with ${risk.title}. This matters because ${risk.businessImpact} The urgency is ${risk.urgency.toLowerCase()}.`
          )
        : [executiveSummary],
    close:
      roadmapHighlights[0]
        ? `Close by aligning owners to the roadmap, starting with ${roadmapHighlights[0]}.`
        : "Close by assigning executive owners and dates to the first remediation milestones."
  };

  const output: ExecutiveBriefingOutput = {
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
    talkingPoints,
    slideReadyBullets,
    meetingScript
  };

  return output as unknown as Prisma.JsonObject;
}
