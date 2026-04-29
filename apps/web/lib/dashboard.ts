import { AssessmentStatus, Prisma, prisma } from "@evolve-edge/db";
import type { DashboardData } from "../components/dashboard-shell";
import { FRAMEWORK_COVERAGE_ENTRIES } from "./authority-content";
import { getOrganizationActivationSnapshot } from "./activation";
import { requireCurrentSession } from "./auth";
import { getOrganizationEntitlements } from "./entitlements";
import { getCurrentSubscription } from "./billing";
import { getMonitoringDashboardSnapshot } from "./continuous-monitoring";
import { toCustomerAccessSession } from "./customer-access-session";
import { isDemoModeEnabled } from "./demo-mode";
import { getExpansionOffers } from "./expansion-engine";
import { logServerEvent } from "./monitoring";
import { requireActiveOrganization } from "./org-scope";
import {
  isPrismaRuntimeCompatibilityError,
  logPrismaRuntimeCompatibilityError
} from "./prisma-runtime";
import { buildProductSurfaceModel } from "./product-surface";
import { listDashboardReportSummaryViewsForAccessSession } from "./report-records";
import { getOrganizationRetentionSnapshot } from "./retention";
import { getOrganizationUsageMeteringSnapshot } from "./usage-metering";
import { getUsageRemaining } from "./usage-quotas";
import {
  getAuditWorkflowProgressPresentation,
  parseAuditWorkflowProgress
} from "./customer-runs";
import { isAuditIntakeCompleteFromRegulatoryProfile } from "./audit-intake";
import {
  buildAuditLifecycleTimeline,
  getLatestAuditLifecycleTimelineForOrganization,
  type AuditLifecycleStatus
} from "./audit-lifecycle";

