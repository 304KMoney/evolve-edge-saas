import Link from "next/link";
import { prisma } from "@evolve-edge/db";
import { requireCurrentSession } from "../../../lib/auth";
import { getOrganizationEntitlements } from "../../../lib/entitlements";

export const dynamic = "force-dynamic";

export default async function RoadmapPage() {
  const session = await requireCurrentSession({ requireOrganization: true });
  const [assessments, entitlements] = await Promise.all([
    prisma.assessment.findMany({
      where: { organizationId: session.organization!.id },
      include: {
        recommendations: {
          orderBy: [{ priority: "asc" }, { sortOrder: "asc" }]
        },
        reports: {
          orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
          take: 1
        }
      },
      orderBy: { createdAt: "desc" }
    }),
    getOrganizationEntitlements(session.organization!.id)
  ]);

  const tasks = assessments.flatMap((assessment) =>
    assessment.recommendations.map((recommendation) => ({
      id: recommendation.id,
      assessmentId: assessment.id,
      assessmentName: assessment.name,
      title: recommendation.title,
      description: recommendation.description,
      owner: recommendation.ownerRole ?? "Unassigned",
      due: recommendation.targetTimeline ?? "TBD",
      priority: recommendation.priority,
      effort: recommendation.effort ?? "Unknown",
      sourceReportId: assessment.reports[0]?.id ?? null
    }))
  );

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-panel">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-accent">Roadmap</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              Remediation action plan
            </h1>
          </div>
          <Link
            href="/dashboard"
            className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink"
          >
            Back to dashboard
          </Link>
        </div>

        {!entitlements.canAccessRoadmap ? (
          <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-warning">
            Roadmap generation is gated on an eligible plan. Activate billing or
            restore a live subscription before sharing remediation plans with
            customer stakeholders.
          </div>
        ) : null}

        {entitlements.canAccessRoadmap ? (
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-line bg-mist p-5">
              <p className="text-sm font-medium text-steel">Total actions</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{tasks.length}</p>
            </div>
            <div className="rounded-2xl border border-line bg-mist p-5">
              <p className="text-sm font-medium text-steel">Urgent items</p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {tasks.filter((task) => task.priority === "URGENT").length}
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-mist p-5">
              <p className="text-sm font-medium text-steel">Report-backed tasks</p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {tasks.filter((task) => task.sourceReportId).length}
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-8 space-y-4">
          {entitlements.canAccessRoadmap
            ? tasks.map((task) => (
                <div
                  key={task.id}
                  className="rounded-2xl border border-line bg-mist p-5"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-lg font-semibold text-ink">{task.title}</p>
                      <p className="mt-2 text-sm text-steel">
                        Assessment: {task.assessmentName} · Owner: {task.owner} · Due:{" "}
                        {task.due}
                      </p>
                    </div>
                    <div className="text-sm text-steel">
                      <p>Priority: {task.priority}</p>
                      <p className="mt-1">Effort: {task.effort}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-steel">
                    {task.description}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link
                      href={`/dashboard/assessments/${task.assessmentId}`}
                      className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink"
                    >
                      Open assessment
                    </Link>
                    {task.sourceReportId ? (
                      <Link
                        href={`/dashboard/reports/${task.sourceReportId}`}
                        className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink"
                      >
                        Open source report
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))
            : null}

          {entitlements.canAccessRoadmap && tasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-white p-8 text-sm text-steel">
              No remediation roadmap exists yet. Generate a report from a
              submitted assessment to populate this view with persisted actions.
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
