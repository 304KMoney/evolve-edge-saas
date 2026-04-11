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
import { syncOrganizationCustomerAccount } from "../../../lib/customer-accounts";
import { calculateWeightedProgress } from "../../../lib/conversion-funnel";
import {
  createCustomerRunForAssessment,
  markCustomerRunQueuedForAnalysis
} from "../../../lib/customer-runs";
import { publishDomainEvent } from "../../../lib/domain-events";
import { getDifyWorkflowVersion } from "../../../lib/dify";
import { requireAssessmentCreationAccess } from "../../../lib/entitlement-guards";
import { getOrganizationEntitlements, requireEntitlement } from "../../../lib/entitlements";
import { trackProductAnalyticsEvent } from "../../../lib/product-analytics";
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
import { computeAndPersistWorkflowRoutingDecision } from "../../../lib/workflow-routing";

const DEFAULT_ASSESSMENT_SECTIONS = [
  { key: "company-profile", title: "Company Profile" },
  { key: "ai-usage", title: "AI Usage Inventory" },
  { key: "data-handling", title: "Data Handling & Privacy" },
  { key: "controls-and-policies", title: "Controls & Policies" }
];

export async function createAssessmentAction(formData: FormData) {
  const session = await requireCurrentSession({ requireOrganization: true });
  const organizationId = session.organization!.id;
  const name = String(formData.get("name") ?? "").trim();
  const requestContext = await getServerAuditRequestContext();

  if (!name) {
    redirect("/dashboard/assessments?error=missing-name");
  }

  const entitlements = await requireAssessmentCreationAccess(
    organizationId,
    "/dashboard/assessments?error=limit"
  );
  await requireQuota(organizationId, "audits", {
    failureRedirect: "/dashboard/assessments",
    failureMessage:
      "Monthly audit quota reached. Upgrade required to create another assessment."
  });

  let assessmentId = "";

  try {
    const assessment = await prisma.$transaction(async (tx) => {
      const existingAssessmentCount = await tx.assessment.count({
        where: { organizationId }
      });

      const createdAssessment = await tx.assessment.create({
        data: {
          organizationId,
          createdByUserId: session.user.id,
          name,
          status: AssessmentStatus.INTAKE_IN_PROGRESS,
          sections: {
            create: DEFAULT_ASSESSMENT_SECTIONS.map((section, index) => ({
              key: section.key,
              title: section.title,
              status: index === 0 ? "in_progress" : "not_started",
              orderIndex: index + 1
            }))
          }
        }
      });

      await recordUsageEvent(
        {
          organizationId,
          meterKey: "audits",
          idempotencyKey: `usage:audits:${createdAssessment.id}`,
          source: "assessment.create",
          sourceRecordType: "assessment",
          sourceRecordId: createdAssessment.id,
          metadata: {
            assessmentId: createdAssessment.id,
            assessmentName: createdAssessment.name
          }
        },
        tx
      );

      await tx.notification.create({
        data: {
          organizationId,
          type: "assessment.created",
          title: "Assessment created",
          body: `${name} was created and is ready for intake.`,
          actionUrl: `/dashboard/assessments/${createdAssessment.id}`
        }
      });

      await publishDomainEvent(tx, {
        type: "assessment.created",
        aggregateType: "assessment",
        aggregateId: createdAssessment.id,
        orgId: organizationId,
        userId: session.user.id,
        idempotencyKey: `assessment.created:${createdAssessment.id}`,
        payload: {
          assessmentId: createdAssessment.id,
          organizationId,
          userId: session.user.id,
          name,
          status: createdAssessment.status,
          isFirstAssessment: existingAssessmentCount === 0
        } satisfies Prisma.InputJsonValue
      });

      if (existingAssessmentCount === 0) {
        await trackProductAnalyticsEvent({
          db: tx,
          name: "product.first_assessment_created",
          payload: {
            assessmentId: createdAssessment.id,
            assessmentName: createdAssessment.name
          },
          source: "assessment-create",
          path: "/dashboard/assessments",
          session,
          organizationId,
          userId: session.user.id,
          billingPlanCode: entitlements.planCode
        });
      }

      const usageEvents = buildUsageThresholdEvents({
        metric: "active_assessments",
        used: existingAssessmentCount + 1,
        limit: entitlements.activeAssessmentsLimit,
        organizationId
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
              metric: "active_assessments",
              thresholdPercent,
              limit: entitlements.activeAssessmentsLimit,
              used: existingAssessmentCount + 1
            },
            source: "assessment-create",
            path: "/dashboard/assessments",
            session,
            organizationId,
            userId: session.user.id,
            billingPlanCode: entitlements.planCode
          });
        }
      }

      await writeAuditLog(tx, {
        organizationId,
        userId: session.user.id,
        actorLabel: session.user.email,
        action: "assessment.created",
        entityType: "assessment",
        entityId: createdAssessment.id,
        metadata: {
          name,
          isFirstAssessment: existingAssessmentCount === 0
        },
        requestContext
      });

      await createCustomerRunForAssessment({
        db: tx,
        organizationId,
        initiatedByUserId: session.user.id,
        assessmentId: createdAssessment.id,
        source: "workspace_assessment_create",
        contextJson: {
          assessmentName: createdAssessment.name
        }
      });

      await syncOrganizationCustomerAccount(organizationId, {
        db: tx,
        actorUserId: session.user.id,
        actorLabel: session.user.email,
        reason: "Assessment creation started the intake lifecycle."
      });

      return createdAssessment;
    });
    assessmentId = assessment.id;
  } catch (error) {
    redirect(
      `/dashboard/assessments?error=${encodeURIComponent(
        error instanceof Error ? error.message : "Assessment creation failed."
      )}` as never
    );
  }

  redirect(`/dashboard/assessments/${assessmentId}?created=1`);
}

export async function saveAssessmentSectionAction(formData: FormData) {
  const session = await requireCurrentSession({ requireOrganization: true });
  const entitlements = await getOrganizationEntitlements(session.organization!.id);
  const assessmentId = String(formData.get("assessmentId") ?? "");
  const sectionId = String(formData.get("sectionId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const status = String(formData.get("status") ?? "in_progress");
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

  const completedSections = assessment.sections.filter(
    (section) => section.status === "completed"
  ).length;

  if (completedSections === 0) {
    redirect(`/dashboard/assessments/${assessment.id}?error=incomplete`);
  }

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

    await tx.assessment.update({
      where: { id: assessment.id },
      data: {
        status: AssessmentStatus.ANALYSIS_QUEUED,
        submittedAt: new Date()
      }
    });

    if (
      !assessment.analysisJobs[0] ||
      assessment.analysisJobs[0].status === JobStatus.FAILED ||
      assessment.analysisJobs[0].status === JobStatus.CANCELED
    ) {
      await tx.analysisJob.create({
        data: {
          assessmentId: assessment.id,
          provider: "dify",
          status: JobStatus.QUEUED,
          jobType: "assessment_analysis",
          contractVersion: "assessment-analysis.v1",
          workflowVersion: getDifyWorkflowVersion(),
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

  redirect(`/dashboard/assessments/${assessment.id}?submitted=1`);
}