function formatDate(date: Date | null | undefined) {
  if (!date) return "Draft";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatLifecycleTimestamp(date: Date | null | undefined) {
  if (!date) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function mapAuditLifecycleForDashboard(input: Awaited<
  ReturnType<typeof getLatestAuditLifecycleTimelineForOrganization>
> | null) {
  const timeline =
    input ??
    {
      currentStatus: "intake_pending" as AuditLifecycleStatus,
      stages: buildAuditLifecycleTimeline({
        currentStatus: "intake_pending",
        timestamps: {
          intake_pending: null
        }
      })
    };

  return {
    currentStatus: timeline.currentStatus,
    stages: timeline.stages.map((stage) => ({
      status: stage.status,
      label: stage.label,
      description: stage.description,
      completed: stage.completed,
      active: stage.active,
      failed: stage.failed,
      timestampLabel: formatLifecycleTimestamp(stage.timestamp)
    }))
  };
}

async function getLatestExecutiveBriefingForDashboard(organizationId: string) {
  try {
    const rows = await prisma.$queryRaw<Array<{
      id: string;
      reportId: string;
      summary: string;
      createdAt: Date;
      reportTitle: string;
    }>>(Prisma.sql`
      SELECT
        b."id",
        b."reportId",
        b."summary",
        b."createdAt",
        r."title" AS "reportTitle"
      FROM "Briefing" b
      INNER JOIN "Report" r ON r."id" = b."reportId"
      WHERE b."organizationId" = ${organizationId}
      ORDER BY b."createdAt" DESC
      LIMIT 1
    `);

    return rows[0] ?? null;
  } catch (error) {
    if (isPrismaRuntimeCompatibilityError(error)) {
      logPrismaRuntimeCompatibilityError("dashboard.latest_briefing", error, {
        organizationId
      });
      return null;
    }

    throw error;
  }
}

function titleCaseSeverity(value: string) {
  return value.toUpperCase();
}

function getSeverityWeight(severity: string) {
  switch (severity) {
    case "CRITICAL":
      return 22;
    case "HIGH":
      return 14;
    case "MEDIUM":
      return 8;
    case "LOW":
      return 4;
    default:
      return 0;
  }
}

function buildDomainScores(
  findings: Array<{ riskDomain: string; severity: string }>
) {
  const domains = [
    "governance",
    "security",
    "privacy",
    "compliance",
    "third-party risk"
  ];

  return domains.map((domain) => {
    const penalties = findings
      .filter((finding) => finding.riskDomain === domain)
      .reduce((sum, finding) => sum + getSeverityWeight(finding.severity), 0);

    return {
      label:
        domain === "third-party risk"
          ? "Third-Party Risk"
          : domain.charAt(0).toUpperCase() + domain.slice(1),
      score: Math.max(35, 90 - penalties)
    };
  });
}

function calculateAssessmentProgress(sections: Array<{ status: string }>) {
  if (!sections.length) {
    return 0;
  }

  const completedWeight = sections.reduce((total, section) => {
    if (section.status === "completed") {
      return total + 1;
    }

    if (section.status === "in_review" || section.status === "in_progress") {
      return total + 0.7;
    }

    return total + 0.2;
  }, 0);

  return Math.round((completedWeight / sections.length) * 100);
}

function readAssessmentWorkflowProgress(contextJson: Prisma.JsonValue | null | undefined) {
  if (!contextJson || typeof contextJson !== "object" || Array.isArray(contextJson)) {
    return null;
  }

  return parseAuditWorkflowProgress(
    (contextJson as Record<string, unknown>).workflowProgress
  );
}

function normalizeFrameworkKey(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function resolveFrameworkResourceSelections(
  selections: Array<{ code: string; name: string }>
) {
  const matched = new Map<
    string,
    {
      code: string;
      title: string;
      body: string;
      href: string;
      assetCount: number;
    }
  >();

  for (const selection of selections) {
    const selectionKeys = [
      normalizeFrameworkKey(selection.code),
      normalizeFrameworkKey(selection.name)
    ];
    const resource = FRAMEWORK_COVERAGE_ENTRIES.find((entry) => {
      const entryKeys = [
        normalizeFrameworkKey(entry.slug),
        normalizeFrameworkKey(entry.code),
        normalizeFrameworkKey(entry.name)
      ];

      return selectionKeys.some((selectionKey) =>
        entryKeys.some((entryKey) => entryKey.length > 0 && entryKey === selectionKey)
      );
    });

    if (!resource || !resource.assetDownloads?.length) {
      continue;
    }

    matched.set(resource.slug, {
      code: resource.code,
      title: resource.featuredAsset?.title ?? resource.name,
      body: resource.featuredAsset?.body ?? resource.overview,
      href: `/frameworks/${resource.slug}`,
      assetCount: resource.assetDownloads.length
    });
  }

  return Array.from(matched.values());
}

function buildFallbackDashboardData(organizationName: string): DashboardData {
  return {
    organizationName,
    organizationId: "unknown",
    planName: "No Plan",
    planSummary: "Connect billing and complete onboarding to populate this workspace.",
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
    reports: [],
    notifications: [],
    frameworkResources: [],
    inventories: {
      vendorCount: 0,
      modelCount: 0,
      memberCount: 0,
      latestVendors: [],
      latestModels: []
    },
    usageMetrics: [],
    productSurface: buildProductSurfaceModel({
      area: "dashboard",
      entitlements: {
        planName: "No Plan",
        workspaceMode: "INACTIVE",
        trialEndsAt: null,
        currentPeriodEnd: null,
        canAccessReports: false,
        canGenerateReports: false,
        featureAccess: {
          "workspace.access": false,
          "assessments.create": false,
          "reports.view": false,
          "reports.generate": false,
          "roadmap.view": false,
          "members.manage": false,
          "billing.portal": false,
          "evidence.view": false,
          "evidence.manage": false,
          "uploads.manage": false,
          "monitoring.view": false,
          "monitoring.manage": false,
          "executive.reviews": false,
          "executive.delivery": false,
          "frameworks.view": false,
          "frameworks.manage": false,
          "custom.frameworks": false,
          "api.access": false,
          "priority.support": false
        }
      }
    }),
    upsellOffers: [],
    activation: {
      activationMilestone: {
        key: "first_report_generated",
        label: "First executive report generated",
        rationale:
          "This is the earliest point where Evolve Edge turns setup and assessment work into stakeholder-visible compliance value.",
        isReached: false
      },
      completionPercent: 0,
      steps: [],
      supportingSignals: [],
      nextAction: {
        title: "Create your first live records",
        body: "Create an assessment and move it toward the first executive report.",
        href: "/dashboard/assessments",
        label: "Open assessments"
      },
      isActivated: false
    },
    retention: {
      healthScore: 0,
      healthTone: "watch",
      headline: "Retention data pending",
      summary:
        "Renewal and retention signals will appear once the workspace has a subscription and live product activity.",
      renewal: {
        label: "Billing status",
        dateLabel: null,
        daysRemaining: null,
        helperText: "No billing milestone is recorded yet."
      },
      usageDeclineWarning: null,
      reactivationPrompt: null,
      saveOffer: null,
      valueReminders: [],
      signals: []
    },
    isDemoMode: isDemoModeEnabled(),
    monitoring: {
      status: "Pending",
      postureScore: null,
      riskLevel: "Unscored",
      openFindingsCount: 0,
      inRemediationCount: 0,
      reportArchiveCount: 0,
      nextReviewLabel: "Monitoring will activate after the first live report sync.",
      trendDelta: 0
    },
    auditIntake: {
      complete: false,
      statusLabel: "Intake incomplete",
      summary: "Complete onboarding intake before dashboard access and audit readiness."
    },
    auditLifecycle: mapAuditLifecycleForDashboard(null),
    executiveBriefing: {
      available: false,
      title: "Executive briefing",
      summary:
        "Executive briefing will appear after a validated report is ready and the active plan allows briefing delivery.",
      href: null,
      statusLabel: "Not available yet",
      ctaLabel: "View reports"
    },
    recommendedFocus: {
      label: "Getting started",
      title: "Create your first live records",
      body: "Set up an assessment, register vendors and AI systems, and then generate your first executive deliverable.",
      primaryHref: "/dashboard/assessments",
      primaryLabel: "Create Assessment",
      secondaryHref: "/dashboard/settings",
      secondaryLabel: "Open Settings"
    }
  };
}

const dashboardOrganizationInclude = {
  subscriptions: {
    include: { plan: true },
    orderBy: { createdAt: "desc" },
    take: 1
  },
  frameworkSelections: {
    include: { framework: true }
  },
  vendors: {
    orderBy: { createdAt: "desc" },
    take: 3
  },
  models: {
    orderBy: { createdAt: "desc" },
    take: 3
  },
  notifications: {
    orderBy: { createdAt: "desc" },
    take: 4
  },
  _count: {
    select: {
      members: true,
      vendors: true,
      models: true
    }
  },
  assessments: {
    orderBy: { createdAt: "desc" },
    take: 1,
    include: {
      sections: {
        orderBy: { orderIndex: "asc" }
      },
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
      },
      customerRuns: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          contextJson: true
        }
      }
    }
  },
  reports: {
    orderBy: { publishedAt: "desc" },
    take: 6
  }
} satisfies Prisma.OrganizationInclude;

