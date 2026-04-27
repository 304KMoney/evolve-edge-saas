import type { Metadata } from "next";
import { MarketingShell } from "../../components/marketing-shell";
import { PageAnalyticsTracker } from "../../components/page-analytics-tracker";
import { PricingPageClient } from "../../components/pricing-page";
import { getPricingPageData } from "../../lib/pricing";
import {
  resolveCanonicalBillingCadence,
  resolvePublicCanonicalPlanCode
} from "../../lib/commercial-catalog";
import { buildPricingAccessStartPath } from "../../lib/pricing-access";

export const metadata: Metadata = {
  title: "Pricing | Evolve Edge",
  description:
    "Compare Evolve Edge plans for AI governance, compliance reporting, and recurring risk oversight."
};

export const dynamic = "force-dynamic";

export default async function PricingPage({
  searchParams
}: {
  searchParams: Promise<{ plan?: string; billingCadence?: string }>;
}) {
  const params = await searchParams;
  const selectedPlanCode = resolvePublicCanonicalPlanCode(params.plan);
  const selectedBillingCadence = resolveCanonicalBillingCadence(
    params.billingCadence,
    "monthly"
  );
  const data = await getPricingPageData(selectedBillingCadence);
  const shellCtaHref = data.sessionState.isAuthenticated
    ? "/dashboard"
    : selectedPlanCode
      ? buildPricingAccessStartPath(selectedPlanCode, selectedBillingCadence)
      : buildPricingAccessStartPath("starter", selectedBillingCadence);

  return (
    <MarketingShell
      ctaHref={shellCtaHref}
      ctaLabel={data.sessionState.isAuthenticated ? "Open workspace" : "Get started"}
    >
      <PageAnalyticsTracker
        eventName="marketing.pricing_viewed"
        payload={{
          location: "pricing-page",
          authenticated: data.sessionState.isAuthenticated,
          selectedPlanCode
        }}
        source="pricing-page"
        storageKey="analytics:pricing-viewed"
      />
      <PricingPageClient
        data={data}
        selectedPlanCode={selectedPlanCode}
        selectedBillingCadence={selectedBillingCadence}
      />
    </MarketingShell>
  );
}
