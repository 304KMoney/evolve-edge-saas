import { randomBytes } from "node:crypto";
import { sanitizeInternalRedirect } from "./auth";
import type { CanonicalPlanCode } from "./commercial-catalog";

export function buildPricingAccessOnboardingPath(planCode: CanonicalPlanCode) {
  return sanitizeInternalRedirect(
    `/onboarding?plan=${encodeURIComponent(planCode)}&leadSource=pricing_plan_selection&leadIntent=launch-pricing&leadPlanCode=${encodeURIComponent(planCode)}`
  );
}

export function buildPricingAccessStartPath(planCode: CanonicalPlanCode) {
  return `/start?plan=${encodeURIComponent(planCode)}`;
}

export function buildPricingAccessSignInPath(input: {
  planCode: CanonicalPlanCode;
  hasWorkspaceAccess: boolean;
}) {
  const redirectTo = input.hasWorkspaceAccess
    ? "/dashboard"
    : buildPricingAccessOnboardingPath(input.planCode);

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
