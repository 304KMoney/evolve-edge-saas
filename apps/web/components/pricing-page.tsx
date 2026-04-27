"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleHelp, ShieldCheck } from "lucide-react";
import type { PricingCta, PricingPageData } from "../lib/pricing";
import type { CanonicalPlanCode } from "../lib/commercial-catalog";
import {
  EXECUTIVE_PROOF,
  PRICING_FAQ,
  PRICING_HERO,
  PRICING_SUMMARY,
  PRICING_TRUST_SIGNALS,
  ROI_POINTS,
  SERVICE_OFFERS,
  WHO_ITS_FOR
} from "../lib/pricing-content";

function PricingPlanAction({
  cta
}: {
  cta: PricingCta;
}) {
  if (cta.kind === "link") {
    return (
      <Link
        href={cta.href as never}
        className="inline-flex w-full items-center justify-center rounded-full bg-[#0f172a] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#111f36]"
      >
        {cta.label}
      </Link>
    );
  }

  const isDisabled = cta.kind === "checkout" ? cta.disabled : false;

  return (
    <form action={cta.action} method="post" className="w-full">
      {cta.kind === "checkout" ? (
        <input type="hidden" name="planCode" value={cta.planCode} />
      ) : null}
      <button
        type="submit"
        disabled={isDisabled}
        className="inline-flex w-full items-center justify-center rounded-full bg-[#0f172a] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#111f36] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {cta.label}
      </button>
    </form>
  );
}