export async function getDashboardData(): Promise<DashboardData> {
  const session = await requireCurrentSession({ requireOrganization: true });
  const accessSession = toCustomerAccessSession(session);
  const organizationId = session.organization!.id;
  const organizationName = session.organization!.name;

  let entitlements: Awaited<ReturnType<typeof getOrganizationEntitlements>>;
  let currentSubscription: Awaited<ReturnType<typeof getCurrentSubscription>>;
  let monitoring: Awaited<ReturnType<typeof getMonitoringDashboardSnapshot>>;
  let usageMetering: Awaited<ReturnType<typeof getOrganizationUsageMeteringSnapshot>>;
  let auditsQuota: Awaited<ReturnType<typeof getUsageRemaining>>;
  let evidenceUploadsQuota: Awaited<ReturnType<typeof getUsageRemaining>>;
  let activation: Awaited<ReturnType<typeof getOrganizationActivationSnapshot>>;
  let auditLifecycle: Awaited<
    ReturnType<typeof getLatestAuditLifecycleTimelineForOrganization>
  > | null = null;
  let latestBriefing: Awaited<
    ReturnType<typeof getLatestExecutiveBriefingForDashboard>
  > | null = null;
  let visibleReports: Awaited<
    ReturnType<typeof listDashboardReportSummaryViewsForAccessSession>
  > = [];
  let organization: Prisma.OrganizationGetPayload<{
    include: typeof dashboardOrganizationInclude;
  }> | null;

  try {
    await requireActiveOrganization(organizationId);
    [entitlements, currentSubscription] = await Promise.all([
      getOrganizationEntitlements(organizationId),
      getCurrentSubscription(organizationId)
    ]);
    monitoring = await getMonitoringDashboardSnapshot(organizationId);
    [usageMetering, auditsQuota, evidenceUploadsQuota, visibleReports] = await Promise.all([
      getOrganizationUsageMeteringSnapshot(organizationId, entitlements.planCode),
      getUsageRemaining(organizationId, "audits"),
      getUsageRemaining(organizationId, "evidence_uploads"),
      listDashboardReportSummaryViewsForAccessSession({
        accessSession
      })
    ]);
    activation = await getOrganizationActivationSnapshot(organizationId, entitlements);
    [auditLifecycle, latestBriefing] = await Promise.all([
      getLatestAuditLifecycleTimelineForOrganization(organizationId),
      getLatestExecutiveBriefingForDashboard(organizationId)
    ]);
    organization = await prisma.organization.findUnique({
      where: {
        id: organizationId
      },
      include: dashboardOrganizationInclude
    });
  } catch (error) {
    if (isPrismaRuntimeCompatibilityError(error)) {
      logPrismaRuntimeCompatibilityError("dashboard.data", error, {
        organizationId
      });
      return buildFallbackDashboardData(organizationName);
    }

    logServerEvent("error", "dashboard.data.error", {
      organizationId,
      message: error instanceof Error ? error.message : "Unknown error"
    });
    throw error;
  }

  if (!organization) {
    return buildFallbackDashboardData(organizationName);
  }

  const subscription = organization.subscriptions[0];
  const assessment = organization.assessments[0];
  const reports = organization.reports;
  const latestVisibleReport = visibleReports[0] ?? null;
  const frameworks = organization.frameworkSelections.map((item) => item.framework.name);
  const frameworkResources = resolveFrameworkResourceSelections(
    organization.frameworkSelections.map((item) => ({
      code: item.framework.code,
      name: item.framework.name
    }))
  );
  const vendorNames = organization.vendors.map((vendor) => vendor.name);
  const modelNames = organization.models.map((model) => model.name);
  const monitoredAssetsCount = organization._count.vendors + organization._count.models;
  const findingsCount = assessment?.findings.length ?? 0;
  const criticalFindings =
    assessment?.findings.filter((finding) => finding.severity === "CRITICAL").length ?? 0;
  const activeWorkflowProgress = assessment
    ? readAssessmentWorkflowProgress(assessment.customerRuns[0]?.contextJson ?? null)
    : null;
  const activeWorkflowPresentation = activeWorkflowProgress
    ? getAuditWorkflowProgressPresentation(activeWorkflowProgress.status)
    : null;
  const auditIntakeComplete = isAuditIntakeCompleteFromRegulatoryProfile(
    organization.regulatoryProfile
  );
  const latestAnalysisStatus = assessment?.analysisJobs[0]?.status ?? null;
  const analysisStatusLabel =
    latestAnalysisStatus === "RUNNING"
      ? "Analysis running"
      : latestAnalysisStatus === "SUCCEEDED"
        ? "Analysis complete - report draft available"
        : latestAnalysisStatus === "FAILED"
          ? "Analysis failed - review required"
          : assessment?.status === AssessmentStatus.ANALYSIS_QUEUED
            ? "Analysis pending"
            : assessment?.status === AssessmentStatus.REPORT_DRAFT_READY
              ? "Analysis complete - report draft available"
              : "Analysis pending";
  const analysisStatusSummary =
    latestAnalysisStatus === "SUCCEEDED" ||
    assessment?.status === AssessmentStatus.REPORT_DRAFT_READY
      ? "Validated OpenAI/LangGraph output has been persisted by the backend. Report draft visibility remains governed by report review and entitlement controls."
      : latestAnalysisStatus === "FAILED"
        ? "The AI execution did not produce a validated report draft and is marked for operator review. Customer-visible reports remain blocked until validation succeeds."
        : latestAnalysisStatus === "RUNNING"
          ? "OpenAI/LangGraph analysis is running through the backend execution worker after routing snapshot creation."
          : "Required audit intake is saved in Neon and marked ready_for_audit. Analysis waits for backend routing snapshot and workflow dispatch controls.";
  const currentPeriodEnd = subscription?.currentPeriodEnd;
  const primaryRecommendation = assessment?.recommendations[0];
  const latestNotification = organization.notifications[0];
  const activeAssessmentNextStep = activeWorkflowPresentation?.nextStep ??
    (assessment?.status === AssessmentStatus.INTAKE_SUBMITTED
      ? "Wait for orchestration handoff confirmation before analysis begins."
      : assessment?.analysisJobs[0]?.status === "RUNNING"
        ? "Generate executive summary and publish findings package"
        : assessment
          ? "Complete intake sections and queue analysis"
          : "Create your first live assessment");
  const activeAssessmentEta = activeWorkflowPresentation?.eta ??
    (assessment?.status === AssessmentStatus.INTAKE_SUBMITTED
      ? "Awaiting handoff confirmation"
      : assessment?.analysisJobs[0]?.status === "RUNNING"
        ? "Ready in about 18 minutes"
        : assessment
          ? "Waiting for input completion"
          : "No assessment in progress");
  const recommendedFocus =
    entitlements.workspaceMode === "INACTIVE"
      ? {
          label: "Billing required",
          title: "Reactivate the workspace before the next operating cycle.",
          body: "This customer is now in inactive mode. Restore billing to resume assessment creation, reports, and roadmap access.",
          primaryHref: "/dashboard/settings",
          primaryLabel: "Open Billing",
          secondaryHref: "/dashboard/reports",
          secondaryLabel: "View Reports"
        }
      : usageMetering.topWarning
        ? {
            label: "Capacity pressure",
            title: usageMetering.topWarning.upgradeTitle,
            body: `${usageMetering.topWarning.upgradeBody} ${usageMetering.topWarning.helperText}`,
            primaryHref: "/pricing",
            primaryLabel: "Review upgrade options",
            secondaryHref: "/dashboard/settings",
            secondaryLabel: "Open usage details"
          }
      : primaryRecommendation
        ? {
            label: "Top remediation",
            title: primaryRecommendation.title,
            body:
              primaryRecommendation.description ||
              "Open the roadmap to assign ownership and due dates for this action.",
            primaryHref: "/dashboard/roadmap",
            primaryLabel: "Open Roadmap",
            secondaryHref: assessment
              ? `/dashboard/assessments/${assessment.id}`
              : "/dashboard/assessments",
            secondaryLabel: "Review Assessment"
          }
        : latestNotification
          ? {
              label: "Latest activity",
              title: latestNotification.title,
              body: latestNotification.body,
              primaryHref: latestNotification.actionUrl ?? "/dashboard/settings",
              primaryLabel: latestNotification.actionUrl ? "Open Activity" : "Open Settings",
              secondaryHref: "/dashboard/assessments",
              secondaryLabel: "Create Assessment"
            }
          : {
              label: "Inventory next",
              title: "Register the tools and vendors used in production.",
              body: "Track vendors and AI systems in the workspace so assessments, reports, and stakeholder reviews are backed by real operational records.",
              primaryHref: "/dashboard/settings",
              primaryLabel: "Manage Inventory",
              secondaryHref: "/dashboard/assessments",
              secondaryLabel: "Open Assessments"
            };
  const retention = getOrganizationRetentionSnapshot({
    entitlements,
    activation,
    usageMetering,
    assessmentsCount: assessment ? 1 : 0,
    reportsCount: reports.length,
    findingsCount,
    monitoredAssetsCount,
    memberCount: organization._count.members,
    currentPlanCode: currentSubscription?.plan.code ?? entitlements.planCode,
    hasStripeCustomer: Boolean(currentSubscription?.stripeCustomerId)
  });

  return {
    organizationName: organization.name,
    organizationId: organization.id,
    planName: subscription?.plan.name ?? "Unassigned Plan",
    planSummary:
      entitlements.workspaceMode === "DEMO"
        ? "Demo workspace using seeded data fallbacks for exploration only. Stripe billing and plan enforcement stay disabled in this mode."
        : entitlements.workspaceMode === "TRIAL"
          ? "Trial workspace with live assessments, reports, roadmap generation, and onboarding enabled while the customer evaluates the product."
          : entitlements.workspaceMode === "SUBSCRIPTION"
            ? "Live subscription with assessments, report archive, remediation roadmap, and team workspace controls."
            : entitlements.workspaceMode === "READ_ONLY"
              ? "Workspace access is preserved in read-only mode while billing is paused, past due, or recently canceled. Historical records remain available while write actions stay gated."
            : "Inactive workspace. Reactivate billing to unlock report generation, roadmap access, and new assessment creation.",
    workspaceLabel: "AI Governance Workspace",
    metrics: [
      {
        label: "Posture Score",
        value: `${organization.currentPostureScore ?? assessment?.postureScore ?? 0} / 100`,
        note:
          assessment?.completedAt
            ? `Last completed ${formatDate(assessment.completedAt)}`
            : "Calculated from your latest live assessment",
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
        note: frameworks.length > 0 ? frameworks.join(", ") : "No frameworks selected yet",
        tone: "neutral"
      },
      {
        label: "Plan Status",
        value:
          entitlements.subscriptionStatus === "NONE"
            ? "No billing"
            : entitlements.subscriptionStatus.replaceAll("_", " "),
        note: currentPeriodEnd ? `Current term through ${formatDate(currentPeriodEnd)}` : "Billing period pending",
        tone: "neutral"
      }
    ],
    activeAssessment: {
      name: assessment?.name ?? "No active assessment",
      status:
        activeWorkflowProgress?.label ??
        assessment?.status.replaceAll("_", " ") ??
        "Not started",
      progress:
        activeWorkflowProgress?.progressPercent ??
        (assessment ? calculateAssessmentProgress(assessment.sections) : 0),
      nextStep: activeAssessmentNextStep,
      eta: activeAssessmentEta
    },
    domainScores: buildDomainScores(assessment?.findings ?? []),
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
    reports: visibleReports.map((report) => ({
      id: report.id,
      title: report.title,
      type:
        report.status === "DELIVERED"
          ? "Delivered report"
          : report.artifactAvailability.canDownload
            ? "Executive artifact ready"
            : "Ready for delivery",
      date: formatDate(report.publishedAt ?? report.createdAt),
      href: `/dashboard/reports/${report.id}`
    })),
    executiveBriefing: latestBriefing
      ? {
          available: true,
          title: latestBriefing.reportTitle,
          summary:
            latestBriefing.summary ||
            "Executive briefing available for leadership walkthrough and customer-facing presentation.",
          href: `/briefings/${latestBriefing.id}`,
          statusLabel: "Executive briefing available",
          ctaLabel: "View briefing"
        }
      : {
          available: false,
          title: "Executive briefing",
          summary: latestVisibleReport
            ? "A report is available. Enterprise briefing access appears here after the briefing is generated from validated report data."
            : "Executive briefing will appear after a validated report is ready and the active plan allows briefing delivery.",
          href: latestVisibleReport ? `/dashboard/reports/${latestVisibleReport.id}` : null,
          statusLabel: latestVisibleReport ? "Report ready" : "Pending report",
          ctaLabel: latestVisibleReport ? "Open latest report" : "View reports"
        },
    notifications: organization.notifications.map((notification) => ({
      title: notification.title,
      body: notification.body,
      date: formatDate(notification.createdAt),
      actionUrl: notification.actionUrl
    })),
    frameworkResources,
    usageMetrics: usageMetering.metrics.filter((metric) =>
      ["activeAssessments", "reportsGenerated", "monitoredAssets", "seats"].includes(
        metric.key
      )
    ),
    productSurface: buildProductSurfaceModel({
      area: "dashboard",
      entitlements,
      usageMetrics: usageMetering.metrics.filter((metric) =>
        ["activeAssessments", "monitoredAssets"].includes(metric.key)
      ),
      quotas: [
        {
          key: "audits",
          label: "Monthly audits",
          snapshot: auditsQuota
        },
        {
          key: "evidence_uploads",
          label: "Monthly evidence uploads",
          snapshot: evidenceUploadsQuota
        }
      ]
    }),
    activation,
    retention,
    monitoring: {
      status: monitoring.subscription
        ? monitoring.subscription.status.replaceAll("_", " ")
        : "Pending",
      postureScore: monitoring.summary.postureScore,
      riskLevel: monitoring.summary.riskLevel,
      openFindingsCount: monitoring.summary.openFindingsCount,
      inRemediationCount: monitoring.summary.inRemediationCount,
      reportArchiveCount: monitoring.summary.reportArchiveCount,
      nextReviewLabel: monitoring.summary.nextReviewAt
        ? `Next review ${formatDate(monitoring.summary.nextReviewAt)}`
        : "Monitoring review not scheduled yet",
      trendDelta: monitoring.summary.postureTrendDelta
    },
    auditIntake: {
      complete: auditIntakeComplete,
      statusLabel: auditIntakeComplete
        ? `Intake complete - ${analysisStatusLabel.toLowerCase()}`
        : "Intake incomplete",
      summary: auditIntakeComplete
        ? analysisStatusSummary
        : "Required audit intake is missing or invalid. Dashboard access should redirect back to onboarding."
    },
    auditLifecycle: mapAuditLifecycleForDashboard(auditLifecycle),
    isDemoMode: isDemoModeEnabled(),
    upsellOffers: getExpansionOffers({
      placement: "dashboard",
      session,
      entitlements,
      usageMetering,
      currentPlanCode: currentSubscription?.plan.code ?? entitlements.planCode,
      hasStripeCustomer: Boolean(currentSubscription?.stripeCustomerId)
    }),
    inventories: {
      vendorCount: organization._count.vendors,
      modelCount: organization._count.models,
      memberCount: organization._count.members,
      latestVendors: vendorNames,
      latestModels: modelNames
    },
    recommendedFocus
  };
}
