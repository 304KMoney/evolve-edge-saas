import Link from "next/link";
import { AssessmentStatus, prisma } from "@evolve-edge/db";
import { ActivationTipCard } from "../../../components/activation-guide";
import { ProductSurfacePanel } from "../../../components/product-surface-panel";
import { UpsellOfferStack } from "../../../components/upsell-offer-stack";
import { getOrganizationActivationSnapshot } from "../../../lib/activation";
import { getCurrentSubscription } from "../../../lib/billing";
import {
  getSessionAuthorizationContext,
  requireCurrentSession,
} from "../../../lib/auth";
import { hasPermission } from "../../../lib/authorization";
import { toCustomerAccessSession } from "../../../lib/customer-access-session";
import { getOrganizationEntitlements } from "../../../lib/entitlements";
import { getOrganizationReportPackages } from "../../../lib/executive-delivery";
import { getExpansionOffers } from "../../../lib/expansion-engine";
import { getOrganizationAiFeedbackSummary } from "../../../src/server/ai/feedback";
import { buildProductSurfaceModel } from "../../../lib/product-surface";
import { logServerEvent } from "../../../lib/monitoring";
import {
  isPrismaRuntimeCompatibilityError,
  logPrismaRuntimeCompatibilityError
} from "../../../lib/prisma-runtime";
import { listDashboardReportSummaryViewsForAccessSession } from "../../../lib/report-records";
import {
  getOrganizationUsageMeteringSnapshot,
  getUsageMetricSnapshot
} from "../../../lib/usage-metering";
import { getUsageRemaining } from "../../../lib/usage-quotas";
import { generateReportAction } from "./actions";

export const dynamic = "force-dynamic";

type AssessmentListItem = Awaited<ReturnType<typeof prisma.assessment.findMany>>[number];
type DeliveryPackageListItem = Awaited<
  ReturnType<typeof getOrganizationReportPackages>
>[number];
type OptionalReportsDependencyKey =
  | "delivery_packages"
  | "billing_snapshot"
  | "documents_processed_quota"
  | "usage_metering"
  | "activation"
  | "ai_feedback";

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

function isPendingReviewLikeStatus(status: string | null | undefined) {
  return (
    status === "PENDING" ||
    status === "PENDING_REVIEW" ||
    status === "GENERATED"
  );
}

function buildOptionalReportsDependencyWarning(
  dependency: OptionalReportsDependencyKey
) {
  switch (dependency) {
    case "delivery_packages":
      return "Delivery package status is temporarily unavailable.";
    case "billing_snapshot":
      return "Billing-linked report upgrade context is temporarily unavailable.";
    case "documents_processed_quota":
      return "Document processing quota status is temporarily unavailable.";
    case "usage_metering":
      return "Usage metering for reports is temporarily unavailable.";
    case "activation":
      return "Activation guidance is temporarily unavailable.";
    case "ai_feedback":
      return "Internal AI feedback metrics are temporarily unavailable.";
    default:
      return "A secondary report panel is temporarily unavailable.";
  }
}

async function loadOptionalReportsDependency<T>(input: {
  organizationId: string;
  dependency: OptionalReportsDependencyKey;
  load: () => Promise<T>;
  fallback: T;
}) {
  try {
    return {
      value: await input.load(),
      warning: null
    };
  } catch (error) {
    if (isPrismaRuntimeCompatibilityError(error)) {
      logPrismaRuntimeCompatibilityError(
        `dashboard.reports.${input.dependency}`,
        error,
        {
          organizationId: input.organizationId
        }
      );
    } else {
      logServerEvent("warn", "dashboard.reports.partial_dependency", {
        organizationId: input.organizationId,
        dependency: input.dependency,
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }

    return {
      value: input.fallback,
      warning: buildOptionalReportsDependencyWarning(input.dependency)
    };
  }
}

function renderReportsFallback() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(243,249,255,0.9))] p-8 shadow-panel backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-accent">Report Center</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              Reports unavailable
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-steel">
              Report generation and archive data are temporarily unavailable.
              This page is rendering a safe fallback state until workspace report
              records are fully available again.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink"
          >
            Back to dashboard
          </Link>
        </div>

        <div className="mt-8 rounded-2xl border border-dashed border-line bg-white p-8 text-sm text-steel">
          Report data is unavailable right now.
        </div>
      </div>
    </main>
  );
}

