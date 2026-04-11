"use server";

import { Prisma, ReportStatus, prisma } from "@evolve-edge/db";
import { redirect } from "next/navigation";
import { getServerAuditRequestContext, writeAuditLog } from "../../../../lib/audit";
import { requireOrganizationPermission } from "../../../../lib/auth";
import { syncOrganizationCustomerAccount } from "../../../../lib/customer-accounts";
import { markCustomerRunDelivered } from "../../../../lib/customer-runs";
import { publishDomainEvent } from "../../../../lib/domain-events";
import {
  approveReportPackageQa,
  completeFounderReview,
  getReportExecutiveDeliveryPackage,
  markReportPackageBriefingBooked,
  markReportPackageBriefingCompleted,
  markReportPackageSent,
  requestReportPackageChanges,
  syncCustomerLifecycleFromReportPackage,
  upsertExecutiveDeliveryPackageForReport
} from "../../../../lib/executive-delivery";
import { trackProductAnalyticsEvent } from "../../../../lib/product-analytics";

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

  redirectToReport(result.report.id, "?changesRequested=1");
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

  const deliveredAt = new Date();

  await prisma.$transaction(async (tx) => {
    await markReportPackageSent({
      packageId: deliveryPackage.id,
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
