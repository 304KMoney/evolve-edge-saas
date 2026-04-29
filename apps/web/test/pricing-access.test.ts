import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PricingPageClient } from "../components/pricing-page";
import type { PricingPageData } from "../lib/pricing";
import { queueEmailNotification } from "../lib/email";
import {
  buildPricingAccessOnboardingPath,
  buildPricingAccessSignInPath,
  buildPricingAccessStartPath,
  shouldIssuePricingAccessCredentials
} from "../lib/pricing-access";

async function runPricingAccessTests() {
  assert.equal(
    buildPricingAccessStartPath("starter"),
    "/signup?redirectTo=%2Fonboarding%3Fplan%3Dstarter%26leadSource%3Dpricing_plan_selection%26leadIntent%3Dlaunch-pricing%26leadPlanCode%3Dstarter"
  );
  assert.equal(
    buildPricingAccessStartPath("starter", "monthly"),
    "/signup?redirectTo=%2Fonboarding%3Fplan%3Dstarter%26leadSource%3Dpricing_plan_selection%26leadIntent%3Dlaunch-pricing%26leadPlanCode%3Dstarter%26billingCadence%3Dmonthly"
  );
  assert.equal(
    buildPricingAccessOnboardingPath("scale"),
    "/onboarding?plan=scale&leadSource=pricing_plan_selection&leadIntent=launch-pricing&leadPlanCode=scale"
  );
  assert.equal(
    buildPricingAccessOnboardingPath("scale", "annual"),
    "/onboarding?plan=scale&leadSource=pricing_plan_selection&leadIntent=launch-pricing&leadPlanCode=scale&billingCadence=annual"
  );
  assert.equal(
    buildPricingAccessSignInPath({
      planCode: "starter",
      billingCadence: "monthly",
      hasWorkspaceAccess: false
    }),
    "/sign-in?redirectTo=%2Fonboarding%3Fplan%3Dstarter%26leadSource%3Dpricing_plan_selection%26leadIntent%3Dlaunch-pricing%26leadPlanCode%3Dstarter%26billingCadence%3Dmonthly"
  );
  assert.equal(
    buildPricingAccessSignInPath({
      planCode: "starter",
      hasWorkspaceAccess: true
    }),
    "/sign-in?redirectTo=%2Fdashboard"
  );

  const pricingData = {
    plans: [
      {
        code: "starter",
        name: "Starter",
        headline: "Starter headline",
        description: "Starter description",
        publicDescription: "Starter public description",
        priceLabel: "$5,000 / month",
        priceUsd: 5000,
        priceByCadence: {
          monthly: {
            label: "$5,000 / month",
            usd: 5000,
            helperText: "Billed monthly"
          },
          annual: {
            label: "$48,000 / year",
            usd: 48000,
            helperText: "Billed annually"
          }
        },
        annualSavingsLabel: "Save $12,000 / year with annual billing",
        billingMotion: "stripe_checkout",
        workflowCode: "audit_starter",
        reportTemplate: "starter",
        processingDepth: "standard",
        isRecommended: false,
        recommendationLabel: null,
        highlights: ["App-owned signup"]
      },
      {
        code: "scale",
        name: "Scale",
        headline: "Scale headline",
        description: "Scale description",
        publicDescription: "Scale public description",
        priceLabel: "$12,000 / month",
        priceUsd: 12000,
        priceByCadence: {
          monthly: {
            label: "$12,000 / month",
            usd: 12000,
            helperText: "Billed monthly"
          },
          annual: {
            label: "$120,000 / year",
            usd: 120000,
            helperText: "Billed annually"
          }
        },
        annualSavingsLabel: "Save $24,000 / year with annual billing",
        billingMotion: "stripe_checkout",
        workflowCode: "audit_scale",
        reportTemplate: "scale",
        processingDepth: "deep",
        isRecommended: true,
        recommendationLabel: "Primary offer",
        highlights: ["Checkout after onboarding"]
      },
      {
        code: "enterprise",
        name: "Enterprise",
        headline: "Enterprise headline",
        description: "Enterprise description",
        publicDescription: "Enterprise public description",
        priceLabel: "Custom",
        priceUsd: null,
        priceByCadence: {
          monthly: {
            label: "Custom",
            usd: null,
            helperText: "Sales-led"
          },
          annual: {
            label: "Custom",
            usd: null,
            helperText: "Sales-led"
          }
        },
        annualSavingsLabel: null,
        billingMotion: "contact_sales",
        workflowCode: "audit_enterprise",
        reportTemplate: "enterprise",
        processingDepth: "custom",
        isRecommended: false,
        recommendationLabel: null,
        highlights: ["Sales-led"]
      }
    ],
    sessionState: {
      isAuthenticated: false,
      onboardingRequired: false,
      organizationName: null,
      organizationRole: null,
      currentPlanCode: null,
      currentPlanName: null
    },
    ctasByPlanCode: {
      starter: {
        kind: "link",
        href: buildPricingAccessStartPath("starter"),
        label: "Start with Starter",
        helperText: "Create an account first."
      },
      scale: {
        kind: "link",
        href: buildPricingAccessStartPath("scale"),
        label: "Start with Scale",
        helperText: "Create an account first."
      },
      enterprise: {
        kind: "link",
        href: "/contact-sales?intent=enterprise-plan&source=pricing-page",
        label: "Contact sales",
        helperText: "Sales-led."
      }
    },
    salesEmail: "sales@example.com",
    marketingLinks: {
      foundingRiskAuditHref: "/pricing?plan=starter",
      foundingRiskAuditCallHref: "/contact"
    }
  } satisfies PricingPageData;

  const pricingMarkup = renderToStaticMarkup(
    React.createElement(PricingPageClient, {
      data: pricingData,
      selectedPlanCode: "starter",
      selectedBillingCadence: "annual"
    })
  );

  assert.match(
    pricingMarkup,
    /\/signup\?redirectTo=%2Fonboarding%3Fplan%3Dstarter%26leadSource%3Dpricing_plan_selection%26leadIntent%3Dlaunch-pricing%26leadPlanCode%3Dstarter%26billingCadence%3Dannual/
  );

  assert.equal(
    shouldIssuePricingAccessCredentials({
      hasWorkspaceAccess: false,
      hasPasswordCredential: false
    }),
    true
  );
  assert.equal(
    shouldIssuePricingAccessCredentials({
      hasWorkspaceAccess: false,
      hasPasswordCredential: true
    }),
    true
  );
  assert.equal(
    shouldIssuePricingAccessCredentials({
      hasWorkspaceAccess: true,
      hasPasswordCredential: false
    }),
    true
  );
  assert.equal(
    shouldIssuePricingAccessCredentials({
      hasWorkspaceAccess: true,
      hasPasswordCredential: true
    }),
    false
  );

  const notifications: Array<Record<string, unknown>> = [];
  const db = {
    emailNotification: {
      async upsert(input: Record<string, unknown>) {
        notifications.push(input);
        return input;
      }
    }
  };

  await queueEmailNotification(db as never, {
    templateKey: "pricing-access-guide",
    recipientEmail: "owner@example.com",
    recipientName: "Owner",
    idempotencyKey: "pricing-access-guide:test",
    payload: {
      companyName: "Acme AI",
      planName: "Starter",
      signInUrl: "https://example.com/sign-in",
      credentialsIssued: true,
      nextStep: "Sign in and continue onboarding."
    }
  });

  await queueEmailNotification(db as never, {
    templateKey: "pricing-access-credentials",
    recipientEmail: "owner@example.com",
    recipientName: "Owner",
    idempotencyKey: "pricing-access-credentials:test",
    payload: {
      loginEmail: "owner@example.com",
      temporaryPassword: "TempPass123!A",
      signInUrl: "https://example.com/sign-in"
    }
  });

  const guideCreate = notifications[0]?.["create"] as Record<string, unknown>;
  const credentialsCreate = notifications[1]?.["create"] as Record<string, unknown>;

  assert.match(String(guideCreate.subject), /How to log in/i);
  assert.match(String(guideCreate.textBody), /Acme AI/);
  assert.match(String(guideCreate.textBody), /https:\/\/example\.com\/sign-in/);

  assert.match(String(credentialsCreate.subject), /login credentials/i);
  assert.match(String(credentialsCreate.textBody), /owner@example.com/);
  assert.match(String(credentialsCreate.textBody), /TempPass123!A/);

  console.log("pricing access tests passed");
}

void runPricingAccessTests();
