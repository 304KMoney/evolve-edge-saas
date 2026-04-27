import assert from "node:assert/strict";
import type { AppSession } from "../lib/auth";
import {
  resolveScopedOrganizationSession,
  shouldUsePreviewGuestSession
} from "../lib/auth";

async function runAuthRoutingTests() {
  assert.equal(
    shouldUsePreviewGuestSession({
      requestPath: "/dashboard/reports",
      previewGuestAccessEnabled: true
    }),
    true
  );
  assert.equal(
    shouldUsePreviewGuestSession({
      requestPath: "/onboarding",
      previewGuestAccessEnabled: true
    }),
    true
  );
  assert.equal(
    shouldUsePreviewGuestSession({
      requestPath: "/pricing",
      previewGuestAccessEnabled: true
    }),
    false
  );
  assert.equal(
    shouldUsePreviewGuestSession({
      requestPath: "/onboarding",
      previewGuestAccessEnabled: false
    }),
    false
  );

  const session: AppSession = {
    user: {
      id: "user_123",
      email: "owner@example.com",
      firstName: "Primary",
      lastName: "Owner",
      platformRole: "NONE"
    },
    organization: {
      id: "org_current",
      slug: "current",
      name: "Current Org",
      role: "OWNER",
      isBillingAdmin: false
    },
    onboardingRequired: false,
    authMode: "password"
  };

  const sameOrganizationSession = await resolveScopedOrganizationSession({
    session,
    organizationId: "org_current",
    permission: "reports.view",
    db: {
      organizationMember: {
        async findUnique() {
          throw new Error("same-organization lookup should not hit the database");
        }
      }
    }
  });
  assert.equal(sameOrganizationSession, session);

  const reboundSession = await resolveScopedOrganizationSession({
    session,
    organizationId: "org_report",
    permission: "reports.review",
    db: {
      organizationMember: {
        async findUnique() {
          return {
            role: "ANALYST",
            isBillingAdmin: false,
            organization: {
              id: "org_report",
              slug: "report-org",
              name: "Report Org",
              onboardingCompletedAt: new Date("2026-04-20T00:00:00.000Z")
            }
          };
        }
      }
    }
  });
  assert.equal(reboundSession?.organization?.id, "org_report");
  assert.equal(reboundSession?.organization?.role, "ANALYST");

  const deniedSession = await resolveScopedOrganizationSession({
    session,
    organizationId: "org_viewer",
    permission: "reports.review",
    db: {
      organizationMember: {
        async findUnique() {
          return {
            role: "VIEWER",
            isBillingAdmin: false,
            organization: {
              id: "org_viewer",
              slug: "viewer-org",
              name: "Viewer Org",
              onboardingCompletedAt: new Date("2026-04-20T00:00:00.000Z")
            }
          };
        }
      }
    }
  });
  assert.equal(deniedSession, null);

  console.log("auth routing tests passed");
}

void runAuthRoutingTests();
