import Link from "next/link";
import {
  AuditActorType,
  CustomerAccountTimelineCategory,
  CustomerAccountTimelineSeverity,
  CustomerAccountTimelineSourceSystem,
  CustomerAccountTimelineVisibility,
  CustomerLifecycleStage,
  prisma
} from "@evolve-edge/db";
import type { Route } from "next";
import {
  addCustomerAccountNoteAction,
  resendCustomerAccountStatusSyncAction,
  resyncCustomerAccountAction,
  retryCustomerRunFromCustomerAccountAction,
  updateCustomerAccountFounderReviewAction,
  updateCustomerAccountNextActionAction,
  updateCustomerAccountStageAction
} from "./actions";
import { getServerAuditRequestContext, writeAuditLog } from "../../../../lib/audit";
import { requireAdminSession } from "../../../../lib/auth";
import {
  ACCOUNT_TIMELINE_CATEGORIES,
  ACCOUNT_TIMELINE_SEVERITIES,
  ACCOUNT_TIMELINE_SOURCE_SYSTEMS,
  ACCOUNT_TIMELINE_VISIBILITIES,
  formatAccountTimelineCategory,
  formatAccountTimelineSeverity,
  formatAccountTimelineSourceSystem,
  formatAccountTimelineVisibility,
  listCustomerAccountTimelineEvents
} from "../../../../lib/account-timeline";
import {
  formatCustomerLifecycleStage,
  getCustomerAccountDetailSnapshot
} from "../../../../lib/customer-accounts";

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
    return "Not set";
  }

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseOptionalDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseEnumValue<TValue extends string>(
  value: string | undefined,
  allowedValues: readonly TValue[]
) {
  return value && allowedValues.includes(value as TValue) ? (value as TValue) : null;
}

function getTimelineRecordHref(input: {
  organizationId?: string | null;
  sourceRecordType?: string | null;
  sourceRecordId?: string | null;
}) {
  if (!input.sourceRecordType || !input.sourceRecordId) {
    return null;
  }

  switch (input.sourceRecordType) {
    case "organization":
      return (`/admin/accounts/${input.sourceRecordId}` as Route);
    case "report":
      return (`/dashboard/reports/${input.sourceRecordId}` as Route);
    case "assessment":
      return (`/dashboard/assessments/${input.sourceRecordId}` as Route);
    default:
      return null;
  }
}

