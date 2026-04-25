import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AuditActorType, Prisma, ReportStatus, prisma } from "@evolve-edge/db";
import {
  getSessionAuthorizationContext,
  requireOrganizationPermission
} from "../../../../lib/auth";
import {
  getServerAuditRequestContext,
  writeAuditLog
} from "../../../../lib/audit";
import {
  canManageReportDelivery,
  hasPermission
} from "../../../../lib/authorization";
import { createPlaceholderCustomerAccessGrant } from "../../../../lib/customer-access-grants";
import { findLatestCustomerAccessGrant } from "../../../../lib/customer-access-grant-records";
import { toCustomerAccessSession } from "../../../../lib/customer-access-session";
import { publishDomainEvent } from "../../../../lib/domain-events";
import { getReportExecutiveDeliveryPackage } from "../../../../lib/executive-delivery";
import {
  buildReportAccessStateHref,
  evaluateCustomerReportAccess,
  mapReportAccessDecisionToStateReason
} from "../../../../lib/report-access-control";
import {
  getDashboardReportDetailViewForAccessSession,
  getReportAccessCandidateById
} from "../../../../lib/report-records";
import {
  buildExecutiveReportViewModel,
  getLatestAssessmentWorkflowSnapshot
} from "../../../../lib/report-view-model";
import { getReportDeliveryOperationsSnapshot } from "../../../../lib/report-delivery-operations";
import {
  approveReportPackageQaAction,
  bookReportBriefingAction,
  completeFounderReviewAction,
  completeReportBriefingAction,
  markReportDeliveredAction,
  requestReportPackageChangesAction,
  requestReportRegenerationAction,
  saveReportReviewNotesAction
} from "./actions";

export const dynamic = "force-dynamic";

type DeliveryPackageDetail = NonNullable<
  Awaited<ReturnType<typeof getReportExecutiveDeliveryPackage>>
>;
type DeliveryPackageVersion = DeliveryPackageDetail["versions"][number];

