import type { Route } from "next";
import Link from "next/link";
import {
  AuditActorType,
  OperationsQueueSeverity,
  OperationsQueueStatus,
  OperationsQueueType,
  prisma
} from "@evolve-edge/db";
import { getServerAuditRequestContext, writeAuditLog } from "../../../lib/audit";
import { requirePlatformPermission } from "../../../lib/auth";
import {
  formatOperationsQueueSeverity,
  formatOperationsQueueStatus,
  formatOperationsQueueType,
  listOperationsQueueItems,
  OPERATIONS_QUEUE_SEVERITIES,
  OPERATIONS_QUEUE_STATUSES,
  OPERATIONS_QUEUE_TYPES,
  synchronizeOperationsQueues
} from "../../../lib/operations-queues";
import { refreshOperationsQueuesAction } from "./actions";

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

function ageLabel(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) {
    return "Today";
  }

  return `${diffDays}d`;
}

function parseQueueType(value?: string) {
  return value && OPERATIONS_QUEUE_TYPES.includes(value as OperationsQueueType)
    ? (value as OperationsQueueType)
    : null;
}

function parseQueueStatus(value?: string) {
  return value && OPERATIONS_QUEUE_STATUSES.includes(value as OperationsQueueStatus)
    ? (value as OperationsQueueStatus)
    : null;
}

function parseQueueSeverity(value?: string) {
  return value && OPERATIONS_QUEUE_SEVERITIES.includes(value as OperationsQueueSeverity)
    ? (value as OperationsQueueSeverity)
    : null;
}

