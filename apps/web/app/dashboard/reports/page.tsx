import Link from "next/link";
import { AssessmentStatus, Prisma, prisma } from "@evolve-edge/db";
import { ActivationTipCard } from "../../../components/activation-guide";
import { ProductSurfacePanel } from "../../../components/product-surface-panel";
import { UpsellOfferStack } from "../../../components/upsell-offer-stack";
import { getOrganizationActivationSnapshot } from "../../../lib/activation";
import { requireCurrentSession } from "../../../lib/auth";
import { getCurrentSubscription } from "../../../lib/billing";
import { getOrganizationEntitlements } from "../../../lib/entitlements";
import { getOrganizationReportPackages } from "../../../lib/executive-delivery";
import { getExpansionOffers } from "../../../lib/expansion-engine";
import { buildProductSurfaceModel } from "../../../lib/product-surface";
import {
  getOrganizationUsageMeteringSnapshot,
  getUsageMetricSnapshot
} from "../../../lib/usage-metering";
import { getUsageRemaining } from "../../../lib/usage-quotas";
import { generateReportAction } from "./actions";

export const dynamic = "force-dynamic";

type ReportListItem = Prisma.ReportGetPayload<{
  include: {
    assessment: true;
  };
}>;
type AssessmentListItem = Awaited<ReturnType<typeof prisma.assessment.findMany>>[number];
type DeliveryPackageListItem = Awaited<
  ReturnType<typeof getOrganizationReportPackages>
>[number];

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

function formatCompactStatus(status: string | null | undefined) {
  return status ? formatStatus(status).replace("Briefing ", "Briefing: ") : "Pending";
}

