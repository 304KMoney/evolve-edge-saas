import type { Route } from "next";
import Link from "next/link";
import {
  AuditActorType,
  CustomerLifecycleStage,
  EngagementProgramType,
  prisma
} from "@evolve-edge/db";
import { getServerAuditRequestContext, writeAuditLog } from "../../../lib/audit";
import { requireAdminSession } from "../../../lib/auth";
import {
  formatCurrencyDollarsFromCents,
  getKpiDashboardSnapshot,
  parseKpiDashboardFilters,
  type KpiDashboardSnapshot
} from "../../../lib/kpi-dashboard";

export const dynamic = "force-dynamic";

function formatStageLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatHours(value: number | null) {
  if (value === null) {
    return "n/a";
  }

  return `${value.toFixed(1)}h`;
}

function getMaxValue(values: number[]) {
  return values.length ? Math.max(...values, 1) : 1;
}

function SummaryCard({
  label,
  value,
  helperText
}: {
  label: string;
  value: string;
  helperText: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-panel">
      <p className="text-sm text-steel">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-ink">{value}</p>
      <p className="mt-3 text-sm leading-6 text-steel">{helperText}</p>
    </div>
  );
}

function BarTrend({
  title,
  points,
  valueLabel = "count"
}: {
  title: string;
  points: Array<{ key: string; label: string; value: number }>;
  valueLabel?: string;
}) {
  const maxValue = getMaxValue(points.map((point) => point.value));

  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-panel">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-5 space-y-3">
        {points.length ? (
          points.map((point) => (
            <div key={point.key}>
              <div className="flex items-center justify-between text-sm text-steel">
                <span>{point.label}</span>
                <span>
                  {point.value} {valueLabel}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-mist">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{
                    width: `${Math.max((point.value / maxValue) * 100, point.value ? 6 : 0)}%`
                  }}
                />
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-steel">No trend data matches the current filters.</p>
        )}
      </div>
    </div>
  );
}