export default async function ReportsPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; generated?: string }>;
}) {
  // This index page is a product surface and control center for report generation,
  // billing posture, and delivery status. Direct report artifact access remains
  // permission-gated on the detail/export paths.
  const session = await requireCurrentSession({ requireOrganization: true });
  const accessSession = toCustomerAccessSession(session);
  const organizationId = session.organization!.id;
  let reports: Awaited<
    ReturnType<typeof listDashboardReportSummaryViewsForAccessSession>
  > = [];
  let assessments: AssessmentListItem[] = [];
  let deliveryPackages: DeliveryPackageListItem[] = [];
  let entitlements: Awaited<ReturnType<typeof getOrganizationEntitlements>> | null = null;
  let currentSubscription: Awaited<ReturnType<typeof getCurrentSubscription>> | null = null;
  let documentsProcessedQuota: Awaited<ReturnType<typeof getUsageRemaining>> | null = null;
  let params: Awaited<typeof searchParams> = {};
  let activation: Awaited<ReturnType<typeof getOrganizationActivationSnapshot>> | null = null;
  let reportUsage: ReturnType<typeof getUsageMetricSnapshot> = null;
  let aiRunUsage: ReturnType<typeof getUsageMetricSnapshot> = null;
  let upsellOffers: ReturnType<typeof getExpansionOffers> = [];
  const partialDataWarnings: string[] = [];
  const canReviewReports = hasPermission(
    getSessionAuthorizationContext(session),
    "reports.review"
  );
  let aiFeedbackSummary: Awaited<ReturnType<typeof getOrganizationAiFeedbackSummary>> | null =
    null;

  try {
    [reports, assessments, entitlements, params] = await Promise.all([
      listDashboardReportSummaryViewsForAccessSession({
        accessSession
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
      getOrganizationEntitlements(organizationId),
      searchParams
    ]);
  } catch (error) {
    if (isPrismaRuntimeCompatibilityError(error)) {
      logPrismaRuntimeCompatibilityError("dashboard.reports", error, {
        organizationId
      });
    } else {
      logServerEvent("error", "dashboard.reports.fallback", {
        organizationId,
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }

    return renderReportsFallback();
  }

  const [
    deliveryPackagesResult,
    currentSubscriptionResult,
    documentsProcessedQuotaResult,
    usageMeteringResult,
    activationResult,
    aiFeedbackSummaryResult
  ] = await Promise.all([
    loadOptionalReportsDependency({
      organizationId,
      dependency: "delivery_packages",
      load: () => getOrganizationReportPackages(organizationId, { limit: 50 }),
      fallback: [] as DeliveryPackageListItem[]
    }),
    loadOptionalReportsDependency({
      organizationId,
      dependency: "billing_snapshot",
      load: () => getCurrentSubscription(organizationId),
      fallback: null as Awaited<ReturnType<typeof getCurrentSubscription>> | null
    }),
    loadOptionalReportsDependency({
      organizationId,
      dependency: "documents_processed_quota",
      load: () => getUsageRemaining(organizationId, "documents_processed"),
      fallback: null as Awaited<ReturnType<typeof getUsageRemaining>> | null
    }),
    loadOptionalReportsDependency({
      organizationId,
      dependency: "usage_metering",
      load: () =>
        getOrganizationUsageMeteringSnapshot(organizationId, entitlements.planCode),
      fallback:
        null as Awaited<ReturnType<typeof getOrganizationUsageMeteringSnapshot>> | null
    }),
    loadOptionalReportsDependency({
      organizationId,
      dependency: "activation",
      load: () => getOrganizationActivationSnapshot(organizationId, entitlements),
      fallback:
        null as Awaited<ReturnType<typeof getOrganizationActivationSnapshot>> | null
    }),
    canReviewReports
      ? loadOptionalReportsDependency({
          organizationId,
          dependency: "ai_feedback",
          load: () =>
            getOrganizationAiFeedbackSummary({
              organizationId
            }),
          fallback:
            null as Awaited<ReturnType<typeof getOrganizationAiFeedbackSummary>> | null
        })
      : Promise.resolve({
          value: null as Awaited<ReturnType<typeof getOrganizationAiFeedbackSummary>> | null,
          warning: null as string | null
        })
  ]);

  deliveryPackages = deliveryPackagesResult.value;
  currentSubscription = currentSubscriptionResult.value;
  documentsProcessedQuota = documentsProcessedQuotaResult.value;
  activation = activationResult.value;
  aiFeedbackSummary = aiFeedbackSummaryResult.value;

  partialDataWarnings.push(
    ...[
      deliveryPackagesResult.warning,
      currentSubscriptionResult.warning,
      documentsProcessedQuotaResult.warning,
      usageMeteringResult.warning,
      activationResult.warning,
      aiFeedbackSummaryResult.warning
    ].filter((warning): warning is string => Boolean(warning))
  );

  if (usageMeteringResult.value) {
    reportUsage = getUsageMetricSnapshot(
      usageMeteringResult.value,
      "reportsGenerated"
    );
    aiRunUsage = getUsageMetricSnapshot(
      usageMeteringResult.value,
      "aiProcessingRuns"
    );
    upsellOffers = getExpansionOffers({
      placement: "reports",
      session,
      entitlements,
      usageMetering: usageMeteringResult.value,
      currentPlanCode: currentSubscription?.plan.code ?? entitlements.planCode,
      hasStripeCustomer: Boolean(currentSubscription?.stripeCustomerId)
    });
  }

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
    quotas: documentsProcessedQuota
      ? [
          {
            key: "documents_processed" as const,
            label: "Monthly documents processed",
            snapshot: documentsProcessedQuota
          }
        ]
      : []
  });

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(243,249,255,0.9))] p-8 shadow-panel backdrop-blur">
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
            A new report was generated and is now awaiting internal review.
          </div>
        ) : null}

        {partialDataWarnings.length > 0 ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-warning">
            <p className="font-medium text-ink">
              Report records are available, but some secondary panels are limited right now.
            </p>
            <p className="mt-2 leading-6">
              {partialDataWarnings.join(" ")}
            </p>
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

        {canReviewReports && aiFeedbackSummary ? (
          <section className="mt-6 rounded-[24px] border border-line bg-white p-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm font-medium text-accent">AI feedback loop</p>
                <h2 className="mt-2 text-xl font-semibold text-ink">
                  Internal report quality signals
                </h2>
                <p className="mt-2 text-sm text-steel">
                  Last {aiFeedbackSummary.lookbackDays} days of approval, rejection,
                  regeneration, and flagged eval feedback.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-line bg-mist p-4">
                <p className="text-sm font-medium text-steel">Approved</p>
                <p className="mt-2 text-2xl font-semibold text-ink">
                  {aiFeedbackSummary.approvalRate}%
                </p>
                <p className="mt-2 text-sm text-steel">
                  {aiFeedbackSummary.approvedCount} approved out of{" "}
                  {aiFeedbackSummary.reviewedCount} reviewed reports.
                </p>
              </div>
              <div className="rounded-2xl border border-line bg-mist p-4">
                <p className="text-sm font-medium text-steel">Rejected</p>
                <p className="mt-2 text-2xl font-semibold text-ink">
                  {aiFeedbackSummary.rejectionRate}%
                </p>
                <p className="mt-2 text-sm text-steel">
                  {aiFeedbackSummary.rejectedCount} rejected,{" "}
                  {aiFeedbackSummary.regeneratedCount} regenerated,{" "}
                  {aiFeedbackSummary.flaggedCount} flagged.
                </p>
              </div>
              <div className="rounded-2xl border border-line bg-mist p-4">
                <p className="text-sm font-medium text-steel">Top Failure Categories</p>
                <div className="mt-3 space-y-2">
                  {aiFeedbackSummary.topFailureCategories.length > 0 ? (
                    aiFeedbackSummary.topFailureCategories.slice(0, 3).map((entry) => (
                      <p key={entry.category} className="text-sm text-steel">
                        {formatStatus(entry.category)}: {entry.count}
                      </p>
                    ))
                  ) : (
                    <p className="text-sm text-steel">
                      No recurring failure category has been recorded yet.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {(aiFeedbackSummary.promptWeaknesses.length > 0 ||
              aiFeedbackSummary.modelFailureSignals.length > 0) ? (
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-line bg-mist p-4">
                  <p className="text-sm font-medium text-steel">Prompt Weaknesses</p>
                  <div className="mt-3 space-y-3">
                    {aiFeedbackSummary.promptWeaknesses.map((entry) => (
                      <div key={`${entry.category}-${entry.node}`} className="rounded-2xl bg-white p-4">
                        <p className="text-sm font-semibold text-ink">
                          {formatStatus(entry.category)}
                        </p>
                        <p className="mt-2 text-sm text-steel">
                          {entry.node} · {entry.count} signals
                        </p>
                        <p className="mt-2 text-sm leading-6 text-steel">{entry.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-line bg-mist p-4">
                  <p className="text-sm font-medium text-steel">Model Failure Signals</p>
                  <div className="mt-3 space-y-3">
                    {aiFeedbackSummary.modelFailureSignals.map((entry) => (
                      <div key={entry.signal} className="rounded-2xl bg-white p-4">
                        <p className="text-sm font-semibold text-ink">
                          {formatStatus(entry.signal)}
                        </p>
                        <p className="mt-2 text-sm text-steel">
                          {entry.count} linked feedback events
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {activation && !activation.isActivated ? (
          <div className="mt-6">
            <ActivationTipCard
              title="This page is the activation milestone"
              body={
                entitlements.canGenerateReports && assessments.length > 0
                  ? "Generating the first executive report is the clearest first-value moment in Evolve Edge because it turns intake and analysis into stakeholder-ready output."
                  : entitlements.canGenerateReports
                    ? "A submitted assessment is required before the first executive report can be generated from live workspace data."
                  : "The first executive report is the activation milestone, but current plan or billing state is blocking report generation."
              }
              href={
                entitlements.canGenerateReports
                  ? assessments.length > 0
                    ? "/dashboard/reports#generate-report-workflow"
                    : "/dashboard/assessments/start"
                  : "/dashboard/settings"
              }
              label={
                entitlements.canGenerateReports
                  ? assessments.length > 0
                    ? "Generate first report"
                    : "Start an assessment"
                  : "Open billing"
              }
            />
          </div>
        ) : null}

        <form
          id="generate-report-workflow"
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
            className="w-fit rounded-full bg-[linear-gradient(135deg,#1cc7d8,#6fe8f1)] px-5 py-3 text-sm font-semibold text-[#05111d] disabled:cursor-not-allowed disabled:opacity-50"
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
        <div className="mt-4 rounded-2xl border border-line bg-white p-4 text-sm text-steel">
          <p className="font-medium text-ink">How reports are generated</p>
          <p className="mt-2 leading-6">
            Reports are built from your submitted assessment answers, selected
            frameworks, and reviewed evidence summaries. Evolve Edge validates
            the workflow output before it appears in the product.
          </p>
          <p className="mt-2 leading-6">
            Reports are advisory guidance for planning and review. They do not
            guarantee compliance or certification.
          </p>
        </div>
        {reportUsage ? (
          <p className="mt-2 text-sm text-steel">
            Usage: {reportUsage.usageLabel}. {reportUsage.helperText}
          </p>
        ) : null}

        <div className="mt-8 grid gap-4">
          {entitlements.canAccessReports
            ? reports.map((report) => {
                const deliveryPackage = deliveryPackageByReportId.get(report.id);
                const postureScore = report.postureScore;

                return (
                  <Link
                    key={report.id}
                    href={`/dashboard/reports/${report.id}`}
                    className="rounded-2xl border border-line bg-mist p-5 transition hover:border-accent hover:shadow-[0_18px_40px_rgba(28,199,216,0.14)]"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-lg font-semibold text-ink">{report.title}</p>
                        <p className="mt-2 text-sm text-steel">
                          {report.assessment.name} | {formatStatus(report.status)} |{" "}
                          {formatDate(report.publishedAt ?? report.createdAt)}
                        </p>
                        <p className="mt-2 text-sm text-steel">
                          Confidence{" "}
                          {report.status === "DELIVERED" ||
                          report.status === "APPROVED" ||
                          report.status === "READY"
                            ? "High"
                            : isPendingReviewLikeStatus(report.status)
                              ? "High, pending review"
                              : "In progress"}{" "}
                          | Last updated {formatDate(report.publishedAt ?? report.createdAt)}
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
                        {report.deliveryStatus
                            ? `Delivery ${formatCompactStatus(report.deliveryStatus)}`
                            : deliveryPackage?.deliveryStatus === "BRIEFING_COMPLETED"
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
                        <p className="mt-1">
                          {report.artifactAvailability.canDownload
                            ? "Artifact ready"
                            : report.artifactMetadata?.downloadStatus === "failed"
                              ? "Artifact unavailable"
                              : "Artifact pending"}
                        </p>
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
          activation &&
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


