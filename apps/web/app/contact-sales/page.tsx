import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { MarketingShell } from "../../components/marketing-shell";
import { getOptionalCurrentSession } from "../../lib/auth";
import { getSalesContactEmail } from "../../lib/runtime-config";
import { FOUNDING_RISK_AUDIT } from "../../lib/pricing-content";
import { submitContactSalesLeadAction } from "./actions";

export const metadata: Metadata = {
  title: "Contact Evolve Edge | Evolve Edge",
  description:
    "Book a call about the Founding Risk Audit or broader Evolve Edge AI risk and compliance engagements."
};

const defaultTrustBullets = [
  "Executive-ready risk reporting",
  "Built for regulated and high-trust teams",
  "Clear remediation roadmap, not just findings"
] as const;

const foundingTrustBullets = [
  "Fast-turnaround premium assessment",
  "Leadership-ready report and live briefing",
  "Focused on AI, confidentiality, governance, and compliance exposure"
] as const;

const defaultNextSteps = [
  "We review your use case and current environment",
  "We tailor the walkthrough to your risk and compliance priorities",
  "You leave with a clear next-step recommendation"
] as const;

const foundingNextSteps = [
  "We confirm fit and scope for the Founding Risk Audit",
  "We review your current AI usage, sensitive workflows, and business concerns",
  "We recommend the fastest path to a high-trust executive-ready assessment"
] as const;

