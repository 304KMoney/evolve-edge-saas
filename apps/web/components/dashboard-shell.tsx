"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  Bell,
  Building2,
  ChartColumn,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  FileText,
  LayoutDashboard,
  ListTodo,
  ShieldCheck,
  TriangleAlert
} from "lucide-react";

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
  title: string;
  type: string;
  date: string;
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
};

const navigation = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/assessments", label: "Assessments", icon: ShieldCheck },
  { href: "/dashboard/reports", label: "Reports", icon: FileText },
  { href: "/dashboard/roadmap", label: "Roadmap", icon: ListTodo },
  { href: "/dashboard/settings", label: "Billing & Settings", icon: CreditCard }
];

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function DashboardShell({ data }: { data: DashboardData }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-transparent px-4 py-4 md:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1520px] grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-[28px] border border-white/80 bg-[#0f172a] p-5 text-white shadow-panel">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-teal-200">
                Evolve Edge
              </p>
              <p className="mt-2 text-lg font-semibold">{data.organizationName}</p>
            </div>
            <Building2 className="h-5 w-5 text-teal-200" />
          </div>

          <div className="mt-8 rounded-2xl bg-white/8 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-300">
              Active Plan
            </p>
            <p className="mt-2 text-xl font-semibold">{data.planName}</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {data.planSummary}
            </p>
          </div>

          <nav className="mt-8 space-y-2">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition",
                    active
                      ? "bg-white text-ink"
                      : "text-slate-200 hover:bg-white/10 hover:text-white"
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

          <div className="mt-8 rounded-2xl border border-white/10 p-4">
            <p className="text-sm font-semibold">Trust Center</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Review data handling, audit logs, access controls, and methodology
              notes for your current assessments.
            </p>
            <button className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-teal-200">
              Open trust center
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </aside>

        <main className="rounded-[28px] border border-white/75 bg-white/85 p-5 shadow-panel backdrop-blur md:p-6">
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
              <button className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink">
                <Bell className="h-4 w-4" />
                Notifications
              </button>
              <button className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white">
                Start Reassessment
              </button>
            </div>
          </header>

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
                {data.domainScores.map((item) => (
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
                ))}
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
                {data.findings.map((finding) => (
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
                ))}
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
                {data.roadmap.map((item) => (
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
                ))}
              </div>
            </article>
          </section>

          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            <article className="rounded-[24px] border border-line p-5">
              <p className="text-sm font-medium text-steel">Recent Reports</p>
              <div className="mt-5 space-y-3">
                {data.reports.map((report) => (
                  <Link
                    key={report.title}
                    href="/dashboard/reports"
                    className="flex items-center justify-between rounded-2xl border border-line bg-mist p-4 transition hover:border-accent"
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {report.title}
                      </p>
                      <p className="mt-2 text-sm text-steel">
                        {report.type} • {report.date}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-steel" />
                  </Link>
                ))}
              </div>
            </article>

            <article className="rounded-[24px] border border-line p-5">
              <p className="text-sm font-medium text-steel">Recommended Focus</p>
              <div className="mt-5 rounded-[24px] bg-[#0f172a] p-5 text-white">
                <p className="text-xs uppercase tracking-[0.24em] text-teal-200">
                  This week
                </p>
                <h2 className="mt-3 text-2xl font-semibold">
                  Convert assessment output into an auditable operating plan.
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  Prioritize policy approval, vendor intake controls, and PHI
                  guidance for AI-enabled workflows before the next executive
                  review.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    href="/dashboard/roadmap"
                    className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink"
                  >
                    Open Roadmap
                  </Link>
                  <Link
                    href="/dashboard/assessments"
                    className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Review Assessment
                  </Link>
                </div>
              </div>
            </article>
          </section>
        </main>
      </div>
    </div>
  );
}
