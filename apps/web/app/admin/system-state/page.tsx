import type { Route } from "next";
import Link from "next/link";
import { AuditActorType, prisma } from "@evolve-edge/db";
import { getServerAuditRequestContext, writeAuditLog } from "../../../lib/audit";
import { requirePlatformPermission } from "../../../lib/auth";

export const dynamic = "force-dynamic";

function formatDateTime(date: Date | null | undefined) {
  if (!date) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatStatus(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function shortId(value: string | null | undefined) {
  if (!value) {
    return "n/a";
  }

  return value.length > 14 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function truncate(value: string | null | undefined, length = 180) {
  if (!value) {
    return null;
  }

  return value.length > length ? `${value.slice(0, length)}...` : value;
}

function buildContainsFilter(q: string) {
  return q
    ? {
        contains: q,
        mode: "insensitive" as const
      }
    : undefined;
}

function asJsonPreview(value: unknown) {
  if (!value) {
    return "No metadata";
  }

  try {
    return JSON.stringify(value, null, 2).slice(0, 900);
  } catch {
    return "Metadata could not be rendered safely.";
  }
}

type AuditLifecycleDebugRow = {
  assessmentId: string;
  routingSnapshotId: string | null;
  workflowDispatchId: string | null;
  reportId: string | null;
  status: string;
};

type BriefingDebugRow = {
  id: string;
  reportId: string;
  organizationId: string;
  createdAt: Date;
};

export default async function AdminSystemStatePage({
  searchParams
}: {
  searchParams: Promise<{
    q?: string;
  }>;
}) {
  const session = await requirePlatformPermission("platform.audit.view");
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const containsFilter = buildContainsFilter(q);

  await writeAuditLog(prisma, {
    userId: session.user.id,
    actorType: AuditActorType.ADMIN,
    actorLabel: session.user.email,
    action: "admin.system_state_viewed",
    entityType: "adminSystemState",
    entityId: "global",
    requestContext: await getServerAuditRequestContext()
  });

  const [
    users,
    organizations,
    audits,
    routingSnapshots,
    reports,
    analysisJobs,
    workflowDispatches,
    auditLifecycles,
    reportDeliveryStates,
    briefings,
    auditLogs,
    operatorEvents
  ] = await Promise.all([
    prisma.user.findMany({
      where: q
        ? {
            OR: [
              { id: containsFilter },
              { email: containsFilter },
              { firstName: containsFilter },
              { lastName: containsFilter }
            ]
          }
        : undefined,
      include: {
        memberships: {
          include: {
            organization: true
          },
          orderBy: { createdAt: "desc" },
          take: 3
        }
      },
      orderBy: { createdAt: "desc" },
      take: 25
    }),
    prisma.organization.findMany({
      where: q
        ? {
            OR: [
              { id: containsFilter },
              { name: containsFilter },
              { slug: containsFilter },
              { hubspotCompanyId: containsFilter }
            ]
          }
        : undefined,
      include: {
        _count: {
          select: {
            members: true,
            assessments: true,
            reports: true,
            routingSnapshots: true
          }
        },
        subscriptions: {
          include: { plan: true },
          orderBy: { updatedAt: "desc" },
          take: 1
        },
        routingSnapshots: {
          include: {
            workflowDispatches: {
              orderBy: { createdAt: "desc" },
              take: 1
            }
          },
          orderBy: { createdAt: "desc" },
          take: 1
        }
      },
      orderBy: { updatedAt: "desc" },
      take: 25
    }),
    prisma.assessment.findMany({
      where: q
        ? {
            OR: [
              { id: containsFilter },
              { name: containsFilter },
              { organization: { name: containsFilter } },
              { organization: { slug: containsFilter } }
            ]
          }
        : undefined,
      include: {
        organization: true,
        analysisJobs: {
          orderBy: { createdAt: "desc" },
          take: 1
        },
        reports: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      },
      orderBy: { updatedAt: "desc" },
      take: 25
    }),
    prisma.routingSnapshot.findMany({
      where: q
        ? {
            OR: [
              { id: containsFilter },
              { sourceEventId: containsFilter },
              { sourceRecordId: containsFilter },
              { organization: { name: containsFilter } },
              { user: { email: containsFilter } }
            ]
          }
        : undefined,
      include: {
        organization: true,
        user: true,
        workflowDispatches: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      },
      orderBy: { createdAt: "desc" },
      take: 25
    }),
    prisma.report.findMany({
      where: q
        ? {
            OR: [
              { id: containsFilter },
              { title: containsFilter },
              { organization: { name: containsFilter } },
              { assessment: { name: containsFilter } }
            ]
          }
        : undefined,
      include: {
        organization: true,
        assessment: true,
      },
      orderBy: { createdAt: "desc" },
      take: 25
    }),
    prisma.analysisJob.findMany({
      where: q
        ? {
            OR: [
              { id: containsFilter },
              { providerRequestId: containsFilter },
              { provider: containsFilter },
              { assessment: { name: containsFilter } },
              { assessment: { organization: { name: containsFilter } } }
            ]
          }
        : undefined,
      include: {
        assessment: {
          include: {
            organization: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 25
    }),
    prisma.workflowDispatch.findMany({
      where: q
        ? {
            OR: [
              { id: containsFilter },
              { correlationId: containsFilter },
              { externalExecutionId: containsFilter },
              { routingSnapshotId: containsFilter },
              { routingSnapshot: { organization: { name: containsFilter } } }
            ]
          }
        : undefined,
      include: {
        routingSnapshot: {
          include: {
            organization: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 25
    }),
    q
      ? prisma.$queryRaw<AuditLifecycleDebugRow[]>`
          SELECT
            al."assessmentId",
            al."routingSnapshotId",
            al."workflowDispatchId",
            al."reportId",
            al."status"::text AS "status"
          FROM "AuditLifecycle" al
          JOIN "Organization" o ON o."id" = al."organizationId"
          WHERE
            al."assessmentId" ILIKE ${`%${q}%`} OR
            COALESCE(al."routingSnapshotId", '') ILIKE ${`%${q}%`} OR
            COALESCE(al."workflowDispatchId", '') ILIKE ${`%${q}%`} OR
            COALESCE(al."reportId", '') ILIKE ${`%${q}%`} OR
            o."name" ILIKE ${`%${q}%`}
          ORDER BY al."updatedAt" DESC
          LIMIT 60
        `
      : prisma.$queryRaw<AuditLifecycleDebugRow[]>`
          SELECT
            "assessmentId",
            "routingSnapshotId",
            "workflowDispatchId",
            "reportId",
            "status"::text AS "status"
          FROM "AuditLifecycle"
          ORDER BY "updatedAt" DESC
          LIMIT 60
        `,
    prisma.deliveryStateRecord.findMany({
      where: q
        ? {
            OR: [
              { reportId: containsFilter },
              { routingSnapshotId: containsFilter },
              { workflowDispatchId: containsFilter },
              { organization: { name: containsFilter } },
              { lastError: containsFilter }
            ]
          }
        : undefined,
      orderBy: { updatedAt: "desc" },
      take: 60
    }),
    q
      ? prisma.$queryRaw<BriefingDebugRow[]>`
          SELECT b."id", b."reportId", b."organizationId", b."createdAt"
          FROM "Briefing" b
          JOIN "Organization" o ON o."id" = b."organizationId"
          WHERE
            b."reportId" ILIKE ${`%${q}%`} OR
            b."summary" ILIKE ${`%${q}%`} OR
            o."name" ILIKE ${`%${q}%`}
          ORDER BY b."createdAt" DESC
          LIMIT 60
        `
      : prisma.$queryRaw<BriefingDebugRow[]>`
          SELECT "id", "reportId", "organizationId", "createdAt"
          FROM "Briefing"
          ORDER BY "createdAt" DESC
          LIMIT 60
        `,
    prisma.auditLog.findMany({
      where: q
        ? {
            OR: [
              { action: containsFilter },
              { entityType: containsFilter },
              { entityId: containsFilter },
              { actorLabel: containsFilter },
              { organization: { name: containsFilter } },
              { user: { email: containsFilter } }
            ]
          }
        : {
            action: {
              in: [
                "routing_snapshot.created",
                "workflow_dispatch.status_updated",
                "workflow_dispatch.report_ready",
                "ai_execution.completed",
                "ai_execution.failed",
                "report.generated"
              ]
            }
          },
      include: {
        organization: true,
        user: true
      },
      orderBy: { createdAt: "desc" },
      take: 35
    }),
    prisma.operatorWorkflowEventRecord.findMany({
      where: q
        ? {
            OR: [
              { message: containsFilter },
              { eventKey: containsFilter },
              { organization: { name: containsFilter } },
              { reportId: containsFilter }
            ]
          }
        : undefined,
      include: {
        organization: true,
        report: true,
        paymentReconciliation: true
      },
      orderBy: { createdAt: "desc" },
      take: 35
    })
  ]);

  const failedWorkflowDispatches = workflowDispatches.filter((dispatch) => dispatch.lastError);
  const failedAnalysisJobs = analysisJobs.filter((job) => job.errorMessage);
  const reportsReady = reports.filter((report) =>
    ["APPROVED", "GENERATED", "DELIVERED"].includes(String(report.status))
  );
  const lifecycleByAssessmentId = new Map(
    auditLifecycles.map((lifecycle) => [lifecycle.assessmentId, lifecycle])
  );
  const lifecycleByReportId = new Map(
    auditLifecycles
      .filter((lifecycle) => lifecycle.reportId)
      .map((lifecycle) => [lifecycle.reportId!, lifecycle])
  );
  const deliveryStateByReportId = new Map(
    reportDeliveryStates
      .filter((deliveryState) => deliveryState.reportId)
      .map((deliveryState) => [deliveryState.reportId!, deliveryState])
  );
  const briefingByReportId = new Map(
    briefings.map((briefing) => [briefing.reportId, briefing])
  );

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10">
      <div className="rounded-[24px] border border-line bg-white p-8 shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-accent">Internal Admin</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              System State Debugger
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-steel">
              Support-safe visibility across users, organizations, audits,
              routing snapshots, workflow dispatches, AI execution attempts,
              reports, and operational logs.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link href={"/admin" as Route} className="font-medium text-accent">
              Back to admin
            </Link>
            <span className="text-steel">Signed in as {session.user.email}</span>
          </div>
        </div>

        <form className="mt-8 flex flex-col gap-3 rounded-2xl border border-line bg-mist p-4 md:flex-row">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search org, email, snapshot_id, workflow run, report, error..."
            className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
          />
          <button
            type="submit"
            className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white"
          >
            Search state
          </button>
        </form>

        <section className="mt-8 grid gap-4 md:grid-cols-5">
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Organizations</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{organizations.length}</p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Audits</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{audits.length}</p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Snapshots</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{routingSnapshots.length}</p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Report-ready</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{reportsReady.length}</p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Errors</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {failedWorkflowDispatches.length + failedAnalysisJobs.length}
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-ink">Organizations</h2>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-mist text-steel">
                <tr>
                  <th className="px-4 py-3 font-medium">Organization</th>
                  <th className="px-4 py-3 font-medium">Current status</th>
                  <th className="px-4 py-3 font-medium">Last workflow run</th>
                  <th className="px-4 py-3 font-medium">Snapshot ID</th>
                  <th className="px-4 py-3 font-medium">Last error</th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((organization) => {
                  const subscription = organization.subscriptions[0];
                  const snapshot = organization.routingSnapshots[0];
                  const dispatch = snapshot?.workflowDispatches[0];
                  return (
                    <tr key={organization.id} className="border-t border-line">
                      <td className="px-4 py-3 align-top">
                        <p className="font-medium text-ink">{organization.name}</p>
                        <p className="text-steel">{organization.slug}</p>
                      </td>
                      <td className="px-4 py-3 align-top text-steel">
                        <p>{organization.onboardingCompletedAt ? "Onboarded" : "Onboarding pending"}</p>
                        <p>{subscription ? formatStatus(subscription.status) : "No subscription"}</p>
                        <p>{organization._count.assessments} audits, {organization._count.reports} reports</p>
                      </td>
                      <td className="px-4 py-3 align-top text-steel">
                        <p>{dispatch ? formatStatus(dispatch.status) : "No workflow run"}</p>
                        <p>{formatDateTime(dispatch?.lastAttemptAt ?? dispatch?.createdAt)}</p>
                      </td>
                      <td className="px-4 py-3 align-top font-mono text-xs text-steel">
                        {shortId(snapshot?.id)}
                      </td>
                      <td className="px-4 py-3 align-top text-danger">
                        {truncate(dispatch?.lastError) ?? "No recent workflow error"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-ink">Users</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {users.map((user) => (
              <div key={user.id} className="rounded-2xl border border-line p-4">
                <p className="font-medium text-ink">
                  {[user.firstName, user.lastName].filter(Boolean).join(" ") || user.email}
                </p>
                <p className="mt-1 text-sm text-steel">{user.email}</p>
                <p className="mt-2 text-sm text-steel">
                  Platform role: {formatStatus(user.platformRole)}
                </p>
                <p className="mt-1 font-mono text-xs text-steel">user_id {shortId(user.id)}</p>
                <div className="mt-3 space-y-1 text-sm text-steel">
                  {user.memberships.length ? (
                    user.memberships.map((membership) => (
                      <p key={membership.id}>
                        {membership.organization.name} - {formatStatus(membership.role)}
                      </p>
                    ))
                  ) : (
                    <p>No organization memberships.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-ink">Audits</h2>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-mist text-steel">
                <tr>
                  <th className="px-4 py-3 font-medium">Audit</th>
                  <th className="px-4 py-3 font-medium">Current status</th>
                  <th className="px-4 py-3 font-medium">Last workflow run</th>
                  <th className="px-4 py-3 font-medium">Snapshot ID</th>
                  <th className="px-4 py-3 font-medium">Last error</th>
                </tr>
              </thead>
              <tbody>
                {audits.map((audit) => {
                  const job = audit.analysisJobs[0];
                  const report = audit.reports[0];
                  const lifecycle = lifecycleByAssessmentId.get(audit.id);
                  return (
                    <tr key={audit.id} className="border-t border-line">
                      <td className="px-4 py-3 align-top">
                        <p className="font-medium text-ink">{audit.name}</p>
                        <p className="text-steel">{audit.organization.name}</p>
                      </td>
                      <td className="px-4 py-3 align-top text-steel">
                        <p>{formatStatus(lifecycle?.status ?? audit.status)}</p>
                        <p>Report: {report ? formatStatus(report.status) : "No report"}</p>
                      </td>
                      <td className="px-4 py-3 align-top text-steel">
                        <p>{job ? `${job.provider} ${formatStatus(job.status)}` : "No analysis job"}</p>
                        <p>{formatDateTime(job?.lastAttemptAt ?? job?.createdAt)}</p>
                      </td>
                      <td className="px-4 py-3 align-top font-mono text-xs text-steel">
                        {shortId(lifecycle?.routingSnapshotId)}
                      </td>
                      <td className="px-4 py-3 align-top text-danger">
                        {truncate(job?.errorMessage) ?? "No recent analysis error"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-ink">Routing snapshots</h2>
          <div className="mt-4 space-y-3">
            {routingSnapshots.map((snapshot) => {
              const dispatch = snapshot.workflowDispatches[0];
              return (
                <details key={snapshot.id} className="rounded-2xl border border-line p-4">
                  <summary className="cursor-pointer list-none">
                    <div className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
                      <div>
                        <p className="font-medium text-ink">{snapshot.organization.name}</p>
                        <p className="font-mono text-xs text-steel">snapshot_id {snapshot.id}</p>
                      </div>
                      <div className="text-sm text-steel">
                        <p>{formatStatus(snapshot.status)}</p>
                        <p>{formatStatus(snapshot.workflowCode)}</p>
                      </div>
                      <div className="text-sm text-steel">
                        <p>Dispatch: {dispatch ? formatStatus(dispatch.status) : "None"}</p>
                        <p>{shortId(dispatch?.externalExecutionId ?? dispatch?.id)}</p>
                      </div>
                      <div className="text-sm text-danger">
                        {truncate(dispatch?.lastError, 120) ?? "No dispatch error"}
                      </div>
                    </div>
                  </summary>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl bg-mist p-4">
                      <p className="text-sm font-semibold text-ink">Routing decisions</p>
                      <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-steel">
                        {asJsonPreview(snapshot.routingReasonJson)}
                      </pre>
                    </div>
                    <div className="rounded-xl bg-mist p-4">
                      <p className="text-sm font-semibold text-ink">Normalized hints</p>
                      <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-steel">
                        {asJsonPreview(snapshot.normalizedHintsJson)}
                      </pre>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold text-ink">Execution attempts</h2>
            <div className="mt-4 space-y-3">
              {analysisJobs.map((job) => (
                <div key={job.id} className="rounded-2xl border border-line p-4">
                  <p className="font-medium text-ink">{job.assessment.name}</p>
                  <p className="mt-1 text-sm text-steel">
                    {job.assessment.organization.name} - {job.provider} - {formatStatus(job.status)}
                  </p>
                  <p className="mt-2 text-sm text-steel">
                    Attempt {job.attemptCount} - last attempt {formatDateTime(job.lastAttemptAt)}
                  </p>
                  <p className="mt-1 font-mono text-xs text-steel">
                    job_id {shortId(job.id)} run {shortId(job.providerRequestId)}
                  </p>
                  {job.errorMessage ? (
                    <p className="mt-2 text-sm text-danger">{truncate(job.errorMessage)}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink">Workflow runs</h2>
            <div className="mt-4 space-y-3">
              {workflowDispatches.map((dispatch) => (
                <div key={dispatch.id} className="rounded-2xl border border-line p-4">
                  <p className="font-medium text-ink">
                    {dispatch.routingSnapshot.organization.name}
                  </p>
                  <p className="mt-1 text-sm text-steel">
                    {dispatch.eventType} - {dispatch.destination} - {formatStatus(dispatch.status)}
                  </p>
                  <p className="mt-2 font-mono text-xs text-steel">
                    snapshot_id {shortId(dispatch.routingSnapshotId)} - dispatch_id {shortId(dispatch.id)}
                  </p>
                  <p className="mt-1 text-sm text-steel">
                    Last attempt {formatDateTime(dispatch.lastAttemptAt)} - attempts {dispatch.attemptCount}
                  </p>
                  {dispatch.lastError ? (
                    <p className="mt-2 text-sm text-danger">{truncate(dispatch.lastError)}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-ink">Reports</h2>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-mist text-steel">
                <tr>
                  <th className="px-4 py-3 font-medium">Report</th>
                  <th className="px-4 py-3 font-medium">Current status</th>
                  <th className="px-4 py-3 font-medium">Snapshot ID</th>
                  <th className="px-4 py-3 font-medium">Delivery</th>
                  <th className="px-4 py-3 font-medium">Briefing</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => {
                  const deliveryState = deliveryStateByReportId.get(report.id);
                  const lifecycle = lifecycleByReportId.get(report.id);
                  const briefing = briefingByReportId.get(report.id);
                  return (
                    <tr key={report.id} className="border-t border-line">
                      <td className="px-4 py-3 align-top">
                        <p className="font-medium text-ink">{report.title}</p>
                        <p className="text-steel">{report.organization.name}</p>
                      </td>
                      <td className="px-4 py-3 align-top text-steel">
                        <p>{formatStatus(report.status)}</p>
                        <p>Published {formatDateTime(report.publishedAt)}</p>
                      </td>
                      <td className="px-4 py-3 align-top font-mono text-xs text-steel">
                        {shortId(lifecycle?.routingSnapshotId)}
                      </td>
                      <td className="px-4 py-3 align-top text-steel">
                        <p>{deliveryState ? formatStatus(deliveryState.status) : "No delivery state"}</p>
                        <p className="text-danger">{truncate(deliveryState?.lastError, 120)}</p>
                      </td>
                      <td className="px-4 py-3 align-top text-steel">
                        {briefing ? `Ready ${formatDateTime(briefing.createdAt)}` : "Not generated"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold text-ink">Routing and execution logs</h2>
            <div className="mt-4 space-y-3">
              {auditLogs.map((log) => (
                <details key={log.id} className="rounded-2xl border border-line p-4">
                  <summary className="cursor-pointer list-none">
                    <p className="font-medium text-ink">{log.action}</p>
                    <p className="mt-1 text-sm text-steel">
                      {formatStatus(log.actorType)} - {log.entityType} - {shortId(log.entityId)} - {formatDateTime(log.createdAt)}
                    </p>
                  </summary>
                  <pre className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-mist p-4 text-xs text-steel">
                    {asJsonPreview(log.metadata)}
                  </pre>
                </details>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink">Failure and operator events</h2>
            <div className="mt-4 space-y-3">
              {operatorEvents.map((event) => (
                <details key={event.id} className="rounded-2xl border border-line p-4">
                  <summary className="cursor-pointer list-none">
                    <p className="font-medium text-ink">{formatStatus(event.eventCode)}</p>
                    <p className="mt-1 text-sm text-steel">
                      {event.organization?.name ?? "No org"} - {formatStatus(event.severity)} - {formatDateTime(event.createdAt)}
                    </p>
                    <p className="mt-2 text-sm text-steel">{event.message}</p>
                  </summary>
                  <pre className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-mist p-4 text-xs text-steel">
                    {asJsonPreview(event.metadata)}
                  </pre>
                </details>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
