import {
  AssessmentStatus,
  EngagementCommercialModel,
  EngagementDeliverableStatus,
  EngagementDeliverableType,
  EngagementOpportunityCategory,
  EngagementOpportunityStatus,
  EngagementProgramStatus,
  EngagementProgramType,
  MonitoringFindingStatus,
  MonitoringSubscriptionStatus,
  Prisma,
  prisma
} from "@evolve-edge/db";

type EngagementDbClient = Prisma.TransactionClient | typeof prisma;

function formatLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatEngagementProgramType(value: EngagementProgramType) {
  switch (value) {
    case EngagementProgramType.ONE_TIME_AUDIT:
      return "One-Time Audit";
    case EngagementProgramType.ONGOING_MONITORING:
      return "Ongoing Monitoring";
    case EngagementProgramType.REMEDIATION_SUPPORT:
      return "Remediation Support";
    case EngagementProgramType.ADVISORY_ADD_ON:
      return "Advisory Add-On";
    case EngagementProgramType.FRAMEWORK_FOLLOW_ON:
      return "Framework Follow-On";
    case EngagementProgramType.PERIODIC_REASSESSMENT:
      return "Periodic Reassessment";
    default:
      return formatLabel(value);
  }
}

export function formatEngagementCommercialModel(value: EngagementCommercialModel) {
  switch (value) {
    case EngagementCommercialModel.PROJECT:
      return "Project";
    case EngagementCommercialModel.SUBSCRIPTION:
      return "Subscription";
    case EngagementCommercialModel.ADD_ON:
      return "Add-On";
    case EngagementCommercialModel.HYBRID:
      return "Hybrid";
    case EngagementCommercialModel.INTERNAL:
      return "Internal";
    default:
      return formatLabel(value);
  }
}

export function formatEngagementDeliverableType(value: EngagementDeliverableType) {
  switch (value) {
    case EngagementDeliverableType.EXECUTIVE_PACKAGE:
      return "Executive Package";
    case EngagementDeliverableType.MONITORING_REVIEW:
      return "Monitoring Review";
    case EngagementDeliverableType.REMEDIATION_CHECKPOINT:
      return "Remediation Checkpoint";
    case EngagementDeliverableType.ADVISORY_MEMO:
      return "Advisory Memo";
    default:
      return formatLabel(value);
  }
}

export function formatEngagementOpportunityCategory(value: EngagementOpportunityCategory) {
  switch (value) {
    case EngagementOpportunityCategory.ONGOING_MONITORING:
      return "Ongoing Monitoring";
    case EngagementOpportunityCategory.REMEDIATION_SUPPORT:
      return "Remediation Support";
    case EngagementOpportunityCategory.ADVISORY_ADD_ON:
      return "Advisory Add-On";
    case EngagementOpportunityCategory.FRAMEWORK_FOLLOW_ON:
      return "Framework Follow-On";
    case EngagementOpportunityCategory.PERIODIC_REASSESSMENT:
      return "Periodic Reassessment";
    default:
      return formatLabel(value);
  }
}

function getAssessmentProgramType(index: number) {
  return index === 0
    ? EngagementProgramType.ONE_TIME_AUDIT
    : EngagementProgramType.PERIODIC_REASSESSMENT;
}

function getAssessmentProgramStatus(input: {
  assessmentStatus: AssessmentStatus;
  hasReadyReport: boolean;
}) {
  if (
    input.assessmentStatus === AssessmentStatus.REPORT_PUBLISHED ||
    input.assessmentStatus === AssessmentStatus.ARCHIVED ||
    input.hasReadyReport
  ) {
    return EngagementProgramStatus.COMPLETED;
  }

  return EngagementProgramStatus.ACTIVE;
}

function getMonitoringProgramStatus(status: MonitoringSubscriptionStatus) {
  switch (status) {
    case MonitoringSubscriptionStatus.ACTIVE:
      return EngagementProgramStatus.ACTIVE;
    case MonitoringSubscriptionStatus.PAUSED:
      return EngagementProgramStatus.PAUSED;
    case MonitoringSubscriptionStatus.CANCELED:
      return EngagementProgramStatus.CANCELED;
    default:
      return EngagementProgramStatus.DRAFT;
  }
}

