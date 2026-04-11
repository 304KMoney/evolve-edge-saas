import Link from "next/link";
import type { Route } from "next";
import { requireCurrentSession } from "../../../lib/auth";
import {
  formatEngagementCommercialModel,
  formatEngagementDeliverableType,
  formatEngagementProgramType,
  getOrganizationEngagementSnapshot
} from "../../../lib/engagement-programs";

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

export default async function ProgramsPage() {
  const session = await requireCurrentSession({ requireOrganization: true });
  const snapshot = await getOrganizationEngagementSnapshot(session.organization!.id, {
    synchronize: true
  });

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-panel">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-accent">Programs</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              Customer program history
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-steel">
              Track active service layers, delivered outputs, and the remediation
              work that continues beyond a single report cycle.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink"
          >
            Back to dashboard
          </Link>
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm font-medium text-steel">Active programs</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {snapshot.activePrograms.length}
            </p>
            <p className="mt-2 text-sm text-steel">
              Concurrent service layers currently active for this org.
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm font-medium text-steel">Delivered outputs</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {snapshot.deliverables.filter((item) => item.status === "DELIVERED").length}
            </p>
            <p className="mt-2 text-sm text-steel">
              Reports, executive packets, and monitoring reviews preserved in the history.
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm font-medium text-steel">Open remediation</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {snapshot.remediationSummary.openCount}
            </p>
            <p className="mt-2 text-sm text-steel">
              {snapshot.remediationSummary.inRemediationCount} currently in remediation.
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm font-medium text-steel">Resolved over time</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {snapshot.remediationSummary.resolvedCount}
            </p>
            <p className="mt-2 text-sm text-steel">
              Historical remediation work that now outlives any one report.
            </p>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-line bg-white p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-steel">Active services</p>
              <h2 className="mt-2 text-2xl font-semibold text-ink">
                Current engagement stack
              </h2>
            </div>
            <span className="text-sm text-steel">
              Projects and subscriptions can coexist for one customer.
            </span>
          </div>

          <div className="mt-5 space-y-4">
            {snapshot.activePrograms.length > 0 ? (
              snapshot.activePrograms.map((program) => (
                <div key={program.id} className="rounded-2xl bg-mist p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-ink">{program.name}</p>
                      <p className="mt-2 text-sm text-steel">
                        {formatEngagementProgramType(program.type)} ·{" "}
                        {formatEngagementCommercialModel(program.commercialModel)} ·{" "}
                        {formatStatus(program.status)}
                      </p>
                      <p className="mt-3 text-sm leading-6 text-steel">
                        {program.description ?? "Program scope has not been documented yet."}
                      </p>
                    </div>
                    <div className="text-sm text-steel">
                      <p>Started {formatDate(program.startedAt)}</p>
                      <p className="mt-1">
                        Next review {formatDate(program.nextReviewAt)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {program.deliverables.length > 0 ? (
                      program.deliverables.map((deliverable) => (
                        <div key={deliverable.id} className="rounded-2xl border border-line bg-white p-4">
                          <p className="text-sm font-semibold text-ink">{deliverable.title}</p>
                          <p className="mt-2 text-sm text-steel">
                            {formatEngagementDeliverableType(deliverable.deliverableType)} ·{" "}
                            {formatStatus(deliverable.status)}
                          </p>
                          <p className="mt-2 text-sm text-steel">
                            Version {deliverable.versionLabel ?? "Current"} · Delivered{" "}
                            {formatDate(deliverable.deliveredAt ?? deliverable.readyAt)}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-line bg-white p-4 text-sm text-steel">
                        Deliverables will appear as this program produces reports, executive packets, or monitoring reviews.
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-line bg-white p-5 text-sm text-steel">
                No active programs are recorded yet. Generate a report or activate monitoring to initialize the engagement history.
              </div>
            )}
          </div>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <article className="rounded-2xl border border-line bg-white p-6">
            <p className="text-sm font-medium text-steel">Engagement archive</p>
            <div className="mt-5 space-y-3">
              {snapshot.historicalPrograms.length > 0 ? (
                snapshot.historicalPrograms.map((program) => (
                  <div key={program.id} className="rounded-2xl bg-mist p-4">
                    <p className="text-sm font-semibold text-ink">{program.name}</p>
                    <p className="mt-2 text-sm text-steel">
                      {formatEngagementProgramType(program.type)} ·{" "}
                      {formatStatus(program.status)}
                    </p>
                    <p className="mt-2 text-sm text-steel">
                      Started {formatDate(program.startedAt)} · Completed{" "}
                      {formatDate(program.completedAt)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-line bg-white p-5 text-sm text-steel">
                  Historic engagements will appear after the first audit cycle is completed or a service layer is retired.
                </div>
              )}
            </div>
          </article>

          <article className="rounded-2xl border border-line bg-white p-6">
            <p className="text-sm font-medium text-steel">Remediation continuity</p>
            <div className="mt-5 space-y-3">
              <div className="rounded-2xl bg-mist p-4">
                <p className="text-sm font-semibold text-ink">Open</p>
                <p className="mt-2 text-sm text-steel">
                  {snapshot.remediationSummary.openCount} findings still require action.
                </p>
              </div>
              <div className="rounded-2xl bg-mist p-4">
                <p className="text-sm font-semibold text-ink">In remediation</p>
                <p className="mt-2 text-sm text-steel">
                  {snapshot.remediationSummary.inRemediationCount} issues are actively being worked.
                </p>
              </div>
              <div className="rounded-2xl bg-mist p-4">
                <p className="text-sm font-semibold text-ink">Accepted or deferred</p>
                <p className="mt-2 text-sm text-steel">
                  {snapshot.remediationSummary.acceptedCount + snapshot.remediationSummary.deferredCount} items have an explicit disposition.
                </p>
              </div>
              <Link href={"/dashboard/monitoring" as Route} className="inline-flex text-sm font-semibold text-accent">
                Open monitoring workspace
              </Link>
            </div>
          </article>
        </section>

        <section className="mt-8 rounded-2xl border border-line bg-white p-6">
          <p className="text-sm font-medium text-steel">Deliverable history</p>
          <div className="mt-5 space-y-3">
            {snapshot.deliverables.length > 0 ? (
              snapshot.deliverables.map((deliverable) => (
                <div key={deliverable.id} className="rounded-2xl bg-mist p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-ink">{deliverable.title}</p>
                      <p className="mt-2 text-sm text-steel">
                        {formatEngagementDeliverableType(deliverable.deliverableType)} ·{" "}
                        {formatStatus(deliverable.status)} · Version{" "}
                        {deliverable.versionLabel ?? "Current"}
                      </p>
                    </div>
                    <p className="text-sm text-steel">
                      {formatDate(deliverable.deliveredAt ?? deliverable.readyAt)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-line bg-white p-5 text-sm text-steel">
                Deliverables will appear here once audit or monitoring outputs are generated.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
