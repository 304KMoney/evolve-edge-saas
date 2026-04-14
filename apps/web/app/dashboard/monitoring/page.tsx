
import { getCurrentSubscription } from "../../../lib/billing";
import { getMonitoringDashboardSnapshot } from "../../../lib/continuous-monitoring";
import { getOrganizationEntitlements } from "../../../lib/entitlements";
import { logServerEvent } from "../../../lib/monitoring";
import { buildProductSurfaceModel } from "../../../lib/product-surface";
import {
  isPrismaRuntimeCompatibilityError,
  logPrismaRuntimeCompatibilityError
} from "../../../lib/prisma-runtime";
import {
  getOrganizationUsageMeteringSnapshot,
  getUsageMetricSnapshot
} from "../../../lib/usage-metering";
    .join(" ");
}

function renderMonitoringFallback() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-panel">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-accent">Continuous Monitoring</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              Monitoring data unavailable
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-steel">
              Monitoring posture, findings, and recurring checks are temporarily unavailable.
              This page is showing a safe fallback state instead of live monitoring data.
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
          Monitoring data is unavailable right now.
        </div>
      </div>
    </main>
  );
}

export default async function MonitoringPage({
  searchParams
}: {
  searchParams: Promise<{ updated?: string }>;
}) {
  const session = await requireCurrentSession({ requireOrganization: true });
  const params = await searchParams;
  const [monitoring, entitlements, currentSubscription] = await Promise.all([
    getMonitoringDashboardSnapshot(session.organization!.id),
    getOrganizationEntitlements(session.organization!.id),
    getCurrentSubscription(session.organization!.id)
  ]);
  const usageMetering = await getOrganizationUsageMeteringSnapshot(
    session.organization!.id,
    currentSubscription?.plan.code ?? entitlements.planCode
  );
  const monitoredAssetsUsage = getUsageMetricSnapshot(usageMetering, "monitoredAssets");
  let params: Awaited<typeof searchParams> = {};
  let monitoring: Awaited<ReturnType<typeof getMonitoringDashboardSnapshot>> | null = null;
  let entitlements: Awaited<ReturnType<typeof getOrganizationEntitlements>> | null = null;
  let currentSubscription: Awaited<ReturnType<typeof getCurrentSubscription>> | null = null;
  let monitoredAssetsUsage: ReturnType<typeof getUsageMetricSnapshot> = null;

  try {
    params = await searchParams;
    [monitoring, entitlements, currentSubscription] = await Promise.all([
      getMonitoringDashboardSnapshot(session.organization!.id),
      getOrganizationEntitlements(session.organization!.id),
      getCurrentSubscription(session.organization!.id)
    ]);
    const usageMetering = await getOrganizationUsageMeteringSnapshot(
      session.organization!.id,
      currentSubscription?.plan.code ?? entitlements.planCode
    );
    monitoredAssetsUsage = getUsageMetricSnapshot(usageMetering, "monitoredAssets");
  } catch (error) {
    if (isPrismaRuntimeCompatibilityError(error)) {
      logPrismaRuntimeCompatibilityError("dashboard.monitoring", error, {
        organizationId: session.organization!.id
      });
    } else {
      logServerEvent("error", "dashboard.monitoring.fallback", {
        organizationId: session.organization!.id,
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }

    return renderMonitoringFallback();
  }

  const canManageFindingsControls = canManageFindings(
    getSessionAuthorizationContext(session)
  );