export default async function ReportsPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; generated?: string }>;
}) {
  const session = await requireCurrentSession({ requireOrganization: true });
  const organizationId = session.organization!.id;
  const [
    reports,
    assessments,
    deliveryPackages,
    entitlements,
    currentSubscription,
    documentsProcessedQuota,
    params
  ] =
    await Promise.all([
      prisma.report.findMany({
        where: { organizationId },
        include: {
          assessment: true
        },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }]
      }),
      prisma.assessment.findMany({
        where: {
          organizationId,
          status: {
            in: [
              AssessmentStatus.INTAKE_SUBMITTED,
              AssessmentStatus.ANALYSIS_QUEUED,
              AssessmentStatus.ANALYSIS_RUNNING,
              AssessmentStatus.REPORT_DRAFT_READY,
              AssessmentStatus.REPORT_PUBLISHED
            ]
          }
        },
        orderBy: { createdAt: "desc" }
      }),
      getOrganizationReportPackages(organizationId, { limit: 50 }),
      getOrganizationEntitlements(organizationId),
      getCurrentSubscription(organizationId),
      getUsageRemaining(organizationId, "documents_processed"),
      searchParams
    ]);
  const usageMetering = await getOrganizationUsageMeteringSnapshot(
    organizationId,
    entitlements.planCode
  );
  const activation = await getOrganizationActivationSnapshot(
    organizationId,
    entitlements
  );
  const reportUsage = getUsageMetricSnapshot(usageMetering, "reportsGenerated");
  const aiRunUsage = getUsageMetricSnapshot(usageMetering, "aiProcessingRuns");
  const upsellOffers = getExpansionOffers({
    placement: "reports",
    session,
    entitlements,
    usageMetering,
    currentPlanCode: currentSubscription?.plan.code ?? entitlements.planCode,
    hasStripeCustomer: Boolean(currentSubscription?.stripeCustomerId)
  });
  const deliveryPackageByReportId = new Map(
    deliveryPackages
      .filter(
        (
          deliveryPackage: DeliveryPackageListItem
        ): deliveryPackage is DeliveryPackageListItem & { latestReportId: string } =>
          typeof deliveryPackage.latestReportId === "string"
      )
      .map((deliveryPackage: DeliveryPackageListItem & { latestReportId: string }) => [
        deliveryPackage.latestReportId,
        deliveryPackage
      ])
  );
  const productSurface = buildProductSurfaceModel({
    area: "reports",
    entitlements,
    usageMetrics: [reportUsage, aiRunUsage].filter(
      (metric): metric is NonNullable<typeof metric> => Boolean(metric)
    ),
    quotas: [
      {
        key: "documents_processed",
        label: "Monthly documents processed",
        snapshot: documentsProcessedQuota
      }
    ]
  });

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-panel">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-accent">Report Center</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              Executive reports
            </h1>
          </div>
          <Link
            href="/dashboard"
            className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink"
          >
            Back to dashboard
          </Link>
        </div>

        {params.error === "missing-assessment" ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-danger">
            Choose an assessment before generating a report.
          </div>
        ) : null}

        {params.error === "incomplete" ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-warning">
            Submit the assessment intake before generating a report.
          </div>
        ) : null}

        {params.error === "plan" ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-warning">
            Report generation is not available on the current workspace tier.
            Upgrade billing or move this customer out of inactive mode to
            unlock executive deliverables.
          </div>
        ) : null}

        {params.generated ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            A new report is ready for review and delivery.
          </div>
        ) : null}

        {upsellOffers.length > 0 ? (
          <div className="mt-6">
            <UpsellOfferStack
              offers={upsellOffers}
              title="Reporting expansion"
              description="Keep premium report prompts tied to real reporting behavior so the page stays useful instead of noisy."
            />
          </div>
        ) : null}

        <div className="mt-6">
          <ProductSurfacePanel model={productSurface} />
        </div>

        {!activation.isActivated ? (
          <div className="mt-6">
            <ActivationTipCard
              title="This page is the activation milestone"
              body={
                entitlements.canGenerateReports
                  ? "Generating the first executive report is the clearest first-value moment in Evolve Edge because it turns intake and analysis into stakeholder-ready output."
                  : "The first executive report is the activation milestone, but current plan or billing state is blocking report generation."
              }
              href={entitlements.canGenerateReports ? "/dashboard/reports" : "/dashboard/settings"}
              label={entitlements.canGenerateReports ? "Generate first report" : "Open billing"}
            />
          </div>
        ) : null}

        <form
          action={generateReportAction}
          className="mt-8 flex flex-col gap-3 rounded-[24px] border border-line bg-mist p-5 md:flex-row md:items-center"
        >
          <select
            name="assessmentId"
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none md:min-w-[320px]"
            defaultValue={assessments[0]?.id ?? ""}
          >
            {assessments.map((assessment: AssessmentListItem) => (
              <option key={assessment.id} value={assessment.id}>
                {assessment.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={
              assessments.length === 0 || !entitlements.canGenerateReports
            }
            className="w-fit rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Generate report
          </button>
        </form>

        <p className="mt-3 text-sm text-steel">
          {entitlements.canGenerateReports
            ? entitlements.workspaceMode === "TRIAL"
              ? "Trial workspaces can generate live executive summaries during evaluation."
              : "Executive report generation is enabled for this workspace."
            : entitlements.canAccessReports
              ? "This workspace can still view existing reports, but billing is currently read-only for new report generation."
              : "This workspace cannot generate reports until an eligible plan is active."}
        </p>
        {reportUsage ? (
          <p className="mt-2 text-sm text-steel">
            Usage: {reportUsage.usageLabel}. {reportUsage.helperText}
          </p>
        ) : null}

        <div className="mt-8 grid gap-4">
          {entitlements.canAccessReports
            ? reports.map((report: ReportListItem) => {
                const deliveryPackage = deliveryPackageByReportId.get(report.id);
                const postureScore =
                  typeof report.reportJson === "object" &&
                  report.reportJson &&
                  !Array.isArray(report.reportJson) &&
                  typeof (report.reportJson as Record<string, unknown>).postureScore === "number"
                    ? ((report.reportJson as Record<string, unknown>).postureScore as number)
                    : null;

                return (
                  <Link
                    key={report.id}
                    href={`/dashboard/reports/${report.id}`}
                    className="rounded-2xl border border-line bg-mist p-5 transition hover:border-accent"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-lg font-semibold text-ink">{report.title}</p>
                        <p className="mt-2 text-sm text-steel">
                          {report.assessment.name} · {formatStatus(report.status)} ·{" "}
                          {formatDate(report.publishedAt ?? report.createdAt)}
                        </p>
                        {deliveryPackage ? (
                          <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
                            <span className="rounded-full bg-white px-3 py-1 text-steel">
                              Package {formatCompactStatus(deliveryPackage.deliveryStatus)}
                            </span>
                            <span className="rounded-full bg-white px-3 py-1 text-steel">
                              QA {formatCompactStatus(deliveryPackage.qaStatus)}
                            </span>
                            {deliveryPackage.requiresFounderReview &&
                            !deliveryPackage.founderReviewedAt ? (
                              <span className="rounded-full bg-rose-100 px-3 py-1 text-danger">
                                Founder review
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <div className="text-sm text-steel">
                        <p>
                          {deliveryPackage?.deliveryStatus === "BRIEFING_COMPLETED"
                            ? "Briefing completed"
                            : report.status === "DELIVERED"
                              ? "Delivered package"
                              : "Customer-ready report"}
                        </p>
                        <p className="mt-1">
                          {postureScore !== null
                            ? `Posture ${postureScore}/100`
                            : "Posture pending"}
                        </p>
                        {deliveryPackage?.sentAt ? (
                          <p className="mt-1">Sent {formatDate(deliveryPackage.sentAt)}</p>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                );
              })
            : null}

          {entitlements.canAccessReports && reports.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-white p-8 text-sm text-steel">
              No reports have been generated yet. Submit an assessment intake
              and use the action above to create the first executive
              deliverable from live workspace data.
            </div>
          ) : null}

          {reports.length > 0 &&
          !activation.supportingSignals.find((signal) => signal.key === "firstExecutiveSummaryViewed")?.completed ? (
            <ActivationTipCard
              title="Review the first report with stakeholders"
              body="Activation is already reached, and the next signal of healthy adoption is getting the first executive summary in front of the right audience."
              href={`/dashboard/reports/${reports[0]!.id}`}
              label="Open latest report"
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}
