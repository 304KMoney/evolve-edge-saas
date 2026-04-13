import { ArrowRight, CheckCircle2, ShieldCheck, Workflow } from "lucide-react";
import { MarketingShell } from "../components/marketing-shell";
import { TrackedCtaLink } from "../components/tracked-cta-link";
import { getOptionalCurrentSession, isPasswordAuthEnabled } from "../lib/auth";
import {
  EXPANSION_PATHS,
  FOUNDING_RISK_AUDIT,
  FOUNDING_RISK_AUDIT_AUDIENCE,
  FOUNDING_RISK_AUDIT_DELIVERABLES,
  FOUNDING_RISK_AUDIT_OUTCOMES,
  FOUNDING_RISK_AUDIT_PROCESS,
  FOUNDING_RISK_AUDIT_PROBLEMS,
  PRICING_TRUST_SIGNALS
} from "../lib/pricing-content";

export default async function HomePage() {
  const session = await getOptionalCurrentSession();
  const workspaceHref = session
    ? session.onboardingRequired
      ? "/onboarding"
      : "/dashboard"
    : isPasswordAuthEnabled()
      ? "/sign-in"
      : "/dashboard";
  const workspaceLabel = session
    ? "Open workspace"
    : isPasswordAuthEnabled()
      ? "Sign in"
      : "View workspace";
  const foundingOfferHref = "/contact?intent=founding-risk-audit&source=homepage-primary";
  const foundingCallHref = "/contact?intent=founding-risk-audit&source=homepage-secondary";

  return (
    <MarketingShell ctaHref={workspaceHref} ctaLabel={workspaceLabel}>
      <div className="grid gap-14 md:gap-20">
        <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch">
          <div className="brand-surface relative overflow-hidden p-10 md:p-16">
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[#8debf4]">
              {FOUNDING_RISK_AUDIT.eyebrow}
            </p>
            <h1 className="mt-6 max-w-4xl text-4xl font-semibold tracking-[-0.05em] text-white md:text-6xl">
              Identify Your AI Risk Before It Becomes a Business Problem
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-white/[0.78]">
              Evolve Edge helps high-trust organizations uncover hidden AI security, confidentiality, and compliance risks and delivers a clear, executive-ready action plan in days, not months.
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
            <div className="mt-10 flex flex-wrap gap-4">
              <TrackedCtaLink
                href={foundingOfferHref}
                eventPayload={{
                  ctaKey: "book-demo",
                  location: "homepage-hero",
                  href: foundingOfferHref
                }}
                source="homepage"
                className="inline-flex items-center rounded-full bg-[linear-gradient(135deg,#1cc7d8,#6fe8f1)] px-6 py-3.5 text-sm font-semibold text-[#05111d] shadow-[0_18px_44px_rgba(28,199,216,0.24)] transition hover:-translate-y-0.5"
              >
                {FOUNDING_RISK_AUDIT.ctas.primary}
                <ArrowRight className="ml-2 h-4 w-4" />
              </TrackedCtaLink>
              <TrackedCtaLink
                href={foundingCallHref}
                eventPayload={{
                  ctaKey: "book-demo",
                  location: "homepage-hero",
                  href: foundingCallHref
                }}
                source="homepage"
                className="rounded-full border border-white/[0.16] bg-transparent px-6 py-3.5 text-sm font-semibold text-white"
              >
                {FOUNDING_RISK_AUDIT.ctas.secondary}
              </TrackedCtaLink>
            </div>
            <p className="mt-4 text-sm font-medium text-[#8debf4]">{FOUNDING_RISK_AUDIT.availability}</p>
          </div>

          <div className="content-surface p-8 md:p-12">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
              From uncertainty to clarity
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-ink">
              Know your top AI risks in days, not months
            </h2>
            <p className="mt-4 text-base leading-7 text-steel">
              {FOUNDING_RISK_AUDIT.summary}
            </p>
            <div className="mt-8 space-y-4">
              {FOUNDING_RISK_AUDIT_OUTCOMES.map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-[22px] border border-line bg-[#f8fafc] px-5 py-4">
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
              Problem
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-ink">
              Most Organizations Are Using AI Without Understanding the Risk
            </h2>
          </div>
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {FOUNDING_RISK_AUDIT_PROBLEMS.map((problem) => (
              <article key={problem} className="content-surface-muted p-7">
                <ShieldCheck className="h-5 w-5 text-accent" />
                <p className="mt-5 text-sm leading-7 text-steel">{problem}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="brand-surface p-8 md:p-12">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#8debf4]">
              {FOUNDING_RISK_AUDIT.eyebrow}
            </p>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-white">
              {FOUNDING_RISK_AUDIT.title}
            </h2>
            <p className="mt-4 text-2xl font-semibold text-[#8debf4]">{FOUNDING_RISK_AUDIT.priceLabel}</p>
            <p className="mt-4 max-w-2xl text-base leading-8 text-white/[0.74]">
              {FOUNDING_RISK_AUDIT.summary}
            </p>
            <div className="mt-8 rounded-[24px] border border-white/10 bg-white/[0.05] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/[0.54]">
                Who this is for
              </p>
              <div className="mt-4 space-y-4">
                {FOUNDING_RISK_AUDIT_AUDIENCE.map((audience) => (
                  <article key={audience.title}>
                    <p className="text-lg font-semibold text-white">{audience.title}</p>
                    <p className="mt-2 text-sm leading-7 text-white/[0.72]">{audience.body}</p>
                  </article>
                ))}
              </div>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <TrackedCtaLink
                href={foundingOfferHref}
                eventPayload={{
                  ctaKey: "book-demo",
                  location: "homepage-founding-offer",
                  href: foundingOfferHref
                }}
                source="homepage"
                className="inline-flex items-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink"
              >
                Start Your Audit
              </TrackedCtaLink>
              <TrackedCtaLink
                href={foundingCallHref}
                eventPayload={{
                  ctaKey: "book-demo",
                  location: "homepage-founding-offer",
                  href: foundingCallHref
                }}
                source="homepage"
                className="inline-flex items-center rounded-full border border-white/[0.14] bg-white/[0.06] px-5 py-3 text-sm font-semibold text-white"
              >
                {FOUNDING_RISK_AUDIT.ctas.secondary}
              </TrackedCtaLink>
            </div>
          </div>

          <div className="content-surface p-8 md:p-12">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
              Deliverables
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-ink">
              What You Actually Receive
            </h2>
            <p className="mt-4 text-sm leading-7 text-steel">
              This is not just a report artifact. It is a fast, executive-ready assessment built to help leadership understand where risk sits and what to do next.
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
        </section>

        <section className="content-surface p-8 md:p-14">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
                How it works
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-ink">
                How Evolve Edge Works
              </h2>
            </div>
            <Workflow className="h-6 w-6 text-accent" />
          </div>
          <div className="signal-divider mt-6" />
          <div className="mt-8 grid gap-5 lg:grid-cols-4">
            {FOUNDING_RISK_AUDIT_PROCESS.map((step) => (
              <article key={step.step} className="content-surface-muted p-7">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
                  Step {step.step}
                </p>
                <h3 className="mt-4 text-xl font-semibold text-ink">{step.title}</h3>
                <p className="mt-4 text-sm leading-7 text-steel">{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="content-surface p-8 md:p-14">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
              Outcomes
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-ink">
              From Uncertainty to Clarity
            </h2>
          </div>
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {PRICING_TRUST_SIGNALS.map((card) => (
              <article key={card.title} className="content-surface-muted p-7">
                <ShieldCheck className="h-5 w-5 text-accent" />
                <h3 className="mt-5 text-2xl font-semibold text-ink">{card.title}</h3>
                <p className="mt-4 text-sm leading-7 text-steel">{card.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="content-surface p-8 md:p-12">
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
          <div className="grid gap-5 lg:grid-cols-3">
            {EXPANSION_PATHS.map((path) => (
              <article key={path.title} className="content-surface-muted p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
                  {path.priceLabel}
                </p>
                <h3 className="mt-4 text-xl font-semibold text-ink">{path.title}</h3>
                <p className="mt-4 text-sm leading-7 text-steel">{path.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="brand-surface p-8 md:p-14">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#8debf4]">
                Final CTA
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white md:text-4xl">
                Get Ahead of AI Risk Before It Becomes a Problem
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-8 text-white/[0.72]">
                Join a limited group of founding clients and get a clear, executive-ready understanding of your AI risk posture.
              </p>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/[0.06] p-6 backdrop-blur">
              <div className="space-y-4">
                {[
                  FOUNDING_RISK_AUDIT.priceLabel,
                  "Executive-ready report plus live briefing",
                  "30-60 day action roadmap"
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 text-sm text-white/[0.8]">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-[#8debf4]" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <TrackedCtaLink
                  href={foundingOfferHref}
                  eventPayload={{
                    ctaKey: "book-demo",
                    location: "homepage-final-cta",
                    href: foundingOfferHref
                  }}
                  source="homepage"
                className="inline-flex items-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink"
              >
                  Start Your Founding Risk Audit
                </TrackedCtaLink>
                <TrackedCtaLink
                  href={foundingCallHref}
                  eventPayload={{
                    ctaKey: "book-demo",
                    location: "homepage-final-cta",
                    href: foundingCallHref
                  }}
                  source="homepage"
                  className="inline-flex items-center rounded-full border border-white/[0.14] bg-white/[0.06] px-5 py-3 text-sm font-semibold text-white"
                >
                  Book a Call
                </TrackedCtaLink>
              </div>
            </div>
          </div>
        </section>
      </div>
    </MarketingShell>
  );
}