function getAssessmentProgramName(name: string, index: number) {
  return index === 0 ? `${name} Audit Engagement` : `${name} Reassessment Cycle`;
}

function getAssessmentDeliverableStatus(input: {
  assessmentStatus: AssessmentStatus;
  reportPublished: boolean;
}) {
  if (input.reportPublished) {
    return EngagementDeliverableStatus.DELIVERED;
  }

  if (
    input.assessmentStatus === AssessmentStatus.ANALYSIS_QUEUED ||
    input.assessmentStatus === AssessmentStatus.ANALYSIS_RUNNING ||
    input.assessmentStatus === AssessmentStatus.REPORT_DRAFT_READY
  ) {
    return EngagementDeliverableStatus.IN_PROGRESS;
  }

  return EngagementDeliverableStatus.PLANNED;
}

function getReportDeliverableStatus(publishedAt: Date | null) {
  return publishedAt ? EngagementDeliverableStatus.DELIVERED : EngagementDeliverableStatus.READY;
}

function getExecutivePackageDeliverableStatus(input: {
  reviewedAt: Date | null;
  sentAt: Date | null;
  briefingCompletedAt: Date | null;
}) {
  if (input.briefingCompletedAt) {
    return EngagementDeliverableStatus.DELIVERED;
  }

  if (input.sentAt || input.reviewedAt) {
    return EngagementDeliverableStatus.READY;
  }

  return EngagementDeliverableStatus.IN_PROGRESS;
}

export function buildEngagementOpportunityCandidates(input: {
  hasMonitoringProgram: boolean;
  openMonitoringFindingsCount: number;
  inRemediationCount: number;
  criticalFindingsCount: number;
  selectedFrameworks: string[];
  completedAuditCount: number;
}) {
  const candidates: Array<{
    category: EngagementOpportunityCategory;
    title: string;
    summary: string;
    sourceSignal: string;
    tags: string[];
  }> = [];

  if (input.completedAuditCount > 0 && !input.hasMonitoringProgram) {
    candidates.push({
      category: EngagementOpportunityCategory.ONGOING_MONITORING,
      title: "Convert the audit into ongoing monitoring",
      summary:
        "This account already has completed audit output. Continuous monitoring is a natural follow-on motion for recurring posture reviews, remediation visibility, and leadership reporting.",
      sourceSignal: "completed_audit_without_monitoring",
      tags: ["retention", "subscription", "monitoring"]
    });
  }

  if (input.openMonitoringFindingsCount >= 3 || input.inRemediationCount > 0) {
    candidates.push({
      category: EngagementOpportunityCategory.REMEDIATION_SUPPORT,
      title: "Offer remediation support",
      summary:
        "Open or active remediation work suggests a service motion around checkpoint reviews, remediation accountability, and follow-up evidence collection.",
      sourceSignal: "open_monitoring_findings",
      tags: ["remediation", "delivery", "support"]
    });
  }

  if (input.criticalFindingsCount > 0) {
    candidates.push({
      category: EngagementOpportunityCategory.ADVISORY_ADD_ON,
      title: "Offer advisory follow-on support",
      summary:
        "Critical findings indicate a strong case for premium advisory support, stakeholder working sessions, or white-glove executive follow-through.",
      sourceSignal: "critical_findings_present",
      tags: ["advisory", "executive", "high_risk"]
    });
  }

  if (input.selectedFrameworks.length > 1) {
    candidates.push({
      category: EngagementOpportunityCategory.FRAMEWORK_FOLLOW_ON,
      title: "Expand into framework-specific follow-on work",
      summary: `The workspace already spans ${input.selectedFrameworks.length} frameworks. This is a good candidate for additional framework-specific follow-on work or control deep-dives.`,
      sourceSignal: "multi_framework_scope",
      tags: ["frameworks", "expansion"]
    });
  }

  if (input.completedAuditCount > 0) {
    candidates.push({
      category: EngagementOpportunityCategory.PERIODIC_REASSESSMENT,
      title: "Schedule the next reassessment cycle",
      summary:
        "This account has already completed audit work. Periodic reassessment keeps the relationship active and refreshes the executive reporting baseline.",
      sourceSignal: "completed_audit_cycle",
      tags: ["renewal", "reassessment", "program"]
    });
  }

  return candidates;
}

