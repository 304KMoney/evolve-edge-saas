export const ORGANIZATION_ROLES = [
  "OWNER",
  "ADMIN",
  "ANALYST",
  "MEMBER",
  "VIEWER"
] as const;

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export const PLATFORM_USER_ROLES = [
  "NONE",
  "SUPER_ADMIN",
  "OPERATOR",
  "REVIEWER",
  "EXECUTIVE_ADMIN"
] as const;

export type PlatformUserRole = (typeof PLATFORM_USER_ROLES)[number];

export const INTERNAL_PLATFORM_ROLES = [
  "SUPER_ADMIN",
  "OPERATOR",
  "REVIEWER",
  "EXECUTIVE_ADMIN"
] as const satisfies readonly PlatformUserRole[];

export const ORGANIZATION_OPERATOR_ROLES = [
  "OWNER",
  "ADMIN",
  "ANALYST"
] as const satisfies readonly OrganizationRole[];

export const ORGANIZATION_OWNER_ROLES = [
  "OWNER"
] as const satisfies readonly OrganizationRole[];

export const ORGANIZATION_ADMIN_ROLES = [
  "OWNER",
  "ADMIN"
] as const satisfies readonly OrganizationRole[];

export function isOrganizationRole(value: string | null | undefined): value is OrganizationRole {
  return ORGANIZATION_ROLES.includes(value as OrganizationRole);
}

export function isPlatformUserRole(value: string | null | undefined): value is PlatformUserRole {
  return PLATFORM_USER_ROLES.includes(value as PlatformUserRole);
}

export function hasOrganizationRole(
  role: string | null | undefined,
  allowedRoles: readonly OrganizationRole[]
) {
  return isOrganizationRole(role) && allowedRoles.includes(role);
}

export function hasPlatformRole(
  role: string | null | undefined,
  allowedRoles: readonly PlatformUserRole[]
) {
  return isPlatformUserRole(role) && allowedRoles.includes(role);
}

export function isInternalPlatformRole(role: string | null | undefined) {
  return hasPlatformRole(role, INTERNAL_PLATFORM_ROLES);
}

export function isWorkspaceOwner(role: string | null | undefined) {
  return hasOrganizationRole(role, ORGANIZATION_OWNER_ROLES);
}

export function canOperateWorkspace(role: string | null | undefined) {
  return hasOrganizationRole(role, ORGANIZATION_OPERATOR_ROLES);
}

export function canManageMonitoringFindings(role: string | null | undefined) {
  return canOperateWorkspace(role);
}

export function canManageDelivery(role: string | null | undefined) {
  return canOperateWorkspace(role);
}

export function canManageInventory(role: string | null | undefined) {
  return canOperateWorkspace(role);
}

export function canManageBilling(role: string | null | undefined) {
  return isWorkspaceOwner(role);
}

export function getPrimaryOwnerMembership<T extends { role: string }>(members: T[]) {
  return members.find((member) => member.role === "OWNER") ?? members[0] ?? null;
}
