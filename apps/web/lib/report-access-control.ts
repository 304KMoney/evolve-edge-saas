import "server-only";

import type { Route } from "next";
import type { CustomerAccessGrant } from "./customer-access-grants";
import type {
  CustomerAccessScope,
  CustomerAccessSession
} from "./customer-access-session";

export type ReportAccessDecision =
  | {
      allowed: true;
      reason: "allowed";
    }
  | {
      allowed: false;
      reason:
        | "missing_report_id"
        | "missing_report_binding"
        | "missing_access_grant"
        | "expired_access_grant"
        | "revoked_access_grant"
        | "unauthenticated"
        | "missing_organization_context"
        | "missing_access_scope"
        | "report_not_bound_to_customer";
      customerMessage: string;
    };

export type ReportAccessStateReason =
  | "unpaid"
  | "payment-pending"
  | "no-grant"
  | "unauthorized"
  | "expired"
  | "not-bound"
  | "unavailable";

export function evaluateCustomerReportAccess(input: {
  reportId: string | null | undefined;
  reportOrganizationId: string | null | undefined;
  accessSession: CustomerAccessSession;
  requiredScope: CustomerAccessScope;
  accessGrant?: CustomerAccessGrant | null;
  boundOrganizationId?: string | null;
  requireActiveGrant?: boolean;
}): ReportAccessDecision {
  const reportId = input.reportId?.trim();

  if (!reportId) {
    return {
      allowed: false,
      reason: "missing_report_id",
      customerMessage: "A report identifier is required before access can be evaluated."
    };
  }

  if (!input.reportOrganizationId) {
    return {
      allowed: false,
      reason: "missing_report_binding",
      customerMessage:
        "This report is missing organization binding metadata and cannot be safely exposed."
    };
  }

  if (input.accessGrant) {
    if (input.accessGrant.grantStatus === "expired") {
      return {
        allowed: false,
        reason: "expired_access_grant",
        customerMessage:
          "This report access grant has expired and should be refreshed through the correct customer delivery path."
      };
    }

    if (input.accessGrant.grantStatus === "revoked") {
      return {
        allowed: false,
        reason: "revoked_access_grant",
        customerMessage:
          "This report access grant is no longer active for the current customer context."
      };
    }

    if (
      input.accessGrant.organizationId &&
      input.accessGrant.organizationId !== input.reportOrganizationId
    ) {
      return {
        allowed: false,
        reason: "report_not_bound_to_customer",
        customerMessage:
          "This report is not bound to the customer context used for this access attempt."
      };
    }

    if (
      input.accessGrant.reportScope.reportId &&
      input.accessGrant.reportScope.reportId !== reportId
    ) {
      return {
        allowed: false,
        reason: "report_not_bound_to_customer",
        customerMessage:
          "This report is not included in the current customer access grant."
      };
    }
  }

  if (input.boundOrganizationId) {
    // Current first-customer-safe path: a signed export token may carry
    // organization binding context even when the caller is not walking through
    // the normal authenticated dashboard flow.
    if (input.boundOrganizationId !== input.reportOrganizationId) {
      return {
        allowed: false,
        reason: "report_not_bound_to_customer",
        customerMessage:
          "This report is not bound to the customer context used for this access attempt."
      };
    }

    return {
      allowed: true,
      reason: "allowed"
    };
  }

  if (!input.accessSession.isAuthenticated) {
    return {
      allowed: false,
      reason: "unauthenticated",
      customerMessage: "A valid customer session is required before this report can be accessed."
    };
  }

  if (!input.accessSession.organizationId) {
    return {
      allowed: false,
      reason: "missing_organization_context",
      customerMessage:
        "The current customer session is not attached to an organization context."
    };
  }

  if (!input.accessSession.accessScopes.includes(input.requiredScope)) {
    return {
      allowed: false,
      reason: "missing_access_scope",
      customerMessage:
        "The current customer session does not include the required report access scope."
    };
  }

  if (input.accessSession.organizationId !== input.reportOrganizationId) {
    return {
      allowed: false,
      reason: "report_not_bound_to_customer",
      customerMessage:
        "This report is not bound to the current customer organization."
    };
  }

  if (input.requireActiveGrant) {
    return {
      allowed: false,
      reason: "missing_access_grant",
      customerMessage:
        "This report is not included in the active customer access grants for the current session."
    };
  }

  return {
    allowed: true,
    reason: "allowed"
  };
}

export function mapReportAccessDecisionToStateReason(
  decision: Exclude<ReportAccessDecision, { allowed: true }>
): ReportAccessStateReason {
  switch (decision.reason) {
    case "report_not_bound_to_customer":
      return "not-bound";
    case "expired_access_grant":
      return "expired";
    case "missing_access_grant":
      return "no-grant";
    case "missing_report_binding":
      return "unavailable";
    case "revoked_access_grant":
      return "no-grant";
    case "unauthenticated":
    case "missing_organization_context":
    case "missing_access_scope":
    case "missing_report_id":
    default:
      return "unauthorized";
  }
}

export function buildReportAccessStateHref(input: {
  reason: ReportAccessStateReason;
  reportId?: string | null;
}) {
  const searchParams = new URLSearchParams({
    reason: input.reason
  });

  if (input.reportId?.trim()) {
    searchParams.set("reportId", input.reportId.trim());
  }

  return `/dashboard/reports/access?${searchParams.toString()}` as Route;
}
