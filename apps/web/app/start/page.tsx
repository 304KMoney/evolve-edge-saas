import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { MarketingShell } from "../../components/marketing-shell";
import { PageAnalyticsTracker } from "../../components/page-analytics-tracker";
import {
  resolveCanonicalBillingCadence,
  getCanonicalCommercialPlanDefinition,
  resolvePublicCanonicalPlanCode
} from "../../lib/commercial-catalog";
import { requestPricingAccessAction } from "./actions";

export const metadata: Metadata = {
  title: "Get Started | Evolve Edge",
  description:
    "Start the Evolve Edge onboarding workflow and receive secure login instructions for your selected plan."
};

export const dynamic = "force-dynamic";

type StartSearchParams = {
  plan?: string;
  billingCadence?: string;
  submitted?: string;
  delivery?: string;
  error?: string;
};

export default async function StartPage({
  searchParams
}: {
  searchParams: Promise<StartSearchParams>;
}) {
  const params = await searchParams;
  const planCode = resolvePublicCanonicalPlanCode(params.plan ?? "") ?? "starter";
  const billingCadence = resolveCanonicalBillingCadence(
    params.billingCadence,
    "monthly"
  );
  const plan = getCanonicalCommercialPlanDefinition(planCode) ??
    getCanonicalCommercialPlanDefinition("starter");

  if (!plan || plan.code === "enterprise") {
    return (
      <MarketingShell ctaHref="/pricing" ctaLabel="View pricing">
        <main className="mx-auto flex min-h-[70vh] max-w-3xl items-center px-6 py-10">
          <div className="content-surface w-full p-8 md:p-10">
            <h1 className="text-3xl font-semibold text-ink">Starter and Scale launch here</h1>
            <p className="mt-4 text-sm leading-7 text-steel">
              Enterprise remains sales-led. Use the pricing page to choose Starter or Scale, or
              contact sales for enterprise rollout support.
            </p>
            <div className="mt-6">
              <Link
                href="/pricing"
                className="inline-flex items-center rounded-full bg-[#0f172a] px-5 py-3 text-sm font-semibold text-white"
              >
                Return to pricing
              </Link>
            </div>
          </div>
        </main>
      </MarketingShell>
    );
  }

  const submitted = params.submitted === "1";
  const delivery = params.delivery ?? "";
  const error = params.error ?? "";
  const successCopy =
    delivery === "guide-and-credentials"
      ? "Check your inbox for two emails: one with login steps and one with your temporary credentials."
      : "Check your inbox for your login email. We kept any active workspace password in place.";

  return (
    <MarketingShell ctaHref="/pricing" ctaLabel="View pricing">
      <PageAnalyticsTracker
        eventName="marketing.pricing_viewed"
        payload={{
          location: "pricing-page",
          authenticated: false,
          selectedPlanCode: plan.code
        }}
        source="pricing-page"
        storageKey={`analytics:pricing-started:${plan.code}`}
      />

      <main className="mx-auto flex min-h-screen max-w-5xl items-center px-6 py-10">
        <div className="grid w-full gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="brand-surface p-8 md:p-10">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#8debf4]">
              Start {plan.displayName}
            </p>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white">
              Start the workflow without a manual login handoff
            </h1>
            <p className="mt-5 text-sm leading-8 text-white/[0.78]">
              Tell us where to send access. We will start the {plan.displayName} onboarding path,
              email secure login instructions, and issue temporary credentials when the customer
              does not already have a workspace password.
            </p>

            <div className="mt-8 space-y-4">
              {[
                "Selected plan carries directly into onboarding.",
                "Starter and Scale stay app-owned through onboarding and checkout.",
                "Existing workspace passwords are not reset for active customers."
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-[24px] border border-white/10 bg-white/[0.06] p-5"
                >
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#8debf4]" />
                    <p className="text-sm leading-7 text-white/[0.8]">{item}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="content-surface p-8 md:p-10">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
              Access request
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-ink">
              Email the customer login path
            </h2>
            <p className="mt-4 text-sm leading-7 text-steel">
              Use a work email and company name so we can attach the selected plan to the right
              onboarding flow.
            </p>

            {submitted ? (
              <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-[#0f766e]">
                {successCopy}
              </div>
            ) : null}

            {error === "missing-required" ? (
              <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-[#b42318]">
                Work email and company name are required to start the onboarding workflow.
              </div>
            ) : null}

            <form action={requestPricingAccessAction} className="mt-8 grid gap-4">
              <input type="hidden" name="planCode" value={plan.code} />
              <input type="hidden" name="billingCadence" value={billingCadence} />

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

              <div className="rounded-2xl border border-line bg-mist p-4 text-sm text-steel">
                We will send one email with the sign-in path and, when needed, a second email with
                temporary credentials for {plan.displayName}.
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-full bg-[#0f172a] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#111f36]"
                >
                  Email customer access
                </button>
                <Link
                  href={`/pricing?plan=${plan.code}&billingCadence=${billingCadence}` as never}
                  className="inline-flex items-center justify-center rounded-full border border-line px-5 py-3 text-sm font-semibold text-ink transition hover:border-accent/30 hover:text-accent"
                >
                  Back to pricing
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </div>
            </form>
          </section>
        </div>
      </main>
    </MarketingShell>
  );
}
