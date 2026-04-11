"use client";

import Link from "next/link";
import { ArrowRight, BadgeCheck, Check, CircleHelp, ShieldCheck, Sparkles } from "lucide-react";
import {
  PRICING_COPY_BLOCKS,
  PRICING_FAQ,
  PRICING_HERO,
  PRICING_TRUST_SIGNALS
} from "../lib/pricing-content";
import type { PricingCta, PricingPageData, PricingPlanCard } from "../lib/pricing";

function renderCta(cta: PricingCta) {
  if (cta.kind === "link") {
    return (
      <Link
        href={cta.href as never}
        className="inline-flex w-full items-center justify-center rounded-full bg-[#0f766e] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#115e59]"
      >
        {cta.label}
      </Link>
    );
  }

  if (cta.kind === "portal") {
    return (
      <form action={cta.action} method="post">
        <button
          type="submit"
          className="inline-flex w-full items-center justify-center rounded-full bg-[#0f766e] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#115e59]"
        >
          {cta.label}
        </button>
      </form>
    );
  }

  return (
    <form action={cta.action} method="post">
      <input type="hidden" name="planCode" value={cta.planCode} />
      <button
        type="submit"
        disabled={cta.disabled}
        className="inline-flex w-full items-center justify-center rounded-full bg-[#0f766e] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#115e59] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {cta.label}
      </button>
    </form>
  );
}

