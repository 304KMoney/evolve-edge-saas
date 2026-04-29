import { randomBytes } from "node:crypto";
import { sanitizeInternalRedirect } from "./auth";
import type { CanonicalPlanCode } from "./commercial-catalog";
import {
  resolveCanonicalBillingCadence,
  type CanonicalBillingCadence
} from "./commercial-catalog";

function appendBillingCadence(
  searchParams: URLSearchParams,
  billingCadence?: CanonicalBillingCadence | null
) {
  if (!billingCadence) {
    return;
  }

  searchParams.set(
    "billingCadence",
    resolveCanonicalBillingCadence(billingCadence, "monthly")
  );
}

export function buildPricingAccessOnboardingPath(
  planCode: CanonicalPlanCode,
  billingCadence?: CanonicalBillingCadence | null
) {
  const searchParams = new URLSearchParams({
    plan: planCode,
    leadSource: "pricing_plan_selection",
    leadIntent: "launch-pricing",
    leadPlanCode: planCode
  });
  appendBillingCadence(searchParams, billingCadence);

  return sanitizeInternalRedirect(`/onboarding?${searchParams.toString()}`);
}

export function buildPricingAccessStartPath(
  planCode: CanonicalPlanCode,
  billingCadence?: CanonicalBillingCadence | null
) {
  const onboardingPath = buildPricingAccessOnboardingPath(planCode, billingCadence);
  const searchParams = new URLSearchParams({
    redirectTo: onboardingPath
  });

  return `/signup?${searchParams.toString()}`;
}

export function buildPricingAccessSignInPath(input: {
  planCode: CanonicalPlanCode;
  billingCadence?: CanonicalBillingCadence | null;
  hasWorkspaceAccess: boolean;
}) {
  const redirectTo = input.hasWorkspaceAccess
    ? "/dashboard"
    : buildPricingAccessOnboardingPath(input.planCode, input.billingCadence);

  return `/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`;
}

export function shouldIssuePricingAccessCredentials(input: {
  hasWorkspaceAccess: boolean;
  hasPasswordCredential: boolean;
}) {
  return !input.hasWorkspaceAccess || !input.hasPasswordCredential;
}

export function generatePricingAccessTemporaryPassword() {
  return `${randomBytes(9).toString("base64url")}A!9`;
}
