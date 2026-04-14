"use server";

import {
  AssessmentStatus,
  FindingSeverity,
  JobStatus,
  Prisma,
  RecommendationPriority,
  ReportStatus,
  prisma
} from "@evolve-edge/db";
import { redirect } from "next/navigation";
import { getServerAuditRequestContext, writeAuditLog } from "../../../lib/audit";
import { requireCurrentSession } from "../../../lib/auth";
import { syncMonitoringFromAssessment } from "../../../lib/continuous-monitoring";
import { syncOrganizationCustomerAccount } from "../../../lib/customer-accounts";
import { markCustomerRunReportGenerated } from "../../../lib/customer-runs";
import { publishDomainEvents } from "../../../lib/domain-events";
import { queueEmailNotification } from "../../../lib/email";
import { requireEntitlement } from "../../../lib/entitlements";
import { syncOrganizationEngagementPrograms } from "../../../lib/engagement-programs";
import { requireOrganizationFeature } from "../../../lib/entitlement-guards";
import { upsertExecutiveDeliveryPackageForReport } from "../../../lib/executive-delivery";
import { syncFrameworkControlScoringFromAssessment } from "../../../lib/framework-intelligence";
import {
  logReportGenerationFailure,
  logReportGenerationValidationFallback,
  type ReportGenerationFailureStage
} from "../../../lib/report-generation-monitoring";
import { trackProductAnalyticsEvent } from "../../../lib/product-analytics";
import { getAppUrl } from "../../../lib/runtime-config";
import { buildUsageThresholdEvents } from "../../../lib/usage";
import {
  getOrganizationUsageMeteringSnapshot,
  getUsageMetricSnapshot,
  getUsageThresholdEventMetricKey
} from "../../../lib/usage-metering";
import { computeAndPersistWorkflowRoutingDecision } from "../../../lib/workflow-routing";

function getRiskDomain(sectionKey: string) {
  switch (sectionKey) {
    case "company-profile":
      return "governance";
    case "ai-usage":
      return "third-party risk";
    case "data-handling":
      return "privacy";
    case "controls-and-policies":
      return "compliance";
    default:
      return "security";
  }
}

function getFrameworks(sectionKey: string) {
  switch (sectionKey) {
    case "company-profile":
      return ["NIST AI RMF", "SOC 2"];
    case "ai-usage":
      return ["ISO 42001", "NIST AI RMF"];
    case "data-handling":
      return ["GDPR", "HIPAA"];
    case "controls-and-policies":
      return ["SOC 2", "ISO 27001"];
    default:
      return ["NIST CSF"];
  }
}

function summarizeSectionNotes(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "No detailed intake notes were captured yet.";
  }

  const notes = (value as Record<string, unknown>).notes;
  return typeof notes === "string" && notes.trim().length > 0
    ? notes.trim()
    : "No detailed intake notes were captured yet.";
}

type ValidatedAnalysisResult = {
  executiveSummary: string;
  postureScore: number;
  riskLevel: string;
  findings: Array<Record<string, unknown>>;
  recommendations: Array<Record<string, unknown>>;
};

function getValidatedAnalysisResult(value: unknown): ValidatedAnalysisResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const result = (value as Record<string, unknown>).result;
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return null;
  }

  const record = result as Record<string, unknown>;
  if (
    typeof record.executiveSummary !== "string" ||
    typeof record.postureScore !== "number" ||
    typeof record.riskLevel !== "string" ||
    !Array.isArray(record.findings) ||
    !Array.isArray(record.recommendations)
  ) {
    return null;
  }

  return {
    executiveSummary: record.executiveSummary,
    postureScore: record.postureScore,
    riskLevel: record.riskLevel,
    findings: record.findings as Array<Record<string, unknown>>,
    recommendations: record.recommendations as Array<Record<string, unknown>>
  };
}

