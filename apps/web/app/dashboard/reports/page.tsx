
import { getOrganizationReportPackages } from "../../../lib/executive-delivery";
import { getExpansionOffers } from "../../../lib/expansion-engine";
import { buildProductSurfaceModel } from "../../../lib/product-surface";
import { logServerEvent } from "../../../lib/monitoring";
import {
  isPrismaRuntimeCompatibilityError,
  logPrismaRuntimeCompatibilityError
} from "../../../lib/prisma-runtime";
import { listDashboardReportSummaryViewsForAccessSession } from "../../../lib/report-records";
import {
  getOrganizationUsageMeteringSnapshot,
  return status ? formatStatus(status).replace("Briefing ", "Briefing: ") : "Pending";
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
  const session = await requireCurrentSession({ requireOrganization: true });
  const accessSession = toCustomerAccessSession(session);
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

  try {
    [
      reports,
      assessments,
      deliveryPackages,
      entitlements,
      currentSubscription,
      documentsProcessedQuota,
      params
    ] = await Promise.all([
      listDashboardReportSummaryViewsForAccessSession({
        accessSession
      }),
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
    const usageMetering = await getOrganizationUsageMeteringSnapshot(
      organizationId,
      entitlements.planCode
    );
    activation = await getOrganizationActivationSnapshot(
      organizationId,
      entitlements
    );
    reportUsage = getUsageMetricSnapshot(usageMetering, "reportsGenerated");
    aiRunUsage = getUsageMetricSnapshot(usageMetering, "aiProcessingRuns");
    upsellOffers = getExpansionOffers({
      placement: "reports",
      session,
      entitlements,
      usageMetering,
      currentPlanCode: currentSubscription?.plan.code ?? entitlements.planCode,
      hasStripeCustomer: Boolean(currentSubscription?.stripeCustomerId)
    });
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

  const deliveryPackageByReportId = new Map(
    deliveryPackages
      .filter(