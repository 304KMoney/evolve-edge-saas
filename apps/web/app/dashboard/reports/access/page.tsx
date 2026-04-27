import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getOptionalCurrentSession,
  resolveScopedOrganizationSession
} from "../../../../lib/auth";
import { toCustomerAccessSession } from "../../../../lib/customer-access-session";
import {
  getDashboardReportDetailViewForAccessSession,
  getReportAccessCandidateById
} from "../../../../lib/report-records";

const ACCESS_STATE_COPY = {
  unpaid: {
    eyebrow: "Protected Report Access",
    title: "This report is not available until billing is confirmed",
    body:
      "Your workspace does not currently have an active paid route for this deliverable. If you expected access after checkout, we can verify the billing status and complete the handoff for you.",
    nextSteps:
      "Review your billing workspace if you are an existing customer, or contact Evolve Edge so we can confirm payment status and activate the correct delivery path.",
    primaryHref: "/dashboard/settings",
    primaryLabel: "Open billing"
  },
  "payment-pending": {
    eyebrow: "Protected Report Access",
    title: "Your payment is still being reconciled",
    body:
      "We have your payment signal, but the secure access handoff has not finished yet. This usually clears automatically once the Stripe event is reconciled into your customer workspace.",
    nextSteps:
      "Give the workflow a moment to finish, then return to the report center. If access does not appear shortly, our team can verify the reconciliation state for you.",
    primaryHref: "/dashboard/reports",
    primaryLabel: "Back to reports"
  },
  "no-grant": {
    eyebrow: "Protected Report Access",
    title: "No active access grant is available for this report",
    body:
      "The current customer context does not have a valid report-access grant for this deliverable. This can happen if access was revoked, replaced, or has not been reissued yet.",
    nextSteps:
      "Return to your workspace if another delivery route is already active, or contact Evolve Edge so we can verify the correct grant path for your team.",
    primaryHref: "/dashboard/reports",
    primaryLabel: "Back to reports"
  },
  unauthorized: {
    eyebrow: "Protected Report Access",
    title: "This report is not available in the current session",
    body:
      "Your current workspace access does not include this report or its delivery artifact. Sign in with the correct customer workspace or contact Evolve Edge if access should already be active.",
    nextSteps:
      "Return to the report center if you are already signed in to the correct workspace, or contact Evolve Edge support so we can review access and delivery status with you.",
    primaryHref: "/dashboard/reports",
    primaryLabel: "Back to reports"
  },
  expired: {
    eyebrow: "Protected Report Access",
    title: "This access link has expired",
    body:
      "For security, report access links are time-bounded. If you still need access to this deliverable, we can help issue a fresh route through the correct customer workspace.",
    nextSteps:
      "Return to your workspace if the report has already been issued there, or contact us so we can refresh the delivery path securely.",
    primaryHref: "/dashboard/reports",
    primaryLabel: "Back to reports"
  },
  "not-bound": {
    eyebrow: "Protected Report Access",
    title: "This report is not bound to your current customer context",
    body:
      "The report you opened does not match the current customer or organization context. This usually means the link belongs to a different workspace or delivery path.",
    nextSteps:
      "Return to the correct workspace if you have more than one customer context, or contact Evolve Edge so we can verify the intended delivery path.",
    primaryHref: "/dashboard/reports",
    primaryLabel: "Back to reports"
  },
  unavailable: {
    eyebrow: "Protected Report Access",
    title: "This report is not available right now",
    body:
      "The report exists, but it is not currently available for secure viewing or download. If you expected a completed deliverable, our team can verify the delivery state for you.",
    nextSteps:
      "Return to the report center if the deliverable is still being prepared, or contact support if you expected a completed report to be available already.",
    primaryHref: "/dashboard/reports",
    primaryLabel: "Back to reports"
  }
} as const;

type AccessReason = keyof typeof ACCESS_STATE_COPY;

function isAccessReason(value: string | undefined): value is AccessReason {
  return (
    value === "unpaid" ||
    value === "payment-pending" ||
    value === "no-grant" ||
    value === "unauthorized" ||
    value === "expired" ||
    value === "not-bound" ||
    value === "unavailable"
  );
}

export default async function ReportAccessStatePage({
  searchParams
}: {
  searchParams: Promise<{ reason?: string; reportId?: string }>;
}) {
  const params = await searchParams;
  const reason = isAccessReason(params.reason) ? params.reason : "unauthorized";
  const copy = ACCESS_STATE_COPY[reason];
  const reportId = params.reportId?.trim();

  if (reportId) {
    const [session, reportAccessCandidate] = await Promise.all([
      getOptionalCurrentSession(),
      getReportAccessCandidateById(reportId)
    ]);

    if (session && reportAccessCandidate) {
      const scopedSession = await resolveScopedOrganizationSession({
        session,
        organizationId: reportAccessCandidate.organizationId,
        permission: "reports.view"
      });

      if (scopedSession) {
        const report = await getDashboardReportDetailViewForAccessSession({
          reportId,
          accessSession: toCustomerAccessSession(scopedSession)
        });

        if (report) {
          redirect(`/dashboard/reports/${reportId}`);
        }
      }
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-panel">
        <p className="text-sm font-medium text-accent">{copy.eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink">{copy.title}</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-steel">{copy.body}</p>

        {reportId ? (
          <div className="mt-6 rounded-2xl border border-line bg-mist p-4 text-sm text-steel">
            Report reference: <span className="font-semibold text-ink">{reportId}</span>
          </div>
        ) : null}

        <div className="mt-8 grid gap-4 rounded-[24px] border border-line bg-mist p-5 md:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-ink">What to do next</p>
            <p className="mt-2 text-sm leading-6 text-steel">
              {copy.nextSteps}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 md:justify-end">
            <Link
              href={copy.primaryHref}
              className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white"
            >
              {copy.primaryLabel}
            </Link>
            <Link
              href="/contact-sales?intent=report-access-support&source=report-access-state"
              className="rounded-full border border-line px-5 py-3 text-sm font-semibold text-ink"
            >
              Contact support
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
