import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Prisma, ReportStatus, prisma } from "@evolve-edge/db";
import {
  getSessionAuthorizationContext,
  requireOrganizationPermission
} from "../../../../lib/auth";
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
  approveReportPackageQaAction,
  bookReportBriefingAction,
  completeFounderReviewAction,
  completeReportBriefingAction,
  markReportDeliveredAction,
  requestReportPackageChangesAction
} from "./actions";

export const dynamic = "force-dynamic";

type DeliveryPackageDetail = NonNullable<
  Awaited<ReturnType<typeof getReportExecutiveDeliveryPackage>>
>;
type DeliveryPackageVersion = DeliveryPackageDetail["versions"][number];

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatStatus(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function readReportJson(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
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
    changesRequested?: string;
    founderReviewed?: string;
    briefingBooked?: string;
    briefingCompleted?: string;
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

  const reportJson = readReportJson(report.reportJson);
  const deliveryPackage = await getReportExecutiveDeliveryPackage(report.id);
  const currentPackageVersion =
    deliveryPackage?.versions.find(
      (version: DeliveryPackageVersion) => version.reportId === report.id
    ) ?? null;
  const executiveSummary = readReportJson(currentPackageVersion?.executiveSummaryJson);
  const roadmapSummary = readReportJson(currentPackageVersion?.roadmapSummaryJson);
  const frameworkSummary = readReportJson(currentPackageVersion?.frameworkSummaryJson);
  const findings = Array.isArray(reportJson.findings)
    ? (reportJson.findings as Array<Record<string, unknown>>)
    : [];
  const roadmap = Array.isArray(reportJson.roadmap)
    ? (reportJson.roadmap as Array<Record<string, unknown>>)
    : [];
  const sectionSummaries = Array.isArray(reportJson.sectionSummaries)
    ? (reportJson.sectionSummaries as Array<Record<string, unknown>>)
    : [];
  const authz = getSessionAuthorizationContext(session);
  const canManageDeliveryControls = canManageReportDelivery(authz);
  const canApproveQa = hasPermission(authz, "reports.review");
  const canFounderReview = hasPermission(authz, "organization.manage");
  const artifactAvailability = hydratedReportView.artifactAvailability;

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(243,249,255,0.9))] p-8 shadow-panel backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium text-accent">Executive Report</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">{report.title}</h1>
            <p className="mt-3 text-sm text-steel">
              {report.assessment.name} · {report.versionLabel} · {formatStatus(report.status)} · Published{" "}
              {formatDate(report.publishedAt ?? report.createdAt)}
            </p>
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
        {query.qaApproved === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            QA review completed. This executive package is ready for delivery decisions.
          </div>
        ) : null}
        {query.changesRequested === "1" ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-warning">
            QA changes were requested before external delivery.
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
                Delivery is blocked until QA signs off on the executive packet.
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
                {deliveryPackage.deliveryStatus === "GENERATED" && canApproveQa ? (
                  <div className="flex flex-col gap-3">
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
                        Request changes
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

                {report.status !== ReportStatus.DELIVERED && canManageDeliveryControls ? (
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

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm font-medium text-steel">Posture Score</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {typeof reportView?.overallRiskPosture.score === "number"
                ? `${reportView.overallRiskPosture.score}/100`
                : "Pending"}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm font-medium text-steel">Risk Level</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {typeof reportView?.overallRiskPosture.level === "string"
                ? reportView.overallRiskPosture.level
                : "Not scored"}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm font-medium text-steel">Coverage</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {typeof reportJson.findingCount === "number"
                ? `${reportJson.findingCount} findings`
                : "0 findings"}
            </p>
            <p className="mt-2 text-sm text-steel">
              {typeof reportJson.recommendationCount === "number"
                ? `${reportJson.recommendationCount} recommendations`
                : "0 recommendations"}
            </p>
          </div>
        </div>

        <section className="mt-8 rounded-2xl border border-line bg-white p-6">
          <p className="text-sm font-medium text-steel">Executive Summary</p>
          <p className="mt-3 text-sm leading-7 text-ink">
            {reportView?.executiveSummary
              ? reportView.executiveSummary
              : "No executive summary was generated for this report yet."}
          </p>
        </section>

        {currentPackageVersion ? (
          <section className="mt-8 grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-line bg-white p-6">
              <p className="text-sm font-medium text-steel">Leadership overview</p>
              <p className="mt-3 text-sm leading-7 text-ink">
                {String(
                  executiveSummary.leadershipOverview ??
                    "No packaged leadership overview is available."
                )}
              </p>
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl bg-mist p-4">
                  <p className="text-sm font-semibold text-ink">Business risk framing</p>
                  <p className="mt-2 text-sm text-steel">
                    {String(executiveSummary.businessRisk ?? "Risk framing pending.")}
                  </p>
                </div>
                <div className="rounded-2xl bg-mist p-4">
                  <p className="text-sm font-semibold text-ink">Priority actions</p>
                  <div className="mt-2 space-y-2">
                    {Array.isArray(roadmapSummary.topActions)
                      ? (roadmapSummary.topActions as Array<Record<string, unknown>>).map(
                          (action, index) => (
                            <p key={`${action.title}-${index}`} className="text-sm text-steel">
                              {String(action.title ?? "Untitled")} · {String(action.priority ?? "Unknown")} ·{" "}
                              {String(action.timeline ?? "Timeline pending")}
                            </p>
                          )
                        )
                      : null}
                  </div>
                </div>
              </div>
            </article>

            <article className="rounded-2xl border border-line bg-white p-6">
              <p className="text-sm font-medium text-steel">Briefing packet metadata</p>
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl bg-mist p-4">
                  <p className="text-sm font-semibold text-ink">Frameworks assessed</p>
                  <div className="mt-2 space-y-2">
                    {Array.isArray(frameworkSummary.frameworksAssessed)
                      ? (
                          frameworkSummary.frameworksAssessed as Array<Record<string, unknown>>
                        ).map((framework, index) => (
                          <p key={`${framework.code}-${index}`} className="text-sm text-steel">
                            {String(framework.name ?? framework.code ?? "Framework")}
                            {framework.version ? ` ${String(framework.version)}` : ""}
                          </p>
                        ))
                      : null}
                  </div>
                </div>
                <div className="rounded-2xl bg-mist p-4">
                  <p className="text-sm font-semibold text-ink">Top findings snapshot</p>
                  <div className="mt-2 space-y-2">
                    {Array.isArray(executiveSummary.topFindings)
                      ? (
                          executiveSummary.topFindings as Array<Record<string, unknown>>
                        ).map((finding, index) => (
                          <p key={`${finding.title}-${index}`} className="text-sm text-steel">
                            {String(finding.title ?? "Untitled")} · {String(finding.severity ?? "Unknown")}
                          </p>
                        ))
                      : null}
                  </div>
                </div>
              </div>
            </article>
          </section>
        ) : null}

        <section className="mt-8 grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-line bg-white p-6">
            <p className="text-sm font-medium text-steel">Findings</p>
            <div className="mt-4 space-y-3">
              {findings.map((finding, index) => (
                <div key={`${finding.title}-${index}`} className="rounded-2xl bg-mist p-4">
                  <p className="text-sm font-semibold text-ink">
                    {String(finding.title ?? "Untitled finding")}
                  </p>
                  <p className="mt-2 text-sm text-steel">
                    {String(finding.severity ?? "Unknown severity")} ·{" "}
                    {String(finding.riskDomain ?? "Unknown domain")}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-steel">
                    {String(finding.summary ?? "No finding summary available.")}
                  </p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-line bg-white p-6">
            <p className="text-sm font-medium text-steel">Roadmap</p>
            <div className="mt-4 space-y-3">
              {roadmap.map((item, index) => (
                <div key={`${item.title}-${index}`} className="rounded-2xl bg-mist p-4">
                  <p className="text-sm font-semibold text-ink">
                    {String(item.title ?? "Untitled action")}
                  </p>
                  <p className="mt-2 text-sm text-steel">
                    {String(item.priority ?? "Unknown priority")} ·{" "}
                    {String(item.ownerRole ?? "Owner pending")} ·{" "}
                    {String(item.timeline ?? "Timeline pending")}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-steel">
                    {String(item.description ?? "No roadmap detail was generated.")}
                  </p>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="mt-8 rounded-2xl border border-line bg-white p-6">
          <p className="text-sm font-medium text-steel">Intake Evidence Summary</p>
          <div className="mt-4 space-y-3">
            {sectionSummaries.map((section, index) => (
              <div key={`${section.title}-${index}`} className="rounded-2xl bg-mist p-4">
                <p className="text-sm font-semibold text-ink">
                  {String(section.title ?? "Untitled section")}
                </p>
                <p className="mt-2 text-sm text-steel">
                  Status: {String(section.status ?? "Unknown")}
                </p>
                <p className="mt-2 text-sm leading-6 text-steel">
                  {String(section.notes ?? "No intake summary captured.")}
                </p>
              </div>
            ))}
          </div>
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
                        Packet version {version.versionNumber} · {formatDate(version.createdAt)}
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
