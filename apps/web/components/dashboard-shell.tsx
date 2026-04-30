"use client";

import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  Bell,
  BookOpenCheck,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  FileText,
  FolderOpen,
  LayoutDashboard,
  ListTodo,
  LogOut,
  ShieldCheck,
  Sparkles,
  TriangleAlert
} from "lucide-react";
import { Brand } from "./brand";
import type { ActivationSnapshot } from "../lib/activation";
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

export type DashboardFrameworkResource = {
  code: string;
  title: string;
  body: string;
  href: string;
  assetCount: number;
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
  frameworkResources: DashboardFrameworkResource[];
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
  executiveBriefing: {
    available: boolean;
    title: string;
    summary: string;
    href: string | null;
    statusLabel: string;
    ctaLabel: string;
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
  auditIntake: {
    complete: boolean;
    statusLabel: string;
    summary: string;
  };
  auditLifecycle: {
    currentStatus: string;
    stages: Array<{
      status: string;
      label: string;
      description: string;
      completed: boolean;
      active: boolean;
      failed: boolean;
      timestampLabel: string | null;
    }>;
  };
};

const navigation: Array<{
  href: Route;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { href: "/dashboard", label: "Portal", icon: LayoutDashboard },
  { href: "/dashboard/assessments", label: "Audits", icon: ShieldCheck },
  { href: "/dashboard/reports", label: "Reports", icon: FileText },
  { href: "/dashboard/roadmap", label: "Roadmap", icon: ListTodo },
  { href: "/dashboard/evidence" as Route, label: "Evidence", icon: FolderOpen },
  { href: "/dashboard/frameworks" as Route, label: "Frameworks", icon: CheckCircle2 },
  { href: "/dashboard/billing" as Route, label: "Billing", icon: CreditCard }
];

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function isActiveDashboardRoute(pathname: string, href: Route) {
  if (pathname === href) return true;
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(`${href}/`);
}

function titleCaseStatus(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getStatusMessage(data: DashboardData) {
  const status = data.auditLifecycle.currentStatus;

  if (status === "failed_review_required") {
    return {
      label: "Review required",
      headline: "We are reviewing your audit before delivery.",
      body: "A quality gate needs attention before customer-visible results are released.",
      tone: "alert" as const
    };
  }

  if (["analysis_pending", "analysis_running", "routing_complete"].includes(status)) {
    return {
      label: "Analysis in progress",
      headline: "Your audit analysis is in progress.",
      body: "We are processing your intake through controlled routing and backend analysis. Reports appear here after validation.",
      tone: "progress" as const
    };
  }

  if (["report_ready", "briefing_ready", "delivered"].includes(status)) {
    return {
      label: data.executiveBriefing.available
        ? "Executive briefing available"
        : "Report ready",
      headline: data.executiveBriefing.available
        ? "Your report and executive briefing are ready."
        : "Your latest audit report is ready.",
      body: "Open the latest deliverable for executive summary, risk posture, priority actions, and roadmap guidance.",
      tone: "ready" as const
    };
  }

  if (data.auditIntake.complete) {
    return {
      label: "Intake complete",
      headline: "Your intake is complete and ready for audit routing.",
      body: "The next step is controlled backend routing, followed by analysis and report validation.",
      tone: "progress" as const
    };
  }

  return {
    label: "No audits yet",
    headline: "Start your first AI governance audit.",
    body: "Complete onboarding intake to begin a controlled audit and unlock reports, roadmap, and executive briefing deliverables.",
    tone: "empty" as const
  };
}

function StatusIcon({ tone }: { tone: ReturnType<typeof getStatusMessage>["tone"] }) {
  if (tone === "alert") return <TriangleAlert className="h-5 w-5" />;
  if (tone === "ready") return <CheckCircle2 className="h-5 w-5" />;
  if (tone === "progress") return <Clock3 className="h-5 w-5" />;
  return <Sparkles className="h-5 w-5" />;
}

function PortalCard({
  eyebrow,
  title,
  children,
  action
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-line bg-white/90 p-5 shadow-[0_18px_70px_rgba(15,23,42,0.08)] md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
            {eyebrow}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
            {title}
          </h2>
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
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
  const latestReport = data.reports[0] ?? null;
  const portalStatus = getStatusMessage(data);
  const hasAuditActivity = data.auditIntake.complete || data.reports.length > 0;
  const activeStages = data.auditLifecycle.stages.filter(
    (stage) => stage.completed || stage.active || stage.failed
  );
  const visibleStages = activeStages.length > 0
    ? activeStages
    : data.auditLifecycle.stages.slice(0, 4);
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
                subtitle="Client audit portal"
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
            <p className="text-sm font-semibold">Deliverables</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Reports and briefings appear only after intake, routing, analysis, and validation are complete.
            </p>
            <Link
              href="/dashboard/reports"
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#8debf4]"
            >
              View report center
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </aside>

        <main className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(141,235,244,0.22),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.97),rgba(243,249,255,0.93))] p-5 shadow-panel backdrop-blur md:p-6">
          <header className="flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-medium text-accent">{data.workspaceLabel}</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink md:text-4xl">
                Client Portal
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-steel">
                Track your current audit, open validated deliverables, and prepare leadership conversations from one clean workspace.
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
                Updates
              </Link>
            </div>
          </header>

          {flashMessage ? (
            <section className="mt-6 rounded-[24px] border border-emerald-200 bg-emerald-50 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">
                {flashMessage.title}
              </p>
              <p className="mt-2 text-sm leading-7 text-ink">{flashMessage.body}</p>
            </section>
          ) : null}

          <section
            className={cn(
              "mt-6 rounded-[32px] border p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.22)] md:p-8",
              portalStatus.tone === "alert"
                ? "border-rose-300/40 bg-[linear-gradient(135deg,#7f1d1d,#0f172a)]"
                : portalStatus.tone === "ready"
                  ? "border-emerald-300/40 bg-[linear-gradient(135deg,#064e3b,#0f172a)]"
                  : "border-cyan-300/30 bg-[linear-gradient(135deg,#0f766e,#0f172a)]"
            )}
          >
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white">
                  <StatusIcon tone={portalStatus.tone} />
                  {portalStatus.label}
                </span>
                <h2 className="mt-5 max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">
                  {portalStatus.headline}
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200">
                  {portalStatus.body}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {latestReport ? (
                  <Link
                    href={latestReport.href as Route}
                    className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink"
                  >
                    Open latest report
                  </Link>
                ) : (
                  <Link
                    href="/onboarding"
                    className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink"
                  >
                    Start intake
                  </Link>
                )}
                <Link
                  href="/dashboard/reports"
                  className="rounded-full border border-white/25 px-5 py-3 text-sm font-semibold text-white"
                >
                  View all audits
                </Link>
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-4 md:grid-cols-3">
            {data.metrics.slice(0, 3).map((metric) => (
              <article key={metric.label} className="rounded-[24px] border border-line bg-white/85 p-5">
                <p className="text-sm font-medium text-steel">{metric.label}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-ink">
                  {metric.value}
                </p>
                <p
                  className={cn(
                    "mt-3 text-sm leading-6",
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

          <section className="mt-6 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <PortalCard
              eyebrow="Current Audit Status"
              title={data.activeAssessment.name}
              action={
                <span className="rounded-full bg-accentSoft px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                  {data.activeAssessment.status}
                </span>
              }
            >
              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between text-sm text-steel">
                    <span>Progress</span>
                    <span>{data.activeAssessment.progress}%</span>
                  </div>
                  <div className="mt-2 h-3 rounded-full bg-slate-200">
                    <div
                      className="h-3 rounded-full bg-[linear-gradient(90deg,#0f766e,#67e8f9)]"
                      style={{ width: `${data.activeAssessment.progress}%` }}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl bg-mist p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-steel">
                      Message
                    </p>
                    <p className="mt-2 text-sm leading-6 text-ink">
                      {portalStatus.label === "Report ready" || portalStatus.label === "Executive briefing available"
                        ? "Report ready"
                        : portalStatus.label === "Analysis in progress"
                          ? "Analysis in progress"
                          : data.auditIntake.complete
                            ? "Analysis in progress"
                            : "No audits yet"}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-mist p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-steel">
                      Next Step
                    </p>
                    <p className="mt-2 text-sm leading-6 text-ink">
                      {data.activeAssessment.nextStep}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {visibleStages.map((stage) => (
                    <div
                      key={stage.status}
                      className={cn(
                        "rounded-2xl border p-4",
                        stage.failed
                          ? "border-rose-200 bg-rose-50"
                          : stage.active
                            ? "border-cyan-200 bg-cyan-50"
                            : stage.completed
                              ? "border-emerald-200 bg-emerald-50"
                              : "border-line bg-mist"
                      )}
                    >
                      <p className="text-sm font-semibold text-ink">{stage.label}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.16em] text-steel">
                        {stage.timestampLabel ?? titleCaseStatus(stage.status)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </PortalCard>

            <PortalCard
              eyebrow="Latest Report"
              title={latestReport ? latestReport.title : "No report yet"}
              action={
                latestReport ? (
                  <Link href={latestReport.href as Route} className="text-sm font-semibold text-accent">
                    View report
                  </Link>
                ) : null
              }
            >
              {latestReport ? (
                <div className="rounded-2xl border border-line bg-mist p-5">
                  <p className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-steel">
                    Report ready
                  </p>
                  <p className="mt-4 text-sm leading-7 text-steel">
                    {latestReport.type} generated {latestReport.date}. Open it for executive summary, risk posture, top risks, and priority actions.
                  </p>
                  <Link
                    href={latestReport.href as Route}
                    className="mt-5 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white"
                  >
                    Open report
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-line bg-mist p-5">
                  <p className="text-sm leading-7 text-steel">
                    No report is available yet. Complete intake and let analysis finish before validated reports appear here.
                  </p>
                  <Link
                    href="/onboarding"
                    className="mt-5 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white"
                  >
                    Complete intake
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              )}
            </PortalCard>
          </section>

          <section className="mt-6 grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
            <PortalCard
              eyebrow="Executive Briefing"
              title={data.executiveBriefing.title}
              action={<BookOpenCheck className="h-5 w-5 text-accent" />}
            >
              <div className="rounded-2xl border border-line bg-mist p-5">
                <span
                  className={cn(
                    "inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
                    data.executiveBriefing.available
                      ? "bg-emerald-100 text-accent"
                      : "bg-white text-steel"
                  )}
                >
                  {data.executiveBriefing.statusLabel}
                </span>
                <p className="mt-4 text-sm leading-7 text-steel">
                  {data.executiveBriefing.summary}
                </p>
                {data.executiveBriefing.href ? (
                  <Link
                    href={data.executiveBriefing.href as Route}
                    className="mt-5 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white"
                  >
                    {data.executiveBriefing.ctaLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <Link
                    href={(latestReport?.href ?? "/dashboard/reports") as Route}
                    className="mt-5 inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink"
                  >
                    {data.executiveBriefing.ctaLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </PortalCard>

            <PortalCard
              eyebrow="Past Audits"
              title="Audit history"
              action={
                <Link href="/dashboard/reports" className="text-sm font-semibold text-accent">
                  View all
                </Link>
              }
            >
              {data.reports.length > 0 ? (
                <div className="space-y-3">
                  {data.reports.map((report, index) => (
                    <Link
                      key={report.id}
                      href={report.href as Route}
                      className="flex items-center justify-between rounded-2xl border border-line bg-mist p-4 transition hover:border-accent hover:bg-white"
                    >
                      <div>
                        <p className="text-sm font-semibold text-ink">{report.title}</p>
                        <p className="mt-1 text-sm text-steel">
                          {index === 0 ? "Latest audit" : "Past audit"} - {report.type} - {report.date}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-steel" />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-line bg-mist p-6 text-center">
                  <Sparkles className="mx-auto h-8 w-8 text-accent" />
                  <h3 className="mt-4 text-lg font-semibold text-ink">No audits yet</h3>
                  <p className="mt-2 text-sm leading-7 text-steel">
                    Start with onboarding intake. Once analysis is validated, reports and briefing deliverables will build your audit history here.
                  </p>
                  <Link
                    href={(hasAuditActivity ? "/dashboard/assessments" : "/onboarding") as Route}
                    className="mt-5 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white"
                  >
                    {hasAuditActivity ? "Open audits" : "Start first audit"}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              )}
            </PortalCard>
          </section>

          <section id="activity" className="mt-6 grid gap-5 xl:grid-cols-[1fr_1fr]">
            <PortalCard eyebrow="Action Plan" title={data.recommendedFocus.title}>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">
                {data.recommendedFocus.label}
              </p>
              <p className="mt-3 text-sm leading-7 text-steel">
                {data.recommendedFocus.body}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href={data.recommendedFocus.primaryHref as Route}
                  className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white"
                >
                  {data.recommendedFocus.primaryLabel}
                </Link>
                <Link
                  href={data.recommendedFocus.secondaryHref as Route}
                  className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink"
                >
                  {data.recommendedFocus.secondaryLabel}
                </Link>
              </div>
            </PortalCard>

            <PortalCard eyebrow="Recent Updates" title="What changed recently">
              {data.notifications.length > 0 ? (
                <div className="space-y-3">
                  {data.notifications.slice(0, 3).map((notification) => (
                    <div
                      key={`${notification.title}-${notification.date}`}
                      className="rounded-2xl border border-line bg-mist p-4"
                    >
                      <p className="text-sm font-semibold text-ink">{notification.title}</p>
                      <p className="mt-2 text-sm leading-6 text-steel">{notification.body}</p>
                      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-steel">
                        {notification.date}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-line bg-mist p-5 text-sm leading-7 text-steel">
                  No recent updates yet. Status changes, report availability, and delivery notes will appear here.
                </div>
              )}
            </PortalCard>
          </section>
        </main>
      </div>
    </div>
  );
}
