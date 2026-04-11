import type { Route } from "next";
import Link from "next/link";
import { AuditActorType, OperationsQueueStatus, prisma } from "@evolve-edge/db";
import {
  addOperationsQueueNoteAction,
  assignOperationsQueueItemAction,
  updateOperationsQueueStatusAction
} from "../actions";
import { getServerAuditRequestContext, writeAuditLog } from "../../../../lib/audit";
import { requirePlatformPermission } from "../../../../lib/auth";
import {
  formatOperationsQueueSeverity,
  formatOperationsQueueStatus,
  formatOperationsQueueType,
  getOperationsQueueAssignableUsers,
  getOperationsQueueDetail,
  OPERATIONS_QUEUE_STATUSES
} from "../../../../lib/operations-queues";

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

function formatActorLabel(input: {
  actorLabel: string | null;
  actorUser?: {
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
}) {
  const actorName = [input.actorUser?.firstName, input.actorUser?.lastName]
    .filter(Boolean)
    .join(" ");

  return actorName || input.actorUser?.email || input.actorLabel || "system";
}

export default async function AdminOperationsQueueDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ queueItemId: string }>;
  searchParams: Promise<{
    statusUpdated?: string;
    assignmentUpdated?: string;
    noteAdded?: string;
  }>;
}) {
  const session = await requirePlatformPermission("platform.accounts.view");
  const { queueItemId } = await params;
  const query = await searchParams;
  const [queueItem, assignableUsers] = await Promise.all([
    getOperationsQueueDetail(queueItemId),
    getOperationsQueueAssignableUsers()
  ]);

  await writeAuditLog(prisma, {
    organizationId: queueItem?.organizationId ?? null,
    userId: session.user.id,
    actorType: AuditActorType.ADMIN,
    actorLabel: session.user.email,
    action: "admin.operations_queue_viewed",
    entityType: "operationsQueueItem",
    entityId: queueItemId,
    requestContext: await getServerAuditRequestContext()
  });

  if (!queueItem) {
    return (
      <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
        <div className="rounded-[24px] border border-line bg-white p-8 shadow-panel">
          <p className="text-sm font-medium text-accent">Internal Admin</p>
          <h1 className="mt-2 text-3xl font-semibold text-ink">Queue item not found</h1>
          <Link href={"/admin/queues" as Route} className="mt-6 inline-flex text-sm font-semibold text-accent">
            Back to operations queues
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <div className="rounded-[24px] border border-line bg-white p-8 shadow-panel">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-medium text-accent">Internal Admin</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">{queueItem.title}</h1>
            <p className="mt-2 text-sm text-steel">
              {formatOperationsQueueType(queueItem.queueType)} |{" "}
              {formatOperationsQueueSeverity(queueItem.severity)} |{" "}
              {formatOperationsQueueStatus(queueItem.status)}
            </p>
          </div>
          <div className="flex flex-col gap-2 text-sm font-semibold">
            <Link href={"/admin/queues" as Route} className="text-accent">
              Back to queues
            </Link>
            {queueItem.customerAccountId ? (
              <Link
                href={`/admin/customers/${queueItem.customerAccountId}` as Route}
                className="text-accent"
              >
                Open customer account
              </Link>
            ) : null}
            <Link
              href={`/admin/accounts/${queueItem.organizationId}` as Route}
              className="text-accent"
            >
              Open organization
            </Link>
          </div>
        </div>

        {query.statusUpdated === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Queue status updated.
          </div>
        ) : null}
        {query.assignmentUpdated === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Queue assignment updated.
          </div>
        ) : null}
        {query.noteAdded === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Queue note added.
          </div>
        ) : null}

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Organization</p>
            <p className="mt-2 text-xl font-semibold text-ink">{queueItem.organization.name}</p>
            <p className="mt-2 text-sm text-steel">{queueItem.organization.slug}</p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Account</p>
            <p className="mt-2 text-xl font-semibold text-ink">
              {queueItem.customerAccount?.companyName ??
                queueItem.customerAccount?.primaryContactEmail ??
                "Organization-level issue"}
            </p>
            <p className="mt-2 text-sm text-steel">
              {queueItem.customerAccount?.primaryContactEmail ?? "No customer account linked"}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Owner</p>
            <p className="mt-2 text-xl font-semibold text-ink">
              {queueItem.assignedUser?.email ?? "Unassigned"}
            </p>
            <p className="mt-2 text-sm text-steel">
              Assigned {formatDateTime(queueItem.assignedAt)}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Detection</p>
            <p className="mt-2 text-xl font-semibold text-ink">
              {formatDateTime(queueItem.firstDetectedAt)}
            </p>
            <p className="mt-2 text-sm text-steel">
              Last evaluated {formatDateTime(queueItem.lastEvaluatedAt)}
            </p>
          </div>
        </div>

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-line p-5">
            <h2 className="text-lg font-semibold text-ink">Queue context</h2>
            <div className="mt-4 space-y-3 text-sm text-steel">
              <p>Rule: {queueItem.ruleCode}</p>
              <p>Source system: {queueItem.sourceSystem}</p>
              <p>
                Source record: {queueItem.sourceRecordType ?? "Not set"} |{" "}
                {queueItem.sourceRecordId ?? "Not set"}
              </p>
              <p>Recommended action: {queueItem.recommendedAction ?? "Not set"}</p>
              <p>Reason label: {queueItem.reasonLabel ?? "Not set"}</p>
            </div>
            <p className="mt-4 text-sm leading-6 text-steel">{queueItem.summary}</p>
          </div>

          <div className="rounded-2xl border border-line p-5">
            <h2 className="text-lg font-semibold text-ink">Workflow controls</h2>
            <form action={updateOperationsQueueStatusAction} className="mt-4 space-y-3">
              <input type="hidden" name="queueItemId" value={queueItem.id} />
              <select
                name="status"
                defaultValue={queueItem.status}
                className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
              >
                {OPERATIONS_QUEUE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {formatOperationsQueueStatus(status)}
                  </option>
                ))}
              </select>
              <textarea
                name="note"
                rows={3}
                placeholder="Why is the queue status changing?"
                className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
              />
              <button
                type="submit"
                className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white"
              >
                Update queue status
              </button>
            </form>

            <form action={assignOperationsQueueItemAction} className="mt-6 space-y-3">
              <input type="hidden" name="queueItemId" value={queueItem.id} />
              <select
                name="assignedUserId"
                defaultValue={queueItem.assignedUserId ?? ""}
                className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
              >
                <option value="">Unassigned</option>
                {assignableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.email}
                  </option>
                ))}
              </select>
              <textarea
                name="note"
                rows={3}
                placeholder="Why is ownership changing?"
                className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
              />
              <button
                type="submit"
                className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink"
              >
                Save assignment
              </button>
            </form>

            <form action={addOperationsQueueNoteAction} className="mt-6 space-y-3">
              <input type="hidden" name="queueItemId" value={queueItem.id} />
              <textarea
                name="note"
                rows={4}
                placeholder="Record operator context, customer response, or next step..."
                className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
              />
              <button
                type="submit"
                className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink"
              >
                Add queue note
              </button>
            </form>
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-line p-5">
          <h2 className="text-lg font-semibold text-ink">History</h2>
          <div className="mt-4 space-y-4">
            {queueItem.historyEntries.length ? (
              queueItem.historyEntries.map((entry) => (
                <div key={entry.id} className="rounded-2xl bg-mist p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-medium text-ink">{entry.entryType}</p>
                      <p className="mt-1 text-sm text-steel">
                        {formatActorLabel({
                          actorLabel: entry.actorLabel,
                          actorUser: entry.actorUser
                        })}
                      </p>
                      {entry.note ? (
                        <p className="mt-2 text-sm text-steel">{entry.note}</p>
                      ) : null}
                      {entry.fromStatus || entry.toStatus ? (
                        <p className="mt-2 text-sm text-steel">
                          {entry.fromStatus
                            ? `${formatOperationsQueueStatus(entry.fromStatus)} -> `
                            : ""}
                          {entry.toStatus
                            ? formatOperationsQueueStatus(entry.toStatus)
                            : "No status change"}
                        </p>
                      ) : null}
                    </div>
                    <p className="text-sm text-steel">{formatDateTime(entry.createdAt)}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl bg-mist p-4 text-sm text-steel">
                No history has been recorded for this queue item yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