export async function generateReportAction(formData: FormData) {
  const session = await requireCurrentSession({ requireOrganization: true });
  const requestContext = await getServerAuditRequestContext();
  await requireOrganizationFeature(
    session.organization!.id,
    "reportCenter",
    "/dashboard/reports?error=plan"
  );
  const entitlements = await requireEntitlement(
    session.organization!.id,
    "reports.generate",
    {
      failureRedirect: "/dashboard/reports?error=plan"
    }
  );
  const assessmentId = String(formData.get("assessmentId") ?? "");
  const usageMetering = await getOrganizationUsageMeteringSnapshot(
    session.organization!.id,
    entitlements.planCode
  );
  const reportUsage = getUsageMetricSnapshot(usageMetering, "reportsGenerated");

  if (!assessmentId) {
    redirect("/dashboard/reports?error=missing-assessment");
  }

  const assessment = await prisma.assessment.findFirst({
    where: {
      id: assessmentId,
      organizationId: session.organization!.id
    },
    include: {
      sections: {
        orderBy: { orderIndex: "asc" }
      },
      findings: {
        orderBy: { sortOrder: "asc" }
      },
      recommendations: {
        orderBy: { sortOrder: "asc" }
      },
      analysisJobs: {
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });

  if (!assessment) {
    redirect("/dashboard/reports?error=missing-assessment");
  }

  const completedSections = assessment.sections.filter(
    (section) => section.status === "completed"
  );

  if (completedSections.length === 0) {
    redirect("/dashboard/reports?error=incomplete");
  }

  const analysisResult = getValidatedAnalysisResult(
    assessment.analysisJobs[0]?.outputPayload
  );
  if (assessment.analysisJobs[0] && !analysisResult) {
    logReportGenerationValidationFallback({
      organizationId: session.organization!.id,
      userId: session.user.id,
      assessmentId: assessment.id,
      analysisJobId: assessment.analysisJobs[0].id,
      requestContext
    });
  }
  const postureScore = analysisResult?.postureScore ?? Math.max(
    42,
    Math.min(
      96,
      48 + completedSections.length * 12 + assessment.sections.length * 4
    )
  );

  let failureStage: ReportGenerationFailureStage = "persistence";
  let routingDecisionId: string | null = null;
  let workflowCode: string | null = null;
  let createdReportId: string | null = null;

  let report: { id: string };
  try {
    report = await prisma.$transaction(async (tx) => {
    let findings = assessment.findings;
    if (findings.length === 0) {
      const generatedFindings = analysisResult
        ? analysisResult.findings.map((finding, index) => {
            const item = finding as Record<string, unknown>;

            return {
              assessmentId: assessment.id,
              title: String(item.title ?? "Finding"),
              summary: String(item.summary ?? ""),
              severity: String(item.severity ?? "MEDIUM") as FindingSeverity,
              riskDomain: String(item.riskDomain ?? "governance"),
              impactedFrameworks: Array.isArray(item.impactedFrameworks)
                ? item.impactedFrameworks.filter(
                    (value): value is string => typeof value === "string"
                  )
                : [],
              score:
                typeof item.score === "number" && Number.isFinite(item.score)
                  ? item.score
                  : 55 + index * 8,
              sortOrder: index + 1
            };
          })
        : completedSections.map((section, index) => ({
            assessmentId: assessment.id,
            title: `${section.title} control gap review`,
            summary: summarizeSectionNotes(section.responses),
            severity:
              index === 0
                ? FindingSeverity.HIGH
                : index === 1
                  ? FindingSeverity.MEDIUM
                  : FindingSeverity.LOW,
            riskDomain: getRiskDomain(section.key),
            impactedFrameworks: getFrameworks(section.key),
            score: 55 + index * 8,
            sortOrder: index + 1
          }));

      await tx.finding.createMany({
        data: generatedFindings
      });

      findings = await tx.finding.findMany({
        where: { assessmentId: assessment.id },
        orderBy: { sortOrder: "asc" }
      });
    }

    let recommendations = assessment.recommendations;
    if (recommendations.length === 0) {
      const generatedRecommendations = analysisResult
        ? analysisResult.recommendations.map((recommendation, index) => {
            const item = recommendation as Record<string, unknown>;

            return {
              assessmentId: assessment.id,
              title: String(item.title ?? "Recommendation"),
              description: String(item.description ?? ""),
              priority: String(item.priority ?? "MEDIUM") as RecommendationPriority,
              ownerRole:
                typeof item.ownerRole === "string"
                  ? item.ownerRole
                  : "Program Owner",
              effort: typeof item.effort === "string" ? item.effort : "Medium",
              targetTimeline:
                typeof item.targetTimeline === "string"
                  ? item.targetTimeline
                  : "30 days",
              sortOrder: index + 1
            };
          })
        : completedSections.map((section, index) => ({
            assessmentId: assessment.id,
            title: `Close ${section.title.toLowerCase()} gaps`,
            description: `Formalize controls, ownership, and evidence for ${section.title.toLowerCase()} based on the latest intake notes.`,
            priority:
              index === 0
                ? RecommendationPriority.URGENT
                : index === 1
                  ? RecommendationPriority.HIGH
                  : RecommendationPriority.MEDIUM,
            ownerRole:
              section.key === "data-handling"
                ? "Privacy Lead"
                : section.key === "controls-and-policies"
                  ? "Compliance Lead"
                  : "Program Owner",
            effort: index === 0 ? "Medium" : "Low",
            targetTimeline: index === 0 ? "30 days" : "45 days",
            sortOrder: index + 1
          }));

      await tx.recommendation.createMany({
        data: generatedRecommendations
      });

      recommendations = await tx.recommendation.findMany({
        where: { assessmentId: assessment.id },
        orderBy: { sortOrder: "asc" }
      });
    }

    const criticalFindings = findings.filter(
      (finding) => finding.severity === FindingSeverity.CRITICAL
    ).length;
    const highFindings = findings.filter(
      (finding) => finding.severity === FindingSeverity.HIGH
    ).length;
    const riskLevel =
      analysisResult?.riskLevel ??
      (criticalFindings > 0
        ? "High"
        : highFindings > 1
          ? "Moderate"
          : "Elevated");

    const versionCount = await tx.report.count({
      where: {
        organizationId: session.organization!.id,
        assessmentId: assessment.id
      }
    });
    failureStage = "routing";
    const routingDecision = await computeAndPersistWorkflowRoutingDecision({
      db: tx,
      organizationId: session.organization!.id,
      actorUserId: session.user.id,
      workflowFamily: "report_pipeline",
      sourceRecordType: "assessment",
      sourceRecordId: assessment.id,
      idempotencyKey: `workflow-routing:report-pipeline:${assessment.id}:v${versionCount + 1}`,
      metadata: {
        triggeredBy: "report.generate",
        assessmentId: assessment.id,
        reportVersionLabel: `v${versionCount + 1}.0`
      }
    });
    routingDecisionId = routingDecision.id;
    const workflowRouting =
      routingDecision.workflowHints &&
      typeof routingDecision.workflowHints === "object" &&
      !Array.isArray(routingDecision.workflowHints)
        ? (routingDecision.workflowHints as Record<string, unknown>)
        : null;
    workflowCode =
      typeof workflowRouting?.workflow_code === "string"
        ? workflowRouting.workflow_code
        : typeof workflowRouting?.routeKey === "string"
          ? workflowRouting.routeKey
          : null;
    const workflowFeatureFlags =
      workflowRouting?.featureFlags &&
      typeof workflowRouting.featureFlags === "object" &&
      !Array.isArray(workflowRouting.featureFlags)
        ? (workflowRouting.featureFlags as Record<string, unknown>)
        : {};
    const monitoringEnabled = Boolean(workflowFeatureFlags.monitoringEnabled);
    const controlScoringEnabled = Boolean(
      workflowFeatureFlags.controlScoringEnabled
    );
    const workflowRoutingJson = (workflowRouting ?? null) as Prisma.InputJsonValue | null;
    const workflowRoutingReasonCodes = routingDecision.reasonCodes as Prisma.InputJsonValue;

    failureStage = "persistence";
    const createdReport = await tx.report.create({
      data: {
        organizationId: session.organization!.id,
        assessmentId: assessment.id,
        createdByUserId: session.user.id,
        title: `${assessment.name} Executive Summary`,
        versionLabel: `v${versionCount + 1}.0`,
        status: ReportStatus.READY,
        publishedAt: new Date(),
        reportJson: {
          assessmentName: assessment.name,
          postureScore,
          riskLevel,
          executiveSummary:
            analysisResult?.executiveSummary ??
            (criticalFindings > 0
              ? "Immediate executive attention is required to address critical governance or privacy gaps identified during intake."
              : "The latest intake indicates a workable governance baseline with targeted remediation needed before the next review cycle."),
          intakeCoverage: {
            completedSections: completedSections.length,
            totalSections: assessment.sections.length
          },
          findingCount: findings.length,
          recommendationCount: recommendations.length,
          findings: findings.map((finding) => ({
            title: finding.title,
            severity: finding.severity,
            summary: finding.summary,
            riskDomain: finding.riskDomain,
            impactedFrameworks: finding.impactedFrameworks
          })),
          roadmap: recommendations.map((item) => ({
            title: item.title,
            priority: item.priority,
            description: item.description,
            ownerRole: item.ownerRole,
            timeline: item.targetTimeline,
            effort: item.effort
          })),
          workflowRoutingDecisionId: routingDecision.id,
          workflowRouting: workflowRoutingJson,
          sectionSummaries: assessment.sections.map((section) => ({
            title: section.title,
            status: section.status,
            notes: summarizeSectionNotes(section.responses)
          }))
        }
      }
    });
    createdReportId = createdReport.id;

    const completedAt = new Date();

    await tx.assessment.update({
      where: { id: assessment.id },
      data: {
        postureScore,
        riskLevel,
        status: AssessmentStatus.REPORT_PUBLISHED,
        completedAt
      }
    });

    if (assessment.analysisJobs[0] && analysisResult) {
      await tx.analysisJob.update({
        where: { id: assessment.analysisJobs[0].id },
        data: {
          status: JobStatus.SUCCEEDED,
          completedAt,
          outputPayload: {
            reportId: createdReport.id,
            findingCount: findings.length,
            recommendationCount: recommendations.length,
            provider: assessment.analysisJobs[0].provider
          }
        }
      });
    }

    await tx.notification.create({
      data: {
        organizationId: session.organization!.id,
        type: "report.generated",
        title: "Executive report ready",
        body: `${createdReport.title} is ready for review and delivery.`,
        actionUrl: `/dashboard/reports/${createdReport.id}`
      }
    });

    await publishDomainEvents(tx, [
      {
        type: "assessment.completed",
        aggregateType: "assessment",
        aggregateId: assessment.id,
        orgId: session.organization!.id,
        userId: session.user.id,
        idempotencyKey: `assessment.completed:${assessment.id}`,
        occurredAt: completedAt,
        payload: {
          assessmentId: assessment.id,
          organizationId: session.organization!.id,
          reportId: createdReport.id,
          postureScore,
          riskLevel,
          workflowRoutingDecisionId: routingDecision.id,
          workflowRouting: workflowRoutingJson,
          workflowRoutingReasonCodes
        } satisfies Prisma.InputJsonValue
      },
      {
        type: "report.generated",
        aggregateType: "report",
        aggregateId: createdReport.id,
        orgId: session.organization!.id,
        userId: session.user.id,
        idempotencyKey: `report.generated:${createdReport.id}`,
        occurredAt: completedAt,
        payload: {
          reportId: createdReport.id,
          assessmentId: assessment.id,
          organizationId: session.organization!.id,
          versionLabel: createdReport.versionLabel,
          status: createdReport.status,
          workflowRoutingDecisionId: routingDecision.id,
          workflowRouting: workflowRoutingJson,
          workflowRoutingReasonCodes
        } satisfies Prisma.InputJsonValue
      },
      {
        type: "roadmap.generated",
        aggregateType: "assessment",
        aggregateId: assessment.id,
        orgId: session.organization!.id,
        userId: session.user.id,
        idempotencyKey: `roadmap.generated:${assessment.id}:${createdReport.id}`,
        occurredAt: completedAt,
        payload: {
          assessmentId: assessment.id,
          reportId: createdReport.id,
          organizationId: session.organization!.id,
          recommendationCount: recommendations.length,
          workflowRoutingDecisionId: routingDecision.id,
          workflowRouting: workflowRoutingJson
        } satisfies Prisma.InputJsonValue
      }
    ]);

    const usageEvents = buildUsageThresholdEvents({
      metric: getUsageThresholdEventMetricKey("reportsGenerated"),
      used: (reportUsage?.used ?? 0) + 1,
      limit: reportUsage?.limit ?? null,
      organizationId: session.organization!.id
    });

    if (usageEvents.length > 0) {
      await publishDomainEvents(tx, usageEvents);
    }

    if (versionCount === 0) {
      await trackProductAnalyticsEvent({
        db: tx,
        name: "product.first_report_generated",
        payload: {
          reportId: createdReport.id,
          assessmentId: assessment.id
        },
        source: "report-generate",
        path: "/dashboard/reports",
        session,
        organizationId: session.organization!.id,
        userId: session.user.id,
        billingPlanCode: entitlements.planCode
      });
    }

    for (const event of usageEvents) {
      const thresholdPercent =
        typeof event.payload === "object" &&
        event.payload &&
        "thresholdPercent" in event.payload
          ? Number((event.payload as Record<string, unknown>).thresholdPercent)
          : 0;

      if (thresholdPercent >= 100) {
        await trackProductAnalyticsEvent({
          db: tx,
          name: "usage.limit_reached",
          payload: {
            metric: getUsageThresholdEventMetricKey("reportsGenerated"),
            thresholdPercent,
            limit: reportUsage?.limit ?? null,
            used: (reportUsage?.used ?? 0) + 1
          },
          source: "report-generate",
          path: "/dashboard/reports",
          session,
          organizationId: session.organization!.id,
          userId: session.user.id,
          billingPlanCode: entitlements.planCode
        });
      }
    }

    await writeAuditLog(tx, {
      organizationId: session.organization!.id,
      userId: session.user.id,
      actorLabel: session.user.email,
      action: "report.generated",
      entityType: "report",
      entityId: createdReport.id,
      metadata: {
        assessmentId: assessment.id,
        versionLabel: createdReport.versionLabel,
        recommendationCount: recommendations.length
      },
      requestContext
    });

    failureStage = "downstream_sync";
    await queueEmailNotification(tx, {
      templateKey: "report-ready",
      recipientEmail: session.user.email,
      recipientName: session.user.firstName,
      orgId: session.organization!.id,
      userId: session.user.id,
      idempotencyKey: `email:report-ready:${createdReport.id}:${session.user.id}`,
      payload: {
        organizationName: session.organization!.name,
        reportTitle: createdReport.title,
        reportUrl: `${getAppUrl()}/dashboard/reports/${createdReport.id}`
      }
    });

    await markCustomerRunReportGenerated({
      assessmentId: assessment.id,
      reportId: createdReport.id,
      db: tx
    });

    await upsertExecutiveDeliveryPackageForReport({
      db: tx,
      reportId: createdReport.id,
      actorUserId: session.user.id
    });

    if (monitoringEnabled) {
      await syncMonitoringFromAssessment({
        db: tx,
        organizationId: session.organization!.id,
        assessmentId: assessment.id,
        reportId: createdReport.id,
        actorUserId: session.user.id
      });
    }

    if (controlScoringEnabled) {
      await syncFrameworkControlScoringFromAssessment({
        db: tx,
        organizationId: session.organization!.id,
        assessmentId: assessment.id,
        reportId: createdReport.id,
        actorUserId: session.user.id
      });
    }

    await syncOrganizationCustomerAccount(session.organization!.id, {
      db: tx,
      actorUserId: session.user.id,
      actorLabel: session.user.email,
      reason: "Report generation advanced the customer lifecycle to report ready."
    });

    await syncOrganizationEngagementPrograms(session.organization!.id, {
      db: tx
    });

      return createdReport;
    });
  } catch (error) {
    logReportGenerationFailure({
      organizationId: session.organization!.id,
      userId: session.user.id,
      assessmentId: assessment.id,
      reportId: createdReportId,
      routingDecisionId,
      workflowCode,
      stage: failureStage,
      requestContext,
      error
    });

    throw error;
  }

  redirect(`/dashboard/reports?generated=${report.id}`);
}
