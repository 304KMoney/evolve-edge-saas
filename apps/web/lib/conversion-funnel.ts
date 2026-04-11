export type ConversionStepTone = "completed" | "current" | "upcoming";

export type ConversionStep = {
  key: string;
  label: string;
  detail: string;
  tone: ConversionStepTone;
};

export type WorkspaceLaunchProgress = {
  progressPercent: number;
  steps: ConversionStep[];
  summary: string;
};

export type AssessmentIntakeProgress = {
  progressPercent: number;
  completedSections: number;
  totalSections: number;
  nextSectionTitle: string | null;
  hasStarted: boolean;
  isReadyForSubmission: boolean;
  statusLabel: string;
  helperText: string;
};

export type BillingNextAction = {
  href: string;
  label: string;
  helperText: string;
};

type IntakeSectionLike = {
  title: string;
  status: string;
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getSectionWeight(status: string) {
  switch (status) {
    case "completed":
      return 1;
    case "in_review":
    case "in_progress":
      return 0.7;
    default:
      return 0.2;
  }
}

export function calculateWeightedProgress(statuses: string[]) {
  if (statuses.length === 0) {
    return 0;
  }

  const weight = statuses.reduce((total, status) => {
    return total + getSectionWeight(status);
  }, 0);

  return clampPercent((weight / statuses.length) * 100);
}

export function getWorkspaceLaunchProgress(input: {
  selectedPlanName?: string | null;
  firstAssessmentName?: string | null;
}) : WorkspaceLaunchProgress {
  const hasPlan = Boolean(input.selectedPlanName);
  const hasSeedAssessment = Boolean(input.firstAssessmentName?.trim());
  const steps: ConversionStep[] = [
    {
      key: "plan",
      label: hasPlan ? "Plan selected" : "Plan can be chosen later",
      detail: hasPlan
        ? `${input.selectedPlanName} will carry into billing and post-signup guidance.`
        : "A plan can still be selected from pricing before billing is finalized.",
      tone: hasPlan ? "completed" : "current"
    },
    {
      key: "workspace",
      label: "Create the workspace",
      detail:
        "Set the company profile, scope, and frameworks so the system starts from real customer context.",
      tone: "current"
    },
    {
      key: "intake",
      label: "Complete intake",
      detail: hasSeedAssessment
        ? `${input.firstAssessmentName} will be ready for structured intake as soon as setup finishes.`
        : "The first assessment becomes the intake workspace immediately after setup.",
      tone: "upcoming"
    },
    {
      key: "report",
      label: "Generate the first executive report",
      detail:
        "The activation milestone is a real stakeholder-ready report, not just a completed setup form.",
      tone: "upcoming"
    }
  ];

  const completedSteps = steps.filter((step) => step.tone === "completed").length;
  const progressPercent = clampPercent(((completedSteps + 1) / steps.length) * 100);

  return {
    progressPercent,
    steps,
    summary: hasPlan
      ? "The selected plan is locked in. Finish setup to move directly into intake and first-value delivery."
      : "Finish workspace setup now, then move straight into intake and the first executive report."
  };
}

export function getAssessmentIntakeProgress(
  sections: IntakeSectionLike[]
) : AssessmentIntakeProgress {
  const statuses = sections.map((section) => section.status);
  const completedSections = sections.filter(
    (section) => section.status === "completed"
  ).length;
  const nextSection =
    sections.find((section) => section.status !== "completed") ?? null;
  const hasStarted = sections.some((section) =>
    ["in_progress", "in_review", "completed"].includes(section.status)
  );
  const progressPercent = calculateWeightedProgress(statuses);
  const isReadyForSubmission = completedSections > 0;

  return {
    progressPercent,
    completedSections,
    totalSections: sections.length,
    nextSectionTitle: nextSection?.title ?? null,
    hasStarted,
    isReadyForSubmission,
    statusLabel:
      completedSections === sections.length && sections.length > 0
        ? "Intake complete"
        : hasStarted
          ? "Draft in progress"
          : "Not started",
    helperText:
      completedSections === sections.length && sections.length > 0
        ? "All intake sections are complete. Submit the assessment when the team is ready to queue analysis."
        : nextSection
          ? `Next best action: finish ${nextSection.title}. Progress saves as each section is updated.`
          : "Start the first section to create a resumable intake draft."
  };
}

export function getPostBillingNextAction(input: {
  assessmentsCount: number;
  reportsCount: number;
  canGenerateReports: boolean;
}) : BillingNextAction {
  if (input.assessmentsCount === 0) {
    return {
      href: "/dashboard/assessments",
      label: "Start the first assessment",
      helperText:
        "The subscription is active. Launch intake immediately so paid customers reach first value faster."
    };
  }

  if (input.reportsCount === 0) {
    return {
      href: input.canGenerateReports ? "/dashboard/reports" : "/dashboard/assessments",
      label: input.canGenerateReports ? "Move toward the first report" : "Continue intake",
      helperText:
        "Guide the workspace from paid access into a completed intake and first executive deliverable."
    };
  }

  return {
    href: "/dashboard",
    label: "Open live workspace",
    helperText:
      "Billing is active and the workspace already has activity, so the dashboard is the best re-entry point."
  };
}
