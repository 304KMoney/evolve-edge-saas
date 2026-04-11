import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDemoPresentationGuide, isDemoModeEnabled } from "../../../lib/demo-mode";
import { requireCurrentSession } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export default async function DemoGuidePage() {
  await requireCurrentSession({ requireOrganization: true });

  if (!isDemoModeEnabled()) {
    redirect("/dashboard");
  }

  const guide = getDemoPresentationGuide();

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-panel">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-accent">Demo Workspace</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">{guide.title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-steel">
              {guide.summary}
            </p>
          </div>
          <Link
            href="/dashboard"
            className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink"
          >
            Back to dashboard
          </Link>
        </div>

        <section className="mt-8 grid gap-4 lg:grid-cols-2">
          {guide.steps.map((step) => (
            <article key={step.key} className="rounded-2xl border border-line bg-mist p-5">
              <h2 className="text-lg font-semibold text-ink">{step.title}</h2>
              <p className="mt-3 text-sm leading-7 text-steel">{step.description}</p>
            </article>
          ))}
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-ink">Seeded demo workspaces</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {guide.workspaces.map((workspace) => (
              <article
                key={workspace.key}
                className="rounded-2xl border border-line bg-mist p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-ink">{workspace.name}</h3>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-steel">
                    {workspace.industry}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-7 text-steel">
                  {workspace.summary}
                </p>
                <p className="mt-3 text-sm leading-7 text-steel">
                  {workspace.demoNarrative}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-line bg-mist p-5">
          <h2 className="text-lg font-semibold text-ink">Suggested presentation flow</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href={"/" as Route} className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink">
              Marketing site
            </Link>
            <Link href={"/pricing" as Route} className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink">
              Pricing
            </Link>
            <Link href={"/dashboard/evidence" as Route} className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink">
              Evidence
            </Link>
            <Link href={"/dashboard/frameworks" as Route} className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink">
              Framework scoring
            </Link>
            <Link href={"/dashboard/monitoring" as Route} className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink">
              Monitoring
            </Link>
            <Link href={"/dashboard/reports" as Route} className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink">
              Executive delivery
            </Link>
            <Link href={"/admin" as Route} className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink">
              Operator console
            </Link>
            <Link href={"/admin/kpis" as Route} className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink">
              KPI dashboard
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
