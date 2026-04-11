import { redirect } from "next/navigation";
import { FeatureKey } from "./revenue-catalog";
import { getOrganizationEntitlements, requireEntitlement } from "./entitlements";

export async function requireOrganizationFeature(
  organizationId: string,
  feature: FeatureKey,
  failureRedirect: string
) {
  switch (feature) {
    case "assessments":
      return requireEntitlement(organizationId, "assessments.create", {
        failureRedirect
      });
    case "reportCenter":
      return requireEntitlement(organizationId, "reports.view", {
        failureRedirect
      });
    case "roadmap":
      return requireEntitlement(organizationId, "roadmap.view", {
        failureRedirect
      });
    case "teamManagement":
      return requireEntitlement(organizationId, "members.manage", {
        failureRedirect
      });
    case "billingPortal":
      return requireEntitlement(organizationId, "billing.portal", {
        failureRedirect
      });
    case "executiveReviews":
      return requireEntitlement(organizationId, "executive.reviews", {
        failureRedirect
      });
    case "customFrameworks":
      return requireEntitlement(organizationId, "custom.frameworks", {
        failureRedirect
      });
    case "prioritySupport":
      return requireEntitlement(organizationId, "priority.support", {
        failureRedirect
      });
    case "apiAccess":
      return requireEntitlement(organizationId, "api.access", {
        failureRedirect
      });
    default:
      const entitlements = await getOrganizationEntitlements(organizationId);
      if (!entitlements.canUseFeature(feature)) {
        redirect(failureRedirect as never);
      }
      return entitlements;
  }
}

export async function requireAssessmentCreationAccess(
  organizationId: string,
  failureRedirect: string
) {
  return requireEntitlement(organizationId, "assessments.create", {
    failureRedirect
  });
}
