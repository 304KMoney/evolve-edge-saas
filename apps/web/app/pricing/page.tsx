import type { Metadata } from "next";
import { MarketingShell } from "../../components/marketing-shell";
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
    <MarketingShell
      ctaHref={data.sessionState.isAuthenticated ? "/dashboard" : "/sign-in"}
      ctaLabel={data.sessionState.isAuthenticated ? "Open workspace" : "Sign in"}
    >
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
    </MarketingShell>
  );
}