async function upsertAssessmentProgram(input: {
  db: EngagementDbClient;
  organizationId: string;
  customerAccountId: string | null;
  assessment: {
    id: string;
    name: string;
    status: AssessmentStatus;
    createdAt: Date;
    completedAt: Date | null;
    engagementProgramId: string | null;
    findings: Array<{ severity: string }>;
    reports: Array<{
      id: string;
      title: string;
      versionLabel: string;
      publishedAt: Date | null;
      createdAt: Date;
      status: string;
    }>;
    reportPackage:
      | {
          id: string;
          title: string;
          reviewedAt: Date | null;
          sentAt: Date | null;
          briefingCompletedAt: Date | null;
          currentVersionNumber: number;
      }
      | null;
  };
  assessmentIndex: number;
}) {
  const type = getAssessmentProgramType(input.assessmentIndex);
  const externalKey = `engagement:${type.toLowerCase()}:${input.assessment.id}`;
  const latestReport = input.assessment.reports[0] ?? null;
  const frameworkFocus = {
    assessmentId: input.assessment.id
  } satisfies Prisma.InputJsonValue;

  const program = await input.db.engagementProgram.upsert({
    where: { externalKey },
    update: {
      organizationId: input.organizationId,
      customerAccountId: input.customerAccountId,
      type,
      status: getAssessmentProgramStatus({
        assessmentStatus: input.assessment.status,
        hasReadyReport: Boolean(latestReport)
      }),
      commercialModel: EngagementCommercialModel.PROJECT,
      name: getAssessmentProgramName(input.assessment.name, input.assessmentIndex),
      description:
        type === EngagementProgramType.ONE_TIME_AUDIT
          ? "Project-scoped audit engagement with executive reporting and a remediation-ready output package."
          : "Repeat assessment cycle that refreshes posture, reporting, and follow-on remediation priorities.",
      frameworkFocus,
      tags: [
        type === EngagementProgramType.ONE_TIME_AUDIT ? "initial-engagement" : "repeat-engagement",
        "project"
      ] satisfies Prisma.InputJsonValue,
      currentCycleLabel:
        type === EngagementProgramType.ONE_TIME_AUDIT
          ? "Initial audit"
          : `Cycle ${input.assessmentIndex + 1}`,
      startedAt: input.assessment.createdAt,
      completedAt: latestReport ? input.assessment.completedAt ?? latestReport.publishedAt : null
    },
    create: {
      organizationId: input.organizationId,
      customerAccountId: input.customerAccountId,
      type,
      status: getAssessmentProgramStatus({
        assessmentStatus: input.assessment.status,
        hasReadyReport: Boolean(latestReport)
      }),
      commercialModel: EngagementCommercialModel.PROJECT,
      externalKey,
      name: getAssessmentProgramName(input.assessment.name, input.assessmentIndex),
      description:
        type === EngagementProgramType.ONE_TIME_AUDIT
          ? "Project-scoped audit engagement with executive reporting and a remediation-ready output package."
          : "Repeat assessment cycle that refreshes posture, reporting, and follow-on remediation priorities.",
      frameworkFocus,
      tags: [
        type === EngagementProgramType.ONE_TIME_AUDIT ? "initial-engagement" : "repeat-engagement",
        "project"
      ] satisfies Prisma.InputJsonValue,
      currentCycleLabel:
        type === EngagementProgramType.ONE_TIME_AUDIT
          ? "Initial audit"
          : `Cycle ${input.assessmentIndex + 1}`,
      startedAt: input.assessment.createdAt,
      completedAt: latestReport ? input.assessment.completedAt ?? latestReport.publishedAt : null
    }
  });

  if (input.assessment.engagementProgramId !== program.id) {
    await input.db.assessment.update({
      where: { id: input.assessment.id },
      data: { engagementProgramId: program.id }
    });
  }

  await input.db.engagementDeliverable.upsert({
    where: {
      externalKey: `engagement-deliverable:assessment:${input.assessment.id}`
    },
    update: {
      organizationId: input.organizationId,
      engagementProgramId: program.id,
      assessmentId: input.assessment.id,
      title: input.assessment.name,
      deliverableType: EngagementDeliverableType.ASSESSMENT,
      status: getAssessmentDeliverableStatus({
        assessmentStatus: input.assessment.status,
        reportPublished: Boolean(latestReport)
      }),
      readyAt: latestReport?.publishedAt ?? null,
      deliveredAt: latestReport?.publishedAt ?? null,
      metadata: {
        assessmentStatus: input.assessment.status,
        findingsCount: input.assessment.findings.length
      } satisfies Prisma.InputJsonValue
    },
    create: {
      organizationId: input.organizationId,
      engagementProgramId: program.id,
      assessmentId: input.assessment.id,
      externalKey: `engagement-deliverable:assessment:${input.assessment.id}`,
      title: input.assessment.name,
      deliverableType: EngagementDeliverableType.ASSESSMENT,
      status: getAssessmentDeliverableStatus({
        assessmentStatus: input.assessment.status,
        reportPublished: Boolean(latestReport)
      }),
      readyAt: latestReport?.publishedAt ?? null,
      deliveredAt: latestReport?.publishedAt ?? null,
      metadata: {
        assessmentStatus: input.assessment.status,
        findingsCount: input.assessment.findings.length
      } satisfies Prisma.InputJsonValue
    }
  });

  for (const report of input.assessment.reports) {
    if (report.status !== "READY" && report.status !== "DELIVERED" && report.status !== "SUPERSEDED") {
      continue;
    }

    await input.db.report.update({
      where: { id: report.id },
      data: { engagementProgramId: program.id }
    });

    await input.db.engagementDeliverable.upsert({
      where: {
        externalKey: `engagement-deliverable:report:${report.id}`
      },
      update: {
        organizationId: input.organizationId,
        engagementProgramId: program.id,
        assessmentId: input.assessment.id,
        reportId: report.id,
        title: report.title,
        deliverableType: EngagementDeliverableType.REPORT,
        status: getReportDeliverableStatus(report.publishedAt),
        versionLabel: report.versionLabel,
        readyAt: report.publishedAt ?? report.createdAt,
        deliveredAt: report.publishedAt ?? null,
        metadata: {
          reportStatus: report.status
        } satisfies Prisma.InputJsonValue
      },
      create: {
        organizationId: input.organizationId,
        engagementProgramId: program.id,
        assessmentId: input.assessment.id,
        reportId: report.id,
        externalKey: `engagement-deliverable:report:${report.id}`,
        title: report.title,
        deliverableType: EngagementDeliverableType.REPORT,
        status: getReportDeliverableStatus(report.publishedAt),
        versionLabel: report.versionLabel,
        readyAt: report.publishedAt ?? report.createdAt,
        deliveredAt: report.publishedAt ?? null,
        metadata: {
          reportStatus: report.status
        } satisfies Prisma.InputJsonValue
      }
    });
  }

  if (input.assessment.reportPackage) {
    await input.db.reportPackage.update({
      where: { id: input.assessment.reportPackage.id },
      data: { engagementProgramId: program.id }
    });

    await input.db.engagementDeliverable.upsert({
      where: {
        externalKey: `engagement-deliverable:package:${input.assessment.reportPackage.id}`
      },
      update: {
        organizationId: input.organizationId,
        engagementProgramId: program.id,
        assessmentId: input.assessment.id,
        reportPackageId: input.assessment.reportPackage.id,
        title: input.assessment.reportPackage.title,
        deliverableType: EngagementDeliverableType.EXECUTIVE_PACKAGE,
        status: getExecutivePackageDeliverableStatus({
          reviewedAt: input.assessment.reportPackage.reviewedAt,
          sentAt: input.assessment.reportPackage.sentAt,
          briefingCompletedAt: input.assessment.reportPackage.briefingCompletedAt
        }),
        versionLabel: `v${input.assessment.reportPackage.currentVersionNumber}.0`,
        readyAt: input.assessment.reportPackage.reviewedAt,
        deliveredAt:
          input.assessment.reportPackage.briefingCompletedAt ??
          input.assessment.reportPackage.sentAt,
        metadata: {
          briefingCompletedAt:
            input.assessment.reportPackage.briefingCompletedAt?.toISOString() ?? null
        } satisfies Prisma.InputJsonValue
      },
      create: {
        organizationId: input.organizationId,
        engagementProgramId: program.id,
        assessmentId: input.assessment.id,
        reportPackageId: input.assessment.reportPackage.id,
        externalKey: `engagement-deliverable:package:${input.assessment.reportPackage.id}`,
        title: input.assessment.reportPackage.title,
        deliverableType: EngagementDeliverableType.EXECUTIVE_PACKAGE,
        status: getExecutivePackageDeliverableStatus({
          reviewedAt: input.assessment.reportPackage.reviewedAt,
          sentAt: input.assessment.reportPackage.sentAt,
          briefingCompletedAt: input.assessment.reportPackage.briefingCompletedAt
        }),
        versionLabel: `v${input.assessment.reportPackage.currentVersionNumber}.0`,
        readyAt: input.assessment.reportPackage.reviewedAt,
        deliveredAt:
          input.assessment.reportPackage.briefingCompletedAt ??
          input.assessment.reportPackage.sentAt,
        metadata: {
          briefingCompletedAt:
            input.assessment.reportPackage.briefingCompletedAt?.toISOString() ?? null
        } satisfies Prisma.InputJsonValue
      }
    });
  }

  return program;
}

