import assert from "node:assert/strict";
import {
  canManageBilling,
  canManageDelivery,
  canManageMonitoringFindings,
  getPrimaryOwnerMembership,
  hasPlatformRole,
  hasOrganizationRole,
  isOrganizationRole,
  isPlatformUserRole
} from "../lib/roles";

function runRoleTests() {
  assert.equal(isOrganizationRole("OWNER"), true);
  assert.equal(isOrganizationRole("unknown"), false);
  assert.equal(isPlatformUserRole("SUPER_ADMIN"), true);
  assert.equal(isPlatformUserRole("not-a-role"), false);

  assert.equal(hasOrganizationRole("ADMIN", ["OWNER", "ADMIN"]), true);
  assert.equal(hasOrganizationRole("VIEWER", ["OWNER", "ADMIN"]), false);
  assert.equal(hasPlatformRole("OPERATOR", ["SUPER_ADMIN", "OPERATOR"]), true);
  assert.equal(hasPlatformRole("REVIEWER", ["SUPER_ADMIN", "OPERATOR"]), false);

  assert.equal(canManageBilling("OWNER"), true);
  assert.equal(canManageBilling("ADMIN"), false);

  assert.equal(canManageMonitoringFindings("ANALYST"), true);
  assert.equal(canManageMonitoringFindings("MEMBER"), false);

  assert.equal(canManageDelivery("ADMIN"), true);
  assert.equal(canManageDelivery("VIEWER"), false);

  {
    const ownerMembership = getPrimaryOwnerMembership([
      { role: "MEMBER", email: "member@example.com" },
      { role: "OWNER", email: "owner@example.com" }
    ]);

    assert.equal(ownerMembership?.email, "owner@example.com");
  }

  {
    const fallbackMembership = getPrimaryOwnerMembership([
      { role: "ADMIN", email: "admin@example.com" }
    ]);

    assert.equal(fallbackMembership?.email, "admin@example.com");
  }

  console.log("roles tests passed");
}

runRoleTests();
