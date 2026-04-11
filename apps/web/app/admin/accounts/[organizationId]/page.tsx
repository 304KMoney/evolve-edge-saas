import Link from "next/link";
import type { Route } from "next";
import { AuditActorType, prisma } from "@evolve-edge/db";
import { resyncBillingSubscriptionAction, retryCustomerRunAction } from "./actions";
import { getServerAuditRequestContext, writeAuditLog } from "../../../../lib/audit";
import {
  getSessionAuthorizationContext,
  requireAdminSession
} from "../../../../lib/auth";
import { hasPermission } from "../../../../lib/authorization";
import {
  formatAccountTimelineCategory,
  formatAccountTimelineSourceSystem,
  listCustomerAccountTimelineEvents
} from "../../../../lib/account-timeline";
import { formatBillingAccessState } from "../../../../lib/billing";
import { formatCustomerLifecycleStage } from "../../../../lib/customer-accounts";
import { getOrganizationCustomerRuns } from "../../../../lib/customer-runs";
import { getCustomerLifecycleSnapshot } from "../../../../lib/customer-lifecycle";
import {
  formatEngagementCommercialModel,
  formatEngagementOpportunityCategory,
  formatEngagementProgramType,
  getOrganizationEngagementSnapshot
} from "../../../../lib/engagement-programs";
import { getOrganizationReportPackages } from "../../../../lib/executive-delivery";
import { getOrganizationBillingManagementSnapshot } from "../../../../lib/billing-admin";
import { formatWorkflowRoutingDisposition } from "../../../../lib/workflow-routing";

export const dynamic = "force-dynamic";

type CustomerRunListItem = Awaited<ReturnType<typeof getOrganizationCustomerRuns>>[number];
type ReportPackageListItem = Awaited<ReturnType<typeof getOrganizationReportPackages>>[number];

function formatDate(date: Date | null | undefined) {
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
    return "None";
  }

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatJsonPreview(value: unknown) {
  if (value == null) {
    return "No payload";
  }

  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 220 ? `${serialized.slice(0, 217)}...` : serialized;
  } catch {
    return "Payload unavailable";
  }
}