function FunnelTrend({ snapshot }: { snapshot: KpiDashboardSnapshot }) {
  const maxValue = getMaxValue(
    snapshot.trends.funnel.flatMap((point) => [
      point.leads,
      point.paidCustomers,
      point.intakeCompleted,
      point.reportsGenerated,
      point.briefingsBooked,
      point.monitoringConversions
    ])
  );

  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-panel">
      <h2 className="text-lg font-semibold text-ink">Funnel movement</h2>
      <p className="mt-2 text-sm text-steel">
        Weekly or monthly milestone movement built from app-owned lead, lifecycle,
        assessment, report, briefing, and monitoring records.
      </p>
      <div className="mt-5 space-y-4">
        {snapshot.trends.funnel.length ? (
          snapshot.trends.funnel.map((point) => {
            const series = [
              { label: "Leads", value: point.leads, tone: "bg-accent" },
              { label: "Paid", value: point.paidCustomers, tone: "bg-ink" },
              { label: "Intake", value: point.intakeCompleted, tone: "bg-emerald-700" },
              { label: "Reports", value: point.reportsGenerated, tone: "bg-sky-700" },
              { label: "Briefings", value: point.briefingsBooked, tone: "bg-amber-600" },
              { label: "Monitoring", value: point.monitoringConversions, tone: "bg-violet-700" }
            ];

            return (
              <div key={point.key} className="rounded-2xl bg-mist p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-ink">{point.label}</p>
                  <p className="text-sm text-steel">
                    {point.leads} leads / {point.paidCustomers} paid
                  </p>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {series.map((item) => (
                    <div key={`${point.key}-${item.label}`}>
                      <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-steel">
                        <span>{item.label}</span>
                        <span>{item.value}</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                        <div
                          className={`h-full rounded-full ${item.tone}`}
                          style={{
                            width: `${Math.max((item.value / maxValue) * 100, item.value ? 6 : 0)}%`
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-sm text-steel">No funnel movement matches the current filters.</p>
        )}
      </div>
    </div>
  );
}

function StageMovementTable({ snapshot }: { snapshot: KpiDashboardSnapshot }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-panel">
      <h2 className="text-lg font-semibold text-ink">Customer stage movement</h2>
      <p className="mt-2 text-sm text-steel">
        Audited lifecycle stage transitions from the customer account timeline.
      </p>
      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-steel">
            <tr>
              <th className="px-3 py-2 font-medium">Period</th>
              {Object.values(CustomerLifecycleStage).map((stage) => (
                <th key={stage} className="px-3 py-2 font-medium">
                  {formatStageLabel(stage)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {snapshot.trends.customerStageMovement.length ? (
              snapshot.trends.customerStageMovement.map((point) => (
                <tr key={point.key} className="border-t border-line">
                  <td className="px-3 py-3 font-medium text-ink">{point.label}</td>
                  {Object.values(CustomerLifecycleStage).map((stage) => (
                    <td key={`${point.key}-${stage}`} className="px-3 py-3 text-steel">
                      {point.transitions[stage]}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={Object.values(CustomerLifecycleStage).length + 1}
                  className="px-3 py-6 text-steel"
                >
                  No lifecycle transitions match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SnapshotTable({
  title,
  description,
  rows
}: {
  title: string;
  description: string;
  rows: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-panel">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-2 text-sm text-steel">{description}</p>
      <div className="mt-5 space-y-3">
        {rows.length ? (
          rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between rounded-2xl bg-mist px-4 py-3"
            >
              <span className="text-sm text-ink">{row.label}</span>
              <span className="text-sm font-semibold text-ink">{row.value}</span>
            </div>
          ))
        ) : (
          <p className="text-sm text-steel">No records match the current filters.</p>
        )}
      </div>
    </div>
  );
}

export default async function AdminKpiPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdminSession();
  await writeAuditLog(prisma, {
    userId: session.user.id,
    actorType: AuditActorType.ADMIN,
    actorLabel: session.user.email,
    action: "admin.kpi_dashboard_viewed",
    entityType: "adminKpiDashboard",
    entityId: "global",
    requestContext: await getServerAuditRequestContext()
  });

  const params = await searchParams;
  const filters = parseKpiDashboardFilters({
    preset: typeof params.preset === "string" ? params.preset : null,
    from: typeof params.from === "string" ? params.from : null,
    to: typeof params.to === "string" ? params.to : null,
    organizationId: typeof params.organizationId === "string" ? params.organizationId : null,
    stage: typeof params.stage === "string" ? params.stage : null,
    engagementType:
      typeof params.engagementType === "string" ? params.engagementType : null,
    trendGrain: typeof params.trendGrain === "string" ? params.trendGrain : null
  });

  const [snapshot, organizations] = await Promise.all([
    getKpiDashboardSnapshot(filters),
    prisma.organization.findMany({
      select: {
        id: true,
        name: true
      },
      orderBy: { name: "asc" },
      take: 150
    })
  ]);

  const exportHref = `/admin/kpis/export?preset=${snapshot.filters.preset}&from=${snapshot.filters.from}&to=${snapshot.filters.to}&trendGrain=${snapshot.filters.trendGrain}${snapshot.filters.organizationId ? `&organizationId=${snapshot.filters.organizationId}` : ""}${snapshot.filters.stage ? `&stage=${snapshot.filters.stage}` : ""}${snapshot.filters.engagementType ? `&engagementType=${snapshot.filters.engagementType}` : ""}`;

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10">
      <div className="rounded-[28px] border border-line bg-white p-8 shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-accent">Internal Analytics</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              Customer KPI Dashboard
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-steel">
              Leadership metrics built from authoritative app records across lead
              capture, customer lifecycle, delivery, monitoring, engagements, and
              subscription state.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href={exportHref}
              className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
            >
              Export CSV
            </a>
            <Link
              href={"/admin" as Route}
              className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
            >
              Back to ops console
            </Link>
          </div>
        </div>

        <form className="mt-8 grid gap-3 rounded-2xl border border-line bg-mist p-4 lg:grid-cols-[160px_160px_160px_220px_220px_220px_140px_auto]">
          <select
            name="preset"
            defaultValue={snapshot.filters.preset}
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
          >
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="180d">Last 180 days</option>
            <option value="365d">Last 365 days</option>
          </select>
          <input
            type="date"
            name="from"
            defaultValue={snapshot.filters.from}
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
          />
          <input
            type="date"
            name="to"
            defaultValue={snapshot.filters.to}
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
          />
          <select
            name="organizationId"
            defaultValue={snapshot.filters.organizationId ?? ""}
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
          >
            <option value="">All organizations</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
          <select
            name="stage"
            defaultValue={snapshot.filters.stage ?? ""}
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
          >
            <option value="">All customer stages</option>
            {Object.values(CustomerLifecycleStage).map((stage) => (
              <option key={stage} value={stage}>
                {formatStageLabel(stage)}
              </option>
            ))}
          </select>
          <select
            name="engagementType"
            defaultValue={snapshot.filters.engagementType ?? ""}
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
          >
            <option value="">All engagement types</option>
            {Object.values(EngagementProgramType).map((type) => (
              <option key={type} value={type}>
                {formatStageLabel(type)}
              </option>
            ))}
          </select>
          <select
            name="trendGrain"
            defaultValue={snapshot.filters.trendGrain}
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
          >
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
          <button
            type="submit"
            className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white"
          >
            Apply
          </button>
        </form>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label={snapshot.summary.totalLeads.label}
            value={`${snapshot.summary.totalLeads.value}`}
            helperText={snapshot.summary.totalLeads.helperText}
          />
          <SummaryCard
            label={snapshot.summary.paidCustomers.label}
            value={`${snapshot.summary.paidCustomers.value}`}
            helperText={snapshot.summary.paidCustomers.helperText}
          />
          <SummaryCard
            label={snapshot.summary.reportPackagesSent.label}
            value={`${snapshot.summary.reportPackagesSent.value}`}
            helperText={snapshot.summary.reportPackagesSent.helperText}
          />
          <SummaryCard
            label={snapshot.summary.estimatedNormalizedMrrCents.label}
            value={formatCurrencyDollarsFromCents(
              snapshot.summary.estimatedNormalizedMrrCents.value
            )}
            helperText={snapshot.summary.estimatedNormalizedMrrCents.helperText}
          />
          <SummaryCard
            label="Intake completion rate"
            value={`${snapshot.rates.intakeCompletion.percent}%`}
            helperText={`${snapshot.rates.intakeCompletion.numerator}/${snapshot.rates.intakeCompletion.denominator} / ${snapshot.rates.intakeCompletion.helperText}`}
          />
          <SummaryCard
            label="Report completion rate"
            value={`${snapshot.rates.reportCompletion.percent}%`}
            helperText={`${snapshot.rates.reportCompletion.numerator}/${snapshot.rates.reportCompletion.denominator} / ${snapshot.rates.reportCompletion.helperText}`}
          />
          <SummaryCard
            label="Briefing booking rate"
            value={`${snapshot.rates.briefingBooking.percent}%`}
            helperText={`${snapshot.rates.briefingBooking.numerator}/${snapshot.rates.briefingBooking.denominator} / ${snapshot.rates.briefingBooking.helperText}`}
          />
          <SummaryCard
            label="Monitoring conversion rate"
            value={`${snapshot.rates.monitoringConversion.percent}%`}
            helperText={`${snapshot.rates.monitoringConversion.numerator}/${snapshot.rates.monitoringConversion.denominator} / ${snapshot.rates.monitoringConversion.helperText}`}
          />
        </div>

        <div className="mt-10 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <FunnelTrend snapshot={snapshot} />
          <div className="grid gap-6">
            <SnapshotTable
              title="Current customer stages"
              description="Current active customer count by lifecycle stage."
              rows={snapshot.snapshots.customerStages.map((entry) => ({
                label: formatStageLabel(entry.stage),
                value: `${entry.count}`
              }))}
            />
            <SnapshotTable
              title="Drop-off indicators"
              description="Immediate bottlenecks across the lead-to-monitoring funnel."
              rows={snapshot.snapshots.dropOff.map((entry) => ({
                label: entry.label,
                value: `${entry.count}`
              }))}
            />
          </div>
        </div>

        <div className="mt-10 grid gap-6 xl:grid-cols-2">
          <BarTrend
            title="Reports generated over time"
            points={snapshot.trends.reportsGenerated}
            valueLabel="reports"
          />
          <div className="rounded-2xl border border-line bg-white p-5 shadow-panel">
            <h2 className="text-lg font-semibold text-ink">Active vs closed engagements</h2>
            <p className="mt-2 text-sm text-steel">
              Engagement program starts versus completions or cancellations.
            </p>
            <div className="mt-5 space-y-4">
              {snapshot.trends.activeVsClosedEngagements.length ? (
                snapshot.trends.activeVsClosedEngagements.map((point) => {
                  const maxValue = Math.max(point.value, point.closedValue, 1);
                  return (
                    <div key={point.key} className="rounded-2xl bg-mist p-4">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-ink">{point.label}</p>
                        <p className="text-sm text-steel">
                          {point.value} started / {point.closedValue} closed
                        </p>
                      </div>
                      <div className="mt-4 grid gap-3">
                        <div>
                          <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-steel">
                            <span>Started</span>
                            <span>{point.value}</span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                            <div
                              className="h-full rounded-full bg-accent"
                              style={{
                                width: `${Math.max((point.value / maxValue) * 100, point.value ? 6 : 0)}%`
                              }}
                            />
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-steel">
                            <span>Closed</span>
                            <span>{point.closedValue}</span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                            <div
                              className="h-full rounded-full bg-ink"
                              style={{
                                width: `${Math.max((point.closedValue / maxValue) * 100, point.closedValue ? 6 : 0)}%`
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-steel">No engagement movement matches the current filters.</p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <StageMovementTable snapshot={snapshot} />
          <div className="grid gap-6">
            <SnapshotTable
              title="Workflow failure rate"
              description="Failed or action-required customer runs by workflow step."
              rows={snapshot.snapshots.workflowFailures.map((entry) => ({
                label: `${formatStageLabel(entry.step)} / ${entry.failedRuns}/${entry.totalRuns}`,
                value: `${entry.failureRatePercent}%`
              }))}
            />
            <SnapshotTable
              title="Expansion opportunities"
              description="Open expansion opportunities grouped by organization."
              rows={snapshot.snapshots.expansionOpportunities.map((entry) => ({
                label: entry.organizationName,
                value: `${entry.openOpportunities}`
              }))}
            />
          </div>
        </div>

        <div className="mt-10 grid gap-6 xl:grid-cols-2">
          <SnapshotTable
            title="Operational durations"
            description="Average durations across processing, QA review, delivery, and the first paid-to-delivery cycle."
            rows={[
              {
                label: snapshot.durations.paymentToDelivery.label,
                value: formatHours(snapshot.durations.paymentToDelivery.averageHours)
              },
              {
                label: snapshot.durations.processing.label,
                value: formatHours(snapshot.durations.processing.averageHours)
              },
              {
                label: snapshot.durations.review.label,
                value: formatHours(snapshot.durations.review.averageHours)
              },
              {
                label: snapshot.durations.delivery.label,
                value: formatHours(snapshot.durations.delivery.averageHours)
              }
            ]}
          />
          <SnapshotTable
            title="Revenue support metrics"
            description="Commercial health signals from active services and recurring relationships."
            rows={[
              {
                label: snapshot.summary.qualifiedLeads.label,
                value: `${snapshot.summary.qualifiedLeads.value}`
              },
              {
                label: snapshot.summary.activeEngagements.label,
                value: `${snapshot.summary.activeEngagements.value}`
              },
              {
                label: snapshot.summary.paidAudits.label,
                value: `${snapshot.summary.paidAudits.value}`
              },
              {
                label: snapshot.summary.activeMonitoringSubscriptions.label,
                value: `${snapshot.summary.activeMonitoringSubscriptions.value}`
              },
              {
                label: snapshot.summary.failedRuns.label,
                value: `${snapshot.summary.failedRuns.value}`
              },
              {
                label: "Run recovery rate",
                value: `${snapshot.rates.runRecovery.percent}%`
              }
            ]}
          />
        </div>
      </div>
    </main>
  );
}
