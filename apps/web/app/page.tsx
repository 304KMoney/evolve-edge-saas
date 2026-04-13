import Image from "next/image";
import { ArrowRight, CheckCircle2, ShieldCheck, Workflow } from "lucide-react";
import { MarketingShell } from "../components/marketing-shell";
import { TrackedCtaLink } from "../components/tracked-cta-link";
import { getOptionalCurrentSession, isPasswordAuthEnabled } from "../lib/auth";

const workflowSteps = [
  {
    title: "Capture your current AI footprint",
    body: "We gather the policies, tools, vendors, and use cases shaping your actual exposure."
  },
  {
    title: "Prioritize what matters most",
    body: "We connect gaps to the obligations, control areas, and business risks leadership needs to understand."
  },
  {
    title: "Equip leadership to act",
    body: "You leave with an executive-ready report and a clear 30 to 90 day action plan."
  }
];

const clarityCards = [
  {
    title: "AI Risk Assessment",
    body: "See where your current AI posture is exposed, what is driving the risk, and what needs attention first."
  },
  {
    title: "Compliance Mapping",
    body: "Connect your current state to the frameworks, policies, and obligations leadership needs to answer for."
  },
  {
    title: "Executive Reporting",
    body: "Turn technical findings into concise reporting that supports decisions, budget asks, and stakeholder alignment."
  }
];

const solutionCards = [
  {
    title: "Regulated operators",
    body: "Create a credible view of AI risk without slowing the business down."
  },
  {
    title: "Lean compliance teams",
    body: "Replace scattered evidence and unclear priorities with a focused plan."
  },
  {
    title: "Leadership under scrutiny",
    body: "Give boards and executives a sharper picture of exposure, ownership, and next steps."
  }
];

const outcomes = [
  "Risk score + breakdown",
  "Top findings",
  "30-90 day remediation roadmap",
  "Executive briefing"
];

const reportPreview = [
  {
    label: "Risk posture",
    value: "Clear score, drivers, and current-state summary"
  },
  {
    label: "Findings",
    value: "Priority gaps tied to business impact"
  },
  {
    label: "Roadmap",
    value: "Immediate, 30-day, and 90-day action plan"
  }
];