export default async function AdminOperationsQueuesPage({
  searchParams
}: {
  searchParams: Promise<{
    q?: string;
    queueType?: string;
    status?: string;
    severity?: string;
    assigned?: string;
    refreshed?: string;
    error?: string;
  }>;
}) {
  const session = await requirePlatformPermission("platform.accounts.view");
  const params = await searchParams;
  await synchronizeOperationsQueues();

  await writeAuditLog(prisma, {
    userId: session.user.id,
    actorType: AuditActorType.ADMIN,
    actorLabel: session.user.email,
    action: "admin.operations_queues_viewed",
    entityType: "operationsQueue",
    entityId: "global",
    requestContext: await getServerAuditRequestContext()
  });

  const filters = {
    q: params.q ?? null,
    queueType: parseQueueType(params.queueType),
    status: parseQueueStatus(params.status),
    severity: parseQueueSeverity(params.severity),
    assigned:
      params.assigned === "assigned" || params.assigned === "unassigned"
        ? params.assigned
        : null,
    pageSize: 50
  } as const;
  const queue = await listOperationsQueueItems(filters);
  const summary = {
    successRiskOpen: queue.counts
      .filter(
        (entry) =>
          entry.queueType === OperationsQueueType.SUCCESS_RISK &&
          entry.status !== OperationsQueueStatus.RESOLVED &&
          entry.status !== OperationsQueueStatus.DISMISSED
      )
      .reduce((total, entry) => total + entry._count._all, 0),
    billingAnomalyOpen: queue.counts
      .filter(
        (entry) =>
          entry.queueType === OperationsQueueType.BILLING_ANOMALY &&
          entry.status !== OperationsQueueStatus.RESOLVED &&
          entry.status !== OperationsQueueStatus.DISMISSED
      )
      .reduce((total, entry) => total + entry._count._all, 0),
    investigating: queue.counts
      .filter((entry) => entry.status === OperationsQueueStatus.INVESTIGATING)
      .reduce((total, entry) => total + entry._count._all, 0),
    critical: queue.items.filter(
      (item) =>
        item.severity === OperationsQueueSeverity.CRITICAL &&
        item.status !== OperationsQueueStatus.RESOLVED &&
        item.status !== OperationsQueueStatus.DISMISSED
    ).length,
    unassigned: queue.items.filter((item) => !item.assignedUserId).length
  };

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10">
      <div className="rounded-[24px] border border-line bg-white p-8 shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-accent">Internal Admin</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              Proactive operations queues
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-steel">
              Deterministic success-risk and billing-anomaly queues built from
              lifecycle, billing, monitoring, and delivery records. Operators
              can work the highest-risk accounts before churn, failed
              activation, or billing friction becomes revenue loss.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link href={"/admin" as Route} className="font-medium text-accent">
              Back to admin
            </Link>
            <form action={refreshOperationsQueuesAction}>
              <button
                type="submit"
                className="rounded-full border border-line px-4 py-2 font-medium text-ink transition hover:border-accent hover:text-accent"
              >
                Recompute queues
              </button>
            </form>
          </div>
        </div>

        {params.refreshed === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Queue rules were recomputed successfully.
          </div>
        ) : null}
        {params.error ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-danger">
            {params.error}
          </div>
        ) : null}

        <div className="mt-8 grid gap-4 md:grid-cols-5">
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Open success risk</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{summary.successRiskOpen}</p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Open billing anomalies</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{summary.billingAnomalyOpen}</p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Investigating</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{summary.investigating}</p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Critical now</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{summary.critical}</p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Unassigned</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{summary.unassigned}</p>
          </div>
        </div>

        <form className="mt-8 grid gap-3 rounded-2xl border border-line bg-mist p-4 lg:grid-cols-[minmax(0,1fr)_180px_180px_180px_180px_auto]">
          <input
            type="text"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search org, email, rule, source record..."
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
          />
          <select
            name="queueType"
            defaultValue={params.queueType ?? ""}
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
          >
            <option value="">All queues</option>
            {OPERATIONS_QUEUE_TYPES.map((queueType) => (
              <option key={queueType} value={queueType}>
                {formatOperationsQueueType(queueType)}
              </option>
            ))}
          </select>
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
          >
            <option value="">All statuses</option>
            {OPERATIONS_QUEUE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {formatOperationsQueueStatus(status)}
              </option>
            ))}
          </select>
          <select
            name="severity"
            defaultValue={params.severity ?? ""}
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
          >
            <option value="">All severities</option>
            {OPERATIONS_QUEUE_SEVERITIES.map((severity) => (
              <option key={severity} value={severity}>
                {formatOperationsQueueSeverity(severity)}
              </option>
            ))}
          </select>
          <select
            name="assigned"
            defaultValue={params.assigned ?? ""}
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
          >
            <option value="">Assigned + unassigned</option>
            <option value="assigned">Assigned only</option>
            <option value="unassigned">Unassigned only</option>
          </select>
          <button
            type="submit"
            className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white"
          >
            Apply
          </button>
        </form>

        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">Queue items</h2>
            <p className="text-sm text-steel">{queue.totalCount} matching items</p>
          </div>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-mist text-steel">
                <tr>
                  <th className="px-4 py-3 font-medium">Issue</th>
                  <th className="px-4 py-3 font-medium">Account</th>
                  <th className="px-4 py-3 font-medium">Queue</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">Age</th>
                  <th className="px-4 py-3 font-medium">Last note</th>
                </tr>
              </thead>
              <tbody>
                {queue.items.length ? (
                  queue.items.map((item) => (
                    <tr key={item.id} className="border-t border-line">
                      <td className="px-4 py-3 align-top">
                        <Link
                          href={`/admin/queues/${item.id}` as Route}
                          className="font-medium text-ink transition hover:text-accent"
                        >
                          {item.title}
                        </Link>
                        <p className="mt-1 text-steel">{item.summary}</p>
                      </td>
                      <td className="px-4 py-3 align-top text-steel">
                        <p>{item.organization.name}</p>
                        <p>
                          {item.customerAccount?.companyName ??
                            item.customerAccount?.primaryContactEmail ??
                            item.organization.slug}
                        </p>
                      </td>
                      <td className="px-4 py-3 align-top text-steel">
                        <p>{formatOperationsQueueType(item.queueType)}</p>
                        <p>{formatOperationsQueueSeverity(item.severity)}</p>
                      </td>
                      <td className="px-4 py-3 align-top text-steel">
                        {formatOperationsQueueStatus(item.status)}
                      </td>
                      <td className="px-4 py-3 align-top text-steel">
                        {item.assignedUser
                          ? item.assignedUser.email
                          : "Unassigned"}
                      </td>
                      <td className="px-4 py-3 align-top text-steel">
                        <p>{ageLabel(item.firstDetectedAt)}</p>
                        <p>Detected {formatDateTime(item.firstDetectedAt)}</p>
                      </td>
                      <td className="px-4 py-3 align-top text-steel">
                        {item.historyEntries[0]?.note
                          ? item.historyEntries[0].note
                          : "No notes yet"}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-steel">
                      No queue items match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
