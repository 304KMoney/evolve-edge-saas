"use server";

import { redirect } from "next/navigation";
import {
  Prisma,
  AssessmentStatus,
  JobStatus,
  prisma
} from "@evolve-edge/db";
import { requireCurrentSession } from "../../../lib/auth";
import { getServerAuditRequestContext, writeAuditLog } from "../../../lib/audit";
import { createOrReuseAssessmentWorkspace } from "../../../lib/assessment-start";
import { syncOrganizationCustomerAccount } from "../../../lib/customer-accounts";
import {
  calculateWeightedProgress,
  hasSavedAssessmentIntakeDraft
} from "../../../lib/conversion-funnel";
import {
  createCustomerRunForAssessment,
  markCustomerRunQueuedForAnalysis
} from "../../../lib/customer-runs";
import { publishDomainEvent } from "../../../lib/domain-events";
import { getAiExecutionWorkflowVersion } from "../../../lib/ai-execution";
import { requireAssessmentCreationAccess } from "../../../lib/entitlement-guards";
import { getOrganizationEntitlements, requireEntitlement } from "../../../lib/entitlements";
import { sendOperationalAlert } from "../../../lib/monitoring";
import { trackProductAnalyticsEvent } from "../../../lib/product-analytics";
import { ensurePendingAssessmentReport } from "../../../lib/report-records";
import { getAiExecutionProvider } from "../../../lib/runtime-config";
import { buildUsageThresholdEvents } from "../../../lib/usage";
import {
  getOrganizationUsageMeteringSnapshot,
  getUsageMetricSnapshot,
  getUsageThresholdEventMetricKey
} from "../../../lib/usage-metering";
import {
  recordUsageEvent,
  requireQuota
} from "../../../lib/usage-quotas";
import { dispatchWebhookDeliveriesForEvent } from "../../../lib/webhook-dispatcher";
import { computeAndPersistWorkflowRoutingDecision } from "../../../lib/workflow-routing";

export async function createAssessmentAction(formData: FormData) {
  const session = await requireCurrentSession({ requireOrganization: true });
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    redirect("/dashboard/assessments?error=missing-name");
  }

  const requestContext = await getServerAuditRequestContext();

  try {
    const result = await createOrReuseAssessmentWorkspace({
      session,
      requestContext,
      name,
      reuseExisting: false
    });

    redirect(`/dashboard/assessments/${result.assessmentId}?created=1`);
  } catch (error) {
    redirect(
      `/dashboard/assessments?error=${encodeURIComponent(
        error instanceof Error ? error.message : "Assessment creation failed."
      )}` as never
    );
  }
}

