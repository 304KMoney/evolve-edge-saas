import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { MarketingShell } from "../components/marketing-shell";

const actionLinks = [
  { href: "/pricing", label: "View Pricing" },
  { href: "/intake", label: "Start Intake" },
  { href: "/contact", label: "Contact Us" }
];

const highlights = [
  "AI risk and compliance advisory built for high-trust organizations",
  "Clear intake, pricing, and customer workspace entry points",
  "Production-safe homepage with minimal runtime dependencies"
];

export default function HomePage() {
  return (
    <MarketingShell ctaHref="/pricing" ctaLabel="Get Started">
      <div className="mx-auto grid w-full max-w-[1240px] gap-8 md:gap-12">
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-stretch">
          <div className="brand-surface px-6 py-8 sm:px-8 sm:py-10 md:px-12 md:py-14 lg:px-14">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#8debf4]">
              Production Homepage
            </p>
            <h1 className="mt-5 max-w-[10ch] text-4xl font-semibold leading-[1.02] tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">
              Evolve Edge
            </h1>
            <p className="mt-5 max-w-[44rem] text-base leading-7 text-white/[0.78] sm:text-lg sm:leading-8">
              AI security, compliance, and audit delivery for organizations that need
              clear decisions and operational follow-through.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/pricing"
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-[linear-gradient(135deg,#1cc7d8,#6fe8f1)] px-6 py-3.5 text-sm font-semibold text-[#05111d] shadow-[0_18px_44px_rgba(28,199,216,0.24)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_52px_rgba(28,199,216,0.3)]"
              >
                View Pricing
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href="/sign-in"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/15 bg-white/[0.05] px-6 py-3.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.08]"
              >
                Sign In
              </Link>
            </div>
          </div>

          <div className="content-surface px-6 py-7 sm:px-8 sm:py-8 md:px-10 md:py-10">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
              What this gives you
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-ink">
              A stable entry point into the platform
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
            Quick links
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-ink">
            Navigate the live product safely
          </h2>
          <div className="mt-7 grid gap-4 md:grid-cols-3">
            {actionLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href as never}
                className="content-surface-muted inline-flex min-h-[72px] items-center justify-between gap-3 px-5 py-5 text-sm font-semibold text-ink transition hover:-translate-y-0.5 hover:border-[#c9dced] hover:bg-white"
              >
                <span>{link.label}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-accent" />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </MarketingShell>
  );
}