export function PricingPageClient({
  data,
  selectedPlanCode
}: {
  data: PricingPageData;
  selectedPlanCode?: CanonicalPlanCode | null;
}) {
  const readinessCallHref = data.marketingLinks.foundingRiskAuditCallHref;
  const readinessCallIsExternal = /^https?:\/\//.test(readinessCallHref);
  const highlightedPlanCode = selectedPlanCode ?? "starter";
  const highlightedPlan =
    data.plans.find((plan) => plan.code === highlightedPlanCode) ?? data.plans[0];
  const highlightedCta = data.ctasByPlanCode[highlightedPlan.code];

  return (
    <main className="grid gap-6">
      <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <div className="brand-surface p-8 md:p-12">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#8debf4]">
            {PRICING_HERO.eyebrow}
          </p>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight text-white md:text-5xl">
            {PRICING_HERO.title}
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-white/[0.74]">
            {PRICING_HERO.body}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3 text-sm text-white/[0.72]">
            {PRICING_HERO.trustBadges.map((badge) => (
              <span
                key={badge}
                className="rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 font-semibold text-white"
              >
                {badge}
              </span>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap gap-3">
            <div className="min-w-[220px]">
              <PricingPlanAction cta={highlightedCta} />
            </div>
            <Link
              href={"/contact-sales?intent=enterprise-plan&source=pricing-page" as never}
              className="inline-flex items-center rounded-full border border-white/14 bg-white/[0.06] px-5 py-3 text-sm font-semibold text-white"
            >
              Talk to Evolve Edge
            </Link>
          </div>
          <p className="mt-4 text-sm text-white/[0.72]">
            {highlightedPlan.name} is currently selected.
          </p>
        </div>

        <div className="content-surface p-8 md:p-12">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
            Pricing at a glance
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-ink">
            Premium packaging for advisory-led readiness work
          </h2>
          <p className="mt-4 text-sm leading-7 text-steel">
            Evolve Edge is positioned as a premium AI security, compliance, and executive risk visibility platform rather than a low-ticket checklist tool.
          </p>
          <div className="mt-8 space-y-4">
            {PRICING_SUMMARY.map((item) => (
              <div
                key={item.title}
                className="flex items-start gap-3 rounded-[20px] border border-line bg-[#f8fafc] px-5 py-4"
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-accent" />
                <div>
                  <p className="text-sm font-semibold text-ink">{item.title}</p>
                  <p className="mt-1 text-sm text-steel">{item.priceLabel}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="content-surface p-8 md:p-14">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
            Plans
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-ink">
            Choose the commercial path that fits your team
          </h2>
          <p className="mt-4 text-sm leading-7 text-steel">
            Starter and Scale flow into the app-owned onboarding and billing path. Enterprise stays sales-led so scope, rollout, and commercial terms remain explicit.
          </p>
        </div>
        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {data.plans.map((plan) => {
            const cta = data.ctasByPlanCode[plan.code];
            return (
              <article
                key={plan.code}
                className={`rounded-[28px] border p-7 ${
                  plan.code === highlightedPlan.code
                    ? "border-accent bg-[#f4fbfd] shadow-[0_18px_50px_rgba(19,79,97,0.12)]"
                    : plan.isRecommended
                    ? "border-accent/30 bg-[#f4fbfd] shadow-[0_18px_50px_rgba(19,79,97,0.08)]"
                    : "border-line bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent">
                      {plan.name}
                    </p>
                    <h3 className="mt-3 text-3xl font-semibold text-ink">{plan.priceLabel}</h3>
                  </div>
                  {plan.recommendationLabel ? (
                    <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                      {plan.recommendationLabel}
                    </span>
                  ) : null}
                </div>
                <p className="mt-5 text-sm leading-7 text-steel">{plan.headline}</p>
                <p className="mt-4 text-sm leading-7 text-ink">{plan.publicDescription}</p>
                <ul className="mt-6 space-y-3 text-sm leading-7 text-steel">
                  {plan.highlights.map((highlight) => (
                    <li key={highlight} className="flex items-start gap-3">
                      <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-accent" />
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <PricingPlanAction cta={cta} />
                  <p className="mt-3 text-sm text-steel">{cta.helperText}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="content-surface p-8 md:p-14">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
            Services
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-ink">
            Premium service packaging built for high-trust teams
          </h2>
          <p className="mt-4 text-sm leading-7 text-steel">
            Evolve Edge combines AI-powered assessment, executive reporting, and security and compliance advisory to help organizations improve readiness before risk turns into costly delay.
          </p>
        </div>
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {SERVICE_OFFERS.map((offer) => (
            <article key={offer.title} className="content-surface-muted p-7">
              <ShieldCheck className="h-5 w-5 text-accent" />
              <p className="mt-5 text-sm font-semibold uppercase tracking-[0.22em] text-accent">
                {offer.priceLabel}
              </p>
              <h3 className="mt-3 text-2xl font-semibold text-ink">{offer.title}</h3>
              <p className="mt-4 text-sm leading-7 text-steel">{offer.body}</p>
              <p className="mt-4 text-sm leading-7 text-ink">{offer.audience}</p>
              <ul className="mt-5 space-y-3 text-sm leading-7 text-steel">
                {offer.deliverables.map((deliverable) => (
                  <li key={deliverable} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-accent" />
                    <span>{deliverable}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="content-surface p-8 md:p-12">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
            Who it is for
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-ink">
            Teams that need trust before scale
          </h2>
          <p className="mt-4 text-sm leading-7 text-steel">
            The focus is on organizations that need stronger readiness, clearer risk visibility, and executive reporting that supports real decisions.
          </p>
          <div className="mt-8 grid gap-4">
            {WHO_ITS_FOR.map((item) => (
              <article key={item} className="content-surface-muted p-6">
                <p className="text-sm font-medium leading-7 text-ink">{item}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="brand-surface p-8 md:p-12">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#8debf4]">
            ROI positioning
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Why buyers invest before gaps get expensive
          </h2>
          <div className="mt-8 grid gap-4">
            {ROI_POINTS.map((point) => (
              <article
                key={point}
                className="rounded-[24px] border border-white/10 bg-white/[0.05] p-6"
              >
                <p className="text-sm leading-7 text-white/[0.78]">{point}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {PRICING_TRUST_SIGNALS.map((signal) => (
          <article key={signal.title} className="content-surface-muted p-6">
            <ShieldCheck className="h-6 w-6 text-accent" />
            <h2 className="mt-4 text-xl font-semibold text-ink">{signal.title}</h2>
            <p className="mt-3 text-sm leading-7 text-steel">{signal.body}</p>
          </article>
        ))}
      </section>

      <section className="content-surface p-8 md:p-14">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
            Why teams buy
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-ink">
            Proof-oriented positioning for executive buyers
          </h2>
          <p className="mt-4 text-sm leading-7 text-steel">
            Buyers are usually looking for clearer decisions, stronger diligence readiness, and a more credible way to communicate risk upward and outward.
          </p>
        </div>
        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {EXECUTIVE_PROOF.map((item) => (
            <article key={item.title} className="content-surface-muted p-7">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent">
                {item.title}
              </p>
              <p className="mt-4 text-sm leading-7 text-steel">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="content-surface p-6">
          <div className="flex items-center gap-3">
            <CircleHelp className="h-5 w-5 text-accent" />
            <h2 className="text-2xl font-semibold text-ink">FAQ</h2>
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
            Next step
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight">
            Book an AI Security Readiness Call
          </h2>
          <p className="mt-4 text-sm leading-7 text-slate-300">
            Start with a focused conversation about readiness gaps, executive reporting needs, and the right engagement path for your environment.
          </p>
          <div className="mt-8 space-y-3">
            <div className="w-full">
              <PricingPlanAction cta={highlightedCta} />
            </div>
            {readinessCallIsExternal ? (
              <a
                href={readinessCallHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white"
              >
                Book an AI Security Readiness Call
              </a>
            ) : (
              <Link
                href={readinessCallHref as never}
                className="inline-flex w-full items-center justify-center rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white"
              >
                Book an AI Security Readiness Call
              </Link>
            )}
            <Link
              href={"/contact-sales?intent=enterprise-plan&source=pricing-page" as never}
              className="inline-flex w-full items-center justify-center rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white"
            >
              Contact sales
            </Link>
          </div>
          <ul className="mt-8 space-y-3 text-sm text-slate-300">
            {[
              "Premium packaging with starting-at pricing",
              "Executive-ready reporting and remediation guidance",
              "Custom enterprise pricing for complex environments"
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <ArrowRight className="mt-0.5 h-4 w-4 text-[#99f6e4]" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
