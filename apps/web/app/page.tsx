import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { MarketingShell } from "../components/marketing-shell";
import {
  getFoundingRiskAuditCallUrl,
  getFoundingRiskAuditOfferUrl
} from "../lib/runtime-config";
import { EXECUTIVE_PROOF_POINTS } from "../lib/marketing-services";

export const metadata: Metadata = {
  title: "Evolve Edge — AI Risk & Compliance Readiness",
  description:
    "Evolve Edge helps AI-using companies map security, compliance, and governance gaps — and delivers audit-ready reports before customers, investors, or auditors force the conversation.",
  openGraph: {
    title: "Evolve Edge — AI Risk & Compliance Readiness",
    description:
      "AI risk assessment → audit-ready reports → customer & investor trust. Built for 20–200 person SaaS, AI, fintech, healthtech, and legaltech companies.",
    url: "/"
  }
};

const actionLinks = [
  { href: "/pricing", label: "View Pricing" },
  { href: "/contact-sales", label: "Contact Sales" },
  { href: "/trust", label: "Trust Center" }
];

const highlights = [
  "AI-powered assessment with executive-ready reporting",
  "Security, compliance, and governance advisory for high-trust teams",
  "Readiness-focused delivery for organizations that cannot afford blind spots"
];

export default function HomePage() {
  const starterOfferHref = getFoundingRiskAuditOfferUrl();
  const readinessCallHref = getFoundingRiskAuditCallUrl();
  const readinessCallIsExternal = /^https?:\/\//.test(readinessCallHref);

  return (
    <MarketingShell ctaHref="/pricing" ctaLabel="View Pricing">
      <div className="mx-auto grid w-full max-w-[1240px] gap-8 md:gap-12">
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-stretch">
          <div className="brand-surface px-6 py-8 sm:px-8 sm:py-10 md:px-12 md:py-14 lg:px-14">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#8debf4]">
              AI Security Advisory
            </p>
            <h1 className="mt-5 max-w-[14ch] text-4xl font-semibold leading-[1.02] tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">
              AI Security & Compliance Readiness for High-Trust Teams
            </h1>
            <p className="mt-5 max-w-[44rem] text-base leading-7 text-white/[0.78] sm:text-lg sm:leading-8">
              Evolve Edge helps law firms, fintech teams, healthtech startups, and SaaS companies identify AI security, confidentiality, and compliance gaps before they become business risk.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href={starterOfferHref as never}
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-[linear-gradient(135deg,#1cc7d8,#6fe8f1)] px-6 py-3.5 text-sm font-semibold text-[#05111d] shadow-[0_18px_44px_rgba(28,199,216,0.24)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_52px_rgba(28,199,216,0.3)]"
              >
                Start with Starter
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/15 bg-white/[0.05] px-6 py-3.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.08]"
              >
                View Pricing
              </Link>
              {readinessCallIsExternal ? (
                <a
                  href={readinessCallHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/15 bg-white/[0.05] px-6 py-3.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.08]"
                >
                  Book a Readiness Call
                </a>
              ) : (
                <Link
                  href={readinessCallHref as never}
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/15 bg-white/[0.05] px-6 py-3.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.08]"
                >
                  Book a Readiness Call
                </Link>
              )}
            </div>
          </div>

          <div className="content-surface px-6 py-7 sm:px-8 sm:py-8 md:px-10 md:py-10">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
              What this gives you
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-ink">
              Executive-ready visibility before gaps get expensive
            </h2>
            <div className="mt-7 space-y-4">
              {highlights.map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-3 rounded-[22px] border border-line bg-[#f8fafc] px-5 py-4"
                >
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-accent" />
                  <span className="text-sm font-medium text-ink">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="content-surface px-6 py-7 sm:px-8 sm:py-8 md:px-10 md:py-10">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
            Get started
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-ink">
            Ready to close your AI governance gaps?
          </h2>
          <div className="mt-7 grid gap-4 md:grid-cols-3">
            {actionLinks.map((link) => (
              <Link
                key={link.href + link.label}
                href={link.href as never}
                className="content-surface-muted inline-flex min-h-[72px] items-center justify-between gap-3 px-5 py-5 text-sm font-semibold text-ink transition hover:-translate-y-0.5 hover:border-[#c9dced] hover:bg-white"
              >
                <span>{link.label}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-accent" />
              </Link>
            ))}
          </div>
        </section>

        <section className="content-surface px-6 py-7 sm:px-8 sm:py-8 md:px-10 md:py-10">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
            Built for buyers
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-ink">
            Clear proof of value for executive stakeholders
          </h2>
          <div className="mt-7 grid gap-4 md:grid-cols-3">
            {EXECUTIVE_PROOF_POINTS.map((item) => (
              <article key={item.title} className="content-surface-muted p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent">
                  {item.title}
                </p>
                <p className="mt-4 text-sm leading-7 text-steel">{item.body}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </MarketingShell>
  );
}
