import Link from "next/link";
import type { Route } from "next";
import { requireOrganizationPermission } from "../../../lib/auth";
import { getFrameworkOverviewSnapshot } from "../../../lib/framework-intelligence";
import { logServerEvent } from "../../../lib/monitoring";
import {
  isPrismaRuntimeCompatibilityError,
  logPrismaRuntimeCompatibilityError
} from "../../../lib/prisma-runtime";

export const dynamic = "force-dynamic";

function formatStatus(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(date);
}

function renderFrameworksFallback() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10">
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium text-accent">Framework Intelligence</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              Framework data unavailable
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-steel">
              Framework posture and mapped control data are temporarily unavailable.
              This page is rendering a safe fallback state until workspace support
              records are fully available again.
            </p>
          </div>
          <Link
            href={"/dashboard" as Route}
            className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink"
          >
            Back to dashboard
          </Link>
        </div>

        <div className="mt-8 rounded-2xl border border-dashed border-line bg-white p-8 text-sm text-steel">
          No framework data is available yet.
        </div>
      </div>
    </main>
  );
}

export default async function FrameworksPage() {
  const session = await requireOrganizationPermission("findings.view");
  let snapshot: Awaited<ReturnType<typeof getFrameworkOverviewSnapshot>> | null = null;

  try {
    snapshot = await getFrameworkOverviewSnapshot(session.organization!.id);
  } catch (error) {
    if (isPrismaRuntimeCompatibilityError(error)) {
      logPrismaRuntimeCompatibilityError("dashboard.frameworks", error, {
        organizationId: session.organization!.id
      });
    } else {
      logServerEvent("error", "dashboard.frameworks.fallback", {
        organizationId: session.organization!.id,
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }

    return renderFrameworksFallback();
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10">
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium text-accent">Framework Intelligence</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              Continuous control posture
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-steel">
              Review explainable framework rollups, mapped controls, and the highest-priority
              posture gaps across the active compliance scope.
            </p>
          </div>
          <Link
            href={"/dashboard/monitoring" as Route}
            className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink"
          >
            Open monitoring
          </Link>
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Frameworks tracked</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {snapshot.summary.frameworkCount}
            </p>
          </article>
          <article className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Controls assessed</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {snapshot.summary.assessedControlsCount}
            </p>
          </article>
          <article className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Implemented controls</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {snapshot.summary.implementedControlsCount}
            </p>
          </article>
          <article className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Average posture score</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {snapshot.summary.averageScore ?? "--"}
              {snapshot.summary.averageScore !== null ? "/100" : ""}
            </p>
          </article>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-2xl border border-line bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-steel">Framework posture</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">
                  Current mapped framework health
                </h2>
              </div>
              <p className="text-sm text-steel">
                {snapshot.summary.gapControlsCount} mapped gaps need follow-up
              </p>
            </div>
            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {snapshot.frameworks.map((framework) => (
                <Link
                  key={framework.id}
                  href={`/dashboard/frameworks/${framework.code}` as Route}
                  className="rounded-2xl border border-line bg-mist p-5 transition hover:border-accent"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-ink">{framework.name}</p>
                      <p className="mt-1 text-sm text-steel">
                        {framework.category}
                        {framework.version ? ` · ${framework.version}` : ""}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-steel">
                      {formatStatus(framework.status)}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-steel">Score</p>
                      <p className="mt-2 text-xl font-semibold text-ink">
                        {framework.score ?? "--"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-steel">Assessed</p>
                      <p className="mt-2 text-xl font-semibold text-ink">
                        {framework.assessedControlsCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-steel">Gaps</p>
                      <p className="mt-2 text-xl font-semibold text-ink">
                        {framework.gapControlsCount}
                      </p>
                    </div>
                  </div>
                  {framework.topGap ? (
                    <p className="mt-4 text-sm text-steel">
                      Highest pressure: {framework.topGap.code} · {framework.topGap.title}
                    </p>
                  ) : (
                    <p className="mt-4 text-sm text-steel">
                      No mapped control gaps are currently leading this framework.
                    </p>
                  )}
                  <div className="mt-4 flex gap-2">
                    {framework.trend.length > 0 ? (
                      framework.trend.map((point) => (
                        <div
                          key={point.id}
                          className="flex-1 rounded-full bg-white px-3 py-2 text-center text-xs font-medium text-steel"
                        >
                          {point.score ?? "--"}
                          <div className="mt-1 text-[10px] uppercase tracking-[0.16em]">
                            {formatDate(point.recordedAt)}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-full bg-white px-3 py-2 text-xs text-steel">
                        Trend history appears after the first control sync.
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-line bg-white p-6">
            <p className="text-sm font-medium text-steel">Gap priorities</p>
            <div className="mt-5 space-y-3">
              {snapshot.topGaps.length > 0 ? (
                snapshot.topGaps.map((gap) => (
                  <div key={gap.id} className="rounded-2xl bg-mist p-4">
                    <p className="text-sm font-semibold text-ink">
                      {gap.frameworkName} · {gap.controlCode}
                    </p>
                    <p className="mt-2 text-sm text-steel">{gap.controlTitle}</p>
                    <p className="mt-3 text-sm text-steel">
                      {formatStatus(gap.status)} · Score {gap.score ?? "--"}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-line bg-white p-5 text-sm text-steel">
                  Control gaps will appear here once reports or manual reviews produce mapped framework posture.
                </div>
              )}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
