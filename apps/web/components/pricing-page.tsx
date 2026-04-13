"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleHelp, ShieldCheck, Workflow } from "lucide-react";
import type { PricingPageData } from "../lib/pricing";
import {
  EXPANSION_PATHS,
  FOUNDING_RISK_AUDIT,
  FOUNDING_RISK_AUDIT_AUDIENCE,
  FOUNDING_RISK_AUDIT_DELIVERABLES,
  FOUNDING_RISK_AUDIT_OUTCOMES,
  FOUNDING_RISK_AUDIT_PROCESS,
  PRICING_FAQ,
  PRICING_HERO,
  PRICING_TRUST_SIGNALS
} from "../lib/pricing-content";

export function PricingPageClient({ data }: { data: PricingPageData }) {
  const foundingOfferHref = "/contact?intent=founding-risk-audit&source=pricing-page-primary";
  const foundingCallHref = "/contact?intent=founding-risk-audit&source=pricing-page-secondary";

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
            <span className="rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 font-semibold text-white">
              {FOUNDING_RISK_AUDIT.title}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 font-semibold text-white">
              {FOUNDING_RISK_AUDIT.priceLabel}
            </span>
            <span className="rounded-full border border-[#8debf4]/30 bg-[#8debf4]/10 px-4 py-2 font-semibold text-[#8debf4]">
              {FOUNDING_RISK_AUDIT.availability}
            </span>
          </div>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href={foundingOfferHref as never}
              className="inline-flex items-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink"
            >
              {FOUNDING_RISK_AUDIT.ctas.primary}
            </Link>
            <Link
              href={foundingCallHref as never}
              className="inline-flex items-center rounded-full border border-white/14 bg-white/[0.06] px-5 py-3 text-sm font-semibold text-white"
            >
              {FOUNDING_RISK_AUDIT.ctas.secondary}
            </Link>
          </div>
          <p className="mt-4 text-sm font-medium text-[#8debf4]">{FOUNDING_RISK_AUDIT.availability}</p>
        </div>

        <div className="content-surface p-8 md:p-12">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
            Outcomes
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-ink">
            From Uncertainty to Clarity
          </h2>
          <p className="mt-4 text-sm leading-7 text-steel">
            {FOUNDING_RISK_AUDIT.summary}
          </p>
          <div className="mt-8 space-y-4">
            {FOUNDING_RISK_AUDIT_OUTCOMES.map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-[20px] border border-line bg-[#f8fafc] px-5 py-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-accent" />
                <span className="text-sm font-medium text-ink">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="content-surface p-8 md:p-14">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
            Founding offer
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-ink">
            Evolve Edge Founding Risk Audit
          </h2>
          <p className="mt-4 text-xl font-semibold text-accent">{FOUNDING_RISK_AUDIT.priceLabel}</p>
          <p className="mt-4 text-sm leading-7 text-steel">{FOUNDING_RISK_AUDIT.summary}</p>
        </div>
        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {FOUNDING_RISK_AUDIT_AUDIENCE.map((audience) => (
            <article key={audience.title} className="content-surface-muted p-7">
              <ShieldCheck className="h-5 w-5 text-accent" />
              <h3 className="mt-5 text-2xl font-semibold text-ink">{audience.title}</h3>
              <p className="mt-4 text-sm leading-7 text-steel">{audience.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="content-surface p-8 md:p-12">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
            Deliverables
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-ink">
            What You Actually Receive
          </h2>
          <p className="mt-4 text-sm leading-7 text-steel">
            This is not just a PDF. It is a fast, executive-ready AI risk assessment designed to give leadership clarity, confidence, and a prioritized action plan.
          </p>
          <div className="mt-8 grid gap-4">
            {FOUNDING_RISK_AUDIT_DELIVERABLES.map((item) => (
              <article key={item.title} className="content-surface-muted p-6">
                <h3 className="text-lg font-semibold text-ink">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-steel">{item.body}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="brand-surface p-8 md:p-12">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#8debf4]">
            How it works
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            How Evolve Edge Works
          </h2>
          <div className="mt-8 grid gap-4">
            {FOUNDING_RISK_AUDIT_PROCESS.map((step) => (
              <article key={step.step} className="rounded-[24px] border border-white/10 bg-white/[0.05] p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/[0.52]">
                  Step {step.step}
                </p>
                <h3 className="mt-3 text-lg font-semibold text-white">{step.title}</h3>
                <p className="mt-3 text-sm leading-7 text-white/[0.72]">{step.body}</p>
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
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
              Expansion path
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-ink">
              What Happens Next
            </h2>
            <p className="mt-4 text-sm leading-7 text-steel">
              The Founding Risk Audit is designed to give you immediate clarity. From there, organizations can expand into deeper engagement based on their needs.
            </p>
            <p className="mt-4 text-sm font-semibold text-ink">Start with clarity. Expand with confidence.</p>
          </div>
          <Workflow className="h-6 w-6 text-accent" />
        </div>
        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {EXPANSION_PATHS.map((path) => (
            <article key={path.title} className="content-surface-muted p-7">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent">
                {path.priceLabel}
              </p>
              <h3 className="mt-4 text-2xl font-semibold text-ink">{path.title}</h3>
              <p className="mt-4 text-sm leading-7 text-steel">{path.body}</p>
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
            Get Ahead of AI Risk Before It Becomes a Problem
          </h2>
          <p className="mt-4 text-sm leading-7 text-slate-300">
            Join a limited group of founding clients and get a clear, executive-ready understanding of your AI risk posture.
          </p>
          <div className="mt-8 space-y-3">
            <Link
              href={foundingOfferHref as never}
              className="inline-flex w-full items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink"
            >
              Start Your Founding Risk Audit
            </Link>
            <a
              href={foundingCallHref as never}
              className="inline-flex w-full items-center justify-center rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white"
            >
              Book a Call
            </a>
          </div>
          <ul className="mt-8 space-y-3 text-sm text-slate-300">
            {[
              FOUNDING_RISK_AUDIT.priceLabel,
              "Executive-ready report plus live briefing",
              "Expansion path into $10,000 and larger engagements"
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