const pricingPreview = [
  {
    plan: "Starter",
    description: "A focused assessment for teams that need an executive-grade baseline quickly.",
    emphasis: "Best for an initial risk readout"
  },
  {
    plan: "Scale",
    description: "Deeper review and broader stakeholder alignment for growing AI programs.",
    emphasis: "Built for multi-team decision making"
  },
  {
    plan: "Enterprise",
    description: "Advisory-led delivery for complex environments, leadership scrutiny, and ongoing support.",
    emphasis: "Designed for high-stakes programs"
  }
];

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

  return (
    <MarketingShell ctaHref={workspaceHref} ctaLabel={workspaceLabel}>
      <div className="grid gap-14 md:gap-20">
        <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-stretch">
          <div className="brand-surface relative overflow-hidden p-10 md:p-16">
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[#8debf4]">
              Premium AI risk assessment
            </p>
            <h1 className="mt-6 max-w-4xl text-4xl font-semibold tracking-[-0.05em] text-white md:text-6xl">
              Know your AI risk posture in days — not months
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-white/[0.78]">
              Identify AI security and compliance gaps, prioritize remediation, and deliver executive-ready reporting your leadership can act on immediately.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <TrackedCtaLink
                href="/intake"
                eventPayload={{
                  ctaKey: "book-demo",
                  location: "homepage-hero",
                  href: "/intake"
                }}
                source="homepage"
                className="inline-flex items-center rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-[#05111d] shadow-[0_18px_44px_rgba(255,255,255,0.12)]"
              >
                Get your risk assessment
                <ArrowRight className="ml-2 h-4 w-4" />
              </TrackedCtaLink>
              <TrackedCtaLink
                href="#deliverables"
                eventPayload={{
                  ctaKey: "book-demo",
                  location: "homepage-hero",
                  href: "#deliverables"
                }}
                source="homepage"
                className="rounded-full border border-white/[0.16] bg-transparent px-6 py-3.5 text-sm font-semibold text-white"
              >
                View sample report
              </TrackedCtaLink>
            </div>
          </div>

          <div className="content-surface p-8 md:p-12">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
              Executive-ready output
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-ink">
              A premium assessment experience built for high-stakes decisions
            </h2>
            <p className="mt-4 text-base leading-7 text-steel">
              Built for teams that need fast clarity, strong reporting, and a credible plan without a months-long consulting cycle.
            </p>
            <div className="mt-8 overflow-hidden rounded-[28px] border border-line bg-white">
              <Image
                src="/brand/evolve-edge-logo.png"
                alt="Evolve Edge brand mark"
                width={544}
                height={544}
                priority
                className="h-auto w-full object-cover"
              />
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="content-surface-muted p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-steel">
                  Designed for
                </p>
                <p className="mt-3 text-base font-semibold text-ink">
                  Risk, compliance, and executive stakeholders
                </p>
              </div>
              <div className="content-surface-muted p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-steel">
                  Outcome
                </p>
                <p className="mt-3 text-base font-semibold text-ink">
                  Faster clarity, sharper priorities, stronger reporting
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="content-surface p-8 md:p-14">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-ink">
                From uncertainty to actionable risk clarity
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-steel">
                Replace scattered concerns and vague remediation with a structured view leadership can trust.
              </p>
            </div>
          </div>
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {clarityCards.map((card) => (
              <article key={card.title} className="content-surface-muted p-7">
                <ShieldCheck className="h-5 w-5 text-accent" />
                <h3 className="mt-5 text-2xl font-semibold text-ink">{card.title}</h3>
                <p className="mt-4 text-sm leading-7 text-steel">{card.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="deliverables" className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="content-surface p-8 md:p-12">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
              What you walk away with
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-ink">
              Clear outputs your team can use immediately
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-steel">
              Every engagement is designed to give leadership a sharper view of risk, priority actions, and next steps.
            </p>
            <div className="mt-8 space-y-4">
              {outcomes.map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-[20px] border border-line bg-[#f8fafc] px-5 py-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-accent" />
                  <span className="text-sm font-medium text-ink">{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="brand-surface p-8 md:p-12">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#8debf4]">
              Sample report structure
            </p>
            <h3 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white">
              Reporting designed for executive attention spans
            </h3>
            <div className="mt-8 space-y-4">
              {reportPreview.map((item) => (
                <article key={item.label} className="rounded-[24px] border border-white/10 bg-white/[0.05] p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/[0.52]">
                    {item.label}
                  </p>
                  <p className="mt-3 text-lg font-semibold text-white">{item.value}</p>
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
                A fast path from intake to leadership-ready clarity
              </h2>
            </div>
            <Workflow className="h-6 w-6 text-accent" />
          </div>
          <div className="signal-divider mt-6" />
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {workflowSteps.map((step, index) => (
              <article key={step.title} className="content-surface-muted p-7">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
                  Step {index + 1}
                </p>
                <h3 className="mt-4 text-xl font-semibold text-ink">{step.title}</h3>
                <p className="mt-4 text-sm leading-7 text-steel">{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="content-surface p-8 md:p-12">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
              Who this is for
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-ink">
              Built for teams that need confidence before exposure grows
            </h2>
            <p className="mt-4 text-sm leading-7 text-steel">
              Evolve Edge is for organizations that need credible risk clarity without adding more internal overhead.
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {solutionCards.map((card) => (
              <article key={card.title} className="content-surface-muted p-6">
                <ShieldCheck className="h-5 w-5 text-accent" />
                <h3 className="mt-4 text-xl font-semibold text-ink">{card.title}</h3>
                <p className="mt-4 text-sm leading-7 text-steel">{card.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="content-surface p-8 md:p-14">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
                Pricing preview
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-ink">
                Engagement options that match your level of urgency
              </h2>
            </div>
            <TrackedCtaLink
              href="/pricing"
              eventPayload={{
                ctaKey: "view-pricing",
                location: "homepage-pricing-preview",
                href: "/pricing"
              }}
              source="homepage"
              className="inline-flex items-center rounded-full border border-line px-5 py-3 text-sm font-semibold text-ink"
            >
              Explore pricing
              <ArrowRight className="ml-2 h-4 w-4" />
            </TrackedCtaLink>
          </div>
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {pricingPreview.map((item, index) => (
              <article
                key={item.plan}
                className={`content-surface-muted p-7 ${index === 1 ? "ring-1 ring-accent/[0.4]" : ""}`}
              >
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
                  {item.plan}
                </p>
                <p className="mt-4 text-xl font-semibold text-ink">{item.emphasis}</p>
                <p className="mt-4 text-sm leading-7 text-steel">{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="brand-surface p-8 md:p-14">
          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#8debf4]">
                Ready to move
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white md:text-4xl">
                Get a sharper view of AI risk before it becomes an expensive surprise.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-8 text-white/[0.72]">
                Start with a focused assessment, align your stakeholders, and leave with a roadmap your team can execute.
              </p>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/[0.06] p-6 backdrop-blur">
              <div className="space-y-4">
                {[
                  "Clear risk picture for leadership",
                  "Priority findings tied to business impact",
                  "Action plan for the next 30 to 90 days"
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 text-sm text-white/[0.8]">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-[#8debf4]" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <TrackedCtaLink
                  href={workspaceHref}
                  eventPayload={{
                    ctaKey: "open-workspace",
                    location: "homepage-final-cta",
                    href: workspaceHref
                  }}
                  source="homepage"
                  className="inline-flex items-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink"
                >
                  {workspaceLabel}
                </TrackedCtaLink>
                <TrackedCtaLink
                  href="/contact"
                  eventPayload={{
                    ctaKey: "book-demo",
                    location: "homepage-final-cta",
                    href: "/contact"
                  }}
                  source="homepage"
                  className="inline-flex items-center rounded-full border border-white/[0.14] bg-white/[0.06] px-5 py-3 text-sm font-semibold text-white"
                >
                  Speak with an advisor
                </TrackedCtaLink>
              </div>
            </div>
          </div>
        </section>
      </div>
    </MarketingShell>
  );
}