function formatDate(date: Date | null | undefined) {
  if (!date) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatStatus(status: string) {
  return status
    .toLowerCase()
    .replaceAll("-", " ")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getDisplayName(input: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}) {
  const fullName = [input.firstName, input.lastName].filter(Boolean).join(" ");
  return fullName || input.email || "Workspace user";
}

export default async function ReportDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ reportId: string }>;
  searchParams: Promise<{
    delivered?: string;
    qaApproved?: string;
    rejected?: string;
    founderReviewed?: string;
    briefingBooked?: string;
    briefingCompleted?: string;
    notesSaved?: string;
    regenerationRequested?: string;
    error?: string;
  }>;
}) {
  const session = await requireOrganizationPermission("reports.view");
  const { reportId } = await params;
  const query = await searchParams;
  const accessSession = toCustomerAccessSession(session);
  const reportView = await getDashboardReportDetailViewForAccessSession({
    reportId,
    accessSession
  });
  const report = reportView?.report ?? null;

  if (!report) {
    const reportAccessCandidate = await getReportAccessCandidateById(reportId);

    if (!reportAccessCandidate) {
      notFound();
    }

    const durableAccessGrant = await findLatestCustomerAccessGrant({
      organizationId: accessSession.organizationId,
      userId: accessSession.customerId,
      reportId
    });

    const reportAccessDecision = evaluateCustomerReportAccess({
      reportId,
      reportOrganizationId: reportAccessCandidate.organizationId,
      accessSession,
      requiredScope: "reports",
      accessGrant:
        durableAccessGrant ??
        createPlaceholderCustomerAccessGrant({
          accessSession,
          requiredScope: "reports",
          reportId
        })
    });

    if (!reportAccessDecision.allowed) {
      redirect(
        buildReportAccessStateHref({
          reason: mapReportAccessDecisionToStateReason(reportAccessDecision),
          reportId
        })
      );
    }

    notFound();
  }

  const hydratedReportView = reportView!;

  if (!report.viewedAt) {
    const viewedAt = new Date();
    const requestContext = await getServerAuditRequestContext();

    await prisma.$transaction(async (tx) => {
      const claim = await tx.report.updateMany({
        where: {
          id: report.id,
          viewedAt: null
        },
        data: {
          viewedAt,
          viewedByUserId: session.user.id
        }
      });

      if (claim.count === 0) {
        return;
      }

      await publishDomainEvent(tx, {
        type: "report.viewed",
        aggregateType: "report",
        aggregateId: report.id,
        orgId: session.organization!.id,
        userId: session.user.id,
        idempotencyKey: `report.viewed:${report.id}`,
        occurredAt: viewedAt,
        payload: {
          reportId: report.id,
          assessmentId: report.assessmentId,
          organizationId: session.organization!.id,
          viewedAt: viewedAt.toISOString(),
          viewedByUserId: session.user.id
        } satisfies Prisma.InputJsonValue
      });

      await writeAuditLog(tx, {
        organizationId: session.organization!.id,
        userId: session.user.id,
        actorType: AuditActorType.USER,
        actorLabel: session.user.email,
        action: "report.viewed",
        entityType: "report",
        entityId: report.id,
        resourceType: "report",
        resourceId: report.id,
        dataClassification: report.dataClassification,
        metadata: {
          assessmentId: report.assessmentId
        },
        requestContext
      });
    });

    report.viewedAt = viewedAt;
    report.viewedBy = {
      id: session.user.id,
      email: session.user.email,
      firstName: session.user.firstName,
      lastName: session.user.lastName,
      platformRole: session.user.platformRole,
      authProviderId: null,
      hubspotContactId: null,
      onboardingCompletedAt: null,
      createdAt: viewedAt,
      updatedAt: viewedAt
    };
  }

  const deliveryPackage = await getReportExecutiveDeliveryPackage(report.id);
  const workflowSnapshot = await getLatestAssessmentWorkflowSnapshot(report.assessmentId);
  const executiveReport = buildExecutiveReportViewModel({
    report,
    overallRiskPosture: hydratedReportView.overallRiskPosture,
    workflowSnapshot
  });
  const authz = getSessionAuthorizationContext(session);
  const canManageDeliveryControls = canManageReportDelivery(authz);
  const canApproveQa = hasPermission(authz, "reports.review");
  const canFounderReview = hasPermission(authz, "organization.manage");
  const artifactAvailability = hydratedReportView.artifactAvailability;
  const deliveryOperations =
    canManageDeliveryControls || canApproveQa
      ? await getReportDeliveryOperationsSnapshot({
          organizationId: session.organization!.id,
          reportId: report.id
        })
      : null;

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(243,249,255,0.9))] p-8 shadow-panel backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium text-accent">Executive Report</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              {executiveReport.title}
            </h1>
            <p className="mt-3 text-sm text-steel">
              {executiveReport.assessmentName} · {executiveReport.versionLabel} ·{" "}
              {formatStatus(report.status)} · Published{" "}
              {formatDate(executiveReport.publishedAt)}
            </p>
            {executiveReport.subtitle ? (
              <p className="mt-2 text-sm text-steel">{executiveReport.subtitle}</p>
            ) : null}
            {hydratedReportView.deliveryStatus ? (
              <p className="mt-2 text-sm text-steel">
                Delivery {formatStatus(hydratedReportView.deliveryStatus)}
                {hydratedReportView.deliveryMessage
                  ? ` · ${hydratedReportView.deliveryMessage}`
                  : ""}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {artifactAvailability.canDownload ? (
              <a
                href={`/api/reports/${report.id}/export`}
                className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink"
              >
                Download HTML
              </a>
            ) : (
              <span className="rounded-full border border-line bg-mist px-4 py-2 text-sm font-semibold text-steel">
                Export pending
              </span>
            )}
            <Link
              href="/dashboard/roadmap"
              className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink"
            >
              Open roadmap
            </Link>
            <Link
              href="/dashboard/reports"
              className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink"
            >
              Back to reports
            </Link>
          </div>
        </div>

        {query.delivered === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            This report has been marked as delivered.
          </div>
        ) : null}
        {query.error === "delivery-requires-paid-subscription" ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-danger">
            Delivery is blocked because this workspace does not currently have an active paid subscription state in the app.
          </div>
        ) : null}
        {query.qaApproved === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            QA review completed. This executive package is ready for delivery decisions.
          </div>
        ) : null}
        {query.rejected === "1" ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-warning">
            This report was rejected for delivery and requires revision before client release.
          </div>
        ) : null}
        {query.notesSaved === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Internal review notes were saved.
          </div>
        ) : null}
        {query.regenerationRequested === "1" ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-warning">
            Regeneration was requested. A fresh LangGraph run has been queued and this version remains internal-only.
          </div>
        ) : null}
        {query.founderReviewed === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Founder review requirement cleared for this package.
          </div>
        ) : null}
        {query.briefingBooked === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Briefing marked as booked.
          </div>
        ) : null}
        {query.briefingCompleted === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Briefing marked as completed.
          </div>
        ) : null}

        {!artifactAvailability.canDownload ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-sm font-semibold text-warning">
              Download artifact not available yet
            </p>
            <p className="mt-2 text-sm leading-6 text-warning">
              {artifactAvailability.customerMessage}
            </p>
          </div>
        ) : null}

        {deliveryPackage?.requiresFounderReview ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-5">
            <p className="text-sm font-semibold text-danger">Founder review required</p>
            <p className="mt-2 text-sm text-danger">
              {deliveryPackage.founderReviewReason ??
                "This package contains high-risk signals and should be reviewed before client delivery."}
            </p>
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm font-medium text-steel">Workflow Progress</p>
            <p className="mt-2 text-lg font-semibold text-ink">
              {executiveReport.workflowProgress?.label ?? "Unavailable"}
            </p>
            <p className="mt-2 text-sm text-steel">
              {executiveReport.workflowProgress?.description ??
                "No workflow milestone is currently available for this report."}
            </p>
            <div className="mt-4 h-2.5 rounded-full bg-white/70">
              <div
                className="h-2.5 rounded-full bg-accent"
                style={{
                  width: `${executiveReport.workflowProgress?.progressPercent ?? 0}%`
                }}
              />
            </div>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm font-medium text-steel">Delivery Status</p>
            <p className="mt-2 text-lg font-semibold text-ink">
              {formatStatus(hydratedReportView.deliveryStatus ?? report.status)}
            </p>
            <p className="mt-2 text-sm text-steel">
              {hydratedReportView.deliveryMessage
                ? hydratedReportView.deliveryMessage
                : report.deliveredAt
                  ? `Delivered ${formatDate(report.deliveredAt)}`
                  : "Ready for customer delivery"}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm font-medium text-steel">Delivered By</p>
            <p className="mt-2 text-lg font-semibold text-ink">
              {report.deliveredBy
                ? getDisplayName(report.deliveredBy)
                : "Not delivered yet"}
            </p>
            <p className="mt-2 text-sm text-steel">
              {report.deliveredAt
                ? formatDate(report.deliveredAt)
                : "Internal delivery marker pending"}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm font-medium text-steel">First Viewed</p>
            <p className="mt-2 text-lg font-semibold text-ink">
              {report.viewedAt ? formatDate(report.viewedAt) : "Awaiting first view"}
            </p>
            <p className="mt-2 text-sm text-steel">
              {report.viewedBy
                ? `Viewed by ${getDisplayName(report.viewedBy)}`
                : "No viewer recorded yet"}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm font-medium text-steel">Review Gate</p>
            <p className="mt-2 text-lg font-semibold text-ink">
              {formatStatus(report.status)}
            </p>
            <p className="mt-2 text-sm text-steel">
              {report.status === ReportStatus.PENDING_REVIEW
                ? "Awaiting internal reviewer approval before client delivery."
                : report.status === ReportStatus.APPROVED
                  ? "Approved for delivery controls and customer send."
                  : report.status === ReportStatus.REJECTED
                    ? "Rejected for delivery until revised or regenerated."
                    : report.status === ReportStatus.DELIVERED
                      ? "Customer delivery has been recorded."
                      : "Report review status is being synchronized."}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm font-medium text-steel">Artifact state</p>
            <p className="mt-2 text-lg font-semibold text-ink">
              {typeof hydratedReportView.artifactMetadata?.downloadStatus === "string"
                ? formatStatus(hydratedReportView.artifactMetadata.downloadStatus)
                : artifactAvailability.canDownload
                  ? "Ready"
                  : "Pending"}
            </p>
            <p className="mt-2 text-sm text-steel">
              {typeof hydratedReportView.artifactMetadata?.fileName === "string"
                ? hydratedReportView.artifactMetadata.fileName
                : artifactAvailability.customerMessage}
            </p>
          </div>
        </div>

        {deliveryPackage &&
        (canManageDeliveryControls || canApproveQa || canFounderReview) ? (
          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-line bg-white p-5">
              <p className="text-sm font-medium text-steel">Internal QA review</p>
              <p className="mt-2 text-sm text-steel">
                Delivery is blocked until a reviewer approves the report package and any required founder review is cleared.
              </p>
              <div className="mt-4 space-y-3">
                {deliveryPackage.reviewedAt ? (
                  <p className="text-sm text-steel">
                    Reviewed {formatDate(deliveryPackage.reviewedAt)} by{" "}
                    {deliveryPackage.reviewedBy
                      ? getDisplayName(deliveryPackage.reviewedBy)
                      : "an internal reviewer"}
                  </p>
                ) : null}
                {deliveryPackage.qaNotes ? (
                  <p className="text-sm text-steel">{deliveryPackage.qaNotes}</p>
                ) : null}
                {canApproveQa ? (
                  <div className="flex flex-col gap-3">
                    <form action={saveReportReviewNotesAction} className="space-y-3">
                      <input type="hidden" name="reportId" value={report.id} />
                      <textarea
                        name="notes"
                        rows={3}
                        defaultValue={deliveryPackage.qaNotes ?? ""}
                        placeholder="Internal review notes for this report."
                        className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                      />
                      <button
                        type="submit"
                        className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink"
                      >
                        Save internal notes
                      </button>
                    </form>
                    {deliveryPackage.deliveryStatus === "GENERATED" ? (
                      <>
                    <form action={approveReportPackageQaAction} className="space-y-3">
                      <input type="hidden" name="reportId" value={report.id} />
                      <textarea
                        name="notes"
                        rows={3}
                        placeholder="QA notes for executive delivery."
                        className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                      />
                      <button
                        type="submit"
                        className="rounded-full bg-[linear-gradient(135deg,#1cc7d8,#6fe8f1)] px-5 py-3 text-sm font-semibold text-[#05111d]"
                      >
                        Approve for delivery
                      </button>
                    </form>
                    <form action={requestReportPackageChangesAction} className="space-y-3">
                      <input type="hidden" name="reportId" value={report.id} />
                      <textarea
                        name="notes"
                        rows={3}
                        placeholder="What should be corrected before delivery?"
                        className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                      />
                      <button
                        type="submit"
                        className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink"
                      >
                        Reject with reason
                      </button>
                    </form>
                    </>
                    ) : null}
                    <form action={requestReportRegenerationAction} className="space-y-3">
                      <input type="hidden" name="reportId" value={report.id} />
                      <textarea
                        name="notes"
                        rows={3}
                        placeholder="Why should the report be regenerated?"
                        className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                      />
                      <button
                        type="submit"
                        className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink"
                      >
                        Request regeneration
                      </button>
                    </form>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-white p-5">
              <p className="text-sm font-medium text-steel">Delivery progression</p>
              <div className="mt-4 space-y-3 text-sm text-steel">
                <p>Sent: {deliveryPackage.sentAt ? formatDate(deliveryPackage.sentAt) : "Not sent"}</p>
                <p>
                  Briefing booked:{" "}
                  {deliveryPackage.briefingBookedAt
                    ? formatDate(deliveryPackage.briefingBookedAt)
                    : "Not booked"}
                </p>
                <p>
                  Briefing completed:{" "}
                  {deliveryPackage.briefingCompletedAt
                    ? formatDate(deliveryPackage.briefingCompletedAt)
                    : "Not completed"}
                </p>
              </div>
              <div className="mt-4 flex flex-col gap-3">
                {deliveryPackage.requiresFounderReview &&
                !deliveryPackage.founderReviewedAt &&
                canFounderReview ? (
                  <form action={completeFounderReviewAction} className="space-y-3">
                    <input type="hidden" name="reportId" value={report.id} />
                    <textarea
                      name="notes"
                      rows={3}
                      placeholder="Founder review notes."
                      className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                    />
                    <button
                      type="submit"
                      className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink"
                    >
                      Clear founder review
                    </button>
                  </form>
                ) : null}

                {report.status !== ReportStatus.DELIVERED &&
                report.status === ReportStatus.APPROVED &&
                canManageDeliveryControls ? (
                  <form action={markReportDeliveredAction} className="space-y-3">
                    <input type="hidden" name="reportId" value={report.id} />
                    <textarea
                      name="notes"
                      rows={3}
                      placeholder="Delivery notes for the executive packet."
                      className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                    />
                    <button
                      type="submit"
                      className="rounded-full bg-[linear-gradient(135deg,#1cc7d8,#6fe8f1)] px-5 py-3 text-sm font-semibold text-[#05111d]"
                    >
                      Mark package sent
                    </button>
                  </form>
                ) : null}

                {deliveryPackage.deliveryStatus === "SENT" && canManageDeliveryControls ? (
                  <form action={bookReportBriefingAction} className="space-y-3">
                    <input type="hidden" name="reportId" value={report.id} />
                    <textarea
                      name="notes"
                      rows={2}
                      placeholder="Briefing booking notes."
                      className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                    />
                    <button
                      type="submit"
                      className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink"
                    >
                      Mark briefing booked
                    </button>
                  </form>
                ) : null}

                {deliveryPackage.deliveryStatus === "BRIEFING_BOOKED" &&
                canManageDeliveryControls ? (
                  <form action={completeReportBriefingAction} className="space-y-3">
                    <input type="hidden" name="reportId" value={report.id} />
                    <textarea
                      name="notes"
                      rows={2}
                      placeholder="Briefing completion notes."
                      className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                    />
                    <button
                      type="submit"
                      className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink"
                    >
                      Mark briefing completed
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {deliveryOperations ? (
          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-line bg-white p-5">
              <p className="text-sm font-medium text-steel">Delivery operations</p>
              <div className="mt-4 space-y-3 text-sm text-steel">
                <div className="rounded-2xl bg-mist p-4">
                  <p className="font-medium text-ink">
                    Billing {deliveryOperations.billing.eligible ? "eligible" : "blocked"}
                  </p>
                  <p className="mt-1 text-sm text-steel">
                    {deliveryOperations.billing.accessStateLabel}
                  </p>
                  <p className="mt-2 text-sm text-steel">
                    {deliveryOperations.billing.message}
                  </p>
                </div>
                <div className="rounded-2xl bg-mist p-4">
                  <p className="font-medium text-ink">
                    Email dispatch {deliveryOperations.dispatch.configured ? "configured" : "needs setup"}
                  </p>
                  <p className="mt-2 text-sm text-steel">
                    {deliveryOperations.dispatch.message}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {deliveryOperations.dispatch.requiredEnv.map((entry) => (
                      <span
                        key={entry.key}
                        className="rounded-full bg-white px-3 py-1 text-xs font-medium text-steel"
                      >
                        {entry.key}: {entry.configured ? "ready" : "missing"}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-white p-5">
              <p className="text-sm font-medium text-steel">Queued delivery emails</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <div className="rounded-2xl bg-mist p-4">
                  <p className="text-sm text-steel">Pending</p>
                  <p className="mt-2 text-xl font-semibold text-ink">
                    {deliveryOperations.emailQueue.counts.pending}
                  </p>
                </div>
                <div className="rounded-2xl bg-mist p-4">
                  <p className="text-sm text-steel">Processing</p>
                  <p className="mt-2 text-xl font-semibold text-ink">
                    {deliveryOperations.emailQueue.counts.processing}
                  </p>
                </div>
                <div className="rounded-2xl bg-mist p-4">
                  <p className="text-sm text-steel">Sent</p>
                  <p className="mt-2 text-xl font-semibold text-ink">
                    {deliveryOperations.emailQueue.counts.sent}
                  </p>
                </div>
                <div className="rounded-2xl bg-mist p-4">
                  <p className="text-sm text-steel">Failed</p>
                  <p className="mt-2 text-xl font-semibold text-ink">
                    {deliveryOperations.emailQueue.counts.failed}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm text-steel">
                Due now: {deliveryOperations.emailQueue.dueCount} · Scheduled later:{" "}
                {deliveryOperations.emailQueue.scheduledCount} · Latest activity:{" "}
                {formatDate(deliveryOperations.emailQueue.latestActivityAt)}
              </p>
              <div className="mt-4 space-y-3">
                {deliveryOperations.emailQueue.notifications.length > 0 ? (
                  deliveryOperations.emailQueue.notifications.map((notification) => (
                    <div key={notification.id} className="rounded-2xl bg-mist p-4">
                      <p className="font-medium text-ink">
                        {formatStatus(notification.templateKey)}
                      </p>
                      <p className="mt-1 text-sm text-steel">
                        {formatStatus(notification.status)} · Created{" "}
                        {formatDate(notification.createdAt)}
                      </p>
                      <p className="mt-2 text-sm text-steel">
                        {notification.sentAt
                          ? `Sent ${formatDate(notification.sentAt)}`
                          : notification.scheduledFor
                            ? `Scheduled ${formatDate(notification.scheduledFor)}`
                            : "Awaiting dispatch"}
                      </p>
                      {notification.lastError ? (
                        <p className="mt-2 text-sm text-danger">
                          Last error: {notification.lastError}
                        </p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl bg-mist p-4 text-sm text-steel">
                    No delivery or follow-up emails have been queued for this report yet.
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : null}

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm font-medium text-steel">Overall Risk Posture</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {executiveReport.overallRiskPosture.riskLevel ?? "Pending"}
            </p>
            <p className="mt-2 text-sm leading-6 text-steel">
              {executiveReport.overallRiskPosture.summary}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm font-medium text-steel">Compliance Score</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {typeof executiveReport.complianceScore === "number"
                ? `${executiveReport.complianceScore}/100`
                : "Pending"}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm font-medium text-steel">Top Concerns</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {executiveReport.topConcerns.length > 0
                ? `${executiveReport.topConcerns.length} priorities`
                : "Pending"}
            </p>
            <p className="mt-2 text-sm text-steel">
              {executiveReport.topConcerns[0] ??
                "Validated concerns will appear here once report generation completes."}
            </p>
          </div>
        </div>

        {executiveReport.emptyState ? (
          <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <p className="text-sm font-semibold text-warning">
              {executiveReport.emptyState.title}
            </p>
            <p className="mt-3 text-sm leading-7 text-warning">
              {executiveReport.emptyState.description}
            </p>
          </section>
        ) : null}

        <section className="mt-8 rounded-2xl border border-line bg-white p-6">
          <p className="text-sm font-medium text-steel">How this report was generated</p>
          <p className="mt-3 text-sm leading-7 text-ink">
            {executiveReport.trustSignals.howGenerated}
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-mist p-4">
              <p className="text-sm font-medium text-steel">What data was used</p>
              <p className="mt-2 text-sm leading-6 text-ink">
                {executiveReport.trustSignals.dataUsed}
              </p>
            </div>
            <div className="rounded-2xl bg-mist p-4">
              <p className="text-sm font-medium text-steel">Confidence level</p>
              <p className="mt-2 text-sm leading-6 text-ink">
                {executiveReport.trustSignals.confidenceLevel}
              </p>
            </div>
            <div className="rounded-2xl bg-mist p-4">
              <p className="text-sm font-medium text-steel">Last updated</p>
              <p className="mt-2 text-sm leading-6 text-ink">
                {executiveReport.trustSignals.lastUpdatedLabel}
              </p>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-line bg-mist p-4">
            <p className="text-sm font-medium text-steel">Important to know</p>
            <p className="mt-2 text-sm leading-6 text-ink">
              {executiveReport.disclaimers.advisoryOnly}
            </p>
            <p className="mt-2 text-sm leading-6 text-ink">
              {executiveReport.disclaimers.noGuarantee}
            </p>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-line bg-white p-6">
          <p className="text-sm font-medium text-steel">Executive Summary</p>
          <p className="mt-3 text-sm leading-7 text-ink">
            {executiveReport.executiveSummary}
          </p>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-line bg-white p-6">
            <p className="text-sm font-medium text-steel">Top Findings</p>
            <div className="mt-4 space-y-3">
              {executiveReport.topFindings.length > 0 ? (
                executiveReport.topFindings.map((finding, index) => (
                  <div key={`${finding.title}-${index}`} className="rounded-2xl bg-mist p-4">
                    <p className="text-sm font-semibold text-ink">{finding.title}</p>
                    <p className="mt-2 text-sm text-steel">
                      {finding.severity}
                      {finding.affectedArea ? ` · ${finding.affectedArea}` : ""}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-steel">
                      {finding.summary}
                    </p>
                    {finding.businessImpact ? (
                      <p className="mt-2 text-sm leading-6 text-steel">
                        Business impact: {finding.businessImpact}
                      </p>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-mist p-4 text-sm text-steel">
                  No validated findings are available yet.
                </div>
              )}
            </div>
          </article>

          <article className="rounded-2xl border border-line bg-white p-6">
            <p className="text-sm font-medium text-steel">Compliance &amp; Governance Gaps</p>
            <div className="mt-4 space-y-3">
              {executiveReport.complianceAndGovernanceGaps.length > 0 ? (
                executiveReport.complianceAndGovernanceGaps.map((gap, index) => (
                  <div key={`${gap}-${index}`} className="rounded-2xl bg-mist p-4">
                    <p className="text-sm leading-6 text-steel">{gap}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-mist p-4 text-sm text-steel">
                  No material compliance and governance gaps are currently summarized.
                </div>
              )}
            </div>
          </article>
        </section>

        <section className="mt-8 rounded-2xl border border-line bg-white p-6">
          <p className="text-sm font-medium text-steel">30/60/90 Day Roadmap</p>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {[
              {
                title: "0-30 Days",
                items: executiveReport.roadmap.days30,
                empty: "No immediate actions are currently available."
              },
              {
                title: "31-60 Days",
                items: executiveReport.roadmap.days60,
                empty: "No stabilization actions are currently available."
              },
              {
                title: "61-90 Days",
                items: executiveReport.roadmap.days90,
                empty: "No maturity actions are currently available."
              }
            ].map((bucket) => (
              <div key={bucket.title} className="rounded-2xl bg-mist p-4">
                <p className="text-sm font-semibold text-ink">{bucket.title}</p>
                <div className="mt-3 space-y-3">
                  {bucket.items.length > 0 ? (
                    bucket.items.map((item, index) => (
                      <div
                        key={`${bucket.title}-${item.title}-${index}`}
                        className="rounded-2xl border border-white/70 bg-white p-4"
                      >
                        <p className="text-sm font-semibold text-ink">{item.title}</p>
                        <p className="mt-2 text-sm text-steel">
                          {item.priority}
                          {item.ownerRole ? ` · ${item.ownerRole}` : ""}
                          {item.timeline ? ` · ${item.timeline}` : ""}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-steel">
                          {item.description}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-steel">{bucket.empty}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-line bg-white p-6">
            <p className="text-sm font-medium text-steel">Executive Briefing Talking Points</p>
            <div className="mt-4 space-y-3">
              {executiveReport.executiveBriefingTalkingPoints.length > 0 ? (
                executiveReport.executiveBriefingTalkingPoints.map((point, index) => (
                  <div
                    key={`${point}-${index}`}
                    className="rounded-2xl bg-mist p-4 text-sm leading-6 text-steel"
                  >
                    {point}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-mist p-4 text-sm text-steel">
                  Briefing talking points will appear after validated report assembly.
                </div>
              )}
            </div>
          </article>
          <article className="rounded-2xl border border-line bg-white p-6">
            <p className="text-sm font-medium text-steel">Closing Advisory Note</p>
            <p className="mt-4 text-sm leading-7 text-ink">
              {executiveReport.closingAdvisoryNote}
            </p>
          </article>
        </section>

        {deliveryPackage ? (
          <section className="mt-8 rounded-2xl border border-line bg-white p-6">
            <p className="text-sm font-medium text-steel">Prior package versions</p>
            <div className="mt-4 space-y-3">
              {deliveryPackage.versions.map((version: DeliveryPackageVersion) => (
                <div key={version.id} className="rounded-2xl bg-mist p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {version.report.title} · {version.report.versionLabel}
                      </p>
                      <p className="mt-1 text-sm text-steel">
                        Packet version {version.versionNumber} ·{" "}
                        {formatDate(version.createdAt)}
                      </p>
                    </div>
                    <Link
                      href={`/dashboard/reports/${version.reportId}`}
                      className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink"
                    >
                      Open version
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
