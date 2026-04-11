import type { Route } from "next";
import Link from "next/link";
import { AuditActorType, EventReplayTargetType, prisma } from "@evolve-edge/db";
import { replayEventAction } from "./actions";
import { getServerAuditRequestContext, writeAuditLog } from "../../../lib/audit";
import { requirePlatformPermission } from "../../../lib/auth";
import {
  EVENT_REPLAY_TARGET_TYPES,
  formatReplayAttemptStatus,
  formatReplayTargetType,
  getEventReplayDashboardSnapshot
} from "../../../lib/event-replay";

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

function formatStatus(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function truncateJson(value: unknown, maxLength = 700) {
  const serialized = JSON.stringify(value, null, 2);
  return serialized.length <= maxLength
    ? serialized
    : `${serialized.slice(0, maxLength - 3)}...`;
}

function parseTargetType(value?: string) {
  return value && EVENT_REPLAY_TARGET_TYPES.includes(value as EventReplayTargetType)
    ? (value as EventReplayTargetType)
    : null;
}

function parseRetryability(value?: string) {
  return value === "retryable" || value === "non_retryable" || value === "all"
    ? value
    : null;
}

export default async function AdminReplayPage({
  searchParams
}: {
  searchParams: Promise<{
    q?: string;
    targetType?: string;
    retryability?: string;
    replayed?: string;
    replayError?: string;
  }>;
}) {
  const session = await requirePlatformPermission("platform.jobs.view");
  const params = await searchParams;
  const filters = {
    q: params.q?.trim() ?? null,
    targetType: parseTargetType(params.targetType),
    retryability: parseRetryability(params.retryability)
  } as const;
  const snapshot = await getEventReplayDashboardSnapshot(filters);

  await writeAuditLog(prisma, {
    userId: session.user.id,
    actorType: AuditActorType.ADMIN,
    actorLabel: session.user.email,
    action: "admin.event_replay_console_viewed",
    entityType: "adminConsole",
    entityId: "event-replay",
    requestContext: await getServerAuditRequestContext()
  });

  const returnTo = (() => {
    const url = new URLSearchParams();
    if (params.q) url.set("q", params.q);
    if (filters.targetType) url.set("targetType", filters.targetType);
    if (filters.retryability) url.set("retryability", filters.retryability);
    const suffix = url.toString();
    return (`/admin/replays${suffix ? `?${suffix}` : ""}`) as Route;
  })();

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10">
      <div className="rounded-[24px] border border-line bg-white p-8 shadow-panel">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-medium text-accent">Internal Admin</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Event replay console</h1>
            <p className="mt-2 max-w-3xl text-sm text-steel">
              Review failed Stripe billing events, internal domain events, and outbound
              webhook deliveries. Replay is only available when the target is
              explicitly classified as safe and idempotent.
            </p>
          </div>
          <Link href={"/admin" as Route} className="text-sm font-semibold text-accent">
            Back to admin
          </Link>
        </div>

        {params.replayed === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Replay completed successfully.
          </div>
        ) : null}

        {params.replayError ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-danger">
            {params.replayError}
          </div>
        ) : null}

        <form method="get" className="mt-8 grid gap-3 rounded-2xl border border-line bg-mist p-4 md:grid-cols-4">
          <input
            type="text"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search event type, id, destination, reason"
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
          />
          <select
            name="targetType"
            defaultValue={filters.targetType ?? ""}
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
          >
            <option value="">All target types</option>
            {EVENT_REPLAY_TARGET_TYPES.map((targetType) => (
              <option key={targetType} value={targetType}>
                {formatReplayTargetType(targetType)}
              </option>
            ))}
          </select>
          <select
            name="retryability"
            defaultValue={filters.retryability ?? ""}
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
          >
            <option value="">All failure classes</option>
            <option value="retryable">Retryable</option>
            <option value="non_retryable">Non-retryable / reviewed</option>
            <option value="all">All</option>
          </select>
          <button
            type="submit"
            className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white"
          >
            Apply filters
          </button>
        </form>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Failed billing events</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {snapshot.summary.failedBillingEvents}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Failed domain events</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {snapshot.summary.failedDomainEvents}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Failed deliveries</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {snapshot.summary.failedWebhookDeliveries}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Recent replay attempts</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {snapshot.summary.recentReplayAttempts}
            </p>
          </div>
        </div>

        <section className="mt-10 grid gap-6 xl:grid-cols-3">
          <div className="rounded-2xl border border-line p-5">
            <h2 className="text-lg font-semibold text-ink">Failed Stripe billing events</h2>
            <div className="mt-4 space-y-4">
              {snapshot.billingEvents.length ? (
                snapshot.billingEvents.map((event) => (
                  <div key={event.id} className="rounded-2xl bg-mist p-4">
                    <p className="font-medium text-ink">{event.type}</p>
                    <p className="mt-1 text-sm text-steel">
                      {formatStatus(event.status)} | Stripe event {event.stripeEventId}
                    </p>
                    <p className="mt-2 text-sm text-steel">
                      Policy: {event.eligibility.normalizedState} |{" "}
                      {event.eligibility.retryable ? "Retryable" : "Reviewed replay only"} |
                      Attempts in 24h: {event.replayCount24h}
                    </p>
                    <p className="mt-2 text-sm text-steel">{event.eligibility.reason}</p>
                    {event.lastError ? (
                      <p className="mt-2 text-sm text-danger">{event.lastError}</p>
                    ) : null}
                    <pre className="mt-3 overflow-x-auto rounded-2xl border border-line bg-white p-3 text-xs text-steel">
                      {truncateJson(event.payload)}
                    </pre>
                    <form action={replayEventAction} className="mt-4 space-y-3">
                      <input type="hidden" name="targetType" value={EventReplayTargetType.BILLING_EVENT} />
                      <input type="hidden" name="targetId" value={event.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <input
                        type="text"
                        name="reason"
                        placeholder="Why is this replay safe now?"
                        className="w-full rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                      />
                      <input
                        type="text"
                        name="notes"
                        placeholder="Optional internal note"
                        className="w-full rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                      />
                      <div className="flex gap-3">
                        <input
                          type="text"
                          name="confirmation"
                          placeholder="Type REPLAY"
                          className="flex-1 rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                        />
                        <button
                          type="submit"
                          disabled={!event.eligibility.eligible}
                          className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-line"
                        >
                          Replay
                        </button>
                      </div>
                    </form>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-mist p-4 text-sm text-steel">
                  No failed billing events match the current filter.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-line p-5">
            <h2 className="text-lg font-semibold text-ink">Failed domain events</h2>
            <div className="mt-4 space-y-4">
              {snapshot.domainEvents.length ? (
                snapshot.domainEvents.map((event) => (
                  <div key={event.id} className="rounded-2xl bg-mist p-4">
                    <p className="font-medium text-ink">{event.type}</p>
                    <p className="mt-1 text-sm text-steel">
                      {formatStatus(event.status)} | {event.aggregateType} | {event.aggregateId}
                    </p>
                    <p className="mt-2 text-sm text-steel">
                      Policy: {event.eligibility.normalizedState} | Retryable:{" "}
                      {event.eligibility.retryable ? "Yes" : "No"} | Attempts in 24h:{" "}
                      {event.replayCount24h}
                    </p>
                    <p className="mt-2 text-sm text-steel">{event.eligibility.reason}</p>
                    <p className="mt-2 text-sm text-steel">
                      Deliveries: {event.deliveries.length} total,{" "}
                      {event.deliveries.filter((delivery) => delivery.status === "FAILED").length} failed
                    </p>
                    <pre className="mt-3 overflow-x-auto rounded-2xl border border-line bg-white p-3 text-xs text-steel">
                      {truncateJson({
                        idempotencyKey: event.idempotencyKey,
                        payload: event.payload
                      })}
                    </pre>
                    <form action={replayEventAction} className="mt-4 space-y-3">
                      <input type="hidden" name="targetType" value={EventReplayTargetType.DOMAIN_EVENT} />
                      <input type="hidden" name="targetId" value={event.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <input
                        type="text"
                        name="reason"
                        placeholder="Why is this replay safe now?"
                        className="w-full rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                      />
                      <input
                        type="text"
                        name="notes"
                        placeholder="Optional internal note"
                        className="w-full rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                      />
                      <div className="flex gap-3">
                        <input
                          type="text"
                          name="confirmation"
                          placeholder="Type REPLAY"
                          className="flex-1 rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                        />
                        <button
                          type="submit"
                          disabled={!event.eligibility.eligible}
                          className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-line"
                        >
                          Replay
                        </button>
                      </div>
                    </form>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-mist p-4 text-sm text-steel">
                  No failed domain events match the current filter.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-line p-5">
            <h2 className="text-lg font-semibold text-ink">Failed outbound deliveries</h2>
            <div className="mt-4 space-y-4">
              {snapshot.webhookDeliveries.length ? (
                snapshot.webhookDeliveries.map((delivery) => (
                  <div key={delivery.id} className="rounded-2xl bg-mist p-4">
                    <p className="font-medium text-ink">{delivery.destination}</p>
                    <p className="mt-1 text-sm text-steel">
                      {formatStatus(delivery.status)} | Attempt {delivery.attemptCount}
                    </p>
                    <p className="mt-2 text-sm text-steel">
                      Event: {delivery.event.type} | Aggregate: {delivery.event.aggregateId}
                    </p>
                    <p className="mt-2 text-sm text-steel">
                      Policy: {delivery.eligibility.normalizedState} |{" "}
                      {delivery.eligibility.retryable ? "Retryable" : "Reviewed replay only"} |
                      Attempts in 24h: {delivery.replayCount24h}
                    </p>
                    <p className="mt-2 text-sm text-steel">{delivery.eligibility.reason}</p>
                    {delivery.lastError ? (
                      <p className="mt-2 text-sm text-danger">{delivery.lastError}</p>
                    ) : null}
                    <pre className="mt-3 overflow-x-auto rounded-2xl border border-line bg-white p-3 text-xs text-steel">
                      {truncateJson({
                        requestUrl: delivery.requestUrl,
                        eventId: delivery.eventId,
                        idempotencyKey: delivery.event.idempotencyKey,
                        payload: delivery.event.payload
                      })}
                    </pre>
                    <form action={replayEventAction} className="mt-4 space-y-3">
                      <input type="hidden" name="targetType" value={EventReplayTargetType.WEBHOOK_DELIVERY} />
                      <input type="hidden" name="targetId" value={delivery.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <input
                        type="text"
                        name="reason"
                        placeholder="Why is this replay safe now?"
                        className="w-full rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                      />
                      <input
                        type="text"
                        name="notes"
                        placeholder="Optional internal note"
                        className="w-full rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                      />
                      <div className="flex gap-3">
                        <input
                          type="text"
                          name="confirmation"
                          placeholder="Type REPLAY"
                          className="flex-1 rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                        />
                        <button
                          type="submit"
                          disabled={!delivery.eligibility.eligible}
                          className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-line"
                        >
                          Replay
                        </button>
                      </div>
                    </form>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-mist p-4 text-sm text-steel">
                  No failed deliveries match the current filter.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-line p-5">
          <h2 className="text-lg font-semibold text-ink">Recent replay attempts</h2>
          <div className="mt-4 space-y-3">
            {snapshot.recentAttempts.length ? (
              snapshot.recentAttempts.map((attempt) => (
                <div key={attempt.id} className="rounded-2xl bg-mist p-4">
                  <p className="font-medium text-ink">
                    {formatReplayTargetType(attempt.targetType)} | {formatReplayAttemptStatus(attempt.status)}
                  </p>
                  <p className="mt-1 text-sm text-steel">
                    {attempt.requestedByEmail} | {formatDateTime(attempt.createdAt)} | {attempt.correlationId}
                  </p>
                  <p className="mt-2 text-sm text-steel">{attempt.reason}</p>
                  {attempt.notes ? <p className="mt-2 text-sm text-steel">{attempt.notes}</p> : null}
                  {attempt.failureReason ? (
                    <p className="mt-2 text-sm text-danger">{attempt.failureReason}</p>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="rounded-2xl bg-mist p-4 text-sm text-steel">
                No replay attempts have been recorded yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
