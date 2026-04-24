"use server";

import {
  OperationsQueueSeverity,
  OperationsQueueSourceSystem,
  OperationsQueueType,
  Prisma,
  ReportStatus,
  prisma
} from "@evolve-edge/db";
import { redirect } from "next/navigation";
import { getServerAuditRequestContext, writeAuditLog } from "../../../../lib/audit";
import { requireOrganizationPermission } from "../../../../lib/auth";
import { syncOrganizationCustomerAccount } from "../../../../lib/customer-accounts";
import { markCustomerRunDelivered } from "../../../../lib/customer-runs";
import { publishDomainEvent } from "../../../../lib/domain-events";
import {
  assertPaidReportDeliveryEligibility,
  queuePostReportDeliveryAutomation
} from "../../../../lib/report-delivery-automation";
import {
  approveReportPackageQa,
  completeFounderReview,
  getReportExecutiveDeliveryPackage,
  markReportPackageBriefingBooked,
  markReportPackageBriefingCompleted,
  markReportPackageSent,
  requestReportPackageChanges,
  saveReportPackageReviewNotes,
  syncCustomerLifecycleFromReportPackage,
  upsertExecutiveDeliveryPackageForReport
} from "../../../../lib/executive-delivery";
import { appendOperatorWorkflowEventRecord } from "../../../../lib/operator-workflow-event-records";
import { recordOperationalFinding } from "../../../../lib/operations-queues";
import { trackProductAnalyticsEvent } from "../../../../lib/product-analytics";
import { queueReportRegeneration } from "../../../../lib/report-review";

async function getReportAndPackage(reportId: string, organizationId: string) {
  const report = await prisma.report.findFirst({
    where: {
      id: reportId,
      organizationId
    }
  });

  if (!report) {
    return null;
  }

  let deliveryPackage = await getReportExecutiveDeliveryPackage(report.id);
  if (!deliveryPackage) {
    await upsertExecutiveDeliveryPackageForReport({
      reportId: report.id,
      actorUserId: null
    });
    deliveryPackage = await getReportExecutiveDeliveryPackage(report.id);
  }

  if (!deliveryPackage) {
    throw new Error("Executive delivery package could not be created.");
  }

  return {
    report,
    deliveryPackage
  };
}

function redirectToReport(reportId: string, query: string) {
  redirect(`/dashboard/reports/${reportId}${query}`);
}

export async function approveReportPackageQaAction(formData: FormData) {
  const session = await requireOrganizationPermission("reports.review");
  const reportId = String(formData.get("reportId") ?? "");
  const notes = String(formData.get("notes") ?? "");

  if (!reportId) {
    redirect("/dashboard/reports?error=missing-report");
  }

  const result = await getReportAndPackage(reportId, session.organization!.id);
  if (!result) {
    redirect("/dashboard/reports?error=missing-report");
  }

  const requestContext = await getServerAuditRequestContext();
  const updated = await approveReportPackageQa({
    packageId: result.deliveryPackage.id,
    organizationId: session.organization!.id,
    actorUserId: session.user.id,
    notes
  });

  await writeAuditLog(prisma, {
    organizationId: session.organization!.id,
    userId: session.user.id,
    actorLabel: session.user.email,
    action: "report_package.qa_approved",
    entityType: "reportPackage",
    entityId: updated.id,
    metadata: {
      reportId: result.report.id,
      qaStatus: updated.qaStatus
    },
    requestContext
  });

  redirectToReport(result.report.id, "?qaApproved=1");
}

