"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  Bell,
  Building2,
  ChartColumn,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  FolderOpen,
  FileText,
  LayoutDashboard,
  ListTodo,
  LogOut,
  ShieldCheck,
  TriangleAlert
} from "lucide-react";
import { ActivationGuide } from "./activation-guide";
import { Brand } from "./brand";
import { ProductSurfacePanel } from "./product-surface-panel";
import type { ActivationSnapshot } from "../lib/activation";
import { RetentionOverview } from "./retention-overview";
import { UpsellOfferStack } from "./upsell-offer-stack";
import type { ResolvedUpsellOffer } from "../lib/expansion-engine";
import type { ProductSurfaceModel } from "../lib/product-surface";
import type { RetentionSnapshot } from "../lib/retention";
import type { UsageMetricSnapshot } from "../lib/usage-metering";

export type DashboardMetric = {
  label: string;
  value: string;
  note: string;
  tone: "positive" | "alert" | "neutral";
};

export type DashboardFinding = {
  title: string;
  severity: string;
  framework: string;
  owner: string;
};

export type DashboardRoadmapItem = {
  title: string;
  priority: string;
  due: string;
  effort: string;
};

export type DashboardReport = {
  id: string;
  title: string;
  type: string;
  date: string;
  href: string;
};

export type DashboardNotification = {
  title: string;
  body: string;
  date: string;
  actionUrl: string | null;
};

export type DashboardData = {
  organizationName: string;
  planName: string;
  planSummary: string;
  workspaceLabel: string;
  metrics: DashboardMetric[];
  activeAssessment: {
    name: string;
    status: string;
    progress: number;
    nextStep: string;
    eta: string;
  };
  domainScores: Array<{ label: string; score: number }>;
  findings: DashboardFinding[];
  roadmap: DashboardRoadmapItem[];
  reports: DashboardReport[];
  notifications: DashboardNotification[];
  inventories: {
    vendorCount: number;
    modelCount: number;
    memberCount: number;
    latestVendors: string[];
    latestModels: string[];
  };
  recommendedFocus: {
    label: string;
    title: string;
    body: string;
    primaryHref: string;
    primaryLabel: string;
    secondaryHref: string;
    secondaryLabel: string;
  };
  usageMetrics: UsageMetricSnapshot[];
  productSurface: ProductSurfaceModel;
  upsellOffers: ResolvedUpsellOffer[];
  activation: ActivationSnapshot;
  retention: RetentionSnapshot;
  organizationId: string;
  isDemoMode: boolean;
  monitoring: {
    status: string;
    postureScore: number | null;
    riskLevel: string;
    openFindingsCount: number;
    inRemediationCount: number;
    reportArchiveCount: number;
    nextReviewLabel: string;
    trendDelta: number;
  };
};

const navigation: Array<{
  href: Route;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/assessments", label: "Assessments", icon: ShieldCheck },
  { href: "/dashboard/frameworks" as Route, label: "Frameworks", icon: CheckCircle2 },
  { href: "/dashboard/monitoring" as Route, label: "Monitoring", icon: ChartColumn },
  { href: "/dashboard/evidence" as Route, label: "Evidence", icon: FolderOpen },
  { href: "/dashboard/programs" as Route, label: "Programs", icon: Building2 },
  { href: "/dashboard/reports", label: "Reports", icon: FileText },
  { href: "/dashboard/roadmap", label: "Roadmap", icon: ListTodo },
  { href: "/dashboard/billing" as Route, label: "Billing", icon: CreditCard }
];

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function isActiveDashboardRoute(pathname: string, href: Route) {
  if (pathname === href) {
    return true;
  }

  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }

  return pathname.startsWith(`${href}/`);
}