async function upsertMonitoringProgram(input: {
  db: EngagementDbClient;
  organizationId: string;
  customerAccountId: string | null;
  monitoringSubscription: {
    id: string;
    status: MonitoringSubscriptionStatus;
    activatedAt: Date | null;
    nextReviewAt: Date | null;
    currentPostureScore: number | null;
    currentRiskLevel: string | null;
  };
  latestReport:
    | {
        id: string;
        title: string;
        versionLabel: string;
        publishedAt: Date | null;
        assessmentId: string;
      }
    | null;
}) {
  const program = await input.db.engagementProgram.upsert({
    where: {
      externalKey: `engagement:monitoring:${input.organizationId}`
    },
    update: {
      organizationId: input.organizationId,
      customerAccountId: input.customerAccountId,
      subscriptionId: null,
      type: EngagementProgramType.ONGOING_MONITORING,
      status: getMonitoringProgramStatus(input.monitoringSubscription.status),
      commercialModel: EngagementCommercialModel.SUBSCRIPTION,
      name: "Continuous Monitoring Program",
      description:
        "Recurring monitoring layer that keeps posture, findings, and executive reporting visible between major assessment cycles.",
      tags: ["monitoring", "subscription"] satisfies Prisma.InputJsonValue,
      currentCycleLabel: "Current monitoring cycle",
      startedAt: input.monitoringSubscription.activatedAt,
      nextReviewAt: input.monitoringSubscription.nextReviewAt,
      completedAt: null
    },
    create: {
      organizationId: input.organizationId,
      customerAccountId: input.customerAccountId,
      type: EngagementProgramType.ONGOING_MONITORING,
      status: getMonitoringProgramStatus(input.monitoringSubscription.status),
      commercialModel: EngagementCommercialModel.SUBSCRIPTION,
      externalKey: `engagement:monitoring:${input.organizationId}`,
      name: "Continuous Monitoring Program",
      description:
        "Recurring monitoring layer that keeps posture, findings, and executive reporting visible between major assessment cycles.",
      tags: ["monitoring", "subscription"] satisfies Prisma.InputJsonValue,
      currentCycleLabel: "Current monitoring cycle",
      startedAt: input.monitoringSubscription.activatedAt,
      nextReviewAt: input.monitoringSubscription.nextReviewAt
    }
  });

  if (input.latestReport) {
    await input.db.engagementDeliverable.upsert({
      where: {
        externalKey: `engagement-deliverable:monitoring-review:${input.latestReport.id}`
      },
      update: {
        organizationId: input.organizationId,
        engagementProgramId: program.id,
        assessmentId: input.latestReport.assessmentId,
        reportId: input.latestReport.id,
        title: `${input.latestReport.title} Monitoring Review`,
        deliverableType: EngagementDeliverableType.MONITORING_REVIEW,
        status: getReportDeliverableStatus(input.latestReport.publishedAt),
        versionLabel: input.latestReport.versionLabel,
        readyAt: input.latestReport.publishedAt,
        deliveredAt: input.latestReport.publishedAt,
        metadata: {
          postureScore: input.monitoringSubscription.currentPostureScore,
          riskLevel: input.monitoringSubscription.currentRiskLevel
        } satisfies Prisma.InputJsonValue
      },
      create: {
        organizationId: input.organizationId,
        engagementProgramId: program.id,
        assessmentId: input.latestReport.assessmentId,
        reportId: input.latestReport.id,
        externalKey: `engagement-deliverable:monitoring-review:${input.latestReport.id}`,
        title: `${input.latestReport.title} Monitoring Review`,
        deliverableType: EngagementDeliverableType.MONITORING_REVIEW,
        status: getReportDeliverableStatus(input.latestReport.publishedAt),
        versionLabel: input.latestReport.versionLabel,
        readyAt: input.latestReport.publishedAt,
        deliveredAt: input.latestReport.publishedAt,
        metadata: {
          postureScore: input.monitoringSubscription.currentPostureScore,
          riskLevel: input.monitoringSubscription.currentRiskLevel
        } satisfies Prisma.InputJsonValue
      }
    });
  }

  return program;
}

