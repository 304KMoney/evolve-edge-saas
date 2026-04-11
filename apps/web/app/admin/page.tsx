import type { Route } from "next";
import Link from "next/link";
import {
  BillingEventStatus,
  AuditActorType,
  DomainEventStatus,
  PlatformUserRole,
  ScheduledJobStatus,
  SubscriptionStatus,
  WebhookDeliveryStatus,
  prisma
} from "@evolve-edge/db";
import { getAdminConsoleScaleSnapshot, getLeadStageLabel } from "../../lib/admin-console";
import {
  canManagePlatformRoles,
  getEffectivePlatformRole
} from "../../lib/authorization";
import { formatBillingAccessState } from "../../lib/billing";
import { getServerAuditRequestContext, writeAuditLog } from "../../lib/audit";
import {
  getSessionAuthorizationContext,
  requireAdminSession
} from "../../lib/auth";
import {
  formatCustomerLifecycleStage,
  getCustomerAccountsForAdmin
} from "../../lib/customer-accounts";
import { getRecentScheduledJobRuns } from "../../lib/jobs";
import { getOperatorConsoleSnapshot } from "../../lib/operator-console";
import { getOpsReadinessSnapshot } from "../../lib/ops-readiness";
import { getAdminSafePlanMappings } from "../../lib/revenue-catalog";
import { getOrganizationUsageSnapshot } from "../../lib/usage";
import { updatePlatformRoleAction } from "./actions";

export const dynamic = "force-dynamic";

