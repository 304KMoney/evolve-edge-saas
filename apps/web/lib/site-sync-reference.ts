import "server-only";

import {
  getCanonicalCommercialPlanCatalog,
  type CanonicalPlanCode
} from "./commercial-catalog";
import { getAppUrl, getContactSalesUrl } from "./runtime-config";

export type HostingerPlanReference = {
  code: CanonicalPlanCode;
  displayName: "Starter" | "Scale" | "Enterprise";
  priceLabel: string;
  priceUsd: number | null;
  publicDescription: string;
  ctaLabel: string;
  ctaTarget: "stripe_checkout" | "contact_sales";
  entryHref: string;
  workflowCode: string;
  contactSalesOnly: boolean;
};

export type HostingerSiteSyncReference = {
  version: "hostinger-site-sync.v1";
  generatedAt: string;
  sourceOfTruth: {
    commercialModel: "backend";
    billing: "stripe";
    orchestration: "n8n";
    aiProcessing: "dify" | "openai_langgraph";
    crm: "hubspot";
    presentation: "hostinger";
  };
  publicPlans: HostingerPlanReference[];
  workflowCodes: readonly string[];
  ctaRoutingRules: {
    starter: "stripe_checkout";
    scale: "stripe_checkout";
    enterprise: "contact_sales";
  };
  compatibilityNotes: string[];
  operatorPublishingChecklist: string[];
};

function buildEntryHref(planCode: CanonicalPlanCode) {
  if (planCode === "enterprise") {
    return getContactSalesUrl();
  }

  return `${getAppUrl()}/pricing?plan=${encodeURIComponent(planCode)}&billingCadence=monthly`;
}

export function getHostingerSiteSyncReference(): HostingerSiteSyncReference {
  const publicPlans = getCanonicalCommercialPlanCatalog().map((plan) => ({
    code: plan.code,
    displayName: plan.displayName,
    priceLabel: plan.publicPriceLabel,
    priceUsd: plan.publicPriceUsd,
    publicDescription: plan.publicDescription,
    ctaLabel: plan.ctaLabel,
    ctaTarget: plan.hostingerCtaTarget,
    entryHref: buildEntryHref(plan.code),
    workflowCode: plan.workflowCode,
    contactSalesOnly: plan.contactSalesOnly
  }));

  return {
    version: "hostinger-site-sync.v1",
    generatedAt: new Date().toISOString(),
    sourceOfTruth: {
      commercialModel: "backend",
      billing: "stripe",
      orchestration: "n8n",
      aiProcessing: "openai_langgraph",
      crm: "hubspot",
      presentation: "hostinger"
    },
    publicPlans,
    workflowCodes: publicPlans.map((plan) => plan.workflowCode),
    ctaRoutingRules: {
      starter: "stripe_checkout",
      scale: "stripe_checkout",
      enterprise: "contact_sales"
    },
    compatibilityNotes: [
      "Hostinger must not expose legacy internal names such as Growth.",
      "Starter and Scale should link into app-owned pricing or checkout entry flows, not raw Stripe price IDs.",
      "Enterprise remains contact-sales-only in the public commercial model."
    ],
    operatorPublishingChecklist: [
      "Confirm Starter, Scale, and Enterprise names match the canonical catalog exactly.",
      "Confirm public pricing matches the backend-owned commercial model before publishing.",
      "Confirm Enterprise uses contact sales and not self-serve checkout.",
      "Confirm Hostinger copy does not mention Growth or any legacy one-time pricing.",
      "If Hostinger exposes billing cadence, confirm monthly and annual labels match the app exactly. Otherwise link users into the app-owned pricing page.",
      "Confirm CTA destinations point to app-owned routes or the configured contact sales URL."
    ]
  };
}