export async function syncOrganizationEngagementPrograms(
  organizationId: string,
  options?: {
    db?: EngagementDbClient;
  }
) {
  const db = options?.db ?? prisma;
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: {
      customerAccount: {
        select: { id: true }
      },
      frameworkSelections: {
        include: { framework: true }
      },
      monitoringSubscription: {
        select: {
          id: true,
          status: true,
          activatedAt: true,
          nextReviewAt: true,
          currentPostureScore: true,
          currentRiskLevel: true,
          engagementProgramId: true
        }
      },
      monitoringFindings: {
        select: {
          id: true,
          status: true,
          severity: true,
          engagementProgramId: true
        }
      },
      assessments: {
        orderBy: { createdAt: "asc" },
        select: {
          findings: {
            select: {
              severity: true
            }
          },
          reports: {
            orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
            select: {
              id: true,
              title: true,
              versionLabel: true,
              publishedAt: true,
              createdAt: true,
              status: true,
              assessmentId: true
            }
          },
          reportPackages: {
            orderBy: { updatedAt: "desc" },
            take: 1,
            select: {
              id: true,
              title: true,
              reviewedAt: true,
              sentAt: true,
              briefingCompletedAt: true,
              currentVersionNumber: true
            }
          },
          engagementProgramId: true,
          id: true,
          name: true,
          status: true,
          createdAt: true,
          completedAt: true
        }
      }
    }
  });

  if (!organization) {
    throw new Error("Organization not found for engagement program sync.");
  }

  const programs = [];

  for (const [index, assessment] of organization.assessments.entries()) {
    const program = await upsertAssessmentProgram({
      db,
      organizationId,
      customerAccountId: organization.customerAccount?.id ?? null,
      assessment: {
        ...assessment,
        reportPackage: assessment.reportPackages[0] ?? null
      },
      assessmentIndex: index
    });
    programs.push(program);
  }

  let monitoringProgramId: string | null = null;
  const latestReport = organization.assessments
    .flatMap((assessment) => assessment.reports)
    .sort((left, right) => {
      const leftTime = (left.publishedAt ?? left.createdAt).getTime();
      const rightTime = (right.publishedAt ?? right.createdAt).getTime();
      return rightTime - leftTime;
    })[0] ?? null;

  if (organization.monitoringSubscription) {
    const monitoringProgram = await upsertMonitoringProgram({
      db,
      organizationId,
      customerAccountId: organization.customerAccount?.id ?? null,
      monitoringSubscription: organization.monitoringSubscription,
      latestReport
    });
    monitoringProgramId = monitoringProgram.id;
    programs.push(monitoringProgram);

    if (organization.monitoringSubscription.engagementProgramId !== monitoringProgram.id) {
      await db.monitoringSubscription.update({
        where: { id: organization.monitoringSubscription.id },
        data: { engagementProgramId: monitoringProgram.id }
      });
    }

    for (const finding of organization.monitoringFindings) {
      if (finding.engagementProgramId === monitoringProgram.id) {
        continue;
      }

      await db.monitoringFinding.update({
        where: { id: finding.id },
        data: { engagementProgramId: monitoringProgram.id }
      });
    }
  }

  const completedAuditCount = organization.assessments.filter((assessment) =>
    assessment.reports.some((report) => report.publishedAt)
  ).length;
  const openMonitoringFindingsCount = organization.monitoringFindings.filter(
    (finding) => finding.status === MonitoringFindingStatus.OPEN
  ).length;
  const inRemediationCount = organization.monitoringFindings.filter(
    (finding) => finding.status === MonitoringFindingStatus.IN_REMEDIATION
  ).length;
  const criticalFindingsCount =
    organization.monitoringFindings.filter((finding) => finding.severity === "CRITICAL").length +
    organization.assessments.reduce(
      (sum, assessment) =>
        sum + assessment.findings.filter((finding) => finding.severity === "CRITICAL").length,
      0
    );

  const opportunities = buildEngagementOpportunityCandidates({
    hasMonitoringProgram: Boolean(monitoringProgramId),
    openMonitoringFindingsCount,
    inRemediationCount,
    criticalFindingsCount,
    selectedFrameworks: organization.frameworkSelections.map((item) => item.framework.name),
    completedAuditCount
  });

  for (const opportunity of opportunities) {
    await db.engagementOpportunity.upsert({
      where: {
        externalKey: `engagement-opportunity:${organizationId}:${opportunity.category}`
      },
      update: {
        organizationId,
        engagementProgramId:
          opportunity.category === EngagementOpportunityCategory.ONGOING_MONITORING
            ? monitoringProgramId
            : null,
        category: opportunity.category,
        title: opportunity.title,
        summary: opportunity.summary,
        sourceSignal: opportunity.sourceSignal,
        tags: opportunity.tags satisfies Prisma.InputJsonValue,
        status: EngagementOpportunityStatus.OPEN,
        dismissedAt: null
      },
      create: {
        organizationId,
        engagementProgramId:
          opportunity.category === EngagementOpportunityCategory.ONGOING_MONITORING
            ? monitoringProgramId
            : null,
        externalKey: `engagement-opportunity:${organizationId}:${opportunity.category}`,
        category: opportunity.category,
        title: opportunity.title,
        summary: opportunity.summary,
        sourceSignal: opportunity.sourceSignal,
        tags: opportunity.tags satisfies Prisma.InputJsonValue,
        status: EngagementOpportunityStatus.OPEN
      }
    });
  }

  return programs;
}

