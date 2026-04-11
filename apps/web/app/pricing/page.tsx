import type { Metadata } from "next";
import Link from "next/link";
import { PageAnalyticsTracker } from "../../components/page-analytics-tracker";
import { PricingPageClient } from "../../components/pricing-page";
import { getPricingPageData } from "../../lib/pricing";

export const metadata: Metadata = {
  title: "Pricing | Evolve Edge",
  description:
    "Compare Evolve Edge plans for AI governance, compliance reporting, and recurring risk oversight."
};

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const data = await getPricingPageData();

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-white/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-sm font-semibold uppercase tracking-[0.24em] text-[#0f766e]">
            Evolve Edge
          </Link>
          <div className="flex items-center gap-3">
          <Link
            href="/"
            className="rounded-full border border-[#d6e6e8] bg-white px-4 py-2 text-sm font-semibold text-[#0f172a]"
          >
            Home
          </Link>
            <Link
            href={"/trust" as never}
            className="rounded-full border border-[#d6e6e8] bg-white px-4 py-2 text-sm font-semibold text-[#0f172a]"
          >
            Trust center
          </Link>
          <Link
            href={data.sessionState.isAuthenticated ? "/dashboard" : "/sign-in"}
            className="rounded-full bg-[#0f172a] px-4 py-2 text-sm font-semibold text-white"
          >
              {data.sessionState.isAuthenticated ? "Open workspace" : "Sign in"}
            </Link>
          </div>
        </div>
      </header>
      <PageAnalyticsTracker
        eventName="marketing.pricing_viewed"
        payload={{
          location: "pricing-page",
          authenticated: data.sessionState.isAuthenticated
        }}
        source="pricing-page"
        storageKey="analytics:pricing-viewed"
      />
      <PricingPageClient data={data} />
    </>
  );
}
