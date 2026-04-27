import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, RefreshCcw, ShieldCheck } from "lucide-react";
import type { RetentionSnapshot } from "../lib/retention";
import { resolveBillingCadenceFromPlanCode } from "../lib/billing-cadence";

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function HealthBadge({ tone }: { tone: RetentionSnapshot["healthTone"] }) {
  const label =
    tone === "healthy"
      ? "Healthy"
      : tone === "watch"
        ? "Watch"
        : tone === "at_risk"
          ? "At risk"
          : tone === "critical"
            ? "Critical"
            : "Reactivation";

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
        tone === "healthy" && "bg-emerald-100 text-emerald-700",
        tone === "watch" && "bg-sky-100 text-sky-700",
        tone === "at_risk" && "bg-amber-100 text-amber-700",
        tone === "critical" && "bg-red-100 text-red-700",
        tone === "reactivation" && "bg-slate-200 text-slate-700"
      )}
    >
      {label}
    </span>
  );
}

function RetentionActionButton({
  action,
  primary = true
}: {
  action: NonNullable<RetentionSnapshot["saveOffer"]>["primaryAction"];
  primary?: boolean;
}) {
  const className = primary
    ? "inline-flex items-center justify-center rounded-full bg-[#0f172a] px-4 py-2 text-sm font-semibold text-white"
    : "inline-flex items-center justify-center rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink";
  const billingCadence =
    action.kind === "checkout" && action.planCode
      ? resolveBillingCadenceFromPlanCode(action.planCode)
      : null;

  if (action.kind === "link") {
    return (
      <Link href={action.href as Route} className={className}>
        {action.label}
        <ArrowRight className="ml-2 h-4 w-4" />
      </Link>
    );
  }

  return (
    <form action={action.action} method="post">
      {action.kind === "checkout" && action.planCode ? (
        <>
          <input type="hidden" name="planCode" value={action.planCode} />
          {billingCadence ? (
            <input type="hidden" name="billingCadence" value={billingCadence} />
          ) : null}
        </>
      ) : null}
      <input type="hidden" name="source" value={action.source} />
      <button type="submit" className={className}>
        {action.label}
        <ArrowRight className="ml-2 h-4 w-4" />
      </button>
    </form>
  );
}

export function RetentionOverview({
  retention,
  title = "Retention and renewal"
}: {
  retention: RetentionSnapshot;
  title?: string;
}) {
  return (
    <section className="rounded-[24px] border border-line bg-[linear-gradient(180deg,#f9fcfc_0%,#f2f8f7_100%)] p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-medium text-[#0f766e]">{title}</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">{retention.headline}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-steel">{retention.summary}</p>
        </div>
        <div className="rounded-[20px] border border-[#d7eaeb] bg-white px-5 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-steel">Health score</p>
          <div className="mt-2 flex items-center gap-3">
            <p className="text-3xl font-semibold text-ink">{retention.healthScore}</p>
            <HealthBadge tone={retention.healthTone} />
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-[22px] border border-line bg-white p-5">
          <div className="flex items-center gap-2">
            <RefreshCcw className="h-4 w-4 text-[#0f766e]" />
            <p className="text-sm font-semibold text-ink">Renewal visibility</p>
          </div>
          <p className="mt-4 text-3xl font-semibold text-ink">
            {retention.renewal.dateLabel ?? retention.renewal.label}
          </p>
          <p className="mt-2 text-sm text-steel">
            {retention.renewal.daysRemaining !== null
              ? `${retention.renewal.label} in ${retention.renewal.daysRemaining} day${retention.renewal.daysRemaining === 1 ? "" : "s"}`
              : retention.renewal.label}
          </p>
          <p className="mt-3 text-sm leading-7 text-steel">{retention.renewal.helperText}</p>
        </article>

        <article className="rounded-[22px] border border-line bg-white p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#0f766e]" />
            <p className="text-sm font-semibold text-ink">Health signals</p>
          </div>
          <div className="mt-4 space-y-3">
            {retention.signals.map((signal) => (
              <div key={signal.label} className="rounded-2xl bg-mist p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">{signal.label}</p>
                  <span
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]",
                      signal.tone === "positive" && "bg-emerald-100 text-emerald-700",
                      signal.tone === "warning" && "bg-amber-100 text-amber-700",
                      signal.tone === "danger" && "bg-red-100 text-red-700"
                    )}
                  >
                    {signal.tone}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-steel">{signal.detail}</p>
              </div>
            ))}
          </div>
        </article>
      </div>

      {retention.usageDeclineWarning ? (
        <div className="mt-5 rounded-[22px] border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-800">
            {retention.usageDeclineWarning.title}
          </p>
          <p className="mt-2 text-sm leading-7 text-amber-900/80">
            {retention.usageDeclineWarning.body}
          </p>
        </div>
      ) : null}

      {retention.reactivationPrompt ? (
        <div className="mt-5 rounded-[22px] border border-sky-200 bg-sky-50 p-5">
          <p className="text-sm font-semibold text-sky-800">{retention.reactivationPrompt.title}</p>
          <p className="mt-2 text-sm leading-7 text-sky-900/80">{retention.reactivationPrompt.body}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <RetentionActionButton action={retention.reactivationPrompt.action} />
          </div>
          {retention.reactivationPrompt.action.helperText ? (
            <p className="mt-3 text-sm text-sky-900/70">
              {retention.reactivationPrompt.action.helperText}
            </p>
          ) : null}
        </div>
      ) : null}

      {retention.saveOffer ? (
        <div className="mt-5 rounded-[22px] border border-[#d7eaeb] bg-white p-5">
          <p className="text-sm font-semibold text-ink">{retention.saveOffer.title}</p>
          <p className="mt-2 text-sm leading-7 text-steel">{retention.saveOffer.body}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <RetentionActionButton action={retention.saveOffer.primaryAction} />
            {retention.saveOffer.secondaryAction ? (
              <RetentionActionButton
                action={retention.saveOffer.secondaryAction}
                primary={false}
              />
            ) : null}
          </div>
          <div className="mt-3 space-y-1 text-sm text-steel">
            {retention.saveOffer.primaryAction.helperText ? (
              <p>{retention.saveOffer.primaryAction.helperText}</p>
            ) : null}
            {retention.saveOffer.secondaryAction?.helperText ? (
              <p>{retention.saveOffer.secondaryAction.helperText}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {retention.valueReminders.length > 0 ? (
        <div className="mt-5 rounded-[22px] border border-line bg-white p-5">
          <p className="text-sm font-semibold text-ink">Value already created</p>
          <ul className="mt-4 space-y-2">
            {retention.valueReminders.map((reminder) => (
              <li key={reminder} className="text-sm leading-7 text-steel">
                {reminder}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