export async function saveAssessmentSectionAction(formData: FormData) {
  const session = await requireCurrentSession({ requireOrganization: true });
  const entitlements = await getOrganizationEntitlements(session.organization!.id);
  const assessmentId = String(formData.get("assessmentId") ?? "");
  const sectionId = String(formData.get("sectionId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const requestedStatus = String(formData.get("status") ?? "in_progress");
  const status =
    requestedStatus === "not_started" && notes.length > 0
      ? "in_progress"
      : requestedStatus;
  const requestContext = await getServerAuditRequestContext();

  const section = await prisma.assessmentSection.findFirst({
    where: {
      id: sectionId,
      assessmentId,
      assessment: {
        organizationId: session.organization!.id
      }
    },
    include: {
      assessment: true
    }
  });

  if (!section) {
    redirect("/dashboard/assessments?error=missing-assessment");
  }

  await prisma.$transaction(async (tx) => {
    const previousSectionStatus = section.status;

    await tx.assessmentSection.update({
      where: { id: section.id },
      data: {
        status,
        responses: {
          notes
        },
        completedAt: status === "completed" ? new Date() : null
      }
    });

    const sections = await tx.assessmentSection.findMany({
      where: { assessmentId: section.assessmentId },
      orderBy: { orderIndex: "asc" },
      select: { status: true }
    });

    const nextAssessmentStatus = sections.every(
      (item) => item.status === "completed"
    )
      ? AssessmentStatus.INTAKE_SUBMITTED
      : AssessmentStatus.INTAKE_IN_PROGRESS;
    const completedSections = sections.filter(
      (item) => item.status === "completed"
    ).length;
    const progressPercent = calculateWeightedProgress(
      sections.map((item) => item.status)
    );

    await tx.assessment.update({
      where: { id: section.assessmentId },
      data: {
        status: nextAssessmentStatus
      }
    });

    await writeAuditLog(tx, {
      organizationId: session.organization!.id,
      userId: session.user.id,
      actorLabel: session.user.email,
      action: "assessment.section_updated",
      entityType: "assessment",
      entityId: section.assessmentId,
      metadata: {
        sectionId: section.id,
        sectionKey: section.key,
        sectionStatus: status
      },
      requestContext
    });

    if (previousSectionStatus !== status) {
      await trackProductAnalyticsEvent({
        db: tx,
        name: "funnel.intake_progress_saved",
        payload: {
          assessmentId: section.assessmentId,
          completedSections,
          totalSections: sections.length,
          progressPercent
        },
        source: "assessment-save",
        path: `/dashboard/assessments/${section.assessmentId}`,
        session,
        organizationId: session.organization!.id,
        userId: session.user.id,
        billingPlanCode: entitlements.planCode
      });
    }

  });

  redirect(`/dashboard/assessments/${section.assessmentId}?saved=${section.id}`);
}

export async function submitAssessmentAction(formData: FormData) {
  const session = await requireCurrentSession({ requireOrganization: true });
  await requireEntitlement(session.organization!.id, "assessments.create", {
    failureRedirect: "/dashboard/assessments?error=plan"
  });
  const assessmentId = String(formData.get("assessmentId") ?? "");
  const requestContext = await getServerAuditRequestContext();
  const entitlements = await getOrganizationEntitlements(session.organization!.id);
  const usageMetering = await getOrganizationUsageMeteringSnapshot(
    session.organization!.id,
    entitlements.planCode
  );
  const aiRunUsage = getUsageMetricSnapshot(usageMetering, "aiProcessingRuns");

  const assessment = await prisma.assessment.findFirst({
    where: {
      id: assessmentId,
      organizationId: session.organization!.id
    },
    include: {
      sections: {
        orderBy: { orderIndex: "asc" }
      },
      analysisJobs: {
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });

  if (!assessment) {
    redirect("/dashboard/assessments?error=missing-assessment");
  }

  if (!hasSavedAssessmentIntakeDraft(assessment.sections)) {
    redirect(`/dashboard/assessments/${assessment.id}?error=incomplete`);
  }

  const completedSections = assessment.sections.filter(
    (section) => section.status === "completed"
  ).length;

  let submittedEventId: string | null = null;

  await prisma.$transaction(async (tx) => {
    const routingDecision = await computeAndPersistWorkflowRoutingDecision({
      db: tx,
      organizationId: session.organization!.id,
      actorUserId: session.user.id,
      workflowFamily: "assessment_analysis",
      sourceRecordType: "assessment",
      sourceRecordId: assessment.id,
      idempotencyKey: `workflow-routing:assessment-analysis:${assessment.id}`,
      metadata: {
        triggeredBy: "assessment.submit",
        assessmentId: assessment.id
      }
    });
    const canonicalPlanCode =
      entitlements.planCode === "enterprise"
        ? "enterprise"
        : entitlements.planCode === "scale"
          ? "scale"
          : "starter";

    await tx.assessment.update({
      where: { id: assessment.id },
      data: {
        status: AssessmentStatus.ANALYSIS_QUEUED,
        submittedAt: new Date()
      }
    });

    const report = await ensurePendingAssessmentReport({
      db: tx,
      organizationId: session.organization!.id,
      assessmentId: assessment.id,
      assessmentName: assessment.name,
      createdByUserId: session.user.id,
      organizationNameSnapshot: session.organization?.name ?? null,
      customerEmailSnapshot: session.user.email ?? null,
      selectedPlan: canonicalPlanCode
    });

    let queuedAnalysisJobId =
      assessment.analysisJobs[0]?.status === JobStatus.FAILED ||
      assessment.analysisJobs[0]?.status === JobStatus.CANCELED
        ? null
        : (assessment.analysisJobs[0]?.id ?? null);

    if (
      !assessment.analysisJobs[0] ||
      assessment.analysisJobs[0].status === JobStatus.FAILED ||
      assessment.analysisJobs[0].status === JobStatus.CANCELED
    ) {
      const analysisJob = await tx.analysisJob.create({
        data: {
          assessmentId: assessment.id,
          provider: getAiExecutionProvider(),
          status: JobStatus.QUEUED,
          jobType: "assessment_analysis",
          contractVersion: "assessment-analysis.v2",
          workflowVersion: getAiExecutionWorkflowVersion(),
          inputPayload: {
            assessmentId: assessment.id,
            organizationId: session.organization!.id,
            workflowRoutingDecisionId: routingDecision.id,
            workflowRouting:
              routingDecision.workflowHints &&
              typeof routingDecision.workflowHints === "object" &&
              !Array.isArray(routingDecision.workflowHints)
                ? routingDecision.workflowHints
                : undefined
          }
        }
      });
      queuedAnalysisJobId = analysisJob.id;

      const usageEvents = buildUsageThresholdEvents({
        metric: getUsageThresholdEventMetricKey("aiProcessingRuns"),
        used: (aiRunUsage?.used ?? 0) + 1,
        limit: aiRunUsage?.limit ?? null,
        organizationId: session.organization!.id
      });

      for (const event of usageEvents) {
        await publishDomainEvent(tx, event);

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
              metric: getUsageThresholdEventMetricKey("aiProcessingRuns"),
              thresholdPercent,
              limit: aiRunUsage?.limit ?? null,
              used: (aiRunUsage?.used ?? 0) + 1
            },
            source: "assessment-submit",
            path: `/dashboard/assessments/${assessment.id}`,
            session,
            organizationId: session.organization!.id,
            userId: session.user.id,
            billingPlanCode: entitlements.planCode
          });
        }
      }
    }

    const submittedEvent = await publishDomainEvent(tx, {
      type: "assessment.submitted",
      aggregateType: "assessment",
      aggregateId: assessment.id,
      orgId: session.organization!.id,
      userId: session.user.id,
      idempotencyKey: `assessment.submitted:${assessment.id}:${report.id}`,
      payload: {
        assessmentId: assessment.id,
        assessmentName: assessment.name,
        organizationId: session.organization!.id,
        userId: session.user.id,
        reportId: report.id,
        reportTitle: report.title,
        reportStatus: report.status,
        selectedPlan: canonicalPlanCode,
        completedSections,
        totalSections: assessment.sections.length,
        submittedAt: new Date().toISOString(),
        workflowRoutingDecisionId: routingDecision.id,
        workflowRouting:
          routingDecision.workflowHints &&
          typeof routingDecision.workflowHints === "object" &&
          !Array.isArray(routingDecision.workflowHints)
            ? routingDecision.workflowHints
            : undefined,
        workflowRoutingReasonCodes:
          Array.isArray(routingDecision.reasonCodes) ? routingDecision.reasonCodes : [],
        analysisJobId: queuedAnalysisJobId,
        sections: assessment.sections.map((section) => ({
          id: section.id,
          key: section.key,
          title: section.title,
          status: section.status,
          responses:
            section.responses &&
            typeof section.responses === "object" &&
            !Array.isArray(section.responses)
              ? section.responses
              : {}
        }))
      } satisfies Prisma.InputJsonValue
    });
    submittedEventId = submittedEvent?.id ?? null;

    await tx.notification.create({
      data: {
        organizationId: session.organization!.id,
        type: "assessment.submitted",
        title: "Assessment submitted",
        body: `${assessment.name} moved into the analysis queue.`,
        actionUrl: "/dashboard/reports"
      }
    });

    await writeAuditLog(tx, {
      organizationId: session.organization!.id,
      userId: session.user.id,
      actorLabel: session.user.email,
      action: "assessment.submitted",
      entityType: "assessment",
      entityId: assessment.id,
      metadata: {
        completedSections
      },
      requestContext
    });

    if (!assessment.submittedAt) {
      await trackProductAnalyticsEvent({
        db: tx,
        name: "funnel.intake_completed",
        payload: {
          assessmentId: assessment.id,
          completedSections,
          totalSections: assessment.sections.length
        },
        source: "assessment-submit",
        path: `/dashboard/assessments/${assessment.id}`,
        session,
        organizationId: session.organization!.id,
        userId: session.user.id,
        billingPlanCode: entitlements.planCode
      });
    }

    await markCustomerRunQueuedForAnalysis(assessment.id, tx);

    await syncOrganizationCustomerAccount(session.organization!.id, {
      db: tx,
      actorUserId: session.user.id,
      actorLabel: session.user.email,
      reason: "Assessment submission moved the customer into audit processing."
    });
  });

  if (submittedEventId) {
    try {
      await dispatchWebhookDeliveriesForEvent(submittedEventId);
    } catch (error) {
      await sendOperationalAlert({
        source: "assessment.submit",
        title: "Assessment submission n8n dispatch failed",
        metadata: {
          assessmentId,
          domainEventId: submittedEventId,
          message: error instanceof Error ? error.message : "Unknown error"
        }
      });
    }
  }

  redirect(`/dashboard?queued=analysis&assessment=${assessment.id}`);
}
