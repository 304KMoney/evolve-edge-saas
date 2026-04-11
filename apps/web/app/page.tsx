import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, BadgeCheck, FileText, ShieldCheck } from "lucide-react";
import { getOptionalCurrentSession, isPasswordAuthEnabled } from "../lib/auth";
import { TrackedCtaLink } from "../components/tracked-cta-link";
import {
  FRAMEWORK_COVERAGE_ENTRIES,
  METHODOLOGY_STAGES,
  TRUST_CENTER_CONTENT
} from "../lib/authority-content";

export default async function HomePage() {
  const session = await getOptionalCurrentSession();
  const workspaceHref = session
    ? session.onboardingRequired
      ? "/onboarding"
      : "/dashboard"
    : isPasswordAuthEnabled()
      ? "/sign-in"
      : "/dashboard";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(153,246,228,0.45),transparent_28%),linear-gradient(180deg,#f7fbfc_0%,#edf5f7_100%)] px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-[36px] border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(239,245,247,0.92))] p-8 shadow-[0_24px_90px_rgba(15,23,42,0.08)] md:p-10">
          <div className="mb-6 flex flex-wrap items-center gap-3 text-sm font-semibold text-[#0f172a]">
            <Link href={"/trust" as Route} className="rounded-full border border-[#d6e6e8] bg-white px-4 py-2">
              Trust Center
            </Link>
            <Link href={"/frameworks" as Route} className="rounded-full border border-[#d6e6e8] bg-white px-4 py-2">
              Framework Coverage
            </Link>
            <Link href={"/methodology" as Route} className="rounded-full border border-[#d6e6e8] bg-white px-4 py-2">
              Methodology
            </Link>
            <Link href={"/security" as Route} className="rounded-full border border-[#d6e6e8] bg-white px-4 py-2">
              Security Posture
            </Link>
          </div>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#0f766e]">
                Evolve Edge
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-[#0f172a] md:text-6xl">
                AI compliance and risk oversight for regulated teams that need a real operating system.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-[#475569]">
                Move from one-off AI reviews to a serious SaaS workflow for governance posture, executive reporting, remediation planning, and recurring monitoring.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <TrackedCtaLink
                  href="/pricing"
                  eventPayload={{
                    ctaKey: "view-pricing",
                    location: "homepage-hero",
                    href: "/pricing"
                  }}
                  source="homepage"
                  className="inline-flex items-center rounded-full bg-[#0f766e] px-6 py-3 text-sm font-semibold text-white"
                >
                  View pricing
                  <ArrowRight className="ml-2 h-4 w-4" />
                </TrackedCtaLink>
                <TrackedCtaLink
                  href={workspaceHref}
                  eventPayload={{
                    ctaKey: "open-workspace",
                    location: "homepage-hero",
                    href: workspaceHref
                  }}
                  source="homepage"
                  className="rounded-full border border-[#d7eaeb] bg-white px-6 py-3 text-sm font-semibold text-[#0f172a]"
                >
                  {session ? "Open workspace" : isPasswordAuthEnabled() ? "Sign in" : "View workspace"}
                </TrackedCtaLink>
                <TrackedCtaLink
                  href="/contact-sales?intent=demo-request&source=homepage-hero"
                  eventPayload={{
                    ctaKey: "book-demo",
                    location: "homepage-hero",
                    href: "/contact-sales?intent=demo-request&source=homepage-hero"
                  }}
                  source="homepage"
                  className="rounded-full border border-[#d7eaeb] bg-white px-6 py-3 text-sm font-semibold text-[#0f172a]"
                >
                  Book demo
                </TrackedCtaLink>
              </div>
            </div>

            <div className="w-full max-w-sm rounded-[28px] border border-[#d7eaeb] bg-white/95 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#64748b]">
                Why teams buy
              </p>
              <ul className="mt-4 space-y-4 text-sm leading-7 text-[#334155]">
                <li className="flex items-start gap-3">
                  <ShieldCheck className="mt-1 h-5 w-5 text-[#0f766e]" />
                  Clear AI risk reduction workflow instead of ad hoc policy reviews
                </li>
                <li className="flex items-start gap-3">
                  <FileText className="mt-1 h-5 w-5 text-[#0f766e]" />
                  Executive-ready summaries and remediation roadmaps built into the product
                </li>
                <li className="flex items-start gap-3">
                  <BadgeCheck className="mt-1 h-5 w-5 text-[#0f766e]" />
                  Trust-centered billing and access model designed for long-term SaaS expansion
                </li>
              </ul>
            </div>
          </div>
        </div>

        <section className="mt-6 grid gap-5 lg:grid-cols-3">
          {TRUST_CENTER_CONTENT.trustSignals.map((signal) => (
            <article
              key={signal.title}
              className="rounded-[28px] border border-white/75 bg-white/92 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.05)]"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#64748b]">
                Trust layer
              </p>
              <h2 className="mt-3 text-xl font-semibold text-[#0f172a]">{signal.title}</h2>
              <p className="mt-3 text-sm leading-7 text-[#475569]">{signal.body}</p>
            </article>
          ))}
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-2">
          <article className="rounded-[28px] border border-white/75 bg-white/92 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.05)]">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#64748b]">
              Authority infrastructure
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-[#0f172a]">
              Framework and methodology scaffolding built for regulated buyers
            </h2>
            <p className="mt-3 text-sm leading-7 text-[#475569]">
              Evolve Edge now exposes framework coverage, methodology, security posture, and trust-center structures so buyers can evaluate rigor before a live engagement.
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-[#dce7ea] bg-[#fbfdfd] p-4">
                <p className="text-2xl font-semibold text-[#0f172a]">
                  {FRAMEWORK_COVERAGE_ENTRIES.length}
                </p>
                <p className="mt-1 text-sm text-[#64748b]">launch framework coverage pages</p>
              </div>
              <div className="rounded-2xl border border-[#dce7ea] bg-[#fbfdfd] p-4">
                <p className="text-2xl font-semibold text-[#0f172a]">
                  {METHODOLOGY_STAGES.length}
                </p>
                <p className="mt-1 text-sm text-[#64748b]">methodology stages explained</p>
              </div>
            </div>
          </article>

          <article className="rounded-[28px] border border-white/75 bg-[#0f172a] p-6 text-white shadow-[0_20px_70px_rgba(15,23,42,0.1)]">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#99f6e4]">
              Buyer enablement
            </p>
            <h2 className="mt-3 text-2xl font-semibold">
              Give legal, security, and executive stakeholders a structured path to confidence
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              Use the trust center as a shared reference during evaluation, procurement, and delivery conversations so the platform feels like a credible operating system, not a thin report wrapper.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <TrackedCtaLink
                href="/trust"
                eventPayload={{
                  ctaKey: "view-pricing",
                  location: "homepage-authority",
                  href: "/trust"
                }}
                source="homepage"
                className="inline-flex items-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#0f172a]"
              >
                Explore trust center
              </TrackedCtaLink>
              <TrackedCtaLink
                href="/resources"
                eventPayload={{
                  ctaKey: "book-demo",
                  location: "homepage-authority",
                  href: "/resources"
                }}
                source="homepage"
                className="inline-flex items-center rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white"
              >
                View resources
              </TrackedCtaLink>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