export function DashboardShell({
  data,
  flashMessage
}: {
  data: DashboardData;
  flashMessage?: {
    title: string;
    body: string;
  } | null;
}) {
  const pathname = usePathname();
  const resolvedNavigation = data.isDemoMode
    ? [
        ...navigation,
        {
          href: "/dashboard/demo" as Route,
          label: "Demo Tour",
          icon: CheckCircle2
        }
      ]
    : navigation;

  return (
    <div className="min-h-screen bg-transparent px-4 py-4 md:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1520px] grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(11,21,48,0.94),rgba(6,14,28,0.98))] p-5 text-white shadow-panel">
          <div className="flex items-center justify-between">
            <div>
              <Brand
                lockupClassName="border-white/10 bg-white/95 p-1.5"
                imageClassName="w-[126px]"
                subtitle="Signal-led compliance"
                labelClassName="text-white/50"
              />
              <p className="mt-2 text-lg font-semibold">{data.organizationName}</p>
            </div>
            <Building2 className="h-5 w-5 text-[#8debf4]" />
          </div>

          <div className="mt-8 rounded-2xl border border-white/[0.08] bg-white/[0.06] p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-300">
              Active Plan
            </p>
            <p className="mt-2 text-xl font-semibold">{data.planName}</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {data.planSummary}
            </p>
          </div>

          <nav className="mt-8 space-y-2">
            {resolvedNavigation.map((item) => {
              const Icon = item.icon;
              const active = isActiveDashboardRoute(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition",
                    active
                      ? "bg-white text-ink"
                      : "text-slate-200 hover:bg-white/[0.08] hover:text-white"
                  )}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </span>
                  <ChevronRight className="h-4 w-4 opacity-60" />
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-sm font-semibold">Trust Center</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Review data handling, audit logs, access controls, and methodology
              notes for your current assessments.
            </p>
            <Link
              href={"/dashboard/settings#trust-center" as Route}
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#8debf4]"
            >
              Open trust center
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </aside>

        <main className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(243,249,255,0.9))] p-5 shadow-panel backdrop-blur md:p-6">
          <header className="flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-medium text-accent">{data.workspaceLabel}</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">
                Dashboard Overview
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-steel">
                Monitor assessment progress, review findings, and keep leaders
                aligned on AI risk posture across your organization.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/sign-out"
                className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </Link>
              <Link
                href="#activity"
                className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink"
              >
                <Bell className="h-4 w-4" />
                Notifications
              </Link>
              <Link
                href="/dashboard/assessments/start"
                className="rounded-full bg-[linear-gradient(135deg,#1cc7d8,#6fe8f1)] px-4 py-2 text-sm font-semibold text-[#05111d]"
              >
                Start Reassessment
              </Link>
            </div>
          </header>

          {flashMessage ? (
            <section className="mt-6 rounded-[24px] border border-emerald-200 bg-emerald-50 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">
                {flashMessage.title}
              </p>
              <p className="mt-2 text-sm leading-7 text-ink">
                {flashMessage.body}
              </p>
            </section>
          ) : null}

          <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {data.metrics.map((metric) => (
              <article
                key={metric.label}
                className="rounded-[24px] border border-line bg-mist p-5"
              >
                <p className="text-sm font-medium text-steel">{metric.label}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-ink">
                  {metric.value}
                </p>
                <p
                  className={cn(
                    "mt-3 text-sm",
                    metric.tone === "positive" && "text-accent",
                    metric.tone === "alert" && "text-danger",
                    metric.tone === "neutral" && "text-steel"
                  )}
                >
                  {metric.note}
                </p>
              </article>
            ))}
          </section>

          <div className="mt-6">
            <ActivationGuide
              activation={data.activation}
              organizationId={data.organizationId}
            />
          </div>

          <div className="mt-6">
            <RetentionOverview
              retention={data.retention}
              title="Renewal and account health"
            />
          </div>

          <div className="mt-6">
            <ProductSurfacePanel model={data.productSurface} />
          </div>

          <section className="mt-6 rounded-[24px] border border-line p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-steel">Continuous Monitoring</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">
                  Recurring risk visibility
                </h2>
              </div>
              <Link
                href={"/dashboard/monitoring" as Route}
                className="text-sm font-semibold text-accent"
              >
                Open monitoring
              </Link>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-2xl border border-line bg-mist p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-steel">Status</p>
                <p className="mt-3 text-2xl font-semibold text-ink">{data.monitoring.status}</p>
                <p className="mt-2 text-sm text-steel">{data.monitoring.nextReviewLabel}</p>
              </article>
              <article className="rounded-2xl border border-line bg-mist p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-steel">Posture</p>
                <p className="mt-3 text-2xl font-semibold text-ink">
                  {data.monitoring.postureScore ?? "--"}
                  {data.monitoring.postureScore !== null ? "/100" : ""}
                </p>
                <p className="mt-2 text-sm text-steel">
                  {data.monitoring.riskLevel} risk · Trend {data.monitoring.trendDelta >= 0 ? "+" : ""}
                  {data.monitoring.trendDelta}
                </p>
              </article>
              <article className="rounded-2xl border border-line bg-mist p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-steel">Open Findings</p>
                <p className="mt-3 text-2xl font-semibold text-ink">
                  {data.monitoring.openFindingsCount}
                </p>
                <p className="mt-2 text-sm text-steel">
                  {data.monitoring.inRemediationCount} in remediation
                </p>
              </article>
              <article className="rounded-2xl border border-line bg-mist p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-steel">Archive</p>
                <p className="mt-3 text-2xl font-semibold text-ink">
                  {data.monitoring.reportArchiveCount}
                </p>
                <p className="mt-2 text-sm text-steel">
                  Historic reports available to leadership and operators
                </p>
              </article>
            </div>
          </section>

          {data.usageMetrics.length > 0 ? (
            <section className="mt-6 rounded-[24px] border border-line p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-steel">Usage and Capacity</p>
                  <h2 className="mt-2 text-2xl font-semibold text-ink">
                    Plan utilization
                  </h2>
                </div>
                <Link
                  href={"/dashboard/settings#billing-controls" as Route}
                  className="text-sm font-semibold text-accent"
                >
                  Open billing
                </Link>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {data.usageMetrics.map((metric) => (
                  <article
                    key={metric.key}
                    className="rounded-2xl border border-line bg-mist p-4"
                  >
                    <p className="text-xs uppercase tracking-[0.18em] text-steel">
                      {metric.shortLabel}
                    </p>
                    <p className="mt-3 text-2xl font-semibold text-ink">
                      {metric.usageLabel}
                    </p>
                    <p className="mt-2 text-sm text-steel">{metric.helperText}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {data.upsellOffers.length > 0 ? (
            <div className="mt-6">
              <UpsellOfferStack
                offers={data.upsellOffers}
                title="Expansion opportunities"
                description="Show high-intent upgrade and add-on paths only when the workspace signals real commercial readiness."
              />
            </div>
          ) : null}

          <section className="mt-6 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <article className="rounded-[24px] border border-line p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-steel">
                    Active Assessment
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-ink">
                    {data.activeAssessment.name}
                  </h2>
                </div>
                <span className="rounded-full bg-accentSoft px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-accent">
                  {data.activeAssessment.status}
                </span>
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between text-sm text-steel">
                  <span>Completion</span>
                  <span>{data.activeAssessment.progress}%</span>
                </div>
                <div className="mt-2 h-3 rounded-full bg-slate-200">
                  <div
                    className="h-3 rounded-full bg-accent"
                    style={{ width: `${data.activeAssessment.progress}%` }}
                  />
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-mist p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-steel">
                    Next Step
                  </p>
                  <p className="mt-2 text-sm leading-6 text-ink">
                    {data.activeAssessment.nextStep}
                  </p>
                </div>
                <div className="rounded-2xl bg-mist p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-steel">
                    Estimated Completion
                  </p>
                  <p className="mt-2 text-sm leading-6 text-ink">
                    {data.activeAssessment.eta}
                  </p>
                </div>
              </div>
            </article>

            <article className="rounded-[24px] border border-line p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-steel">
                    Readiness Breakdown
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-ink">
                    Domain Scores
                  </h2>
                </div>
                <ChartColumn className="h-5 w-5 text-accent" />
              </div>

              <div className="mt-6 space-y-4">
                {data.domainScores.length > 0 ? (
                  data.domainScores.map((item) => (
                    <div key={item.label}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-steel">{item.label}</span>
                        <span className="font-semibold text-ink">{item.score}%</span>
                      </div>
                      <div className="mt-2 h-2.5 rounded-full bg-slate-200">
                        <div
                          className="h-2.5 rounded-full bg-[#0f766e]"
                          style={{ width: `${item.score}%` }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-line bg-white p-5 text-sm text-steel">
                    Domain scores appear once live findings are attached to an
                    assessment.
                  </div>
                )}
              </div>
            </article>
          </section>

          <section className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <article className="rounded-[24px] border border-line p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-steel">
                    Priority Findings
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-ink">
                    Top Issues This Cycle
                  </h2>
                </div>
                <TriangleAlert className="h-5 w-5 text-warning" />
              </div>

              <div className="mt-6 space-y-3">
                {data.findings.length > 0 ? (
                  data.findings.map((finding) => (
                    <div
                      key={finding.title}
                      className="rounded-2xl border border-line bg-mist p-4"
                    >
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <p className="text-sm font-semibold text-ink">
                          {finding.title}
                        </p>
                        <span
                          className={cn(
                            "w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
                            finding.severity === "CRITICAL" &&
                              "bg-red-100 text-danger",
                            finding.severity === "HIGH" &&
                              "bg-amber-100 text-warning",
                            finding.severity === "MEDIUM" &&
                              "bg-slate-200 text-steel",
                            finding.severity === "LOW" &&
                              "bg-emerald-100 text-accent"
                          )}
                        >
                          {finding.severity}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3 text-sm text-steel">
                        <span>{finding.framework}</span>
                        <span>Owner: {finding.owner}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-line bg-white p-5 text-sm text-steel">
                    No live findings have been generated yet for this workspace.
                  </div>
                )}
              </div>
            </article>

            <article className="rounded-[24px] border border-line p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-steel">
                    Remediation Roadmap
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-ink">
                    Next Actions
                  </h2>
                </div>
                <CheckCircle2 className="h-5 w-5 text-accent" />
              </div>

              <div className="mt-6 space-y-3">
                {data.roadmap.length > 0 ? (
                  data.roadmap.map((item) => (
                    <div
                      key={item.title}
                      className="rounded-2xl border border-line bg-mist p-4"
                    >
                      <p className="text-sm font-semibold text-ink">{item.title}</p>
                      <div className="mt-3 flex flex-wrap gap-3 text-sm text-steel">
                        <span>Priority: {item.priority}</span>
                        <span>Effort: {item.effort}</span>
                        <span>Due: {item.due}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-line bg-white p-5 text-sm text-steel">
                    No live remediation tasks exist yet. Publish a report or add
                    recommendations to populate the roadmap.
                  </div>
                )}
              </div>
            </article>
          </section>

          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            <article className="rounded-[24px] border border-line p-5">
              <p className="text-sm font-medium text-steel">Recent Reports</p>
              <div className="mt-5 space-y-3">
                {data.reports.length > 0 ? (
                  data.reports.map((report) => (
                    <Link
                      key={report.id}
                      href={report.href as Route}
                      className="flex items-center justify-between rounded-2xl border border-line bg-mist p-4 transition hover:border-accent"
                    >
                      <div>
                        <p className="text-sm font-semibold text-ink">
                          {report.title}
                        </p>
                        <p className="mt-2 text-sm text-steel">
                          {report.type} · {report.date}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-steel" />
                    </Link>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-line bg-white p-5 text-sm text-steel">
                    No published reports yet. Generate one from a live assessment
                    to start the report archive.
                  </div>
                )}
              </div>
            </article>

            <article className="rounded-[24px] border border-line p-5">
              <p className="text-sm font-medium text-steel">Recommended Focus</p>
              <div className="mt-5 rounded-[24px] bg-[#0f172a] p-5 text-white">
                <p className="text-xs uppercase tracking-[0.24em] text-teal-200">
                  {data.recommendedFocus.label}
                </p>
                <h2 className="mt-3 text-2xl font-semibold">
                  {data.recommendedFocus.title}
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  {data.recommendedFocus.body}
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    href={data.recommendedFocus.primaryHref as Route}
                    className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink"
                  >
                    {data.recommendedFocus.primaryLabel}
                  </Link>
                  <Link
                    href={data.recommendedFocus.secondaryHref as Route}
                    className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white"
                  >
                    {data.recommendedFocus.secondaryLabel}
                  </Link>
                </div>
              </div>
            </article>
          </section>

          <section
            id="activity"
            className="mt-6 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]"
          >
            <article className="rounded-[24px] border border-line p-5">
              <p className="text-sm font-medium text-steel">Operational Inventory</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl bg-mist p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-steel">
                    Vendors
                  </p>
                  <p className="mt-3 text-2xl font-semibold text-ink">
                    {data.inventories.vendorCount}
                  </p>
                  <p className="mt-2 text-sm text-steel">
                    {data.inventories.latestVendors.length > 0
                      ? data.inventories.latestVendors.join(", ")
                      : "No vendor records yet"}
                  </p>
                </div>
                <div className="rounded-2xl bg-mist p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-steel">
                    AI Models
                  </p>
                  <p className="mt-3 text-2xl font-semibold text-ink">
                    {data.inventories.modelCount}
                  </p>
                  <p className="mt-2 text-sm text-steel">
                    {data.inventories.latestModels.length > 0
                      ? data.inventories.latestModels.join(", ")
                      : "No model records yet"}
                  </p>
                </div>
                <div className="rounded-2xl bg-mist p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-steel">
                    Team Members
                  </p>
                  <p className="mt-3 text-2xl font-semibold text-ink">
                    {data.inventories.memberCount}
                  </p>
                  <p className="mt-2 text-sm text-steel">
                    Live organization memberships tracked in the database.
                  </p>
                </div>
              </div>
              <div className="mt-5">
                <Link
                  href={"/dashboard/settings#inventory-registry" as Route}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-accent"
                >
                  Manage registry records
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </article>

            <article className="rounded-[24px] border border-line p-5">
              <p className="text-sm font-medium text-steel">Recent Activity</p>
              <div className="mt-5 space-y-3">
                {data.notifications.length > 0 ? (
                  data.notifications.map((notification) => (
                    <div
                      key={`${notification.title}-${notification.date}`}
                      className="rounded-2xl border border-line bg-mist p-4"
                    >
                      <p className="text-sm font-semibold text-ink">
                        {notification.title}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-steel">
                        {notification.body}
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-steel">
                          {notification.date}
                        </p>
                        {notification.actionUrl ? (
                          <Link
                            href={notification.actionUrl as Route}
                            className="text-sm font-semibold text-accent"
                          >
                            Open
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-line bg-white p-5 text-sm text-steel">
                    No activity notifications have been recorded yet for this
                    workspace.
                  </div>
                )}
              </div>
            </article>
          </section>
        </main>
      </div>
    </div>
  );
}

export const DashboardLayoutShell = DashboardShell;