export default async function AdminAccountDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{
    runRecovered?: string;
    runRecoveryError?: string;
    billingResynced?: string;
    billingResyncError?: string;
  }>;
}) {
  const session = await requireAdminSession();
  const canManageBillingSync = hasPermission(
    getSessionAuthorizationContext(session),
    "platform.jobs.manage"
  );
  const { organizationId } = await params;
  const query = await searchParams;
  const [lifecycle, customerRuns, reportPackages] = await Promise.all([
    getCustomerLifecycleSnapshot(organizationId),
    getOrganizationCustomerRuns(organizationId, { limit: 8 }),
    getOrganizationReportPackages(organizationId, { limit: 6 })
  ]);
  const billingAdminSnapshot = await getOrganizationBillingManagementSnapshot(
    organizationId
  );
  const engagementSnapshot = await getOrganizationEngagementSnapshot(organizationId, {
    synchronize: true,
    includeInternal: true
  });
  const customerAccount = await prisma.customerAccount.findUnique({
    where: { organizationId },
    select: {
      id: true,
      lifecycleStage: true,
      nextActionLabel: true,
      nextActionOwner: true,
      stageSource: true,
      founderReviewRequired: true,
      founderReviewReason: true
    }
  });
  const recentTimeline =
    customerAccount
      ? await listCustomerAccountTimelineEvents(customerAccount.id, {
          page: 1,
          pageSize: 8
        })
      : null;

  await writeAuditLog(prisma, {
    userId: session.user.id,
    actorType: AuditActorType.ADMIN,
    actorLabel: session.user.email,
    action: "admin.account_detail_viewed",
    entityType: "organization",
    entityId: organizationId,
    requestContext: await getServerAuditRequestContext()
  });

  if (!lifecycle) {
    return (
      <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
        <div className="rounded-[24px] border border-line bg-white p-8 shadow-panel">
          <p className="text-sm font-medium text-accent">Internal Admin</p>
          <h1 className="mt-2 text-3xl font-semibold text-ink">Account not found</h1>
          <p className="mt-3 text-sm text-steel">
            No organization matched the requested id.
          </p>
          <Link href="/admin" className="mt-6 inline-flex text-sm font-semibold text-accent">
            Back to admin
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
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              {lifecycle.organization.name}
            </h1>
            <p className="mt-2 text-sm text-steel">
              {lifecycle.organization.slug} | Growth stage{" "}
              {lifecycle.growthStage.replaceAll("_", " ")}
            </p>
          </div>
          <Link href="/admin" className="text-sm font-semibold text-accent">
            Back to admin
          </Link>
        </div>

        {query.runRecovered === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Recovery was queued successfully for the selected customer run.
          </div>
        ) : null}

        {query.runRecoveryError ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-danger">
            {query.runRecoveryError}
          </div>
        ) : null}

        {query.billingResynced === "1" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-accent">
            Billing state was resynchronized from Stripe successfully.
          </div>
        ) : null}

        {query.billingResyncError ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-danger">
            {query.billingResyncError}
          </div>
        ) : null}

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Plan</p>
            <p className="mt-2 text-xl font-semibold text-ink">{lifecycle.billing.planName}</p>
            <p className="mt-2 text-sm text-steel">
              {formatStatus(lifecycle.billing.subscriptionStatus)}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Access state</p>
            <p className="mt-2 text-xl font-semibold text-ink">
              {formatBillingAccessState(lifecycle.billing.accessState)}
            </p>
            <p className="mt-2 text-sm text-steel">{lifecycle.billing.workspaceMode}</p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Health score</p>
            <p className="mt-2 text-xl font-semibold text-ink">
              {lifecycle.retention.healthScore}
            </p>
            <p className="mt-2 text-sm text-steel">{lifecycle.retention.headline}</p>
          </div>
          <div className="rounded-2xl border border-line bg-mist p-5">
            <p className="text-sm text-steel">Activation</p>
            <p className="mt-2 text-xl font-semibold text-ink">
              {lifecycle.activation.completionPercent}%
            </p>
            <p className="mt-2 text-sm text-steel">
              {lifecycle.activation.activationMilestone.isReached
                ? "Activated"
                : "Not yet activated"}
            </p>
          </div>
        </div>

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-line p-5">
            <h2 className="text-lg font-semibold text-ink">Engagement programs</h2>
            <div className="mt-4 space-y-3">
              {engagementSnapshot.programs.length > 0 ? (
                engagementSnapshot.programs.map((program) => (
                  <div key={program.id} className="rounded-2xl bg-mist p-4">
                    <p className="font-medium text-ink">{program.name}</p>
                    <p className="mt-1 text-sm text-steel">
                      {formatEngagementProgramType(program.type)} |{" "}
                      {formatEngagementCommercialModel(program.commercialModel)} |{" "}
                      {formatStatus(program.status)}
                    </p>
                    <p className="mt-2 text-sm text-steel">
                      Started {formatDate(program.startedAt)} | Next review{" "}
                      {formatDate(program.nextReviewAt)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-mist p-4 text-sm text-steel">
                  No engagement programs have been initialized yet for this workspace.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-line p-5">
            <h2 className="text-lg font-semibold text-ink">Expansion opportunities</h2>
            <div className="mt-4 space-y-3">
              {engagementSnapshot.opportunities.length > 0 ? (
                engagementSnapshot.opportunities.map((opportunity) => (
                  <div key={opportunity.id} className="rounded-2xl bg-mist p-4">
                    <p className="font-medium text-ink">{opportunity.title}</p>
                    <p className="mt-1 text-sm text-steel">
                      {formatEngagementOpportunityCategory(opportunity.category)} |{" "}
                      {formatStatus(opportunity.status)}
                    </p>
                    <p className="mt-2 text-sm text-steel">{opportunity.summary}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-mist p-4 text-sm text-steel">
                  No internal expansion opportunities are currently tagged for this org.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-line p-5">
            <h2 className="text-lg font-semibold text-ink">Operator lifecycle</h2>
            <div className="mt-4 space-y-2 text-sm text-steel">
              <p>
                Stage:{" "}
                {customerAccount
                  ? formatCustomerLifecycleStage(customerAccount.lifecycleStage)
                  : "Not initialized"}
              </p>
              <p>
                Source: {customerAccount ? formatStatus(customerAccount.stageSource) : "None"}
              </p>
              <p>
                Next action: {customerAccount?.nextActionLabel ?? "None scheduled"} |{" "}
                {customerAccount?.nextActionOwner ?? "Unassigned"}
              </p>
              <p>
                Founder review:{" "}
                {customerAccount?.founderReviewRequired
                  ? customerAccount.founderReviewReason ?? "Required"
                  : "Not flagged"}
              </p>
            </div>
            {customerAccount ? (
              <Link
                href={`/admin/customers/${customerAccount.id}` as Route}
                className="mt-4 inline-flex text-sm font-semibold text-accent"
              >
                Open customer control plane
              </Link>
            ) : null}
          </div>

          <div className="rounded-2xl border border-line p-5">
            <h2 className="text-lg font-semibold text-ink">Support-safe summary</h2>
            <div className="mt-4 space-y-2 text-sm text-steel">
              <p>Owner: {lifecycle.organization.ownerEmail ?? "Not assigned"}</p>
              <p>
                Billing owner:{" "}
                {billingAdminSnapshot.organization.billingOwnerEmail ?? "Not assigned"}
              </p>
              <p>Created: {formatDate(lifecycle.organization.createdAt)}</p>
              <p>
                Onboarding completed: {formatDate(lifecycle.organization.onboardingCompletedAt)}
              </p>
              <p>Current period end: {formatDate(lifecycle.billing.currentPeriodEnd)}</p>
              <p>Trial end: {formatDate(lifecycle.billing.trialEndsAt)}</p>
              <p>
                Cancellation scheduled: {lifecycle.billing.cancelAtPeriodEnd ? "Yes" : "No"}
              </p>
              <p>Stripe customer: {lifecycle.billing.stripeCustomerId ?? "Not linked"}</p>
              <p>
                Stripe subscription: {lifecycle.billing.stripeSubscriptionId ?? "Not linked"}
              </p>
              {lifecycle.billing.lastPaymentFailureMessage ? (
                <p className="text-danger">
                  Payment issue: {lifecycle.billing.lastPaymentFailureMessage}
                </p>
              ) : null}
              <p>
                Billing admins:{" "}
                {billingAdminSnapshot.members
                  .filter((member) => member.isBillingAdmin)
                  .map((member) => member.email)
                  .join(", ") || "None"}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-line p-5">
            <h2 className="text-lg font-semibold text-ink">Recent account timeline</h2>
            <div className="mt-4 space-y-3">
              {recentTimeline?.items.length ? (
                recentTimeline.items.slice(0, 5).map((entry) => (
                  <div key={entry.id} className="rounded-2xl bg-mist p-4">
                    <p className="font-medium text-ink">{entry.title}</p>
                    <p className="mt-1 text-sm text-steel">
                      {formatAccountTimelineCategory(entry.category)} · {formatAccountTimelineSourceSystem(entry.sourceSystem)} · {formatDate(entry.occurredAt)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-mist p-4 text-sm text-steel">
                  No unified account timeline events have been recorded yet.
                </div>
              )}
            </div>
            {customerAccount ? (
              <Link
                href={`/admin/customers/${customerAccount.id}` as Route}
                className="mt-4 inline-flex text-sm font-semibold text-accent"
              >
                Open full account timeline
              </Link>
            ) : null}
          </div>

          <div className="rounded-2xl border border-line p-5">
            <h2 className="text-lg font-semibold text-ink">Lead and growth context</h2>
            <div className="mt-4 space-y-2 text-sm text-steel">
              <p>Lead present: {lifecycle.lead ? "Yes" : "No"}</p>
              {lifecycle.lead ? (
                <>
                  <p>Lead email: {lifecycle.lead.email}</p>
                  <p>Source: {lifecycle.lead.source}</p>
                  <p>Stage: {lifecycle.lead.stage.toLowerCase()}</p>
                  <p>Requested plan: {lifecycle.lead.requestedPlanCode ?? "Not set"}</p>
                  <p>Pricing context: {lifecycle.lead.pricingContext ?? "Not set"}</p>
                  <p>Submitted: {formatDate(lifecycle.lead.submittedAt)}</p>
                </>
              ) : null}
              <p>Product events (30d): {lifecycle.analytics.productEventsLast30Days}</p>
              <p>Upgrade completions (30d): {lifecycle.analytics.upgradeEventsLast30Days}</p>
              <p>Usage limit hits (30d): {lifecycle.analytics.usageLimitEventsLast30Days}</p>
            </div>
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-line p-5">
            <h2 className="text-lg font-semibold text-ink">Usage and activation</h2>
            <div className="mt-4 space-y-2 text-sm text-steel">
              <p>Members: {lifecycle.usage.activeMembersCount}</p>
              <p>Assessments: {lifecycle.usage.assessmentsCount}</p>
              <p>Active assessments: {lifecycle.usage.activeAssessmentsCount}</p>
              <p>Reports: {lifecycle.usage.reportsCount}</p>
              <p>Last activity: {formatDate(lifecycle.usage.lastActivityAt)}</p>
            </div>
            <div className="mt-5 space-y-3">
              {billingAdminSnapshot.usageQuotas.map((quota) => (
                <div key={quota.key} className="rounded-2xl bg-mist p-4">
                  <p className="font-medium text-ink">{quota.label}</p>
                  <p className="mt-1 text-sm text-steel">
                    Used {quota.used}
                    {quota.limit !== null ? ` of ${quota.limit}` : " with no plan cap"}
                  </p>
                  <p className="mt-2 text-sm text-steel">
                    Window {formatDate(quota.periodStart)} to {formatDate(quota.periodEnd)}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-5 space-y-3">
              {lifecycle.activation.steps.map((step: (typeof lifecycle.activation.steps)[number]) => (
                <div key={step.key} className="rounded-2xl bg-mist p-4">
                  <p className="font-medium text-ink">{step.label}</p>
                  <p className="mt-1 text-sm text-steel">
                    {step.completed ? "Completed" : "Pending"} · {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-line p-5">
            <h2 className="text-lg font-semibold text-ink">Retention posture</h2>
            <div className="mt-4 space-y-2 text-sm text-steel">
              <p>{lifecycle.retention.summary}</p>
              <p>
                Renewal: {lifecycle.retention.renewal.label} ·{" "}
                {lifecycle.retention.renewal.dateLabel ?? "Not set"}
              </p>
              {lifecycle.retention.usageDeclineWarning ? (
                <p className="text-warning">
                  {lifecycle.retention.usageDeclineWarning.title}
                </p>
              ) : null}
            </div>
            <div className="mt-5 space-y-3">
              {lifecycle.retention.signals.map((signal: (typeof lifecycle.retention.signals)[number]) => (
                <div key={signal.label} className="rounded-2xl bg-mist p-4">
                  <p className="font-medium text-ink">{signal.label}</p>
                  <p className="mt-1 text-sm text-steel">
                    {signal.tone} · {signal.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-line p-5">
            <h2 className="text-lg font-semibold text-ink">Billing snapshot and sync health</h2>
            <div className="mt-4 space-y-2 text-sm text-steel">
              <p>
                Billing customer:{" "}
                {billingAdminSnapshot.billingCustomer.providerCustomerId ?? "Not linked"}
              </p>
              <p>
                Billing provider: {billingAdminSnapshot.billingCustomer.billingProvider ?? "None"}
              </p>
              <p>
                Subscription status: {formatStatus(billingAdminSnapshot.subscription.status)}
              </p>
              <p>
                Access state: {formatStatus(billingAdminSnapshot.subscription.accessState)}
              </p>
              <p>
                Retryable webhook failures:{" "}
                {billingAdminSnapshot.billingWebhookHealth.retryableFailureCount}
              </p>
              <p>
                Open billing failures: {billingAdminSnapshot.billingWebhookHealth.openFailureCount}
              </p>
              <p>
                Pending receipts: {billingAdminSnapshot.billingWebhookHealth.pendingCount} | In
                flight: {billingAdminSnapshot.billingWebhookHealth.processingCount}
              </p>
              <p>
                Last processed receipt:{" "}
                {formatDate(billingAdminSnapshot.billingWebhookHealth.lastProcessedAt)}
              </p>
              <p>
                Last failed receipt:{" "}
                {formatDate(billingAdminSnapshot.billingWebhookHealth.lastFailedAt)}
              </p>
              {billingAdminSnapshot.billingWebhookHealth.recommendedAction ? (
                <p className="text-warning">
                  {billingAdminSnapshot.billingWebhookHealth.recommendedAction}
                </p>
              ) : null}
            </div>
            {canManageBillingSync ? (
              <form action={resyncBillingSubscriptionAction} className="mt-5 space-y-3">
                <input type="hidden" name="organizationId" value={organizationId} />
                <textarea
                  name="reason"
                  rows={3}
                  placeholder="Why is a Stripe resync safe and necessary right now?"
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                />
                <input
                  type="text"
                  name="confirmation"
                  placeholder="Type RESYNC"
                  className="w-full rounded-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink"
                  >
                    Resync billing from Stripe
                  </button>
                  <Link
                    href={"/admin/replays" as Route}
                    className="text-sm font-semibold text-accent"
                  >
                    Open replay console
                  </Link>
                </div>
              </form>
            ) : (
              <div className="mt-5 rounded-2xl bg-mist p-4 text-sm text-steel">
                This workspace has billing sync diagnostics visible, but only internal operators with
                job-management permission can run a manual Stripe resync.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-line p-5">
            <h2 className="text-lg font-semibold text-ink">Commercial launch checks</h2>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl bg-mist p-4">
                <p className="font-medium text-ink">Trial to active</p>
                <p className="mt-1 text-sm text-steel">
                  Validate Stripe trial conversion, internal access state update, and timeline
                  continuity after the first successful invoice.
                </p>
              </div>
              <div className="rounded-2xl bg-mist p-4">
                <p className="font-medium text-ink">Failure to recovery</p>
                <p className="mt-1 text-sm text-steel">
                  Confirm failed invoice receipts, replay-safe recovery, and manual resync path all
                  leave auditable state.
                </p>
              </div>
              <div className="rounded-2xl bg-mist p-4">
                <p className="font-medium text-ink">Cancellation and quota enforcement</p>
                <p className="mt-1 text-sm text-steel">
                  Verify cancellation scheduling, ended access, and quota-exceeded usage signals are
                  visible before launch.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-line p-5">
            <h2 className="text-lg font-semibold text-ink">Entitlement debug</h2>
            <div className="mt-4 space-y-3">
              {billingAdminSnapshot.entitlementBreakdown.slice(0, 10).map((entry) => (
                <div key={`${entry.kind}:${entry.key}`} className="rounded-2xl bg-mist p-4">
                  <p className="font-medium text-ink">{entry.label}</p>
                  <p className="mt-1 text-sm text-steel">
                    {entry.kind === "feature"
                      ? entry.value
                        ? "Enabled"
                        : "Disabled"
                      : entry.value ?? "Unlimited"}
                  </p>
                  {entry.overrideSources.length > 0 ? (
                    <p className="mt-2 text-sm text-accent">
                      Override: {entry.overrideSources.join(", ")}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-line p-5">
            <h2 className="text-lg font-semibold text-ink">Active billing overrides</h2>
            <div className="mt-4 space-y-3">
              {billingAdminSnapshot.activeOverrides.length > 0 ? (
                billingAdminSnapshot.activeOverrides
                  .filter((override) => !override.isExpired)
                  .slice(0, 8)
                  .map((override) => (
                    <div key={override.id} className="rounded-2xl bg-mist p-4">
                      <p className="font-medium text-ink">{override.label}</p>
                      <p className="mt-1 text-sm text-steel">
                        {override.source} |{" "}
                        {override.enabled === null
                          ? `Limit ${override.limitOverride ?? "unset"}`
                          : override.enabled
                            ? "Enabled"
                            : "Disabled"}
                      </p>
                      <p className="mt-2 text-sm text-steel">
                        Expires {formatDate(override.expiresAt ?? override.createdAt)} |{" "}
                        {override.createdByEmail ?? "system"}
                      </p>
                    </div>
                  ))
              ) : (
                <div className="rounded-2xl bg-mist p-4 text-sm text-steel">
                  No active enterprise or manual overrides are currently applied.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-line p-5">
            <h2 className="text-lg font-semibold text-ink">Recent billing event log</h2>
            <div className="mt-4 space-y-3">
              {billingAdminSnapshot.recentBillingEventLogs.length > 0 ? (
                billingAdminSnapshot.recentBillingEventLogs.map((event) => (
                  <div key={event.id} className="rounded-2xl bg-mist p-4">
                    <p className="font-medium text-ink">{event.eventType}</p>
                    <p className="mt-1 text-sm text-steel">
                      {event.eventSource} | {formatDate(event.occurredAt)}
                    </p>
                    <p className="mt-2 text-sm text-steel">
                      {event.sourceReference ?? event.idempotencyKey ?? "No source reference"}
                    </p>
                    <p className="mt-2 break-all text-xs text-steel">
                      {formatJsonPreview(event.payload)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-mist p-4 text-sm text-steel">
                  No billing event log entries have been recorded for this workspace yet.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-line p-5">
            <h2 className="text-lg font-semibold text-ink">Usage event log</h2>
            <div className="mt-4 space-y-3">
              {billingAdminSnapshot.recentUsageEvents.length > 0 ? (
                billingAdminSnapshot.recentUsageEvents.map((event) => (
                  <div key={event.id} className="rounded-2xl bg-mist p-4">
                    <p className="font-medium text-ink">
                      {formatStatus(event.meterKey)} +{event.quantity}
                    </p>
                    <p className="mt-1 text-sm text-steel">
                      {event.source} | {formatDate(event.occurredAt)}
                    </p>
                    <p className="mt-2 text-sm text-steel">
                      {event.sourceRecordType ?? "source"} | {event.sourceRecordId ?? "n/a"}
                    </p>
                    <p className="mt-2 break-all text-xs text-steel">
                      {event.idempotencyKey}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-mist p-4 text-sm text-steel">
                  No usage events have been recorded for this workspace yet.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-line p-5">
          <h2 className="text-lg font-semibold text-ink">Workflow routing decisions</h2>
          <p className="mt-2 text-sm text-steel">
            App-owned routing snapshots explain which commercial state, entitlements, and quota posture selected each workflow path before execution started.
          </p>
          <div className="mt-5 space-y-3">
            {billingAdminSnapshot.recentWorkflowRoutingDecisions.length > 0 ? (
              billingAdminSnapshot.recentWorkflowRoutingDecisions.map((decision) => (
                <div key={decision.id} className="rounded-2xl bg-mist p-4">
                  <p className="font-medium text-ink">
                    {decision.routeKey} · {formatWorkflowRoutingDisposition(decision.disposition)}
                  </p>
                  <p className="mt-1 text-sm text-steel">
                    {decision.workflowFamily} · {decision.processingTier} · {formatDate(decision.createdAt)}
                  </p>
                  <p className="mt-2 text-sm text-steel">
                    {decision.sourceRecordType} {decision.sourceRecordId} · Plan {decision.planCode ?? "none"}
                  </p>
                  <p className="mt-2 break-all text-xs text-steel">
                    Reasons: {formatJsonPreview(decision.reasonCodes)}
                  </p>
                  <p className="mt-2 break-all text-xs text-steel">
                    Hints: {formatJsonPreview(decision.workflowHints)}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl bg-mist p-4 text-sm text-steel">
                No workflow routing snapshots have been recorded for this workspace yet.
              </div>
            )}
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-line p-5">
          <h2 className="text-lg font-semibold text-ink">Customer runs</h2>
          <p className="mt-2 text-sm text-steel">
            One durable operator view of intake, analysis, report generation, CRM sync, and delivery.
          </p>
          <div className="mt-5 space-y-4">
            {customerRuns.length > 0 ? (
              customerRuns.map((run: CustomerRunListItem) => (
                <div key={run.id} className="rounded-2xl bg-mist p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-medium text-ink">
                        {run.assessment?.name ?? "Assessment run"} · {formatStatus(run.status)}
                      </p>
                      <p className="mt-1 text-sm text-steel">
                        Current step: {formatStatus(run.currentStep)} · Started {formatDate(run.startedAt)}
                      </p>
                      <p className="mt-1 text-sm text-steel">
                        Report: {run.report?.title ?? "Not generated yet"} · Initiated by{" "}
                        {run.initiatedBy?.email ?? "system"}
                      </p>
                      {run.lastError ? (
                        <p className="mt-2 text-sm text-danger">{run.lastError}</p>
                      ) : null}
                      {run.recoveryHint ? (
                        <p className="mt-2 text-sm text-steel">{run.recoveryHint}</p>
                      ) : null}
                    </div>
                    {run.status === "ACTION_REQUIRED" ? (
                      <form action={retryCustomerRunAction} className="space-y-3 md:w-80">
                        <input type="hidden" name="runId" value={run.id} />
                        <input type="hidden" name="organizationId" value={organizationId} />
                        <textarea
                          name="reason"
                          rows={3}
                          placeholder="Why is this retry safe to perform now?"
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
                          Retry recovery
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl bg-mist p-4 text-sm text-steel">
                No customer runs have been recorded for this workspace yet.
              </div>
            )}
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-line p-5">
          <h2 className="text-lg font-semibold text-ink">Executive delivery packages</h2>
          <p className="mt-2 text-sm text-steel">
            Internal QA, founder review, version history, and briefing state for executive-ready client delivery.
          </p>
          <div className="mt-5 space-y-4">
            {reportPackages.length > 0 ? (
              reportPackages.map((reportPackage: ReportPackageListItem) => (
                <div key={reportPackage.id} className="rounded-2xl bg-mist p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-medium text-ink">
                        {reportPackage.title} · {reportPackage.assessment.name}
                      </p>
                      <p className="mt-1 text-sm text-steel">
                        Delivery {formatStatus(reportPackage.deliveryStatus)} · QA{" "}
                        {formatStatus(reportPackage.qaStatus)} · Version{" "}
                        {reportPackage.currentVersionNumber}
                      </p>
                      <p className="mt-1 text-sm text-steel">
                        Latest report: {reportPackage.latestReport?.title ?? "Not linked"} ·{" "}
                        {reportPackage.latestReport?.versionLabel ?? "Version pending"}
                      </p>
                      {reportPackage.requiresFounderReview ? (
                        <p className="mt-2 text-sm text-danger">
                          Founder review:{" "}
                          {reportPackage.founderReviewReason ?? "Required before delivery."}
                        </p>
                      ) : null}
                      <p className="mt-2 text-sm text-steel">
                        Sent: {formatDate(reportPackage.sentAt)} · Briefing booked:{" "}
                        {formatDate(reportPackage.briefingBookedAt)} · Briefing completed:{" "}
                        {formatDate(reportPackage.briefingCompletedAt)}
                      </p>
                    </div>
                    {reportPackage.latestReportId ? (
                      <Link
                        href={`/dashboard/reports/${reportPackage.latestReportId}` as Route}
                        className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink"
                      >
                        Open package
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl bg-mist p-4 text-sm text-steel">
                No executive delivery packages have been generated for this workspace yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
