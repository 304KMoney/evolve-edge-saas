import { getOptionalListEnv } from "./runtime-config";
import {
  hasOrganizationRole,
  hasPlatformRole,
  isOrganizationRole,
  isPlatformUserRole,
  type OrganizationRole,
  type PlatformUserRole
} from "./roles";

export const ORGANIZATION_PERMISSIONS = [
  "organization.view",
  "organization.manage",
  "members.view",
  "members.manage",
  "engagements.view",
  "engagements.manage",
  "reports.view",
  "reports.review",
  "reports.deliver",
  "findings.view",
  "findings.manage",
  "evidence.view",
  "evidence.manage",
  "jobs.view",
  "jobs.manage",
  "billing.view",
  "billing.manage",
  "usage.view",
  "inventory.manage"
] as const;

export const PLATFORM_PERMISSIONS = [
  "platform.console.view",
  "platform.accounts.view",
  "platform.accounts.manage",
  "platform.analytics.view",
  "platform.audit.view",
  "platform.billing.view",
  "platform.jobs.view",
  "platform.jobs.manage",
  "platform.reviews.manage",
  "platform.roles.manage"
] as const;

export type OrganizationPermission = (typeof ORGANIZATION_PERMISSIONS)[number];
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];
export type Permission = OrganizationPermission | PlatformPermission;

export type AuthorizationSubject = {
  user: {
    email: string;
    platformRole?: string | null;
  };
  organization?: {
    role?: string | null;
    isBillingAdmin?: boolean | null;
  } | null;
};

export type AuthorizationContext = {
  platformRole: PlatformUserRole;
  organizationRole: OrganizationRole | null;
  isOrganizationBillingAdmin: boolean;
  isInternalAdminAllowlist: boolean;
};

function isPlatformPermission(permission: Permission): permission is PlatformPermission {
  return permission.startsWith("platform.");
}

const ORGANIZATION_ROLE_PERMISSIONS: Record<
  OrganizationRole,
  readonly OrganizationPermission[]
> = {
  OWNER: ORGANIZATION_PERMISSIONS,
  ADMIN: [
    "organization.view",
    "organization.manage",
    "members.view",
    "members.manage",
    "engagements.view",
    "engagements.manage",
    "reports.view",
    "reports.review",
    "reports.deliver",
    "findings.view",
    "findings.manage",
    "evidence.view",
    "evidence.manage",
    "jobs.view",
    "jobs.manage",
    "billing.view",
    "usage.view",
    "inventory.manage"
  ],
  ANALYST: [
    "organization.view",
    "engagements.view",
    "engagements.manage",
    "reports.view",
    "reports.review",
    "reports.deliver",
    "findings.view",
    "findings.manage",
    "evidence.view",
    "evidence.manage",
    "jobs.view",
    "jobs.manage",
    "usage.view",
    "inventory.manage"
  ],
  MEMBER: [
    "organization.view",
    "engagements.view",
    "reports.view",
    "findings.view",
    "evidence.view",
    "jobs.view"
  ],
  VIEWER: [
    "organization.view",
    "engagements.view",
    "reports.view",
    "findings.view",
    "evidence.view",
    "jobs.view"
  ]
};

const PLATFORM_ROLE_PERMISSIONS: Record<
  Exclude<PlatformUserRole, "NONE">,
  readonly PlatformPermission[]
> = {
  SUPER_ADMIN: PLATFORM_PERMISSIONS,
  OPERATOR: [
    "platform.console.view",
    "platform.accounts.view",
    "platform.accounts.manage",
    "platform.analytics.view",
    "platform.audit.view",
    "platform.billing.view",
    "platform.jobs.view",
    "platform.jobs.manage"
  ],
  REVIEWER: [
    "platform.console.view",
    "platform.accounts.view",
    "platform.analytics.view",
    "platform.audit.view",
    "platform.reviews.manage"
  ],
  EXECUTIVE_ADMIN: [
    "platform.console.view",
    "platform.accounts.view",
    "platform.accounts.manage",
    "platform.analytics.view",
    "platform.audit.view",
    "platform.billing.view",
    "platform.jobs.view",
    "platform.reviews.manage"
  ]
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isInternalAdminEmail(email: string) {
  const allowedEmails = getOptionalListEnv("INTERNAL_ADMIN_EMAILS");
  return allowedEmails.includes(normalizeEmail(email));
}

export function getEffectivePlatformRole(
  role: string | null | undefined,
  email: string
): PlatformUserRole {
  if (isPlatformUserRole(role) && role !== "NONE") {
    return role;
  }

  if (isInternalAdminEmail(email)) {
    return "SUPER_ADMIN";
  }

  return "NONE";
}

export function buildAuthorizationContext(
  subject: AuthorizationSubject
): AuthorizationContext {
  const isAllowlisted = isInternalAdminEmail(subject.user.email);
  const organizationRole = subject.organization?.role ?? null;
  const isBillingAdmin = subject.organization?.isBillingAdmin === true;

  return {
    platformRole: getEffectivePlatformRole(
      subject.user.platformRole ?? null,
      subject.user.email
    ),
    organizationRole: isOrganizationRole(organizationRole)
      ? organizationRole
      : null,
    isOrganizationBillingAdmin: isBillingAdmin,
    isInternalAdminAllowlist: isAllowlisted
  };
}

export function hasOrganizationPermission(
  role: string | null | undefined,
  permission: OrganizationPermission
) {
  return (
    isOrganizationRole(role) &&
    ORGANIZATION_ROLE_PERMISSIONS[role].includes(permission)
  );
}

export function hasPlatformPermission(
  role: string | null | undefined,
  permission: PlatformPermission
) {
  if (
    !hasPlatformRole(role, ["SUPER_ADMIN", "OPERATOR", "REVIEWER", "EXECUTIVE_ADMIN"])
  ) {
    return false;
  }

  const normalizedRole = role as Exclude<PlatformUserRole, "NONE">;
  return PLATFORM_ROLE_PERMISSIONS[normalizedRole].includes(permission);
}

export function hasPermission(
  context: AuthorizationContext,
  permission: Permission
) {
  if (isPlatformPermission(permission)) {
    return hasPlatformPermission(context.platformRole, permission);
  }

  if (
    context.isOrganizationBillingAdmin &&
    (permission === "billing.view" ||
      permission === "billing.manage" ||
      permission === "usage.view")
  ) {
    return true;
  }

  return hasOrganizationPermission(context.organizationRole, permission);
}

export function canManagePlatformRoles(context: AuthorizationContext) {
  return hasPermission(context, "platform.roles.manage");
}

export function canAccessAdminConsole(context: AuthorizationContext) {
  return hasPermission(context, "platform.console.view");
}

export function canManageOrganizationMembers(context: AuthorizationContext) {
  return hasPermission(context, "members.manage");
}

export function canViewBilling(context: AuthorizationContext) {
  return hasPermission(context, "billing.view");
}

export function canManageOrganizationBilling(context: AuthorizationContext) {
  return hasPermission(context, "billing.manage");
}

export function canViewUsage(context: AuthorizationContext) {
  return hasPermission(context, "usage.view");
}

export function canManageReportDelivery(context: AuthorizationContext) {
  return hasPermission(context, "reports.deliver");
}

export function canManageFindings(context: AuthorizationContext) {
  return hasPermission(context, "findings.manage");
}

export function canManageInventoryWithContext(context: AuthorizationContext) {
  return hasPermission(context, "inventory.manage");
}