function formatDate(date: Date | null | undefined) {
  if (!date) {
    return "Not set";
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

function buildContainsFilter(q: string) {
  return q
    ? {
        contains: q,
        mode: "insensitive" as const
      }
    : undefined;
}

function getDeliveryFilter(value?: string) {
  switch (value) {
    case "retrying":
      return { in: [WebhookDeliveryStatus.RETRYING, WebhookDeliveryStatus.FAILED] };
    case "all":
      return undefined;
    default:
      return WebhookDeliveryStatus.FAILED;
  }
}

function getEventFilter(value?: string) {
  switch (value) {
    case "processing":
      return DomainEventStatus.PROCESSING;
    case "processed":
      return DomainEventStatus.PROCESSED;
    case "failed":
      return DomainEventStatus.FAILED;
    case "all":
      return undefined;
    default:
      return { in: [DomainEventStatus.PENDING, DomainEventStatus.FAILED] };
  }
}

function getSubscriptionFilter(value?: string) {
  switch (value) {
    case "trialing":
      return SubscriptionStatus.TRIALING;
    case "active":
      return SubscriptionStatus.ACTIVE;
    case "past_due":
      return SubscriptionStatus.PAST_DUE;
    case "canceled":
      return SubscriptionStatus.CANCELED;
    case "all":
      return undefined;
    default:
      return { in: [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] };
  }
}

function getAuditFilter(value?: string) {
  switch (value) {
    case "admin":
      return AuditActorType.ADMIN;
    case "system":
      return { in: [AuditActorType.SYSTEM, AuditActorType.INTERNAL_API, AuditActorType.WEBHOOK, AuditActorType.JOB] };
    case "user":
      return AuditActorType.USER;
    case "all":
      return undefined;
    default:
      return undefined;
  }
}

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

function formatPlatformRole(role: string | null | undefined) {
  if (!role || role === PlatformUserRole.NONE) {
    return "No internal role";
  }

  return formatStatus(role);
}

export default async function AdminPage({
  searchParams
}: {
  searchParams: Promise<{
    q?: string;
    subscription?: string;
    events?: string;
    deliveries?: string;
    audit?: string;
    operatorQueue?: string;
    roleUpdated?: string;
    roleError?: string;
  }>;
}) {
  const session = await requireAdminSession();
  const authz = getSessionAuthorizationContext(session);
  const canManagePlatformRoleAssignments = canManagePlatformRoles(authz);
  await writeAuditLog(prisma, {
    userId: session.user.id,
    actorType: AuditActorType.ADMIN,
    actorLabel: session.user.email,
    action: "admin.console_viewed",
    entityType: "adminConsole",
    entityId: "global",
    requestContext: await getServerAuditRequestContext()
  });
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const containsFilter = buildContainsFilter(q);
  const subscriptionFilter = getSubscriptionFilter(params.subscription);
  const eventFilter = getEventFilter(params.events);
  const deliveryFilter = getDeliveryFilter(params.deliveries);
  const auditFilter = getAuditFilter(params.audit);
  const operatorQueue =
    params.operatorQueue === "follow_up" ||
    params.operatorQueue === "founder_review" ||
    params.operatorQueue === "action_required" ||
    params.operatorQueue === "delivery_review"
      ? params.operatorQueue
      : "all";
  const adminSafePlanMappings = getAdminSafePlanMappings();

  const [
    organizations,
    users,
    subscriptions,
    assessments,
    reports,
    auditLogs,
    domainEvents,
    webhookDeliveries,
    scheduledJobRuns,
    opsReadiness,
    scaleSnapshot,
    customerAccounts,
    operatorSnapshot
  ] = await Promise.all([
    prisma.organization.findMany({
      where: q
        ? {
            OR: [
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
            reports: true
          }
        },
        subscriptions: {
          include: { plan: true },
          orderBy: { createdAt: "desc" },
          take: 1
        }
      },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.user.findMany({
      where: q
        ? {
            OR: [
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
      take: 20
    }),
    prisma.subscription.findMany({
      where: {
        ...(subscriptionFilter ? { status: subscriptionFilter } : {}),
        ...(q
          ? {
              OR: [
                { stripeCustomerId: containsFilter },
                { stripeSubscriptionId: containsFilter },
                { organization: { name: containsFilter } },
                { plan: { name: containsFilter } }
              ]
            }
          : {})
      },
      include: {
        organization: true,
        plan: true
      },
      orderBy: { updatedAt: "desc" },
      take: 20
    }),
    prisma.assessment.findMany({
      where: q
        ? {
            OR: [
              { name: containsFilter },
              { organization: { name: containsFilter } }
            ]
          }
        : undefined,
      include: {
        organization: true
      },
      orderBy: { updatedAt: "desc" },
      take: 20
    }),
    prisma.report.findMany({
      where: q
        ? {
            OR: [
              { title: containsFilter },
              { versionLabel: containsFilter },
              { organization: { name: containsFilter } },
              { assessment: { name: containsFilter } }
            ]
          }
        : undefined,
      include: {
        organization: true,
        assessment: true
      },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.auditLog.findMany({
      where: {
        ...(auditFilter ? { actorType: auditFilter } : {}),
        ...(q
          ? {
              OR: [
                { action: containsFilter },
                { entityType: containsFilter },
                { entityId: containsFilter },
                { actorLabel: containsFilter },
                { user: { email: containsFilter } },
                { organization: { name: containsFilter } }
              ]
            }
          : {})
      },
      include: {
        user: true,
        organization: true
      },
      orderBy: { createdAt: "desc" },
      take: 25
    }),
    prisma.domainEvent.findMany({
      where: {
        ...(eventFilter ? { status: eventFilter } : {}),
        ...(q
          ? {
              OR: [
                { type: containsFilter },
                { aggregateType: containsFilter },
                { aggregateId: containsFilter },
                { orgId: containsFilter },
                { userId: containsFilter }
              ]
            }
          : {})
      },
      orderBy: { occurredAt: "desc" },
      take: 25
    }),
    prisma.webhookDelivery.findMany({
      where: {
        ...(deliveryFilter ? { status: deliveryFilter } : {}),
        ...(q
          ? {
              OR: [
                { destination: containsFilter },
                { requestUrl: containsFilter },
                { event: { type: containsFilter } },
                { event: { aggregateId: containsFilter } }
              ]
            }
          : {})
      },
      include: {
        event: true
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 25
    }),
    getRecentScheduledJobRuns({ limit: 15 }),
    getOpsReadinessSnapshot(),
    getAdminConsoleScaleSnapshot({ q }),
    getCustomerAccountsForAdmin({ q, limit: 12 }),
    getOperatorConsoleSnapshot({ q, queue: operatorQueue })
  ]);

  const organizationUsage = await Promise.all(
    organizations.map(async (organization) => ({
      organizationId: organization.id,
      usage: await getOrganizationUsageSnapshot(organization.id)
    }))
  );
  const usageByOrgId = new Map(
    organizationUsage.map((entry) => [entry.organizationId, entry.usage])
  );

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10">
      <div className="rounded-[24px] border border-line bg-white p-8 shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-accent">Internal Admin</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              Operations Console
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-steel">
              Operational visibility for customer state, onboarding, billing,
              assessments, reports, events, failed automation deliveries, and
              internal access control.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-steel">
            <Link
              href={"/admin/kpis" as Route}
              className="rounded-full border border-line px-4 py-2 font-medium text-ink transition hover:border-accent hover:text-accent"
            >
              View KPI dashboard
            </Link>
            <Link
              href={"/admin/replays" as Route}
              className="rounded-full border border-line px-4 py-2 font-medium text-ink transition hover:border-accent hover:text-accent"
            >
              Review failed events
            </Link>
            <Link
              href={"/admin/queues" as Route}
              className="rounded-full border border-line px-4 py-2 font-medium text-ink transition hover:border-accent hover:text-accent"
            >
              View proactive queues
            </Link>
            <span>Signed in as {session.user.email}</span>
          </div>
        </div>

        {params.roleUpdated === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Internal platform role updated successfully.
          </div>
        ) : null}
        {params.roleError === "last-super-admin" ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-warning">
            Evolve Edge must keep at least one persisted super admin for safe recovery.
          </div>
        ) : null}
        {params.roleError === "missing-user" ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-danger">
            The selected user could not be found.
          </div>
        ) : null}

        <form className="mt-8 grid gap-3 rounded-2xl border border-line bg-mist p-4 lg:grid-cols-[minmax(0,1fr)_180px_180px_180px_180px_auto]">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search org, user, plan, report, event..."
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
          />
          <select
            name="subscription"
            defaultValue={params.subscription ?? ""}
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
          >
            <option value="">Active billing focus</option>
            <option value="all">All subscriptions</option>
            <option value="trialing">Trialing</option>
            <option value="active">Active</option>
            <option value="past_due">Past due</option>
            <option value="canceled">Canceled</option>
          </select>
          <select
            name="events"
            defaultValue={params.events ?? ""}
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
          >
            <option value="">Pending + failed events</option>
            <option value="all">All events</option>
            <option value="processing">Processing</option>
            <option value="processed">Processed</option>
            <option value="failed">Failed</option>
          </select>
          <select
            name="deliveries"
            defaultValue={params.deliveries ?? ""}
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
          >
            <option value="">Failed deliveries</option>
            <option value="all">All deliveries</option>
            <option value="retrying">Retrying + failed</option>
          </select>
          <select
            name="audit"
            defaultValue={params.audit ?? ""}
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
          >
            <option value="">All audit actors</option>
            <option value="user">User actions</option>
            <option value="admin">Admin actions</option>
            <option value="system">System actions</option>
            <option value="all">No filter</option>
          </select>
          <select
            name="operatorQueue"
            defaultValue={params.operatorQueue ?? ""}
            className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none lg:col-span-2"
          >
            <option value="">All operator accounts</option>
            <option value="follow_up">Follow-up due</option>
            <option value="founder_review">Founder review</option>
            <option value="action_required">Failed runs</option>
            <option value="delivery_review">Delivery review</option>
          </select>
          <button
            type="submit"
            className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white"
          >
            Apply
          </button>
        </form>

        <div className="mt-8 grid gap-4 md:grid-cols-5">
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Ops readiness</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {opsReadiness.status === "healthy" ? "Healthy" : "Degraded"}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Organizations</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{organizations.length}</p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Users</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{users.length}</p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Subscriptions</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{subscriptions.length}</p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Failed Deliveries</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{webhookDeliveries.length}</p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Recent Job Runs</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{scheduledJobRuns.length}</p>
          </div>
        </div>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-ink">Operator queue</h2>
          <p className="mt-2 text-sm text-steel">
            The highest-leverage internal view for customer follow-up, failed runs, delivery review, and founder escalation.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-5">
            <div className="rounded-2xl border border-line p-4">
              <p className="text-sm text-steel">Founder review</p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {operatorSnapshot.queueCounts.founderReview}
              </p>
            </div>
            <div className="rounded-2xl border border-line p-4">
              <p className="text-sm text-steel">Follow-up due</p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {operatorSnapshot.queueCounts.upcomingFollowUps}
              </p>
              <p className="mt-2 text-sm text-steel">
                Overdue {operatorSnapshot.queueCounts.overdueFollowUps}
              </p>
            </div>
            <div className="rounded-2xl border border-line p-4">
              <p className="text-sm text-steel">Failed runs</p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {operatorSnapshot.queueCounts.actionRequiredRuns}
              </p>
            </div>
            <div className="rounded-2xl border border-line p-4">
              <p className="text-sm text-steel">Delivery review</p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {operatorSnapshot.queueCounts.deliveryReview}
              </p>
            </div>
            <div className="rounded-2xl border border-line p-4">
              <p className="text-sm text-steel">Current queue</p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {operatorSnapshot.customerAccounts.length}
              </p>
              <p className="mt-2 text-sm text-steel">{operatorQueue.replaceAll("_", " ")}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <div className="rounded-2xl border border-line p-5">
              <h3 className="text-base font-semibold text-ink">Accounts requiring attention</h3>
              <div className="mt-4 space-y-3">
                {operatorSnapshot.customerAccounts.length ? (
                  operatorSnapshot.customerAccounts.map((account) => (
                    <div key={account.id} className="rounded-2xl bg-mist p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <Link
                            href={`/admin/customers/${account.id}` as Route}
                            className="font-medium text-ink transition hover:text-accent"
                          >
                            {account.companyName ?? account.primaryContactEmail}
                          </Link>
                          <p className="mt-1 text-sm text-steel">{account.primaryContactEmail}</p>
                        </div>
                        <div className="text-right text-sm text-steel">
                          <p>{formatCustomerLifecycleStage(account.lifecycleStage)}</p>
                          <p className="mt-1">
                            {account.founderReviewRequired ? "Founder review" : "No escalation"}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 space-y-1 text-sm text-steel">
                        <p>
                          Org: {account.organization?.name ?? "Pre-customer"} · Next action:{" "}
                          {account.nextActionLabel ?? "None scheduled"}
                        </p>
                        <p>
                          Due: {formatDateTime(account.nextActionDueAt)} · Owner:{" "}
                          {account.nextActionOwner ?? "Unassigned"}
                        </p>
                        <p>
                          Latest note: {account.timelineEntries[0]?.body ?? "No internal note yet"}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl bg-mist p-4 text-sm text-steel">
                    No accounts match the current operator queue.
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl border border-line p-5">
                <h3 className="text-base font-semibold text-ink">Failed runs</h3>
                <div className="mt-4 space-y-3">
                  {operatorSnapshot.actionRequiredRuns.length ? (
                    operatorSnapshot.actionRequiredRuns.map((run) => (
                      <div key={run.id} className="rounded-2xl bg-mist p-4">
                        <p className="font-medium text-ink">
                          {run.organization.name} · {formatStatus(run.currentStep)}
                        </p>
                        <p className="mt-1 text-sm text-steel">
                          {run.assessment?.name ?? "Workflow run"} · {run.lastError ?? "Action required"}
                        </p>
                        <p className="mt-2 text-sm text-steel">
                          <Link
                            href={`/admin/accounts/${run.organization.id}` as Route}
                            className="font-semibold text-accent"
                          >
                            Open workspace
                          </Link>
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl bg-mist p-4 text-sm text-steel">
                      No failed runs are currently waiting for operator action.
                    </div>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-line p-5">
                <h3 className="text-base font-semibold text-ink">Delivery review</h3>
                <div className="mt-4 space-y-3">
                  {operatorSnapshot.deliveryReviewPackages.length ? (
                    operatorSnapshot.deliveryReviewPackages.map((deliveryPackage) => (
                      <div key={deliveryPackage.id} className="rounded-2xl bg-mist p-4">
                        <p className="font-medium text-ink">
                          {deliveryPackage.organization.name} · {deliveryPackage.title}
                        </p>
                        <p className="mt-1 text-sm text-steel">
                          QA {formatStatus(deliveryPackage.qaStatus)} · Delivery{" "}
                          {formatStatus(deliveryPackage.deliveryStatus)}
                        </p>
                        {deliveryPackage.requiresFounderReview ? (
                          <p className="mt-2 text-sm text-danger">
                            Founder review: {deliveryPackage.founderReviewReason ?? "Required"}
                          </p>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl bg-mist p-4 text-sm text-steel">
                      No delivery packages are currently waiting for review.
                    </div>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-line p-5">
                <h3 className="text-base font-semibold text-ink">Recent internal notes</h3>
                <div className="mt-4 space-y-3">
                  {operatorSnapshot.recentInternalNotes.length ? (
                    operatorSnapshot.recentInternalNotes.map((note) => (
                      <div key={note.id} className="rounded-2xl bg-mist p-4">
                        <p className="font-medium text-ink">
                          {note.customerAccount.companyName ?? note.customerAccount.primaryContactEmail}
                        </p>
                        <p className="mt-1 text-sm text-steel">
                          {note.actorLabel ?? "operator"} · {formatDateTime(note.createdAt)}
                        </p>
                        <p className="mt-2 text-sm text-steel">
                          {note.body ?? "No note body captured."}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl bg-mist p-4 text-sm text-steel">
                      No internal notes match the current search.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-ink">Environment and flags</h2>
          <p className="mt-2 text-sm text-steel">
            Centralized operator-facing visibility into auth mode, alert wiring, dispatch readiness, and app-owned feature flags.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-line p-4">
              <p className="text-sm text-steel">Auth mode</p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {scaleSnapshot.configSummary.authMode}
              </p>
              <p className="mt-2 text-sm text-steel">
                Internal admins configured: {scaleSnapshot.configSummary.adminEmailCount}
              </p>
            </div>
            <div className="rounded-2xl border border-line p-4">
              <p className="text-sm text-steel">Stripe + dispatch</p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {scaleSnapshot.configSummary.stripeConfigured ? "Ready" : "Missing config"}
              </p>
              <p className="mt-2 text-sm text-steel">
                {scaleSnapshot.configSummary.webhookDestinationsConfigured} outbound destinations
              </p>
              <p className="mt-1 text-sm text-steel">
                Cron secret: {scaleSnapshot.configSummary.cronConfigured ? "present" : "missing"} · Dispatch secret: {scaleSnapshot.configSummary.outboundDispatchConfigured ? "present" : "missing"}
              </p>
            </div>
            <div className="rounded-2xl border border-line p-4">
              <p className="text-sm text-steel">Ops alerts</p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {scaleSnapshot.configSummary.opsAlertsConfigured ? "Enabled" : "Off"}
              </p>
              <p className="mt-2 text-sm text-steel">
                App-owned feature flags stay centralized instead of hiding in the UI layer.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {Object.entries(scaleSnapshot.configSummary.featureFlags).map(([flag, enabled]) => (
              <div key={flag} className="rounded-2xl border border-line p-4">
                <p className="font-medium text-ink">{flag}</p>
                <p className="mt-2 text-sm text-steel">
                  {enabled ? "Enabled" : "Disabled"}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-ink">Customer lifecycle control plane</h2>
          <p className="mt-2 text-sm text-steel">
            One operator-friendly view of manually sold accounts from lead through delivery and follow-up.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {customerAccounts.length > 0 ? (
              customerAccounts.map((account) => {
                const accountHref = `/admin/customers/${account.id}` as Route;

                return (
                  <div key={account.id} className="rounded-2xl border border-line p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <Link
                          href={accountHref}
                          className="font-medium text-ink transition hover:text-accent"
                        >
                          {account.companyName ?? account.primaryContactEmail}
                        </Link>
                        <p className="mt-1 text-sm text-steel">{account.primaryContactEmail}</p>
                      </div>
                      <div className="text-right text-sm text-steel">
                        <p>{formatCustomerLifecycleStage(account.lifecycleStage)}</p>
                        <p className="mt-1">{formatStatus(account.stageSource)}</p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2 text-sm text-steel">
                      <p>Linked org: {account.organization?.name ?? "Not provisioned yet"}</p>
                      <p>
                        Lead source: {account.primaryLeadSubmission?.source ?? "Not linked"} ·{" "}
                        {account.primaryLeadSubmission
                          ? getLeadStageLabel(account.primaryLeadSubmission.stage)
                          : "No lead stage"}
                      </p>
                      <p>
                        Next action: {account.nextActionLabel ?? "None scheduled"} ·{" "}
                        {account.nextActionOwner ?? "Unassigned"}
                      </p>
                      <p>Timeline entries: {account._count.timelineEntries}</p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-line p-5 text-sm text-steel">
                No customer accounts have been created yet.
              </div>
            )}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-ink">Support-safe account summaries</h2>
          <p className="mt-2 text-sm text-steel">
            Fast operator summaries for account lookup, billing state checks, owner identification, usage posture, and latest product activity.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {scaleSnapshot.supportSafeAccountSummaries.map((summary) => {
              const accountHref = `/admin/accounts/${summary.organizationId}` as Route;

              return (
              <div key={summary.organizationId} className="rounded-2xl border border-line p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Link
                      href={accountHref}
                      className="font-medium text-ink transition hover:text-accent"
                    >
                      {summary.organizationName}
                    </Link>
                    <p className="mt-1 text-sm text-steel">{summary.slug}</p>
                  </div>
                  <div className="text-right text-sm text-steel">
                    <p>{summary.billing.planName}</p>
                    <p className="mt-1">
                      {summary.billing.status
                        ? formatStatus(summary.billing.status)
                        : "No subscription"}
                    </p>
                  </div>
                </div>
                <div className="mt-4 space-y-2 text-sm text-steel">
                  <p>Owner: {summary.ownerEmail ?? "Not assigned"}</p>
                  <p>
                    Billing access: {summary.billing.accessState ? formatBillingAccessState(summary.billing.accessState) : "Unknown"}
                  </p>
                  <p>
                    Renews: {formatDate(summary.billing.renewsAt)}
                  </p>
                  <p>
                    Usage: {summary.usage.activeMembersCount} members · {summary.usage.activeAssessmentsCount} active assessments · {summary.usage.reportsCount} reports
                  </p>
                  <p>
                    Latest product state: {summary.product.latestAssessmentName ?? "No assessment"} · {summary.product.latestReportTitle ?? "No report"}
                  </p>
                  <p>
                    Monitored assets: {summary.product.monitoredAssetsCount} · Last activity {formatDate(summary.usage.lastActivityAt)}
                  </p>
                  {summary.lead ? (
                    <p>
                      Lead: {summary.lead.email} · {getLeadStageLabel(summary.lead.stage)} · {summary.lead.source}
                    </p>
                  ) : null}
                  {summary.billing.lastPaymentFailureMessage ? (
                    <p className="text-danger">
                      Payment issue: {summary.billing.lastPaymentFailureMessage}
                    </p>
                  ) : null}
                </div>
              </div>
              );
            })}
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold text-ink">Billing event inspection</h2>
            <div className="mt-4 space-y-3">
              {scaleSnapshot.recentBillingEvents.map((event) => (
                <div key={event.id} className="rounded-2xl border border-line p-4">
                  <p className="font-medium text-ink">{event.type}</p>
                  <p className="mt-1 text-sm text-steel">
                    {event.stripeEventId} · {formatStatus(event.status)}
                  </p>
                  <p className="mt-2 text-sm text-steel">
                    Created {formatDateTime(event.createdAt)}
                  </p>
                  {event.status === BillingEventStatus.FAILED && event.lastError ? (
                    <p className="mt-2 text-sm text-danger">{event.lastError}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink">Growth and lead pipeline</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-line p-4">
                <p className="text-sm text-steel">Analytics events (7d)</p>
                <p className="mt-2 text-2xl font-semibold text-ink">
                  {scaleSnapshot.growthSummary.analyticsEventsLast7Days}
                </p>
              </div>
              <div className="rounded-2xl border border-line p-4">
                <p className="text-sm text-steel">Leads captured (7d)</p>
                <p className="mt-2 text-2xl font-semibold text-ink">
                  {scaleSnapshot.growthSummary.leadsLast7Days}
                </p>
              </div>
              <div className="rounded-2xl border border-line p-4">
                <p className="text-sm text-steel">Unresolved events</p>
                <p className="mt-2 text-2xl font-semibold text-ink">
                  {scaleSnapshot.growthSummary.unresolvedDomainEvents}
                </p>
              </div>
              <div className="rounded-2xl border border-line p-4">
                <p className="text-sm text-steel">Blocked deliveries</p>
                <p className="mt-2 text-2xl font-semibold text-ink">
                  {scaleSnapshot.growthSummary.blockedWebhookDeliveries}
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {scaleSnapshot.recentLeadSubmissions.map((lead) => (
                <div key={lead.id} className="rounded-2xl border border-line p-4">
                  <p className="font-medium text-ink">{lead.email}</p>
                  <p className="mt-1 text-sm text-steel">
                    {lead.companyName ?? "No company"} · {lead.source} · {getLeadStageLabel(lead.stage)}
                  </p>
                  <p className="mt-2 text-sm text-steel">
                    Intent: {lead.intent ?? "n/a"} · Requested plan: {lead.requestedPlanCode ?? "n/a"}
                  </p>
                  <p className="mt-1 text-sm text-steel">
                    Submitted {formatDateTime(lead.submittedAt)}
                  </p>
                  {lead.lastError ? (
                    <p className="mt-2 text-sm text-danger">{lead.lastError}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-ink">Ops readiness</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-line p-4">
              <p className="text-sm text-steel">Billing failures</p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {opsReadiness.failedBillingEvents}
              </p>
            </div>
            <div className="rounded-2xl border border-line p-4">
              <p className="text-sm text-steel">Failed email sends</p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {opsReadiness.failedEmailNotifications}
              </p>
            </div>
            <div className="rounded-2xl border border-line p-4">
              <p className="text-sm text-steel">Stale domain events</p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {opsReadiness.staleDomainEvents}
              </p>
            </div>
            <div className="rounded-2xl border border-line p-4">
              <p className="text-sm text-steel">Failed analysis jobs</p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {opsReadiness.failedAnalysisJobs}
              </p>
            </div>
            <div className="rounded-2xl border border-line p-4">
              <p className="text-sm text-steel">Failed job runs</p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {opsReadiness.failedScheduledJobRuns}
              </p>
            </div>
            <div className="rounded-2xl border border-line p-4">
              <p className="text-sm text-steel">Stale onboarding orgs</p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {opsReadiness.staleOnboardingOrganizations}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">Organizations</h2>
            <Link href="/dashboard" className="text-sm font-medium text-accent">
              Return to app
            </Link>
          </div>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-mist text-steel">
                <tr>
                  <th className="px-4 py-3 font-medium">Organization</th>
                  <th className="px-4 py-3 font-medium">Onboarding</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Members</th>
                  <th className="px-4 py-3 font-medium">Activity</th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((organization) => {
                  const subscription = organization.subscriptions[0];
                  const usage = usageByOrgId.get(organization.id);
                  const accountHref = `/admin/accounts/${organization.id}` as Route;
                  return (
                    <tr key={organization.id} className="border-t border-line">
                      <td className="px-4 py-3 align-top">
                        <Link
                          href={accountHref}
                          className="font-medium text-ink transition hover:text-accent"
                        >
                          {organization.name}
                        </Link>
                        <p className="text-steel">{organization.slug}</p>
                      </td>
                      <td className="px-4 py-3 align-top text-steel">
                        {organization.onboardingCompletedAt
                          ? `Completed ${formatDate(organization.onboardingCompletedAt)}`
                          : "Incomplete"}
                      </td>
                      <td className="px-4 py-3 align-top text-steel">
                        {subscription
                          ? `${subscription.plan.name} · ${formatStatus(subscription.status)}`
                          : "No subscription"}
                      </td>
                      <td className="px-4 py-3 align-top text-steel">
                        {organization._count.members} members · {organization._count.assessments} assessments · {organization._count.reports} reports
                      </td>
                      <td className="px-4 py-3 align-top text-steel">
                        {usage?.lastActivityAt
                          ? `Last activity ${formatDate(usage.lastActivityAt)}`
                          : `Created ${formatDate(organization.createdAt)}`}
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
            <h2 className="text-lg font-semibold text-ink">Usage visibility</h2>
            <div className="mt-4 space-y-3">
              {organizations.map((organization) => {
                const usage = usageByOrgId.get(organization.id);
                const subscription = organization.subscriptions[0];
                return (
                  <div key={organization.id} className="rounded-2xl border border-line p-4">
                    <p className="font-medium text-ink">{organization.name}</p>
                    <p className="mt-2 text-sm text-steel">
                      {usage?.activeMembersCount ?? 0} active members
                      {subscription?.plan.seatsLimit
                        ? ` of ${subscription.plan.seatsLimit} seats`
                        : " · unlimited seats"}
                    </p>
                    <p className="mt-1 text-sm text-steel">
                      {usage?.activeAssessmentsCount ?? 0} active assessments
                      {subscription?.plan.activeAssessmentsLimit
                        ? ` of ${subscription.plan.activeAssessmentsLimit} allowed`
                        : ""}
                    </p>
                    <p className="mt-1 text-sm text-steel">
                      {usage?.reportsCount ?? 0} reports · last activity {formatDate(usage?.lastActivityAt)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink">Users and memberships</h2>
            <div className="mt-4 space-y-3">
              {users.map((user) => (
                <div key={user.id} className="rounded-2xl border border-line p-4">
                  <p className="font-medium text-ink">
                    {[user.firstName, user.lastName].filter(Boolean).join(" ") || user.email}
                  </p>
                  <p className="mt-1 text-sm text-steel">{user.email}</p>
                  <p className="mt-2 text-sm text-steel">
                    Internal role:{" "}
                    {formatPlatformRole(
                      getEffectivePlatformRole(user.platformRole, user.email)
                    )}
                  </p>
                  <div className="mt-3 space-y-1 text-sm text-steel">
                    {user.memberships.length > 0 ? (
                      user.memberships.map((membership) => (
                        <p key={membership.id}>
                          {membership.organization.name} · {formatStatus(membership.role)}
                        </p>
                      ))
                    ) : (
                      <p>No organization memberships yet.</p>
                    )}
                  </div>
                  {canManagePlatformRoleAssignments ? (
                    <form
                      action={updatePlatformRoleAction}
                      className="mt-4 flex flex-col gap-3 md:flex-row md:items-center"
                    >
                      <input type="hidden" name="userId" value={user.id} />
                      <select
                        name="platformRole"
                        defaultValue={user.platformRole}
                        className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                      >
                        <option value={PlatformUserRole.NONE}>No internal role</option>
                        <option value={PlatformUserRole.OPERATOR}>Internal operator</option>
                        <option value={PlatformUserRole.REVIEWER}>Internal reviewer</option>
                        <option value={PlatformUserRole.EXECUTIVE_ADMIN}>Executive admin</option>
                        <option value={PlatformUserRole.SUPER_ADMIN}>Super admin</option>
                      </select>
                      <button
                        type="submit"
                        className="rounded-full border border-line bg-white px-4 py-3 text-sm font-semibold text-ink"
                      >
                        Update internal role
                      </button>
                    </form>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink">Subscriptions and plans</h2>
            <div className="mt-4 space-y-3">
              {subscriptions.map((subscription) => (
                <div key={subscription.id} className="rounded-2xl border border-line p-4">
                  <p className="font-medium text-ink">{subscription.organization.name}</p>
                  <p className="mt-1 text-sm text-steel">
                    {subscription.plan.name} • {formatStatus(subscription.status)} • {formatBillingAccessState(subscription.accessState)}
                  </p>
                  <p className="mt-2 text-sm text-steel">
                    Period end: {formatDate(subscription.currentPeriodEnd)}
                  </p>
                  <p className="mt-1 text-sm text-steel">
                    Stripe customer: {subscription.stripeCustomerId ?? "Not linked"}
                  </p>
                  {subscription.lastPaymentFailureMessage ? (
                    <p className="mt-2 text-sm text-danger">
                      {subscription.lastPaymentFailureMessage}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-ink">Admin-safe plan mappings</h2>
          <p className="mt-2 text-sm text-steel">
            Canonical internal mapping between application plan codes, Stripe lookup keys, env var bindings, and feature entitlements.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {adminSafePlanMappings.map((plan) => (
              <div key={plan.code} className="rounded-2xl border border-line p-4">
                <p className="font-medium text-ink">{plan.name}</p>
                <p className="mt-1 text-sm text-steel">
                  {plan.code} • {plan.billingInterval} • {plan.priceCents / 100} USD
                </p>
                <p className="mt-2 text-sm text-steel">
                  Lookup key: {plan.billingLookupKey} • Env: {plan.stripeEnvVar}
                </p>
                <p className="mt-2 text-sm text-steel">
                  Limits: {plan.usageLimits.activeAssessments ?? "unlimited"} assessments • {plan.usageLimits.seats ?? "unlimited"} seats • {plan.usageLimits.frameworks ?? "unlimited"} frameworks
                </p>
                <p className="mt-2 text-sm text-steel">
                  Support tier: {plan.adminMetadata.supportTier} • Target buyer: {plan.adminMetadata.targetBuyer}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold text-ink">Assessments</h2>
            <div className="mt-4 space-y-3">
              {assessments.map((assessment) => (
                <div key={assessment.id} className="rounded-2xl border border-line p-4">
                  <p className="font-medium text-ink">{assessment.name}</p>
                  <p className="mt-1 text-sm text-steel">
                    {assessment.organization.name} · {formatStatus(assessment.status)}
                  </p>
                  <p className="mt-2 text-sm text-steel">
                    Submitted: {formatDate(assessment.submittedAt)}
                  </p>
                  <p className="mt-1 text-sm text-steel">
                    Completed: {formatDate(assessment.completedAt)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink">Reports</h2>
            <div className="mt-4 space-y-3">
              {reports.map((report) => (
                <div key={report.id} className="rounded-2xl border border-line p-4">
                  <p className="font-medium text-ink">{report.title}</p>
                  <p className="mt-1 text-sm text-steel">
                    {report.organization.name} · {formatStatus(report.status)}
                  </p>
                  <p className="mt-2 text-sm text-steel">
                    Assessment: {report.assessment.name}
                  </p>
                  <p className="mt-1 text-sm text-steel">
                    Delivered: {formatDate(report.deliveredAt)}
                  </p>
                  <p className="mt-1 text-sm text-steel">
                    Viewed: {formatDate(report.viewedAt)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold text-ink">Audit logs</h2>
            <div className="mt-4 space-y-3">
              {auditLogs.map((log) => (
                <div key={log.id} className="rounded-2xl border border-line p-4">
                  <p className="font-medium text-ink">{log.action}</p>
                  <p className="mt-1 text-sm text-steel">
                    {formatStatus(log.actorType)} · {log.entityType} · {log.entityId}
                  </p>
                  <p className="mt-2 text-sm text-steel">
                    Actor: {log.actorLabel ?? log.user?.email ?? "system"} · Org: {log.organization?.name ?? "n/a"}
                  </p>
                  <p className="mt-1 text-sm text-steel">
                    {formatDateTime(log.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink">Recent domain events</h2>
            <div className="mt-4 space-y-3">
              {domainEvents.map((event) => (
                <div key={event.id} className="rounded-2xl border border-line p-4">
                  <p className="font-medium text-ink">{event.type}</p>
                  <p className="mt-1 text-sm text-steel">
                    {formatStatus(event.status)} · {event.aggregateType} · {event.aggregateId}
                  </p>
                  <p className="mt-2 text-sm text-steel">
                    Org: {event.orgId ?? "n/a"} · User: {event.userId ?? "n/a"}
                  </p>
                  <p className="mt-1 text-sm text-steel">
                    Occurred {formatDate(event.occurredAt)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink">Failed webhook deliveries</h2>
            <div className="mt-4 space-y-3">
              {webhookDeliveries.map((delivery) => (
                <div key={delivery.id} className="rounded-2xl border border-line p-4">
                  <p className="font-medium text-ink">{delivery.destination}</p>
                  <p className="mt-1 text-sm text-steel">
                    {formatStatus(delivery.status)} · Attempt {delivery.attemptCount}
                  </p>
                  <p className="mt-2 break-all text-sm text-steel">
                    {delivery.requestUrl}
                  </p>
                  <p className="mt-1 text-sm text-steel">
                    Event: {delivery.event.type}
                  </p>
                  <p className="mt-1 text-sm text-danger">
                    {delivery.lastError ?? "No error message captured"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-ink">Recent scheduled job runs</h2>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-mist text-steel">
                <tr>
                  <th className="px-4 py-3 font-medium">Job</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Started</th>
                  <th className="px-4 py-3 font-medium">Completed</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
                  <th className="px-4 py-3 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {scheduledJobRuns.map((run) => (
                  <tr key={run.id} className="border-t border-line">
                    <td className="px-4 py-3 align-top font-medium text-ink">
                      {run.jobName}
                    </td>
                    <td className="px-4 py-3 align-top text-steel">
                      {run.triggerSource}
                    </td>
                    <td className="px-4 py-3 align-top text-steel">
                      {run.status === ScheduledJobStatus.RUNNING
                        ? "Running"
                        : formatStatus(run.status)}
                    </td>
                    <td className="px-4 py-3 align-top text-steel">
                      {formatDateTime(run.startedAt)}
                    </td>
                    <td className="px-4 py-3 align-top text-steel">
                      {formatDateTime(run.completedAt)}
                    </td>
                    <td className="px-4 py-3 align-top text-steel">
                      {run.durationMs ? `${run.durationMs} ms` : "Not finished"}
                    </td>
                    <td className="px-4 py-3 align-top text-steel">
                      {run.errorMessage
                        ? run.errorMessage
                        : run.summaryJson
                          ? JSON.stringify(run.summaryJson).slice(0, 160)
                          : "No summary captured"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