export default async function AdminCustomerAccountPage({
  params,
  searchParams
}: {
  params: Promise<{ customerAccountId: string }>;
  searchParams: Promise<{
    stageUpdated?: string;
    taskUpdated?: string;
    noteAdded?: string;
    resynced?: string;
    crmSyncQueued?: string;
    runRecovered?: string;
    runRecoveryError?: string;
    founderReviewRequested?: string;
    founderReviewCleared?: string;
    timelineQ?: string;
    timelineCategory?: string;
    timelineSource?: string;
    timelineSeverity?: string;
    timelineVisibility?: string;
    timelineActor?: string;
    timelineFrom?: string;
    timelineTo?: string;
    timelinePage?: string;
  }>;
}) {
  const session = await requireAdminSession();
  const { customerAccountId } = await params;
  const query = await searchParams;
  const account = await getCustomerAccountDetailSnapshot(customerAccountId);
  const timelineFilters = {
    q: query.timelineQ ?? null,
    category: parseEnumValue(query.timelineCategory, ACCOUNT_TIMELINE_CATEGORIES),
    sourceSystem: parseEnumValue(query.timelineSource, ACCOUNT_TIMELINE_SOURCE_SYSTEMS),
    severity: parseEnumValue(query.timelineSeverity, ACCOUNT_TIMELINE_SEVERITIES),
    visibility: parseEnumValue(query.timelineVisibility, ACCOUNT_TIMELINE_VISIBILITIES),
    actor: query.timelineActor ?? null,
    from: parseOptionalDate(query.timelineFrom),
    to: parseOptionalDate(query.timelineTo),
    page: Math.max(Number.parseInt(query.timelinePage ?? "1", 10) || 1, 1),
    pageSize: 40
  } as const;
  const timeline = await listCustomerAccountTimelineEvents(customerAccountId, timelineFilters);
  const recentAuditLogs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entityType: "customerAccount", entityId: customerAccountId },
        ...(account?.organizationId
          ? [{ organizationId: account.organizationId }]
          : [])
      ]
    },
    orderBy: { createdAt: "desc" },
    take: 12
  });

  await writeAuditLog(prisma, {
    userId: session.user.id,
    actorType: AuditActorType.ADMIN,
    actorLabel: session.user.email,
    action: "admin.customer_account_viewed",
    entityType: "customerAccount",
    entityId: customerAccountId,
    requestContext: await getServerAuditRequestContext()
  });

  if (!account) {
    return (
      <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
        <div className="rounded-[24px] border border-line bg-white p-8 shadow-panel">
          <p className="text-sm font-medium text-accent">Internal Admin</p>
          <h1 className="mt-2 text-3xl font-semibold text-ink">Customer account not found</h1>
          <Link href="/admin" className="mt-6 inline-flex text-sm font-semibold text-accent">
            Back to admin
          </Link>
        </div>
      </main>
    );
  }

  const organizationHref = account.organizationId
    ? (`/admin/accounts/${account.organizationId}` as Route)
    : null;
  const buildTimelinePageHref = (page: number) => {
    const params = new URLSearchParams();
    if (query.timelineQ) params.set("timelineQ", query.timelineQ);
    if (timelineFilters.category) params.set("timelineCategory", timelineFilters.category);
    if (timelineFilters.sourceSystem) params.set("timelineSource", timelineFilters.sourceSystem);
    if (timelineFilters.severity) params.set("timelineSeverity", timelineFilters.severity);
    if (timelineFilters.visibility) params.set("timelineVisibility", timelineFilters.visibility);
    if (query.timelineActor) params.set("timelineActor", query.timelineActor);
    if (query.timelineFrom) params.set("timelineFrom", query.timelineFrom);
    if (query.timelineTo) params.set("timelineTo", query.timelineTo);
    params.set("timelinePage", `${page}`);
    return (`/admin/customers/${account.id}?${params.toString()}`) as Route;
  };

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <div className="rounded-[24px] border border-line bg-white p-8 shadow-panel">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-medium text-accent">Internal Admin</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              {account.companyName ?? account.primaryContactEmail}
            </h1>
            <p className="mt-2 text-sm text-steel">
              {account.primaryContactEmail} | {formatCustomerLifecycleStage(account.lifecycleStage)}
            </p>
          </div>
          <div className="flex flex-col gap-2 text-sm font-semibold">
            <Link href="/admin" className="text-accent">
              Back to admin
            </Link>
            {organizationHref ? (
              <Link href={organizationHref} className="text-accent">
                Open linked organization
              </Link>
            ) : null}
          </div>
        </div>

        {query.stageUpdated === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Lifecycle stage updated.
          </div>
        ) : null}
        {query.taskUpdated === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Next action updated.
          </div>
        ) : null}
        {query.noteAdded === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Note added to the account timeline.
          </div>
        ) : null}
        {query.resynced === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Customer account resynced from product state.
          </div>
        ) : null}
        {query.crmSyncQueued === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Lifecycle status was re-published for CRM and automation.
          </div>
        ) : null}
        {query.founderReviewRequested === "1" ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-ink">
            Founder review has been flagged for this account.
          </div>
        ) : null}
        {query.founderReviewCleared === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Founder review was cleared for this account.
          </div>
        ) : null}
        {query.runRecovered === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Workflow recovery was queued for the selected customer run.
          </div>
        ) : null}
        {query.runRecoveryError ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-danger">
            {query.runRecoveryError}
          </div>
        ) : null}

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Lifecycle stage</p>
            <p className="mt-2 text-xl font-semibold text-ink">
              {formatCustomerLifecycleStage(account.lifecycleStage)}
            </p>
            <p className="mt-2 text-sm text-steel">
              {formatStatus(account.stageSource)} · Updated {formatDateTime(account.stageUpdatedAt)}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Next action</p>
            <p className="mt-2 text-xl font-semibold text-ink">
              {account.nextActionLabel ?? "None scheduled"}
            </p>
            <p className="mt-2 text-sm text-steel">
              {account.nextActionOwner ?? "Unassigned"} · Due {formatDate(account.nextActionDueAt)}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">CRM references</p>
            <p className="mt-2 text-sm text-ink">
              Company {account.crmCompanyId ?? "Not linked"}
            </p>
            <p className="mt-2 text-sm text-steel">
              Deal {account.crmDealId ?? "Not linked"}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Operator flags</p>
            <p className="mt-2 text-xl font-semibold text-ink">
              {account.founderReviewRequired ? "Founder review required" : "No escalation"}
            </p>
            <p className="mt-2 text-sm text-steel">
              {account.founderReviewRequired
                ? account.founderReviewReason ?? "Reason pending"
                : account.organization?.name ?? "Pre-customer sales stage"}
            </p>
          </div>
        </div>

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-line p-5">
            <h2 className="text-lg font-semibold text-ink">Lifecycle controls</h2>
            <form action={updateCustomerAccountStageAction} className="mt-4 space-y-3">
              <input type="hidden" name="customerAccountId" value={account.id} />
              <select
                name="stage"
                defaultValue={account.lifecycleStage}
                className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
              >
                {Object.values(CustomerLifecycleStage).map((stage) => (
                  <option key={stage} value={stage}>
                    {formatCustomerLifecycleStage(stage)}
                  </option>
                ))}
              </select>
              <textarea
                name="reason"
                rows={3}
                placeholder="Why is this lifecycle update being made?"
                className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
              />
              <button
                type="submit"
                className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white"
              >
                Update lifecycle stage
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-line p-5">
            <h2 className="text-lg font-semibold text-ink">Next action</h2>
            <form action={updateCustomerAccountNextActionAction} className="mt-4 space-y-3">
              <input type="hidden" name="customerAccountId" value={account.id} />
              <input
                type="text"
                name="nextActionLabel"
                defaultValue={account.nextActionLabel ?? ""}
                placeholder="Schedule briefing with CTO"
                className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
              />
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  type="text"
                  name="nextActionOwner"
                  defaultValue={account.nextActionOwner ?? ""}
                  placeholder="Owner"
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                />
                <input
                  type="date"
                  name="nextActionDueAt"
                  defaultValue={
                    account.nextActionDueAt
                      ? account.nextActionDueAt.toISOString().slice(0, 10)
                      : ""
                  }
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                />
              </div>
              <button
                type="submit"
                className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink"
              >
                Save next action
              </button>
            </form>
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-line p-5">
            <h2 className="text-lg font-semibold text-ink">Operator note</h2>
            <form action={addCustomerAccountNoteAction} className="mt-4 space-y-3">
              <input type="hidden" name="customerAccountId" value={account.id} />
              <textarea
                name="note"
                rows={5}
                placeholder="Captured on call: prospect needs PCI DSS board-ready report before renewal cycle."
                className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
              />
              <button
                type="submit"
                className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink"
              >
                Add note
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-line p-5">
            <h2 className="text-lg font-semibold text-ink">Escalation and sync</h2>
            <form action={updateCustomerAccountFounderReviewAction} className="mt-4 space-y-3">
              <input type="hidden" name="customerAccountId" value={account.id} />
              <input
                type="hidden"
                name="founderReviewRequired"
                value={account.founderReviewRequired ? "false" : "true"}
              />
              <textarea
                name="founderReviewReason"
                rows={3}
                defaultValue={account.founderReviewRequired ? account.founderReviewReason ?? "" : ""}
                placeholder="Why should the founder review this account or delivery package?"
                className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
              />
              <button
                type="submit"
                className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink"
              >
                {account.founderReviewRequired ? "Clear founder review" : "Flag founder review"}
              </button>
            </form>
            <div className="mt-6 space-y-3">
              <form action={resyncCustomerAccountAction} className="space-y-3">
                <input type="hidden" name="customerAccountId" value={account.id} />
                <button
                  type="submit"
                  className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink"
                >
                  Refresh lifecycle from product
                </button>
              </form>
              <form action={resendCustomerAccountStatusSyncAction} className="space-y-3">
                <input type="hidden" name="customerAccountId" value={account.id} />
                <textarea
                  name="reason"
                  rows={3}
                  placeholder="Why are you republishing CRM status for this account?"
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                />
                <button
                  type="submit"
                  className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink"
                >
                  Re-publish CRM status
                </button>
              </form>
            </div>
            <p className="mt-4 text-sm text-steel">
              These controls are read-model safe: they refresh lifecycle state inside the app and re-publish customer status to downstream CRM and automation systems without making HubSpot the source of truth.
            </p>
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-line p-5">
            <h2 className="text-lg font-semibold text-ink">Primary records</h2>
            <div className="mt-4 space-y-3 text-sm text-steel">
              <p>Lead submission: {account.primaryLeadSubmission?.id ?? "Not linked"}</p>
              <p>
                Lead stage:{" "}
                {account.primaryLeadSubmission
                  ? formatStatus(account.primaryLeadSubmission.stage)
                  : "Not set"}
              </p>
              <p>
                Provisioning request: {account.primaryProvisioningRequest?.id ?? "Not linked"}
              </p>
              <p>
                Provisioning status:{" "}
                {account.primaryProvisioningRequest
                  ? formatStatus(account.primaryProvisioningRequest.status)
                  : "Not set"}
              </p>
              <p>Won at: {formatDateTime(account.wonAt)}</p>
              <p>Briefing scheduled: {formatDateTime(account.briefingScheduledAt)}</p>
              <p>Monitoring active: {formatDateTime(account.monitoringActivatedAt)}</p>
              <p>Last system sync: {formatDateTime(account.lastSystemSyncedAt)}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-line p-5">
            <h2 className="text-lg font-semibold text-ink">Product delivery relationship</h2>
            <div className="mt-4 space-y-3 text-sm text-steel">
              <p>Assessments: {account.organization?.assessments.length ?? 0}</p>
              <p>Reports: {account.organization?.reports.length ?? 0}</p>
              <p>Customer runs: {account.organization?.customerRuns.length ?? 0}</p>
              {account.organization?.assessments[0] ? (
                <p>
                  Latest assessment: {account.organization.assessments[0].name} ·{" "}
                  {formatStatus(account.organization.assessments[0].status)}
                </p>
              ) : null}
              {account.organization?.reports[0] ? (
                <p>
                  Latest report: {account.organization.reports[0].title} ·{" "}
                  {formatStatus(account.organization.reports[0].status)}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-line p-5">
          <h2 className="text-lg font-semibold text-ink">Core workflow runs</h2>
          <div className="mt-4 space-y-4">
            {account.organization?.customerRuns.length ? (
              account.organization.customerRuns.map((run) => (
                <div key={run.id} className="rounded-2xl bg-mist p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-medium text-ink">
                        {run.assessment?.name ?? "Workflow run"} · {formatStatus(run.status)}
                      </p>
                      <p className="mt-1 text-sm text-steel">
                        Step {formatStatus(run.currentStep)} · Started {formatDateTime(run.startedAt)}
                      </p>
                      <p className="mt-1 text-sm text-steel">
                        Report {run.report?.title ?? "Not generated yet"} · Initiated by{" "}
                        {run.initiatedBy?.email ?? "system"}
                      </p>
                      {run.lastError ? (
                        <p className="mt-2 text-sm text-danger">{run.lastError}</p>
                      ) : null}
                      {run.recoveryHint ? (
                        <p className="mt-2 text-sm text-steel">{run.recoveryHint}</p>
                      ) : null}
                      <p className="mt-2 text-sm text-steel">
                        Retries: {run.retryCount} | Last recovery note {run.lastRecoveryNote ?? "None"}
                      </p>
                    </div>
                    {run.status === "ACTION_REQUIRED" ? (
                      <form action={retryCustomerRunFromCustomerAccountAction} className="space-y-3 md:w-80">
                        <input type="hidden" name="customerAccountId" value={account.id} />
                        <input
                          type="hidden"
                          name="organizationId"
                          value={account.organizationId ?? account.organization?.id ?? ""}
                        />
                        <input type="hidden" name="runId" value={run.id} />
                        <textarea
                          name="reason"
                          rows={3}
                          placeholder="Why is this recovery safe to retry now?"
                          className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                        />
                        <input
                          type="text"
                          name="confirmation"
                          placeholder="Type RETRY"
                          className="w-full rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                        />
                        <button
                          type="submit"
                          className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink"
                        >
                          Retry workflow
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl bg-mist p-4 text-sm text-steel">
                No product workflow runs are linked yet.
              </div>
            )}
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-line p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink">Unified account timeline</h2>
              <p className="mt-2 text-sm text-steel">
                High-signal internal history across lead capture, billing, onboarding, delivery, monitoring, support, and recovery.
              </p>
            </div>
            <p className="text-sm text-steel">
              {timeline.totalCount} events · Page {timeline.page} of {timeline.totalPages}
            </p>
          </div>
          <form method="get" className="mt-5 grid gap-3 rounded-2xl bg-mist p-4 md:grid-cols-4">
            <input
              type="text"
              name="timelineQ"
              defaultValue={query.timelineQ ?? ""}
              placeholder="Search timeline"
              className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
            />
            <input
              type="text"
              name="timelineActor"
              defaultValue={query.timelineActor ?? ""}
              placeholder="Actor"
              className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
            />
            <select
              name="timelineCategory"
              defaultValue={timelineFilters.category ?? ""}
              className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
            >
              <option value="">All categories</option>
              {ACCOUNT_TIMELINE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {formatAccountTimelineCategory(category)}
                </option>
              ))}
            </select>
            <select
              name="timelineSource"
              defaultValue={timelineFilters.sourceSystem ?? ""}
              className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
            >
              <option value="">All sources</option>
              {ACCOUNT_TIMELINE_SOURCE_SYSTEMS.map((sourceSystem) => (
                <option key={sourceSystem} value={sourceSystem}>
                  {formatAccountTimelineSourceSystem(sourceSystem)}
                </option>
              ))}
            </select>
            <select
              name="timelineSeverity"
              defaultValue={timelineFilters.severity ?? ""}
              className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
            >
              <option value="">All severities</option>
              {ACCOUNT_TIMELINE_SEVERITIES.map((severity) => (
                <option key={severity} value={severity}>
                  {formatAccountTimelineSeverity(severity)}
                </option>
              ))}
            </select>
            <select
              name="timelineVisibility"
              defaultValue={timelineFilters.visibility ?? ""}
              className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
            >
              <option value="">All visibility</option>
              {ACCOUNT_TIMELINE_VISIBILITIES.map((visibility) => (
                <option key={visibility} value={visibility}>
                  {formatAccountTimelineVisibility(visibility)}
                </option>
              ))}
            </select>
            <input
              type="date"
              name="timelineFrom"
              defaultValue={query.timelineFrom ?? ""}
              className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
            />
            <input
              type="date"
              name="timelineTo"
              defaultValue={query.timelineTo ?? ""}
              className="rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
            />
            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white"
              >
                Apply filters
              </button>
              <Link href={`/admin/customers/${account.id}` as Route} className="text-sm font-semibold text-accent">
                Reset
              </Link>
            </div>
          </form>
          <div className="mt-4 space-y-4">
            {timeline.items.length ? (
              timeline.items.map((entry) => {
                const recordHref = getTimelineRecordHref({
                  organizationId: account.organizationId,
                  sourceRecordType: entry.sourceRecordType,
                  sourceRecordId: entry.sourceRecordId
                });

                return (
                  <div key={entry.id} className="rounded-2xl bg-mist p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-ink">{entry.title}</p>
                          <span className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-steel">
                            {formatAccountTimelineCategory(entry.category)}
                          </span>
                          <span className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-steel">
                            {formatAccountTimelineSeverity(entry.severity)}
                          </span>
                          <span className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-steel">
                            {formatAccountTimelineSourceSystem(entry.sourceSystem)}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-steel">
                          {entry.eventCode ?? formatStatus(entry.entryType)} · {entry.actorLabel ?? entry.actorUser?.email ?? "system"} · {formatAccountTimelineVisibility(entry.visibility)}
                        </p>
                        {entry.body ? (
                          <p className="mt-2 text-sm text-steel">{entry.body}</p>
                        ) : null}
                        {(entry.sourceRecordType || entry.sourceRecordId) ? (
                          <div className="mt-2 text-sm text-steel">
                            <span>
                              Source {entry.sourceRecordType ?? "record"} {entry.sourceRecordId ?? ""}
                            </span>
                            {recordHref ? (
                              <Link href={recordHref} className="ml-2 font-semibold text-accent">
                                Open
                              </Link>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <p className="text-sm text-steel">{formatDateTime(entry.occurredAt)}</p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl bg-mist p-4 text-sm text-steel">
                No timeline entries match the current filter set.
              </div>
            )}
          </div>
          {timeline.totalPages > 1 ? (
            <div className="mt-5 flex items-center justify-between text-sm">
              {timeline.page > 1 ? (
                <Link href={buildTimelinePageHref(timeline.page - 1)} className="font-semibold text-accent">
                  Previous page
                </Link>
              ) : (
                <span className="text-steel">Previous page</span>
              )}
              {timeline.page < timeline.totalPages ? (
                <Link href={buildTimelinePageHref(timeline.page + 1)} className="font-semibold text-accent">
                  Next page
                </Link>
              ) : (
                <span className="text-steel">Next page</span>
              )}
            </div>
          ) : null}
        </section>

        <section className="mt-10 rounded-2xl border border-line p-5">
          <h2 className="text-lg font-semibold text-ink">Audit trail</h2>
          <div className="mt-4 space-y-4">
            {recentAuditLogs.length ? (
              recentAuditLogs.map((entry) => (
                <div key={entry.id} className="rounded-2xl bg-mist p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-medium text-ink">{entry.action}</p>
                      <p className="mt-1 text-sm text-steel">
                        {formatStatus(entry.actorType)} | {entry.actorLabel ?? "system"} |{" "}
                        {entry.entityType}
                      </p>
                    </div>
                    <p className="text-sm text-steel">{formatDateTime(entry.createdAt)}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl bg-mist p-4 text-sm text-steel">
                No audit log entries are linked to this account yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