export async function requestReportPackageChangesAction(formData: FormData) {
  const session = await requireOrganizationPermission("reports.review");
  const reportId = String(formData.get("reportId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!reportId || !notes) {
    redirect("/dashboard/reports?error=missing-report");
  }

  const result = await getReportAndPackage(reportId, session.organization!.id);
  if (!result) {
    redirect("/dashboard/reports?error=missing-report");
  }

  const requestContext = await getServerAuditRequestContext();
  const updated = await requestReportPackageChanges({
    packageId: result.deliveryPackage.id,
    organizationId: session.organization!.id,
    actorUserId: session.user.id,
    notes
  });

  await writeAuditLog(prisma, {
    organizationId: session.organization!.id,
    userId: session.user.id,
    actorLabel: session.user.email,
    action: "report_package.changes_requested",
    entityType: "reportPackage",
    entityId: updated.id,
    metadata: {
      reportId: result.report.id,
      qaStatus: updated.qaStatus
    },
    requestContext
  });

  redirectToReport(result.report.id, "?rejected=1");
}

export async function saveReportReviewNotesAction(formData: FormData) {
  const session = await requireOrganizationPermission("reports.review");
  const reportId = String(formData.get("reportId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!reportId || !notes) {
    redirect("/dashboard/reports?error=missing-report");
  }

  const result = await getReportAndPackage(reportId, session.organization!.id);
  if (!result) {
    redirect("/dashboard/reports?error=missing-report");
  }

  const requestContext = await getServerAuditRequestContext();
  const updated = await saveReportPackageReviewNotes({
    packageId: result.deliveryPackage.id,
    organizationId: session.organization!.id,
    actorUserId: session.user.id,
    notes
  });

  await writeAuditLog(prisma, {
    organizationId: session.organization!.id,
    userId: session.user.id,
    actorLabel: session.user.email,
    action: "report_package.review_notes_saved",
    entityType: "reportPackage",
    entityId: updated.id,
    metadata: {
      reportId: result.report.id
    },
    requestContext
  });

  redirectToReport(result.report.id, "?notesSaved=1");
}

export async function requestReportRegenerationAction(formData: FormData) {
  const session = await requireOrganizationPermission("reports.review");
  const reportId = String(formData.get("reportId") ?? "");
  const notes = String(formData.get("notes") ?? "");

  if (!reportId) {
    redirect("/dashboard/reports?error=missing-report");
  }

  const result = await getReportAndPackage(reportId, session.organization!.id);
  if (!result) {
    redirect("/dashboard/reports?error=missing-report");
  }

  const requestContext = await getServerAuditRequestContext();
  const queuedJob = await queueReportRegeneration({
    reportId: result.report.id,
    organizationId: session.organization!.id,
    actorUserId: session.user.id,
    notes
  });

  await writeAuditLog(prisma, {
    organizationId: session.organization!.id,
    userId: session.user.id,
    actorLabel: session.user.email,
    action: "report.regeneration_requested",
    entityType: "report",
    entityId: result.report.id,
    metadata: {
      assessmentId: result.report.assessmentId,
      analysisJobId: queuedJob.id
    },
    requestContext
  });

  redirectToReport(result.report.id, "?regenerationRequested=1");
}

export async function completeFounderReviewAction(formData: FormData) {
  const session = await requireOrganizationPermission("organization.manage");
  const reportId = String(formData.get("reportId") ?? "");
  const notes = String(formData.get("notes") ?? "");

  if (!reportId) {
    redirect("/dashboard/reports?error=missing-report");
  }

  const result = await getReportAndPackage(reportId, session.organization!.id);
  if (!result) {
    redirect("/dashboard/reports?error=missing-report");
  }

  const requestContext = await getServerAuditRequestContext();
  const updated = await completeFounderReview({
    packageId: result.deliveryPackage.id,
    organizationId: session.organization!.id,
    actorUserId: session.user.id,
    notes
  });

  await writeAuditLog(prisma, {
    organizationId: session.organization!.id,
    userId: session.user.id,
    actorLabel: session.user.email,
    action: "report_package.founder_review_completed",
    entityType: "reportPackage",
    entityId: updated.id,
    metadata: {
      reportId: result.report.id
    },
    requestContext
  });

  redirectToReport(result.report.id, "?founderReviewed=1");
}

export async function markReportDeliveredAction(formData: FormData) {
  const session = await requireOrganizationPermission("reports.deliver");
  const reportId = String(formData.get("reportId") ?? "");
  const notes = String(formData.get("notes") ?? "");
  const requestContext = await getServerAuditRequestContext();

  if (!reportId) {
    redirect("/dashboard/reports?error=missing-report");
  }

  const result = await getReportAndPackage(reportId, session.organization!.id);
  if (!result) {
    redirect("/dashboard/reports?error=missing-report");
  }

  const { report, deliveryPackage } = result;

  if (report.status === ReportStatus.DELIVERED) {
    redirect(`/dashboard/reports/${report.id}?delivered=1`);
  }

  try {
    await assertPaidReportDeliveryEligibility(session.organization!.id);
  } catch {
    await recordOperationalFinding({
      organizationId: session.organization!.id,
      queueType: OperationsQueueType.SUCCESS_RISK,
      ruleCode: "report.delivery_blocked_unpaid_subscription",
      severity: OperationsQueueSeverity.HIGH,
      sourceSystem: OperationsQueueSourceSystem.APP,
      title: "Report delivery blocked by billing state",
      summary:
        "An operator tried to deliver an approved report, but the workspace does not currently have an active paid subscription state in the app.",
      recommendedAction:
        "Confirm the latest Stripe-backed subscription state, resync billing if needed, and restore paid access before retrying delivery.",
      sourceRecordType: "report",
      sourceRecordId: report.id,
      metadata: {
        reportId: report.id,
        assessmentId: report.assessmentId,
        reportPackageId: deliveryPackage.id
      } satisfies Prisma.InputJsonValue
    });
    redirect(`/dashboard/reports/${report.id}?error=delivery-requires-paid-subscription`);
  }

  const deliveredAt = new Date();

  await prisma.$transaction(async (tx) => {
    await markReportPackageSent({
      packageId: deliveryPackage.id,
      organizationId: session.organization!.id,
      actorUserId: session.user.id,
      notes,
      db: tx
    });

    await tx.notification.create({
      data: {
        organizationId: session.organization!.id,
        type: "report.delivered",
        title: "Executive report delivered",
        body: `${report.title} was marked as delivered for customer access.`,
        actionUrl: `/dashboard/reports/${report.id}`
      }
    });

    await queuePostReportDeliveryAutomation({
      db: tx,
      report: {
        id: report.id,
        organizationId: report.organizationId,
        assessmentId: report.assessmentId,
        customerAccountId: report.customerAccountId ?? null,
        title: report.title,
        executiveSummary: report.executiveSummary,
        customerEmailSnapshot: report.customerEmailSnapshot ?? null,
        organization: {
          id: session.organization!.id,
          name: session.organization!.name
        },
        customerAccount: report.customerAccountId
          ? await tx.customerAccount.findUnique({
              where: { id: report.customerAccountId },
              select: {
                id: true,
                primaryContactEmail: true,
                companyName: true
              }
            })
          : null
      },
      deliveryPackageId: deliveryPackage.id,
      actorUserId: session.user.id,
      deliveredAt
    });

    await publishDomainEvent(tx, {
      type: "report.delivered",
      aggregateType: "report",
      aggregateId: report.id,
      orgId: session.organization!.id,
      userId: session.user.id,
      idempotencyKey: `report.delivered:${report.id}`,
      occurredAt: deliveredAt,
      payload: {
        reportId: report.id,
        assessmentId: report.assessmentId,
        organizationId: session.organization!.id,
        customerAccountId: report.customerAccountId ?? null,
        deliveredAt: deliveredAt.toISOString(),
        deliveredByUserId: session.user.id,
        reportPackageId: deliveryPackage.id
      } satisfies Prisma.InputJsonValue
    });

    await writeAuditLog(tx, {
      organizationId: session.organization!.id,
      userId: session.user.id,
      actorLabel: session.user.email,
      action: "report.delivered",
      entityType: "report",
      entityId: report.id,
      metadata: {
        assessmentId: report.assessmentId,
        deliveredAt: deliveredAt.toISOString(),
        reportPackageId: deliveryPackage.id
      },
      requestContext
    });

    await markCustomerRunDelivered(report.id, tx);

    await syncOrganizationCustomerAccount(session.organization!.id, {
      db: tx,
      actorUserId: session.user.id,
      actorLabel: session.user.email,
      reason: "Executive delivery package was sent to the customer."
    });

    await appendOperatorWorkflowEventRecord({
      db: tx,
      eventKey: `operator.report_delivered:${report.id}`,
      organizationId: session.organization!.id,
      customerAccountId: report.customerAccountId ?? null,
      reportId: report.id,
      eventCode: "report_delivered",
      severity: "info",
      message: "The report delivery package was marked as sent and customer delivery is now recorded.",
      metadata: {
        assessmentId: report.assessmentId,
        reportPackageId: deliveryPackage.id,
        deliveredAt: deliveredAt.toISOString(),
        deliveredByUserId: session.user.id
      }
    });
  });

  redirect(`/dashboard/reports/${report.id}?delivered=1`);
}

export async function bookReportBriefingAction(formData: FormData) {
  const session = await requireOrganizationPermission("reports.deliver");
  const reportId = String(formData.get("reportId") ?? "");
  const notes = String(formData.get("notes") ?? "");

  if (!reportId) {
    redirect("/dashboard/reports?error=missing-report");
  }

  const result = await getReportAndPackage(reportId, session.organization!.id);
  if (!result) {
    redirect("/dashboard/reports?error=missing-report");
  }

  const requestContext = await getServerAuditRequestContext();

  await prisma.$transaction(async (tx) => {
    const updated = await markReportPackageBriefingBooked({
      packageId: result.deliveryPackage.id,
      organizationId: session.organization!.id,
      actorUserId: session.user.id,
      notes,
      db: tx
    });

    await writeAuditLog(tx, {
      organizationId: session.organization!.id,
      userId: session.user.id,
      actorLabel: session.user.email,
      action: "report_package.briefing_booked",
      entityType: "reportPackage",
      entityId: updated.id,
      metadata: {
        reportId: result.report.id
      },
      requestContext
    });

    await syncCustomerLifecycleFromReportPackage({
      packageId: updated.id,
      db: tx
    });

    if (result.deliveryPackage.deliveryStatus !== "BRIEFING_BOOKED") {
      await trackProductAnalyticsEvent({
        db: tx,
        name: "funnel.briefing_booked",
        payload: {
          reportId: result.report.id,
          assessmentId: result.report.assessmentId,
          reportPackageId: updated.id
        },
        source: "report-briefing",
        path: `/dashboard/reports/${result.report.id}`,
        session,
        organizationId: session.organization!.id,
        userId: session.user.id
      });
    }
  });

  redirectToReport(result.report.id, "?briefingBooked=1");
}

export async function completeReportBriefingAction(formData: FormData) {
  const session = await requireOrganizationPermission("reports.deliver");
  const reportId = String(formData.get("reportId") ?? "");
  const notes = String(formData.get("notes") ?? "");

  if (!reportId) {
    redirect("/dashboard/reports?error=missing-report");
  }

  const result = await getReportAndPackage(reportId, session.organization!.id);
  if (!result) {
    redirect("/dashboard/reports?error=missing-report");
  }

  const requestContext = await getServerAuditRequestContext();

  await prisma.$transaction(async (tx) => {
    const updated = await markReportPackageBriefingCompleted({
      packageId: result.deliveryPackage.id,
      organizationId: session.organization!.id,
      actorUserId: session.user.id,
      notes,
      db: tx
    });

    await writeAuditLog(tx, {
      organizationId: session.organization!.id,
      userId: session.user.id,
      actorLabel: session.user.email,
      action: "report_package.briefing_completed",
      entityType: "reportPackage",
      entityId: updated.id,
      metadata: {
        reportId: result.report.id
      },
      requestContext
    });

    await syncCustomerLifecycleFromReportPackage({
      packageId: updated.id,
      db: tx
    });

    await trackProductAnalyticsEvent({
      db: tx,
      name: "funnel.monitoring_converted",
      payload: {
        reportId: result.report.id,
        assessmentId: result.report.assessmentId,
        reportPackageId: updated.id
      },
      source: "report-briefing",
      path: `/dashboard/reports/${result.report.id}`,
      session,
      organizationId: session.organization!.id,
      userId: session.user.id
    });
  });

  redirectToReport(result.report.id, "?briefingCompleted=1");
}
