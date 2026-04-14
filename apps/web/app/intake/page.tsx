import type { Metadata } from "next";
import { ArrowRight, ClipboardList, FileCheck2, ShieldCheck } from "lucide-react";
import { MarketingShell } from "../../components/marketing-shell";
import { TrackedCtaLink } from "../../components/tracked-cta-link";
import { getOptionalCurrentSession, isPasswordAuthEnabled } from "../../lib/auth";

export const metadata: Metadata = {
  title: "Intake | Evolve Edge",
  description:
    "Review how Evolve Edge captures intake, evidence, scope, and executive reporting inputs."
};

const intakeSteps = [
  {
    icon: ClipboardList,
    title: "Scope the environment",
    body:
      "Capture the business context, frameworks, vendors, model inventory, and target outcomes before orchestration starts."
  },
  {
    icon: FileCheck2,
    title: "Collect evidence that can survive scrutiny",
    body:
      "Gather policies, controls, operating notes, and supporting context in a format that still works when leadership asks hard questions."
  },
  {
    icon: ShieldCheck,
    title: "Generate a reportable operating picture",
    body:
      "Translate the intake into findings, roadmap actions, artifact readiness, and delivery state the customer can actually use."
  }
];

export default async function IntakePage() {
  const session = await getOptionalCurrentSession();
  const workspaceHref = session
    ? session.onboardingRequired
      ? "/onboarding"
      : "/dashboard/assessments"
    : isPasswordAuthEnabled()
      ? "/sign-in"
      : "/dashboard/assessments";

  return (
    <MarketingShell
      ctaHref={workspaceHref}
      ctaLabel={session ? "Open assessment flow" : "Start from workspace"}
    >
      <div className="grid gap-6">
        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="brand-surface p-8 md:p-10">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#8debf4]">
              Intake design
            </p>
            <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] text-white md:text-5xl">
              Intake is where Evolve Edge turns scattered evidence into a governed signal.
            </h1>
            <p className="mt-5 text-base leading-8 text-white/[0.72]">
              This flow is designed to capture the operating reality of an AI program before
              analysis, delivery, and customer visibility take over.
            </p>
          </div>

          <div className="content-surface p-8 md:p-10">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
              What the customer should expect
            </p>
            <div className="mt-6 grid gap-5">
              {intakeSteps.map((step) => {
                const Icon = step.icon;

                return (
                  <article key={step.title} className="content-surface-muted p-6">
                    <Icon className="h-5 w-5 text-accent" />
                    <h2 className="mt-4 text-xl font-semibold text-ink">{step.title}</h2>
                    <p className="mt-3 text-sm leading-7 text-steel">{step.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="content-surface p-8 md:p-10">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
                Outcome
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-ink">
                A premium reporting and delivery experience starts with disciplined intake.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-8 text-steel">
                By the time Evolve Edge reaches the report layer, the platform already has the
                scope, evidence, and operating context needed to create an executive-ready
                output instead of a shallow compliance summary.
              </p>
            </div>
            <div className="brand-surface p-6">
              <p className="text-sm leading-8 text-white/[0.72]">
                Intake is the safest place to align expectations early, reduce workflow
                surprises, and keep downstream report and delivery state honest.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <TrackedCtaLink
                  href={workspaceHref}
                  eventPayload={{
                    ctaKey: "open-workspace",
                    location: "intake-page",
                    href: workspaceHref
                  }}
                  source="intake-page"
                  className="inline-flex items-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink"
                >
                  Open intake flow
                  <ArrowRight className="ml-2 h-4 w-4" />
                </TrackedCtaLink>
                <TrackedCtaLink
                  href="/contact"
                  eventPayload={{
                    ctaKey: "book-demo",
                    location: "intake-page",
                    href: "/contact"
                  }}
                  source="intake-page"
                  className="inline-flex items-center rounded-full border border-white/[0.14] bg-white/[0.06] px-5 py-3 text-sm font-semibold text-white"
                >
                  Contact Evolve Edge
                </TrackedCtaLink>
              </div>
            </div>
          </div>
        </section>
      </div>
    </MarketingShell>
  );
}
