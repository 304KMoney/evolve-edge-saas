import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { ControlImplementationStatus } from "@evolve-edge/db";
import {
  getSessionAuthorizationContext,
  requireOrganizationPermission
} from "../../../../lib/auth";
import { hasPermission } from "../../../../lib/authorization";
import { getFrameworkDetailSnapshot } from "../../../../lib/framework-intelligence";
import { updateControlAssessmentReviewAction } from "../actions";

export const dynamic = "force-dynamic";

function formatDate(date: Date | null | undefined) {
  if (!date) {
    return "Not recorded";
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

export default async function FrameworkDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ frameworkCode: string }>;
  searchParams: Promise<{ updated?: string; error?: string }>;
}) {
  const session = await requireOrganizationPermission("findings.view");
  const authz = getSessionAuthorizationContext(session);
  const canManageControls = hasPermission(authz, "findings.manage");
  const { frameworkCode } = await params;
  const query = await searchParams;
  const snapshot = await getFrameworkDetailSnapshot({
    organizationId: session.organization!.id,
    frameworkCode
  });

  if (!snapshot) {
    notFound();
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10">
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium text-accent">Framework Detail</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              {snapshot.framework.name}
            </h1>
            <p className="mt-3 text-sm text-steel">
              {snapshot.framework.category}
              {snapshot.framework.version ? ` · ${snapshot.framework.version}` : ""}
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href={"/dashboard/frameworks" as Route}
              className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink"
            >
              Back to frameworks
            </Link>
            <Link
              href={"/dashboard/evidence" as Route}
              className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink"
            >
              Open evidence
            </Link>
          </div>
        </div>

        {query.updated === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Control review updated successfully.
          </div>
        ) : null}
        {query.error ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-danger">
            {query.error}
          </div>
        ) : null}

        <section className="mt-8 grid gap-4 md:grid-cols-4">
          <article className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Current score</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {snapshot.summary?.score ?? "--"}
              {snapshot.summary?.score !== null && snapshot.summary?.score !== undefined ? "/100" : ""}
            </p>
          </article>
          <article className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Framework status</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {snapshot.summary ? formatStatus(snapshot.summary.status) : "Watch"}
            </p>
          </article>
          <article className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Mapped gaps</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {snapshot.summary?.gapControlsCount ?? 0}
            </p>
          </article>
          <article className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Assessed controls</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {snapshot.summary?.assessedControlsCount ?? 0}
            </p>
          </article>
        </section>

        <section className="mt-8 rounded-2xl border border-line bg-white p-6">
          <p className="text-sm font-medium text-steel">Trend history</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {snapshot.trend.length > 0 ? (
              snapshot.trend.map((point) => (
                <div key={point.id} className="rounded-2xl bg-mist p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-steel">
                    {formatDate(point.recordedAt)}
                  </p>
                  <p className="mt-3 text-2xl font-semibold text-ink">
                    {point.score ?? "--"}
                    {point.score !== null ? "/100" : ""}
                  </p>
                  <p className="mt-2 text-sm text-steel">
                    {formatStatus(point.status)} · {point.gapControlsCount} gaps
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-line bg-white p-5 text-sm text-steel">
                Trend history appears after the first report or manual control review snapshot.
              </div>
            )}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-line bg-white p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-steel">Control map</p>
              <h2 className="mt-2 text-2xl font-semibold text-ink">
                Explainable control posture
              </h2>
            </div>
            <p className="text-sm text-steel">
              Manual overrides are audit-logged and do not change framework definitions.
            </p>
          </div>

          <div className="mt-6 space-y-4">
            {snapshot.controls.map((control) => (
              <article key={control.id} className="rounded-2xl bg-mist p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {control.familyName ? `${control.familyName} · ` : ""}
                      {control.code}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-ink">{control.title}</h3>
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-steel">
                      {control.description}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3 text-sm text-steel">
                    <p>Status: {formatStatus(control.assessment?.status ?? "NOT_ASSESSED")}</p>
                    <p className="mt-1">
                      Score: {control.assessment?.score ?? "--"}
                      {typeof control.assessment?.score === "number" ? "/100" : ""}
                    </p>
                    <p className="mt-1">
                      Source: {formatStatus(control.assessment?.scoreSource ?? "INFERRED")}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 xl:grid-cols-3">
                  <div className="rounded-2xl bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-steel">Findings</p>
                    <div className="mt-3 space-y-2">
                      {control.findings.length > 0 ? (
                        control.findings.map((finding) => (
                          <div key={finding.id} className="rounded-2xl bg-mist p-3">
                            <p className="text-sm font-semibold text-ink">{finding.title}</p>
                            <p className="mt-1 text-sm text-steel">
                              {finding.severity} · {finding.riskDomain}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-steel">No mapped findings yet.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-steel">Evidence</p>
                    <div className="mt-3 space-y-2">
                      {control.evidence.length > 0 ? (
                        control.evidence.map((evidence) => (
                          <div key={evidence.id} className="rounded-2xl bg-mist p-3">
                            <p className="text-sm font-semibold text-ink">
                              {evidence.title ?? evidence.fileName}
                            </p>
                            <p className="mt-1 text-sm text-steel">
                              {formatStatus(evidence.reviewStatus)} · Uploaded {formatDate(evidence.uploadedAt)}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-steel">No evidence linked yet.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-steel">
                      Remediation and review
                    </p>
                    <div className="mt-3 space-y-2">
                      {control.recommendations.length > 0 ? (
                        control.recommendations.map((recommendation) => (
                          <div key={recommendation.id} className="rounded-2xl bg-mist p-3">
                            <p className="text-sm font-semibold text-ink">{recommendation.title}</p>
                            <p className="mt-1 text-sm text-steel">
                              {recommendation.priority} · {recommendation.ownerRole ?? "Owner TBD"}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-steel">No remediation items mapped yet.</p>
                      )}
                    </div>
                  </div>
                </div>

                {canManageControls && control.assessment ? (
                  <form
                    action={updateControlAssessmentReviewAction}
                    className="mt-5 grid gap-3 rounded-2xl border border-line bg-white p-4 xl:grid-cols-[220px_120px_minmax(0,1fr)_auto]"
                  >
                    <input type="hidden" name="controlAssessmentId" value={control.assessment.id} />
                    <input type="hidden" name="frameworkCode" value={snapshot.framework.code} />
                    <select
                      name="status"
                      defaultValue={control.assessment.status}
                      className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                    >
                      {Object.values(ControlImplementationStatus).map((status) => (
                        <option key={status} value={status}>
                          {formatStatus(status)}
                        </option>
                      ))}
                    </select>
                    <input
                      name="score"
                      defaultValue={control.assessment.score ?? ""}
                      placeholder="Score"
                      className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                    />
                    <input
                      name="rationale"
                      defaultValue={control.assessment.rationale ?? ""}
                      placeholder="Explain the reviewer decision"
                      className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                    />
                    <button
                      type="submit"
                      className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white"
                    >
                      Save review
                    </button>
                  </form>
                ) : null}

                {control.assessment?.reviewedBy ? (
                  <p className="mt-4 text-sm text-steel">
                    Last reviewed by {control.assessment.reviewedBy.firstName ?? control.assessment.reviewedBy.email} on{" "}
                    {formatDate(control.assessment.lastReviewedAt)}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
