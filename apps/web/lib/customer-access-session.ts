import "server-only";

import { hasPermission } from "./authorization";
import {
  getOptionalCurrentSession,
  getSessionAuthorizationContext,
  requireCurrentSession,
  type AppSession
} from "./auth";

export type CustomerAccessScope =
  | "portal"
  | "reports"
  | "report_artifacts"
  | "billing"
  | "settings";

export type CustomerAccessSession =
  | {
      presence: "absent";
      isAuthenticated: false;
      customerId: null;
      organizationId: null;
      organizationSlug: null;
      authMode: null;
      accessScopes: CustomerAccessScope[];
    }
  | {
      presence: "present";
      isAuthenticated: true;
      customerId: string;
      organizationId: string | null;
      organizationSlug: string | null;
      authMode: AppSession["authMode"];
      accessScopes: CustomerAccessScope[];
    };

function buildCustomerAccessScopes(session: AppSession): CustomerAccessScope[] {
  const authorization = getSessionAuthorizationContext(session);
  const scopes: CustomerAccessScope[] = [];

  if (session.organization) {
    scopes.push("portal", "settings");
  }

  if (hasPermission(authorization, "reports.view")) {
    scopes.push("reports", "report_artifacts");
  }

  if (hasPermission(authorization, "billing.view")) {
    scopes.push("billing");
  }

  return Array.from(new Set(scopes));
}

export function toCustomerAccessSession(
  session: AppSession | null
): CustomerAccessSession {
  if (!session) {
    return {
      presence: "absent",
      isAuthenticated: false,
      customerId: null,
      organizationId: null,
      organizationSlug: null,
      authMode: null,
      accessScopes: []
    };
  }

  return {
    presence: "present",
    isAuthenticated: true,
    customerId: session.user.id,
    organizationId: session.organization?.id ?? null,
    organizationSlug: session.organization?.slug ?? null,
    authMode: session.authMode,
    accessScopes: buildCustomerAccessScopes(session)
  };
}

export async function getOptionalCustomerAccessSession() {
  return toCustomerAccessSession(await getOptionalCurrentSession());
}

export async function requireCustomerAccessSession(options?: {
  requireOrganization?: boolean;
}) {
  return toCustomerAccessSession(await requireCurrentSession(options));
}
