import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Users, Wallet } from "lucide-react";
import { getOptionalCurrentSession } from "../../lib/auth";
import { getSalesContactEmail } from "../../lib/runtime-config";
import { submitContactSalesLeadAction } from "./actions";

export const metadata: Metadata = {
  title: "Contact Sales | Evolve Edge",
  description:
    "Contact Evolve Edge for enterprise rollout planning, executive walkthroughs, and pricing alignment."
};

function getIntentContent(intent?: string) {
  switch (intent) {
    case "seat-pack":
      return {
        eyebrow: "Seat expansion",
        title: "Plan the next team expansion without interrupting governance work.",
        body:
          "Use this path when the workspace needs additional seats beyond the standard plan allowance.",
        note: "We are interested in expanding seat capacity for our compliance workspace."
      };
    case "asset-pack":
      return {
        eyebrow: "Monitored asset expansion",
        title: "Expand monitored asset coverage for a broader production estate.",
        body:
          "Use this path when vendor and AI model inventories are growing faster than the current plan envelope.",
        note: "We need additional monitored asset capacity for vendors and AI systems."
      };
    case "premium-reports":
      return {
        eyebrow: "Premium reports",
        title: "Add executive-ready report support for higher-stakes stakeholders.",
        body:
          "Use this path when leadership, board, or regulator-facing reporting needs more structure than the core plan provides.",
        note: "We want to discuss premium report options for leadership and external stakeholders."
      };
    case "premium-support":
      return {
        eyebrow: "Premium support",
        title: "Move this workspace onto a faster, higher-touch support motion.",
        body:
          "Use this path when the team needs quicker responses, rollout guidance, or a stronger operational support relationship.",
        note: "We would like to discuss a premium support option for our workspace."
      };
    case "white-glove-onboarding":
      return {
        eyebrow: "White-glove onboarding",
        title: "Reduce rollout friction with guided onboarding support.",
        body:
          "Use this path when the organization wants help with framework setup, executive alignment, and early governance operating rhythm.",
        note: "We want help with a guided onboarding and rollout plan."
      };
    case "demo-request":
      return {
        eyebrow: "Demo request",
        title: "Book a serious walkthrough for your compliance and governance team.",
        body:
          "Use this path when you want a guided product walkthrough tied to your current governance program, reporting needs, and rollout timeline.",
        note: "We would like a product walkthrough tailored to our governance and compliance use case."
      };
    default:
      return {
        eyebrow: "Contact Sales",
        title: "Align pricing, rollout scope, and executive confidence before you commit.",
        body:
          "Use this path when you need help matching plan fit to procurement timing, governance maturity, or a broader enterprise rollout.",
        note: "We are evaluating Evolve Edge for AI governance and compliance operations."
      };
  }
}

