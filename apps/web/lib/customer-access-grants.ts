import "server-only";

import type { CanonicalPlanCode } from "./canonical-domain";
import {
  resolveCanonicalPlanCode,
  resolveCanonicalPlanCodeFromRevenuePlanCode
} from "./commercial-catalog";
import type {
  CustomerAccessScope,
  CustomerAccessSession
} from "./customer-access-session";

export const CUSTOMER_ACCESS_GRANT_STATUSES = [
  "issued",
  "binding_pending",
  "expired",
  "revoked"
] as const;

export type CustomerAccessGrantStatus =
  (typeof CUSTOMER_ACCESS_GRANT_STATUSES)[number];

export type CustomerAccessGrant = {
  customerId: string | null;
  organizationId: string | null;
  reportScope: {
    scopeType: "organization_reports" | "report_placeholder";
    reportId: string | null;
  };
  selectedPlan: CanonicalPlanCode | null;
  grantStatus: CustomerAccessGrantStatus;
  issuedAt: string;
  expiresAt: string | null;
};

function normalizeCanonicalPlanCode(
  value: string | CanonicalPlanCode | null | undefined
): CanonicalPlanCode | null {
  return (
    resolveCanonicalPlanCode(value ?? null) ??
    resolveCanonicalPlanCodeFromRevenuePlanCode(value ?? null)
  );
}

export function createCustomerAccessGrant(input: {
  customerId?: string | null;
  organizationId?: string | null;
  reportId?: string | null;
  selectedPlan?: string | CanonicalPlanCode | null;
  grantStatus: CustomerAccessGrantStatus;
  issuedAt?: Date | string | null;
  expiresAt?: Date | string | null;
}): CustomerAccessGrant {
  const issuedAt =
    input.issuedAt instanceof Date
      ? input.issuedAt.toISOString()
      : typeof input.issuedAt === "string" && input.issuedAt.trim().length > 0
        ? input.issuedAt
        : new Date().toISOString();

  const expiresAt =
    input.expiresAt instanceof Date
      ? input.expiresAt.toISOString()
      : typeof input.expiresAt === "string" && input.expiresAt.trim().length > 0
        ? input.expiresAt
        : null;

  return {
    customerId: input.customerId?.trim() || null,
    organizationId: input.organizationId?.trim() || null,
    reportScope: {
      // Current first-customer-safe path: payment reconciliation can issue an
      // organization-scoped access grant before a specific report id exists.
      // Future durable grant issuance should narrow this to report-level grants
      // once report delivery artifacts are persisted.
      scopeType: input.reportId ? "report_placeholder" : "organization_reports",
      reportId: input.reportId?.trim() || null
    },
    selectedPlan: normalizeCanonicalPlanCode(input.selectedPlan),
    grantStatus: input.grantStatus,
    issuedAt,
    expiresAt
  };
}

export function createPlaceholderCustomerAccessGrant(input: {
  accessSession: CustomerAccessSession;
  requiredScope: CustomerAccessScope;
  reportId?: string | null;
  boundOrganizationId?: string | null;
  selectedPlan?: string | CanonicalPlanCode | null;
}) {
  if (input.boundOrganizationId?.trim()) {
    return createCustomerAccessGrant({
      customerId: input.accessSession.isAuthenticated
        ? input.accessSession.customerId
        : null,
      organizationId: input.boundOrganizationId,
      reportId: input.reportId ?? null,
      selectedPlan: input.selectedPlan ?? null,
      grantStatus: "issued"
    });
  }

  if (
    !input.accessSession.isAuthenticated ||
    !input.accessSession.organizationId ||
    !input.accessSession.accessScopes.includes(input.requiredScope)
  ) {
    return null;
  }

  return createCustomerAccessGrant({
    customerId: input.accessSession.customerId,
    organizationId: input.accessSession.organizationId,
    reportId: input.reportId ?? null,
    selectedPlan: input.selectedPlan ?? null,
    grantStatus: "issued"
  });
}

// TODO: Persist this grant into CustomerAccessGrantRecord from the verified
// Stripe webhook path so protected report access can evaluate app-owned
// customer/report grants instead of only relying on organization-scoped rules.
