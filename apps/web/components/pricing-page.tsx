"use client";

import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  CircleHelp,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import {
  PRICING_COPY_BLOCKS,
  PRICING_FAQ,
  PRICING_HERO,
  PRICING_TRUST_SIGNALS
} from "../lib/pricing-content";
import type { PricingCta, PricingPageData, PricingPlanCard } from "../lib/pricing";

function getCustomerReadyHelperText(plan: PricingPlanCard, cta: PricingCta) {
  if (cta.kind === "portal") {
    return "Review your current engagement and billing details in one place.";
  }

  if (plan.billingMotion === "contact_sales") {
    return "Talk with our team to align scope, stakeholders, and rollout timing.";
  }

  if (cta.kind === "checkout") {
    return "Start with the plan that matches your current scope and urgency.";
  }

  return "Choose the path that best fits your team and we will guide the next step.";
}

function getDisplayedPriceLabel(plan: PricingPlanCard) {
  switch (plan.code) {
    case "starter":
      return "$10,000";
    case "scale":
      return "$50,000";
    case "enterprise":
      return "$85,000+";
    default:
      return plan.priceLabel;
  }
}

function renderCta(cta: PricingCta) {
  const ctaClassName =
    "inline-flex w-full items-center justify-center rounded-full bg-[linear-gradient(135deg,#1cc7d8,#6fe8f1)] px-5 py-3 text-sm font-semibold text-[#05111d] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50";

  if (cta.kind === "link") {
    return (
      <Link href={cta.href as never} className={ctaClassName}>
        {cta.label}
      </Link>
    );
  }

  if (cta.kind === "portal") {
    return (
      <form action={cta.action} method="post">
        <button type="submit" className={ctaClassName}>
          {cta.label}
        </button>
      </form>
    );
  }

  return (
    <form action={cta.action} method="post">
      <input type="hidden" name="planCode" value={cta.planCode} />
      <button type="submit" disabled={cta.disabled} className={ctaClassName}>
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
      className={`relative flex h-full flex-col rounded-[30px] border p-6 shadow-panel ${
        plan.isRecommended
          ? "border-accent/[0.5] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(238,249,255,0.96))]"
          : "border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(243,249,255,0.86))]"
      }`}
    >
      {plan.recommendationLabel ? (
        <div className="absolute -top-3 left-6 inline-flex items-center rounded-full bg-[linear-gradient(135deg,#1cc7d8,#52deea)] px-3 py-1 text-xs font-semibold text-[#04101a]">
          {plan.recommendationLabel}
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent">
            {plan.code}
          </p>
          <h3 className="mt-3 text-2xl font-semibold text-ink">{plan.name}</h3>
        </div>
        {isCurrentPlan ? (
          <span className="rounded-full border border-accent/[0.25] bg-accentSoft px-3 py-1 text-xs font-semibold text-[#0f5f7d]">
            Current plan
          </span>
        ) : null}
      </div>

      <p className="mt-4 text-sm leading-7 text-steel">{plan.publicDescription}</p>
      <p className="mt-4 text-sm leading-7 text-ink">{plan.headline}</p>

      <div className="mt-6">
        <div className="flex items-end gap-2">
          <span className="text-4xl font-semibold tracking-tight text-ink">
            {getDisplayedPriceLabel(plan)}
          </span>
        </div>
        <p className="mt-2 text-sm text-accent">
          {plan.billingMotion === "contact_sales"
            ? "Sales-led engagement"
            : "Direct plan selection"}
        </p>
      </div>

      <ul className="mt-6 space-y-3 text-sm text-[#334155]">
        {plan.highlights.map((highlight) => (
          <li key={highlight} className="flex items-start gap-3">
            <Check className="mt-0.5 h-4 w-4 text-accent" />
            {highlight}
          </li>
        ))}
      </ul>

      <div className="mt-8">{renderCta(cta)}</div>
      <p className="mt-3 text-sm leading-6 text-steel">{getCustomerReadyHelperText(plan, cta)}</p>
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
    <main className="grid gap-6">
      <section className="content-surface p-6 md:p-10">
        <div className="flex flex-col gap-6 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-accent">
              {PRICING_HERO.eyebrow}
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-ink md:text-5xl">
              {PRICING_HERO.title}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-steel">
              {PRICING_HERO.body}
            </p>
          </div>

          <div className="brand-surface max-w-md p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8debf4]">
              Pricing state
            </p>
            <p className="mt-3 text-lg font-semibold text-white">
              {data.sessionState.isAuthenticated
                ? data.sessionState.currentPlanName
                  ? `${data.sessionState.organizationName} is aligned to ${data.sessionState.currentPlanName}`
                  : data.sessionState.onboardingRequired
                    ? "Signed in and ready to choose a launch plan"
                    : "Signed in without a synced commercial plan yet"
                : "Not signed in"}
            </p>
            <p className="mt-2 text-sm leading-7 text-white/[0.68]">
              Choose the engagement that matches your current level of risk, complexity, and stakeholder scrutiny.
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {PRICING_HERO.trustBadges.map((badge) => (
            <span
              key={badge}
              className="rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink"
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
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {PRICING_TRUST_SIGNALS.map((signal, index) => {
          const Icon = index === 0 ? ShieldCheck : index === 1 ? BadgeCheck : Sparkles;

          return (
            <article key={signal.title} className="content-surface-muted p-6">
              <Icon className="h-6 w-6 text-accent" />
              <h2 className="mt-4 text-xl font-semibold text-ink">{signal.title}</h2>
              <p className="mt-3 text-sm leading-7 text-steel">{signal.body}</p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="content-surface p-6">
          <div className="flex items-center gap-3">
            <CircleHelp className="h-5 w-5 text-accent" />
            <h2 className="text-2xl font-semibold text-ink">Concise FAQ</h2>
          </div>
          <div className="mt-6 space-y-5">
            {PRICING_FAQ.map((item) => (
              <article key={item.question} className="content-surface-muted p-5">
                <h3 className="text-base font-semibold text-ink">{item.question}</h3>
                <p className="mt-3 text-sm leading-7 text-steel">{item.answer}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="brand-surface p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#99f6e4]">
            Secondary path
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight">
            Need a guided rollout or enterprise path?
          </h2>
          <p className="mt-4 text-sm leading-7 text-slate-300">
            Use the sales-led route when rollout scope, security review, procurement timing,
            or stakeholder complexity needs real coordination.
          </p>
          <div className="mt-8 space-y-3">
            <Link
              href={"/contact?intent=enterprise-plan&source=pricing-page-secondary" as never}
              className="inline-flex w-full items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink"
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
              Executive-ready reporting and remediation guidance
            </li>
            <li className="flex items-start gap-3">
              <ArrowRight className="mt-0.5 h-4 w-4 text-[#99f6e4]" />
              Starter and Scale available through direct plan selection
            </li>
            <li className="flex items-start gap-3">
              <ArrowRight className="mt-0.5 h-4 w-4 text-[#99f6e4]" />
              Enterprise path for complex rollout and stakeholder alignment
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}
