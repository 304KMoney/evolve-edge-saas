import { AssessmentStatus, Prisma, prisma } from "@evolve-edge/db";
import type { EntitlementSnapshot } from "./entitlements";

type ActivationDbClient = Prisma.TransactionClient | typeof prisma;

export type ActivationStep = {
  key:
    | "workspaceConfigured"
    | "assessmentStarted"
    | "assessmentSubmitted"
    | "firstReportGenerated";
  label: string;
  description: string;
  completed: boolean;
  href: string;
  ctaLabel: string;
};

export type ActivationSignal = {
  key: "monitoredAssetsConnected" | "firstGapSurfaced" | "firstExecutiveSummaryViewed";
  label: string;
  completed: boolean;
  detail: string;
};

export type ActivationSnapshot = {
  activationMilestone: {
    key: "first_report_generated";
    label: string;
    rationale: string;
    isReached: boolean;
  };
  completionPercent: number;
  steps: ActivationStep[];
  supportingSignals: ActivationSignal[];
  nextAction: {
    title: string;
    body: string;
    href: string;
    label: string;
  };
  isActivated: boolean;
};

export async function getOrganizationActivationSnapshot(
  organizationId: string,
  entitlements: EntitlementSnapshot,
  db: ActivationDbClient = prisma
): Promise<ActivationSnapshot> {
  const [
    organization,
    assessmentsCount,
    submittedAssessmentsCount,
    reportsCount,
    viewedReportsCount,
    findingsCount,
    vendorCount,
    modelCount,
    latestAssessment
  ] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: {
        onboardingCompletedAt: true
      }
    }),
    db.assessment.count({
      where: { organizationId }
    }),
    db.assessment.count({
      where: {
        organizationId,
        OR: [
          { submittedAt: { not: null } },
          {
            status: {
              in: [
                AssessmentStatus.ANALYSIS_QUEUED,
                AssessmentStatus.ANALYSIS_RUNNING,
                AssessmentStatus.REPORT_DRAFT_READY,
                AssessmentStatus.REPORT_PUBLISHED
              ]
            }
          }
        ]
      }
    }),
    db.report.count({
      where: { organizationId }
    }),
    db.report.count({
      where: {
        organizationId,
        viewedAt: {
          not: null
        }
      }
    }),
    db.finding.count({
      where: {
        assessment: {
          organizationId
        }
      }
    }),
    db.vendor.count({
      where: { organizationId }
    }),
    db.aIModel.count({
      where: { organizationId }
    }),
    db.assessment.findFirst({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true }
    })
  ]);

  const steps: ActivationStep[] = [
    {
      key: "workspaceConfigured",
      label: "Workspace configured",
      description: "Complete onboarding so the product is attached to a real organization, plan, and framework profile.",
      completed: Boolean(organization?.onboardingCompletedAt),
      href: "/onboarding",
      ctaLabel: "Finish onboarding"
    },
    {
      key: "assessmentStarted",
      label: "First assessment started",
      description: "Create the first live assessment so the product has real operating context.",
      completed: assessmentsCount > 0,
      href: "/dashboard/assessments",
      ctaLabel: "Start first assessment"
    },
    {
      key: "assessmentSubmitted",
      label: "Assessment submitted for analysis",
      description: "Complete enough intake to queue analysis and move from setup into actual governance work.",
      completed: submittedAssessmentsCount > 0,
      href: latestAssessment ? `/dashboard/assessments/${latestAssessment.id}` : "/dashboard/assessments",
      ctaLabel: latestAssessment ? "Complete intake" : "Open assessments"
    },
    {
      key: "firstReportGenerated",
      label: "First executive report generated",
      description: "Generate the first stakeholder-ready report to reach real product value and prove the workflow end to end.",
      completed: reportsCount > 0,
      href:
        reportsCount > 0
          ? "/dashboard/reports"
          : entitlements.canGenerateReports
            ? "/dashboard/reports"
            : "/dashboard/settings",
      ctaLabel:
        reportsCount > 0
          ? "Review reports"
          : entitlements.canGenerateReports
            ? "Generate first report"
            : "Open billing"
    }
  ];

  const completedPrimarySteps = steps.filter((step) => step.completed).length;
  const isActivated = reportsCount > 0;
  const completionPercent = Math.round((completedPrimarySteps / steps.length) * 100);
  const nextIncompleteStep = steps.find((step) => !step.completed) ?? steps[steps.length - 1];

  const nextAction = isActivated
    ? {
        title: "Activation milestone reached",
        body:
          "This workspace has already crossed the first-value threshold. The next focus is repeating the workflow and keeping leaders aligned on emerging gaps.",
        href: viewedReportsCount > 0 ? "/dashboard/roadmap" : "/dashboard/reports",
        label: viewedReportsCount > 0 ? "Open roadmap" : "Review executive report"
      }
    : nextIncompleteStep.key === "firstReportGenerated" && !entitlements.canGenerateReports
      ? {
          title: "Restore report access to reach first value",
          body:
            "The fastest path to activation is still the first executive report, but billing state currently blocks new report generation.",
          href: "/dashboard/settings",
          label: "Open billing"
        }
      : {
          title: nextIncompleteStep.label,
          body: nextIncompleteStep.description,
          href: nextIncompleteStep.href,
          label: nextIncompleteStep.ctaLabel
        };

  return {
    activationMilestone: {
      key: "first_report_generated",
      label: "First executive report generated",
      rationale:
        "This is the earliest point where Evolve Edge turns setup and assessment work into stakeholder-visible compliance value.",
      isReached: isActivated
    },
    completionPercent,
    steps,
    supportingSignals: [
      {
        key: "monitoredAssetsConnected",
        label: "Monitored assets connected",
        completed: vendorCount + modelCount > 0,
        detail:
          vendorCount + modelCount > 0
            ? `${vendorCount + modelCount} live assets are now tracked in the workspace.`
            : "No vendors or AI models have been registered yet."
      },
      {
        key: "firstGapSurfaced",
        label: "First compliance gap surfaced",
        completed: findingsCount > 0,
        detail:
          findingsCount > 0
            ? `${findingsCount} findings have already been surfaced from live product workflows.`
            : "No findings have been generated yet."
      },
      {
        key: "firstExecutiveSummaryViewed",
        label: "First executive summary viewed",
        completed: viewedReportsCount > 0,
        detail:
          viewedReportsCount > 0
            ? `${viewedReportsCount} report view events have been recorded.`
            : "No executive report view has been recorded yet."
      }
    ],
    nextAction,
    isActivated
  };
}
