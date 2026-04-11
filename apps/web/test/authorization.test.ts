import assert from "node:assert/strict";
import {
  buildAuthorizationContext,
  canAccessAdminConsole,
  canManageOrganizationBilling,
  canManageOrganizationMembers,
  canViewUsage,
  getEffectivePlatformRole,
  hasPermission
} from "../lib/authorization";

function runAuthorizationTests() {
  {
    const context = buildAuthorizationContext({
      user: {
        email: "owner@example.com",
        platformRole: "NONE"
      },
      organization: {
        role: "OWNER",
        isBillingAdmin: false
      }
    });

    assert.equal(hasPermission(context, "members.manage"), true);
    assert.equal(canManageOrganizationMembers(context), true);
    assert.equal(canManageOrganizationBilling(context), true);
    assert.equal(hasPermission(context, "reports.deliver"), true);
    assert.equal(hasPermission(context, "platform.console.view"), false);
  }

  {
    const context = buildAuthorizationContext({
      user: {
        email: "analyst@example.com",
        platformRole: "NONE"
      },
      organization: {
        role: "ANALYST",
        isBillingAdmin: false
      }
    });

    assert.equal(hasPermission(context, "reports.review"), true);
    assert.equal(hasPermission(context, "reports.deliver"), true);
    assert.equal(hasPermission(context, "members.manage"), false);
    assert.equal(canManageOrganizationBilling(context), false);
    assert.equal(canViewUsage(context), true);
  }

  {
    const context = buildAuthorizationContext({
      user: {
        email: "operator@example.com",
        platformRole: "OPERATOR"
      },
      organization: null
    });

    assert.equal(canAccessAdminConsole(context), true);
    assert.equal(hasPermission(context, "platform.jobs.manage"), true);
    assert.equal(hasPermission(context, "platform.roles.manage"), false);
  }

  {
    const context = buildAuthorizationContext({
      user: {
        email: "billing@example.com",
        platformRole: "NONE"
      },
      organization: {
        role: "MEMBER",
        isBillingAdmin: true
      }
    });

    assert.equal(hasPermission(context, "billing.view"), true);
    assert.equal(canManageOrganizationBilling(context), true);
    assert.equal(canViewUsage(context), true);
    assert.equal(hasPermission(context, "members.manage"), false);
  }

  {
    const role = getEffectivePlatformRole("EXECUTIVE_ADMIN", "exec@example.com");
    assert.equal(role, "EXECUTIVE_ADMIN");
  }

  {
    const originalInternalAdmins = process.env.INTERNAL_ADMIN_EMAILS;
    process.env.INTERNAL_ADMIN_EMAILS = "ops@example.com";

    try {
      assert.equal(
        getEffectivePlatformRole("NONE", "ops@example.com"),
        "SUPER_ADMIN"
      );
    } finally {
      process.env.INTERNAL_ADMIN_EMAILS = originalInternalAdmins;
    }
  }

  console.log("authorization tests passed");
}

runAuthorizationTests();