export default async function ContactSalesPage({
  searchParams
}: {
  searchParams: Promise<{ intent?: string; source?: string; submitted?: string; error?: string }>;
}) {
  const session = await getOptionalCurrentSession();
  const params = await searchParams;
  const salesEmail = getSalesContactEmail();
  const primaryHref = session
    ? session.onboardingRequired
      ? "/onboarding"
      : "/dashboard/settings"
    : "/pricing";
  const content = getIntentContent(params.intent);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(153,246,228,0.35),transparent_28%),linear-gradient(180deg,#f8fbfc_0%,#edf5f7_100%)] px-6 py-10">
      <div className="mx-auto max-w-5xl rounded-[32px] border border-white/80 bg-white/92 p-8 shadow-[0_24px_90px_rgba(15,23,42,0.08)] md:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#0f766e]">
          {content.eyebrow}
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-[#0f172a]">
          {content.title}
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-8 text-[#475569]">
          {content.body}
        </p>
        {params.source ? (
          <p className="mt-3 text-sm text-[#64748b]">
            Source: <span className="font-semibold text-[#0f172a]">{params.source}</span>
          </p>
        ) : null}
        {params.submitted ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-[#0f766e]">
            Your request was captured successfully. Revenue operations can now route it into CRM and follow-up workflows.
          </div>
        ) : null}
        {params.error === "missing-required" ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-[#b42318]">
            Company name and email are required so the request can be routed safely into CRM.
          </div>
        ) : null}

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-[24px] border border-[#d7eaeb] bg-[#fbfdfd] p-5">
            <ShieldCheck className="h-6 w-6 text-[#0f766e]" />
            <h2 className="mt-4 text-lg font-semibold text-[#0f172a]">Compliance fit</h2>
            <p className="mt-2 text-sm leading-7 text-[#64748b]">
              Match plan capacity to framework coverage, reporting obligations, and governance cadence.
            </p>
          </div>
          <div className="rounded-[24px] border border-[#d7eaeb] bg-[#fbfdfd] p-5">
            <Users className="h-6 w-6 text-[#0f766e]" />
            <h2 className="mt-4 text-lg font-semibold text-[#0f172a]">Executive rollout</h2>
            <p className="mt-2 text-sm leading-7 text-[#64748b]">
              Coordinate the plan around stakeholder workflows, approvals, and leadership visibility.
            </p>
          </div>
          <div className="rounded-[24px] border border-[#d7eaeb] bg-[#fbfdfd] p-5">
            <Wallet className="h-6 w-6 text-[#0f766e]" />
            <h2 className="mt-4 text-lg font-semibold text-[#0f172a]">Procurement timing</h2>
            <p className="mt-2 text-sm leading-7 text-[#64748b]">
              Start monthly when needed, then convert cleanly to annual once budget or procurement is ready.
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <a
            href={`mailto:${salesEmail}?subject=Evolve%20Edge%20pricing%20and%20rollout`}
            className="inline-flex items-center justify-center rounded-full bg-[#0f172a] px-5 py-3 text-sm font-semibold text-white"
          >
            Email {salesEmail}
          </a>
          <Link
            href={primaryHref as never}
            className="inline-flex items-center justify-center rounded-full border border-[#d7eaeb] bg-white px-5 py-3 text-sm font-semibold text-[#0f172a]"
          >
            {session ? "Open billing and workspace" : "Return to pricing"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>

        <div className="mt-8 rounded-[28px] border border-[#d7eaeb] bg-white p-6">
          <h2 className="text-2xl font-semibold text-[#0f172a]">Request a conversation</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[#64748b]">
            This form captures a normalized lead record with source attribution so sales, HubSpot, and n8n can process it without relying on inbox-only follow-up.
          </p>

          <form action={submitContactSalesLeadAction} className="mt-6 grid gap-4">
            <input type="hidden" name="intent" value={params.intent ?? "general-sales"} />
            <input type="hidden" name="source" value={params.source ?? "contact-sales-page"} />
            <input type="hidden" name="sourcePath" value="/contact-sales" />
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-[#0f172a]">First name</span>
                <input
                  name="firstName"
                  className="mt-2 w-full rounded-2xl border border-[#d7eaeb] bg-white px-4 py-3 text-sm text-[#0f172a]"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-[#0f172a]">Last name</span>
                <input
                  name="lastName"
                  className="mt-2 w-full rounded-2xl border border-[#d7eaeb] bg-white px-4 py-3 text-sm text-[#0f172a]"
                />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-[#0f172a]">Work email</span>
                <input
                  name="email"
                  type="email"
                  required
                  className="mt-2 w-full rounded-2xl border border-[#d7eaeb] bg-white px-4 py-3 text-sm text-[#0f172a]"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-[#0f172a]">Company name</span>
                <input
                  name="companyName"
                  required
                  className="mt-2 w-full rounded-2xl border border-[#d7eaeb] bg-white px-4 py-3 text-sm text-[#0f172a]"
                />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="block">
                <span className="text-sm font-medium text-[#0f172a]">Job title</span>
                <input
                  name="jobTitle"
                  className="mt-2 w-full rounded-2xl border border-[#d7eaeb] bg-white px-4 py-3 text-sm text-[#0f172a]"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-[#0f172a]">Phone</span>
                <input
                  name="phone"
                  className="mt-2 w-full rounded-2xl border border-[#d7eaeb] bg-white px-4 py-3 text-sm text-[#0f172a]"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-[#0f172a]">Team size</span>
                <select
                  name="teamSize"
                  className="mt-2 w-full rounded-2xl border border-[#d7eaeb] bg-white px-4 py-3 text-sm text-[#0f172a]"
                  defaultValue="11-50"
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
              <span className="text-sm font-medium text-[#0f172a]">Requested plan code</span>
              <input
                name="requestedPlanCode"
                defaultValue={params.intent?.includes("enterprise") ? "enterprise-annual" : ""}
                className="mt-2 w-full rounded-2xl border border-[#d7eaeb] bg-white px-4 py-3 text-sm text-[#0f172a]"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-[#0f172a]">What should we prepare for the call?</span>
              <textarea
                name="message"
                rows={4}
                defaultValue={content.note}
                className="mt-2 w-full rounded-2xl border border-[#d7eaeb] bg-white px-4 py-3 text-sm text-[#0f172a]"
              />
            </label>
            <button
              type="submit"
              className="inline-flex w-fit items-center justify-center rounded-full bg-[#0f172a] px-5 py-3 text-sm font-semibold text-white"
            >
              Submit request
            </button>
          </form>
        </div>

        <div className="mt-8 rounded-[28px] border border-[#d7eaeb] bg-[#f8fbfb] p-6">
          <h2 className="text-xl font-semibold text-[#0f172a]">Suggested outreach note</h2>
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-2xl bg-white p-4 text-sm leading-7 text-[#334155]">
{`${content.note}

Please help us determine:
- the best-fit plan for our current team and framework scope
- whether monthly or annual is the better starting point
- what an executive rollout would look like for our stakeholders

Our current environment:
- organization type:
- estimated seat count:
- frameworks in scope:
- target go-live window:
- current expansion trigger: ${params.intent ?? "general-pricing"}`}
          </pre>
        </div>
      </div>
    </main>
  );
}