export async function getOrganizationEngagementSnapshot(
  organizationId: string,
  options?: {
    db?: EngagementDbClient;
    synchronize?: boolean;
    includeInternal?: boolean;
  }
) {
  const db = options?.db ?? prisma;

  if (options?.synchronize) {
    await syncOrganizationEngagementPrograms(organizationId, { db });
  }

  const [programs, deliverables, opportunities, monitoringFindings] = await Promise.all([
    db.engagementProgram.findMany({
      where: { organizationId },
      orderBy: [{ status: "asc" }, { startedAt: "desc" }, { createdAt: "desc" }],
      include: {
        deliverables: {
          orderBy: [{ deliveredAt: "desc" }, { readyAt: "desc" }, { createdAt: "desc" }],
          take: 4
        }
      }
    }),
    db.engagementDeliverable.findMany({
      where: { organizationId },
      orderBy: [{ deliveredAt: "desc" }, { readyAt: "desc" }, { createdAt: "desc" }]
    }),
    options?.includeInternal
      ? db.engagementOpportunity.findMany({
          where: { organizationId },
          orderBy: [{ status: "asc" }, { updatedAt: "desc" }]
        })
      : Promise.resolve([]),
    db.monitoringFinding.findMany({
      where: { organizationId },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
    })
  ]);

  const activePrograms = programs.filter((program) => program.status === EngagementProgramStatus.ACTIVE);
  const historicalPrograms = programs.filter((program) => program.status !== EngagementProgramStatus.ACTIVE);

  return {
    programs,
    activePrograms,
    historicalPrograms,
    deliverables,
      remediationSummary: {
      openCount: monitoringFindings.filter(
        (finding) => finding.status === MonitoringFindingStatus.OPEN
      ).length,
      inRemediationCount: monitoringFindings.filter(
        (finding) => finding.status === MonitoringFindingStatus.IN_REMEDIATION
      ).length,
      acceptedCount: monitoringFindings.filter(
        (finding) => finding.status === MonitoringFindingStatus.ACCEPTED
      ).length,
      deferredCount: monitoringFindings.filter(
        (finding) => finding.status === MonitoringFindingStatus.DEFERRED
      ).length,
      resolvedCount: monitoringFindings.filter(
        (finding) => finding.status === MonitoringFindingStatus.RESOLVED
      ).length
    },
    opportunities
  };
}