export default async function ContactSalesPage({
  searchParams
}: {
  searchParams: Promise<{ intent?: string; source?: string; submitted?: string; error?: string }>;
}) {
  const session = await getOptionalCurrentSession();
  const params = await searchParams;
  const salesEmail = getSalesContactEmail();
  const isFoundingAuditIntent = (params.intent ?? "").includes("founding-risk-audit");
  const primaryHref = session
    ? session.onboardingRequired
      ? "/onboarding"
      : "/dashboard/billing"
    : "/pricing";
  const heroEyebrow = isFoundingAuditIntent ? FOUNDING_RISK_AUDIT.eyebrow : "Private walkthrough";
  const heroTitle = isFoundingAuditIntent
    ? `Apply for the ${FOUNDING_RISK_AUDIT.title}`
    : "Book a private Evolve Edge walkthrough";
  const heroBody = isFoundingAuditIntent
    ? `${FOUNDING_RISK_AUDIT.priceLabel} founding-client access for high-trust teams that need fast clarity on AI, confidentiality, governance, and compliance exposure.`
    : "See how your team can identify AI security, compliance, and governance gaps faster, prioritize remediation, and deliver executive-ready reporting.";
  const scheduleLabel = isFoundingAuditIntent ? "Founding client access" : "Schedule a call";
  const formTitle = isFoundingAuditIntent
    ? "Tell us about your current AI risk concerns"
    : "Tell us what you need help understanding";
  const formBody = isFoundingAuditIntent
    ? "We will use this to confirm fit, understand your environment, and recommend the right audit scope."
    : "We will shape the conversation around your environment, stakeholders, and highest-priority risk questions.";
  const submitLabel = isFoundingAuditIntent ? FOUNDING_RISK_AUDIT.ctas.apply : "Book a Call";
  const messageLabel = isFoundingAuditIntent
    ? "What is driving urgency right now?"
    : "What do you want to discuss?";
  const messagePlaceholder = isFoundingAuditIntent
    ? "Tell us about your AI usage, sensitive workflows, top concerns, and what leadership needs clarity on."
    : "Tell us about your current environment, priorities, or the workflows you want to review.";
  const successMessage = isFoundingAuditIntent
    ? "Thanks. Your request is in, and we will follow up to confirm fit and next-step timing for the Founding Risk Audit."
    : "Thanks. Your request is in, and our team will follow up with the right next step.";
  const trustBullets = isFoundingAuditIntent ? foundingTrustBullets : defaultTrustBullets;
  const nextSteps = isFoundingAuditIntent ? foundingNextSteps : defaultNextSteps;

  return (
    <MarketingShell
      ctaHref={session ? primaryHref : "/pricing"}
      ctaLabel={session ? "Open workspace" : "View pricing"}
    >
      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-stretch">
        <div className="brand-surface relative overflow-hidden p-8 md:p-10 lg:p-12">
          <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(123,230,241,0.8),transparent)]" />
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#8debf4]">
            {heroEyebrow}
          </p>
          <h1 className="mt-5 max-w-2xl text-4xl font-semibold tracking-[-0.04em] text-white md:text-5xl">
            {heroTitle}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-white/[0.72] md:text-lg">
            {heroBody}
          </p>

          <div className="mt-8 grid gap-4">
            {trustBullets.map((item) => (
              <div
                key={item}
                className="rounded-[24px] border border-white/10 bg-white/[0.06] p-5 backdrop-blur"
              >
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#8debf4]" />
                  <p className="text-base font-semibold text-white">{item}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 rounded-[28px] border border-white/10 bg-black/20 p-6 backdrop-blur">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-[#8debf4]" />
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#8debf4]">
                What happens next
              </p>
            </div>
            <div className="mt-5 space-y-4">
              {nextSteps.map((step) => (
                <div key={step} className="flex items-start gap-3 text-sm leading-7 text-white/[0.76]">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#8debf4]" />
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="content-surface p-8 md:p-10 lg:p-12">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
                {scheduleLabel}
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-ink">
                {formTitle}
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-steel">
                {formBody}
              </p>
            </div>
            <a
              href={`mailto:${salesEmail}?subject=${encodeURIComponent(
                isFoundingAuditIntent
                  ? "Founding Risk Audit"
                  : "Evolve Edge walkthrough"
              )}`}
              className="inline-flex items-center rounded-full border border-line px-5 py-3 text-sm font-semibold text-ink transition hover:border-accent/30 hover:text-accent"
            >
              Email {salesEmail}
            </a>
          </div>

          {params.submitted ? (
            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-[#0f766e]">
              {successMessage}
            </div>
          ) : null}
          {params.error === "missing-required" ? (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-[#b42318]">
              Work email and company name are required so we can prepare the right next step for your team.
            </div>
          ) : null}

          <form action={submitContactSalesLeadAction} className="mt-8 grid gap-4">
            <input type="hidden" name="intent" value={params.intent ?? "general-sales"} />
            <input type="hidden" name="source" value={params.source ?? "contact-sales-page"} />
            <input type="hidden" name="sourcePath" value="/contact-sales" />
            <input
              type="hidden"
              name="requestedPlanCode"
              value={params.intent?.includes("enterprise") ? "enterprise-annual" : ""}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-ink">First name</span>
                <input
                  name="firstName"
                  className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink transition focus:border-accent/40 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink">Last name</span>
                <input
                  name="lastName"
                  className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink transition focus:border-accent/40 focus:outline-none"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-ink">Work email</span>
                <input
                  name="email"
                  type="email"
                  required
                  className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink transition focus:border-accent/40 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink">Company name</span>
                <input
                  name="companyName"
                  required
                  className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink transition focus:border-accent/40 focus:outline-none"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-ink">Job title</span>
                <input
                  name="jobTitle"
                  className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink transition focus:border-accent/40 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink">Team size</span>
                <select
                  name="teamSize"
                  defaultValue="11-50"
                  className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink transition focus:border-accent/40 focus:outline-none"
                >
                  <option value="1-10">1-10</option>
                  <option value="11-50">11-50</option>
                  <option value="51-200">51-200</option>
                  <option value="201-1000">201-1000</option>
                  <option value="1000+">1000+</option>
                </select>
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-ink">{messageLabel}</span>
              <textarea
                name="message"
                rows={5}
                className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink transition focus:border-accent/40 focus:outline-none"
                placeholder={messagePlaceholder}
              />
            </label>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#1cc7d8,#6fe8f1)] px-5 py-3 text-sm font-semibold text-[#05111d] shadow-[0_16px_40px_rgba(28,199,216,0.24)] transition hover:-translate-y-0.5"
              >
                {submitLabel}
              </button>
              <Link
                href={primaryHref as never}
                className="inline-flex items-center justify-center rounded-full border border-line px-5 py-3 text-sm font-semibold text-ink transition hover:border-accent/30 hover:text-accent"
              >
                {session ? "Open workspace" : "Return to pricing"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </form>
        </div>
      </section>
    </MarketingShell>
  );
}
