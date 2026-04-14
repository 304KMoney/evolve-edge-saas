import Link from "next/link";
import { MonitoringFindingStatus } from "@evolve-edge/db";
import { ProductSurfacePanel } from "../../../components/product-surface-panel";
import { getSessionAuthorizationContext, requireCurrentSession } from "../../../lib/auth";
import { canManageFindings } from "../../../lib/authorization";
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
import { updateMonitoringFindingStatusAction } from "./actions";

export const dynamic = "force-dynamic";

function formatDate(date: Date | null | undefined) {
  if (!date) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatStatus(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
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
  const productSurface = buildProductSurfaceModel({
    area: "monitoring",
    entitlements,
    usageMetrics: monitoredAssetsUsage ? [monitoredAssetsUsage] : []
  });

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-panel">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-accent">Continuous Monitoring</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              Ongoing risk visibility
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-steel">
              Track recurring posture, remediation status, report history, and
              the next monitoring checkpoints for this workspace.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink"
          >
            Back to dashboard
          </Link>
        </div>

        {params.updated === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Monitoring finding status updated successfully.
          </div>
        ) : null}

        <div className="mt-8">
          <ProductSurfacePanel
            model={productSurface}
            secondaryNote={
              !canManageFindingsControls && entitlements.featureAccess["monitoring.manage"]
                ? "This workspace has monitoring enabled, but your current role is limited to visibility and cannot edit remediation state."
                : null
            }
          />
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm font-medium text-steel">Monitoring status</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {monitoring.subscription
                ? formatStatus(monitoring.subscription.status)
                : "Pending"}
            </p>
            <p className="mt-2 text-sm text-steel">
              Next review {formatDate(monitoring.summary.nextReviewAt)}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm font-medium text-steel">Current posture</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {monitoring.summary.postureScore ?? "--"}
              {monitoring.summary.postureScore !== null ? "/100" : ""}
            </p>
            <p className="mt-2 text-sm text-steel">
              {monitoring.summary.riskLevel} risk · Trend {monitoring.summary.postureTrendDelta >= 0 ? "+" : ""}
              {monitoring.summary.postureTrendDelta}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm font-medium text-steel">Open remediation</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {monitoring.summary.openFindingsCount}
            </p>
            <p className="mt-2 text-sm text-steel">
              {monitoring.summary.inRemediationCount} in remediation ·{" "}
              {monitoring.summary.deferredFindingsCount} deferred
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm font-medium text-steel">Report archive</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {monitoring.summary.reportArchiveCount}
            </p>
            <p className="mt-2 text-sm text-steel">
              {monitoring.summary.resolvedFindingsCount} findings resolved over time
            </p>
          </div>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-2xl border border-line bg-white p-6">
            <p className="text-sm font-medium text-steel">Risk trend history</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {monitoring.trendPoints.length > 0 ? (
                monitoring.trendPoints.map((point) => (
                  <div key={point.label} className="rounded-2xl bg-mist p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-steel">
                      {point.label}
                    </p>
                    <p className="mt-3 text-2xl font-semibold text-ink">
                      {point.postureScore}/100
                    </p>
                    <p className="mt-2 text-sm text-steel">
                      {point.openFindingsCount} open findings
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-line bg-white p-5 text-sm text-steel">
                  Trend history appears after the first monitoring sync runs from a generated report.
                </div>
              )}
            </div>
          </article>

          <article className="rounded-2xl border border-line bg-white p-6">
            <p className="text-sm font-medium text-steel">Framework posture</p>
            <div className="mt-5 space-y-3">
              {monitoring.frameworks.length > 0 ? (
                monitoring.frameworks.map((framework) => (
                  <div key={framework.id} className="rounded-2xl bg-mist p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-ink">
                          {framework.framework.name}
                        </p>
                        <p className="mt-1 text-sm text-steel">
                          {formatStatus(framework.status)} · Score {framework.score ?? "--"}
                        </p>
                      </div>
                      <p className="text-xs uppercase tracking-[0.16em] text-steel">
                        Δ {framework.trendDelta >= 0 ? "+" : ""}
                        {framework.trendDelta}
                      </p>
                    </div>
                    <p className="mt-3 text-sm text-steel">
                      {framework.openFindingsCount} open · {framework.inRemediationCount} in remediation ·{" "}
                      {framework.resolvedFindingsCount} resolved
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-line bg-white p-5 text-sm text-steel">
                  Framework tracking appears once monitoring has synced from a completed report cycle.
                </div>
              )}
            </div>
          </article>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <article className="rounded-2xl border border-line bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-steel">Findings and remediation</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">
                  Ongoing issue tracker
                </h2>
              </div>
              <p className="text-sm text-steel">
                {monitoring.summary.acceptedFindingsCount} accepted ·{" "}
                {monitoring.summary.deferredFindingsCount} deferred
              </p>
            </div>
            <div className="mt-5 space-y-4">
              {monitoring.findings.length > 0 ? (
                monitoring.findings.map((finding) => (
                  <div key={finding.id} className="rounded-2xl bg-mist p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-ink">{finding.title}</p>
                        <p className="mt-2 text-sm text-steel">
                          {finding.severity} · {finding.riskDomain} · Last seen {formatDate(finding.lastSeenAt)}
                        </p>
                        <p className="mt-3 text-sm leading-6 text-steel">{finding.summary}</p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-steel">
                        {formatStatus(finding.status)}
                      </span>
                    </div>
                    {canManageFindingsControls ? (
                      <form action={updateMonitoringFindingStatusAction} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
                        <input type="hidden" name="monitoringFindingId" value={finding.id} />
                        <select
                          name="status"
                          defaultValue={finding.status}
                          className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                        >
                          {Object.values(MonitoringFindingStatus).map((status) => (
                            <option key={status} value={status}>
                              {formatStatus(status)}
                            </option>
                          ))}
                        </select>
                        <input
                          name="ownerRole"
                          defaultValue={finding.ownerRole ?? ""}
                          placeholder="Owner role"
                          className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                        />
                        <input
                          name="remediationNotes"
                          defaultValue={finding.remediationNotes ?? ""}
                          placeholder="Notes or current action"
                          className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                        />
                        <button
                          type="submit"
                          className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white"
                        >
                          Save
                        </button>
                      </form>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-line bg-white p-5 text-sm text-steel">
                  Monitoring findings will appear here after a report sync creates the first recurring remediation backlog.
                </div>
              )}
            </div>
          </article>

          <article className="rounded-2xl border border-line bg-white p-6">
            <p className="text-sm font-medium text-steel">Recurring checks</p>
            <div className="mt-5 space-y-3">
              {monitoring.checks.length > 0 ? (
                monitoring.checks.map((check) => (
                  <div key={check.id} className="rounded-2xl bg-mist p-4">
                    <p className="text-sm font-semibold text-ink">{check.title}</p>
                    <p className="mt-2 text-sm text-steel">{check.description}</p>
                    <p className="mt-3 text-sm text-steel">
                      {formatStatus(check.status)} · Every {check.cadenceDays} days · Next run{" "}
                      {formatDate(check.nextRunAt)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-line bg-white p-5 text-sm text-steel">
                  Default recurring check placeholders will appear once a monitoring subscription is initialized.
                </div>
              )}
            </div>
          </article>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-line bg-white p-6">
            <p className="text-sm font-medium text-steel">Report archive</p>
            <div className="mt-5 space-y-3">
              {monitoring.reports.length > 0 ? (
                monitoring.reports.map((report) => (
                  <Link
                    key={report.id}
                    href={`/dashboard/reports/${report.id}`}
                    className="flex items-center justify-between rounded-2xl bg-mist p-4 transition hover:border-accent"
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink">{report.title}</p>
                      <p className="mt-2 text-sm text-steel">
                        {report.assessment.name} · {report.versionLabel} · {formatDate(report.publishedAt ?? report.createdAt)}
                      </p>
                    </div>
                    <span className="text-sm text-steel">{formatStatus(report.status)}</span>
                  </Link>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-line bg-white p-5 text-sm text-steel">
                  No reports are archived yet for this workspace.
                </div>
              )}
            </div>
          </article>

          <article className="rounded-2xl border border-line bg-white p-6">
            <p className="text-sm font-medium text-steel">Recent activity</p>
            <div className="mt-5 space-y-3">
              {monitoring.recentActivity.length > 0 ? (
                monitoring.recentActivity.map((item) => (
                  <div key={item.id} className="rounded-2xl bg-mist p-4">
                    <p className="text-sm font-semibold text-ink">{item.title}</p>
                    <p className="mt-2 text-sm text-steel">{item.body}</p>
                    <p className="mt-3 text-xs uppercase tracking-[0.16em] text-steel">
                      {formatDate(item.createdAt)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-line bg-white p-5 text-sm text-steel">
                  Monitoring activity will populate as recurring checkpoints and delivery events accumulate.
                </div>
              )}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