function PricingCard({
  plan,
  cta,
  currentPlanCode
}: {
  plan: PricingPlanCard;
  cta: PricingCta;
  currentPlanCode: string | null;
}) {
  const isCurrentPlan = currentPlanCode === plan.code;

  return (
    <article
      className={`relative flex h-full flex-col rounded-[28px] border p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] ${
        plan.isRecommended
          ? "border-[#0f766e] bg-white"
          : "border-white/80 bg-white/92"
      }`}
    >
      {plan.recommendationLabel ? (
        <div className="absolute -top-3 left-6 inline-flex items-center rounded-full bg-[#0f766e] px-3 py-1 text-xs font-semibold text-white">
          {plan.recommendationLabel}
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#0f766e]">
            {plan.code}
          </p>
          <h3 className="mt-3 text-2xl font-semibold text-[#0f172a]">{plan.name}</h3>
        </div>
        {isCurrentPlan ? (
          <span className="rounded-full border border-[#99f6e4] bg-[#ecfeff] px-3 py-1 text-xs font-semibold text-[#115e59]">
            Current plan
          </span>
        ) : null}
      </div>

      <p className="mt-4 text-sm leading-7 text-[#475569]">{plan.publicDescription}</p>
      <p className="mt-4 text-sm leading-7 text-[#0f172a]">{plan.headline}</p>

      <div className="mt-6">
        <div className="flex items-end gap-2">
          <span className="text-4xl font-semibold tracking-tight text-[#0f172a]">
            {plan.priceLabel}
          </span>
        </div>
        <p className="mt-2 text-sm text-[#0f766e]">
          Workflow: `{plan.workflowCode}` | Report template: `{plan.reportTemplate}`
        </p>
      </div>

      <ul className="mt-6 space-y-3 text-sm text-[#334155]">
        {plan.highlights.map((highlight) => (
          <li key={highlight} className="flex items-start gap-3">
            <Check className="mt-0.5 h-4 w-4 text-[#0f766e]" />
            {highlight}
          </li>
        ))}
      </ul>

      <div className="mt-8">{renderCta(cta)}</div>
      <p className="mt-3 text-sm leading-6 text-[#64748b]">{cta.helperText}</p>
      <p className="mt-3 text-xs uppercase tracking-[0.2em] text-[#94a3b8]">
        {plan.billingMotion === "contact_sales"
          ? "Sales-led provisioning"
          : "Stripe hosted checkout"}
      </p>
    </article>
  );
}

export function PricingPageClient({ data }: { data: PricingPageData }) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(153,246,228,0.45),transparent_28%),linear-gradient(180deg,#f7fbfc_0%,#edf5f7_100%)]">
      <section className="mx-auto max-w-7xl px-6 py-8 md:py-12">
        <div className="rounded-[32px] border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(241,245,249,0.92))] p-6 shadow-[0_24px_90px_rgba(15,23,42,0.08)] md:p-10">
          <div className="flex flex-col gap-6 border-b border-[#dbe7ea] pb-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#0f766e]">
                {PRICING_HERO.eyebrow}
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-[#0f172a] md:text-5xl">
                {PRICING_HERO.title}
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-[#475569]">
                {PRICING_HERO.body}
              </p>
            </div>

            <div className="rounded-[28px] border border-[#d5e5e8] bg-white/90 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#64748b]">
                Pricing state
              </p>
              <p className="mt-3 text-lg font-semibold text-[#0f172a]">
                {data.sessionState.isAuthenticated
                  ? data.sessionState.currentPlanName
                    ? `${data.sessionState.organizationName} is aligned to ${data.sessionState.currentPlanName}`
                    : data.sessionState.onboardingRequired
                      ? "Signed in and ready to choose a launch plan"
                      : "Signed in without a synced commercial plan yet"
                  : "Not signed in"}
              </p>
              <p className="mt-2 text-sm leading-7 text-[#64748b]">
                Commercial pricing is normalized to Starter, Scale, and Enterprise while the backend safely maps those choices to internal billing records and workflow routing.
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {PRICING_HERO.trustBadges.map((badge) => (
              <span
                key={badge}
                className="rounded-full border border-[#d6ece7] bg-white px-4 py-2 text-sm font-medium text-[#0f172a]"
              >
                {badge}
              </span>
            ))}
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {data.plans.map((plan) => (
              <PricingCard
                key={plan.code}
                plan={plan}
                cta={data.ctasByPlanCode[plan.code]}
                currentPlanCode={data.sessionState.currentPlanCode}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-6">
        <div className="grid gap-5 lg:grid-cols-3">
          {PRICING_TRUST_SIGNALS.map((signal, index) => {
            const Icon = index === 0 ? ShieldCheck : index === 1 ? BadgeCheck : Sparkles;
            return (
              <article
                key={signal.title}
                className="rounded-[28px] border border-white/75 bg-white/90 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.05)]"
              >
                <Icon className="h-6 w-6 text-[#0f766e]" />
                <h2 className="mt-4 text-xl font-semibold text-[#0f172a]">
                  {signal.title}
                </h2>
                <p className="mt-3 text-sm leading-7 text-[#475569]">{signal.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-6">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[32px] border border-white/75 bg-white/92 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.05)]">
            <div className="flex items-center gap-3">
              <CircleHelp className="h-5 w-5 text-[#0f766e]" />
              <h2 className="text-2xl font-semibold text-[#0f172a]">Concise FAQ</h2>
            </div>
            <div className="mt-6 space-y-5">
              {PRICING_FAQ.map((item) => (
                <article key={item.question} className="rounded-2xl border border-[#e8eff1] bg-[#fbfdfd] p-5">
                  <h3 className="text-base font-semibold text-[#0f172a]">{item.question}</h3>
                  <p className="mt-3 text-sm leading-7 text-[#475569]">{item.answer}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-[#d6ebe7] bg-[linear-gradient(180deg,#0f172a_0%,#123042_100%)] p-6 text-white shadow-[0_20px_80px_rgba(15,23,42,0.16)]">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#99f6e4]">
              Secondary path
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">
              Need a guided rollout or enterprise path?
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              Use the sales-led route when rollout scope, security review, procurement timing, or stakeholder complexity needs real coordination.
            </p>
            <div className="mt-8 space-y-3">
              <Link
                href={"/contact-sales?intent=demo-request&source=pricing-page-secondary" as never}
                className="inline-flex w-full items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#0f172a]"
              >
                {PRICING_COPY_BLOCKS.secondaryCta}
              </Link>
              <a
                href={`mailto:${data.salesEmail}`}
                className="inline-flex w-full items-center justify-center rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white"
              >
                Email {data.salesEmail}
              </a>
            </div>
            <ul className="mt-8 space-y-3 text-sm text-slate-300">
              <li className="flex items-start gap-3">
                <ArrowRight className="mt-0.5 h-4 w-4 text-[#99f6e4]" />
                Canonical plan naming across marketing, app, and routing
              </li>
              <li className="flex items-start gap-3">
                <ArrowRight className="mt-0.5 h-4 w-4 text-[#99f6e4]" />
                Stripe checkout for Starter and Scale only
              </li>
              <li className="flex items-start gap-3">
                <ArrowRight className="mt-0.5 h-4 w-4 text-[#99f6e4]" />
                Sales-led Enterprise provisioning without hidden billing logic
              </li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
