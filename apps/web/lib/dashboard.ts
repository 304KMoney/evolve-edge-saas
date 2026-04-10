import { prisma } from "@evolve-edge/db";
import type { DashboardData } from "../components/dashboard-shell";
import { getCurrentSession } from "./auth";

function formatDate(date: Date | null | undefined) {
  if (!date) return "Draft";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function titleCaseSeverity(value: string) {
  return value.toUpperCase();
}

function buildFallbackDashboardData(organizationName: string): DashboardData {
  return {
    organizationName,
    planName: "No Plan",
    planSummary: "Connect billing and seed demo data to populate this workspace.",
    workspaceLabel: "AI Governance Workspace",
    metrics: [],
    activeAssessment: {
      name: "No active assessment",
      status: "Not started",
      progress: 0,
      nextStep: "Create your first assessment.",
      eta: "Waiting for setup"
    },
    domainScores: [],
    findings: [],
    roadmap: [],
    reports: []
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  const session = await getCurrentSession();

  let organization = null;

  try {
    organization = await prisma.organization.findFirst({
      where: { slug: session.organization.slug },
      include: {
        subscriptions: {
          include: { plan: true },
          orderBy: { createdAt: "desc" },
          take: 1
        },
        frameworkSelections: {
          include: { framework: true }
        },
        assessments: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            findings: {
              orderBy: { sortOrder: "asc" },
              take: 3
            },
            recommendations: {
              orderBy: { sortOrder: "asc" },
              take: 3
            },
            analysisJobs: {
              orderBy: { createdAt: "desc" },
              take: 1
            }
          }
        },
        reports: {
          orderBy: { publishedAt: "desc" },
          take: 2
        }
      }
    });
  } catch (error) {
    console.error("Dashboard data fallback triggered", error);
    return buildFallbackDashboardData(session.organization.name);
  }

  if (!organization) {
    return buildFallbackDashboardData(session.organization.name);
  }

  const subscription = organization.subscriptions[0];
  const assessment = organization.assessments[0];
  const reports = organization.reports;
  const frameworks = organization.frameworkSelections.map((item) => item.framework.name);
  const criticalFindings =
    assessment?.findings.filter((finding) => finding.severity === "CRITICAL").length ?? 0;
  const currentPeriodEnd = subscription?.currentPeriodEnd;

  return {
    organizationName: organization.name,
    planName: subscription?.plan.name ?? "Unassigned Plan",
    planSummary:
      "Quarterly reassessments, report archive, remediation roadmap, and collaborative workspace controls.",
    workspaceLabel: "AI Governance Workspace",
    metrics: [
      {
        label: "Posture Score",
        value: `${organization.currentPostureScore ?? assessment?.postureScore ?? 0} / 100`,
        note: "+8 since prior assessment",
        tone: "positive"
      },
      {
        label: "Critical Findings",
        value: String(criticalFindings),
        note: "Priority items requiring executive visibility",
        tone: criticalFindings > 0 ? "alert" : "neutral"
      },
      {
        label: "Framework Coverage",
        value: `${frameworks.length} active`,
        note: frameworks.join(", "),
        tone: "neutral"
      },
      {
        label: "Renewal Window",
        value: currentPeriodEnd ? formatDate(currentPeriodEnd) : "Not scheduled",
        note: "Quarterly reassessment recommended",
        tone: "neutral"
      }
    ],
    activeAssessment: {
      name: assessment?.name ?? "No active assessment",
      status: assessment?.status.replaceAll("_", " ") ?? "Not started",
      progress: assessment?.status === "ANALYSIS_RUNNING" ? 68 : 20,
      nextStep:
        assessment?.analysisJobs[0]?.status === "RUNNING"
          ? "Generate executive summary and publish findings package"
          : "Complete intake and queue analysis",
      eta:
        assessment?.analysisJobs[0]?.status === "RUNNING"
          ? "Ready in about 18 minutes"
          : "Waiting for input completion"
    },
    domainScores: [
      { label: "Governance", score: 68 },
      { label: "Security", score: 75 },
      { label: "Privacy", score: 64 },
      { label: "Compliance", score: 70 }
    ],
    findings:
      assessment?.findings.map((finding) => ({
        title: finding.title,
        severity: titleCaseSeverity(finding.severity),
        framework: Array.isArray(finding.impactedFrameworks)
          ? finding.impactedFrameworks.join(" / ")
          : "Mapped frameworks pending",
        owner: finding.riskDomain
      })) ?? [],
    roadmap:
      assessment?.recommendations.map((item) => ({
        title: item.title,
        priority: item.priority,
        due: item.targetTimeline ?? "TBD",
        effort: item.effort ?? "Unknown"
      })) ?? [],
    reports: reports.map((report) => ({
      title: report.title,
      type: report.pdfUrl ? "Executive PDF" : "Interactive report",
      date: formatDate(report.publishedAt ?? report.createdAt)
    }))
  };
}
