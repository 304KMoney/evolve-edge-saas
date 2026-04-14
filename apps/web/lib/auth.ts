import {
  createOpaqueToken,
  hashOpaqueToken,
  prisma,
  verifyPassword
} from "@evolve-edge/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { timingSafeEqual } from "node:crypto";
import {
  buildAuthorizationContext,
  canAccessAdminConsole,
  hasPermission,
  isInternalAdminEmail,
  type OrganizationPermission,
  type PlatformPermission
} from "./authorization";
import { publishDomainEvent } from "./domain-events";
import {
  hasOrganizationRole,
  type OrganizationRole,
  type PlatformUserRole
} from "./roles";
import { getAuthMode, getOptionalEnv, getRuntimeEnvironment } from "./runtime-config";

export type AppSession = {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    platformRole: PlatformUserRole;
  };
  organization: {
    id: string;
    slug: string;
    name: string;
    role: string;
    isBillingAdmin: boolean;
  } | null;
  onboardingRequired: boolean;
  authMode: "demo" | "password";
};

export const AUTH_SESSION_COOKIE = "evolve_edge_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const MAX_ACTIVE_SESSIONS = 5;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MINUTES = 15;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getSeedOwnerEmail() {
  return normalizeEmail(
    getOptionalEnv("SEED_OWNER_EMAIL") ??
      getOptionalEnv("AUTH_ACCESS_EMAIL") ??
      "owner@example.com"
  );
}

function getSeedOwnerFirstName() {
  return getOptionalEnv("SEED_OWNER_FIRST_NAME") ?? "Primary";
}

function getSeedOwnerLastName() {
  return getOptionalEnv("SEED_OWNER_LAST_NAME") ?? "Owner";
}

function getSeedOrganizationName() {
  return getOptionalEnv("SEED_ACCOUNT_NAME") ?? "Primary Workspace";
}

function getSeedOrganizationSlug() {
  return getOptionalEnv("SEED_ACCOUNT_SLUG") ?? "primary-workspace";
}

export function isPasswordAuthEnabled() {
  return getAuthMode() === "password";
}

export function getPasswordAuthConfig() {
  const email = normalizeEmail(
    getOptionalEnv("AUTH_ACCESS_EMAIL") ?? getSeedOwnerEmail()
  );
  const password = getOptionalEnv("AUTH_ACCESS_PASSWORD") ?? "";

  return {
    email,
    password,
    isComplete: Boolean(email && password)
  };
}

function buildDemoSession(): AppSession {
  return {
    user: {
      id: "seed_owner_user",
      email: getSeedOwnerEmail(),
      firstName: getSeedOwnerFirstName(),
      lastName: getSeedOwnerLastName(),
      platformRole: isInternalAdminEmail(getSeedOwnerEmail()) ? "SUPER_ADMIN" : "NONE"
    },
    organization: {
      id: "seed_org",
      slug: getSeedOrganizationSlug(),
      name: getSeedOrganizationName(),
      role: "OWNER",
      isBillingAdmin: false
    },
    onboardingRequired: false,
    authMode: "demo"
  };
}

function validateBootstrapPassword(email: string, password: string) {
  const config = getPasswordAuthConfig();
  if (!config.isComplete) {
    return false;
  }

  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail !== config.email) {
    return false;
  }

  if (password.length !== config.password.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(password), Buffer.from(config.password));
}

export function buildCookieSettings() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: getRuntimeEnvironment() === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  };
}

export async function createUserSession(userId: string) {
  await prisma.session.deleteMany({
    where: {
      userId,
      expiresAt: { lte: new Date() }
    }
  });

  const token = createOpaqueToken();

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashOpaqueToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000)
    }
  });

  const activeSessions = await prisma.session.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true }
  });

  if (activeSessions.length > MAX_ACTIVE_SESSIONS) {
    await prisma.session.deleteMany({
      where: {
        id: {
          in: activeSessions
            .slice(MAX_ACTIVE_SESSIONS)
            .map((session) => session.id)
        }
      }
    });
  }

  return token;
}

export async function revokeSession(token: string | null | undefined) {
  if (!token) {
    return;
  }

  await prisma.session.deleteMany({
    where: {
      tokenHash: hashOpaqueToken(token)
    }
  });
}

export function getSignInErrorMessage(error?: string) {
  switch (error) {
    case "invalid":
      return "That email or password did not match a valid workspace credential.";
    case "config":
      return "Password auth is enabled, but AUTH_ACCESS_EMAIL or AUTH_ACCESS_PASSWORD is missing.";
    case "expired":
      return "Your session expired. Please sign in again.";
    case "locked":
      return `This account is temporarily locked after repeated failed sign-in attempts. Try again in ${LOGIN_LOCKOUT_MINUTES} minutes.`;
    default:
      return null;
  }
}

function redirectToSignIn(error?: string): never {
  redirect(error ? `/sign-in?error=${error}` : "/sign-in");
}

export function sanitizeInternalRedirect(
  value: string | null | undefined,
  fallback = "/dashboard"
) {
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();

  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }

  return trimmed;
}

export async function authenticateUser(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: {
      passwordCredential: true,
      memberships: {
        include: { organization: true },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (user?.passwordCredential) {
    if (
      user.passwordCredential.lockedUntil &&
      user.passwordCredential.lockedUntil > new Date()
    ) {
      return { user: null, error: "locked" as const };
    }

    if (!verifyPassword(password, user.passwordCredential.passwordHash)) {
      const failedAttempts = user.passwordCredential.failedLoginAttempts + 1;
      const shouldLock = failedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;

      await prisma.passwordCredential.update({
        where: { userId: user.id },
        data: {
          failedLoginAttempts: shouldLock ? 0 : failedAttempts,
          lockedUntil: shouldLock
            ? new Date(Date.now() + LOGIN_LOCKOUT_MINUTES * 60 * 1000)
            : null
        }
      });

      return { user: null, error: shouldLock ? ("locked" as const) : ("invalid" as const) };
    }

    await prisma.passwordCredential.update({
      where: { userId: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastAuthenticatedAt: new Date()
      }
    });

    return { user, error: null };
  }

  if (!validateBootstrapPassword(normalizedEmail, password)) {
    return { user: null, error: "invalid" as const };
  }

  const bootstrapUser = user
    ? await prisma.user.update({
        where: { email: normalizedEmail },
        data: {
          firstName: user.firstName ?? getSeedOwnerFirstName(),
          lastName: user.lastName ?? getSeedOwnerLastName()
        },
        include: {
          passwordCredential: true,
          memberships: {
            include: { organization: true },
            orderBy: { createdAt: "asc" }
          }
        }
      })
    : await prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email: normalizedEmail,
            firstName: getSeedOwnerFirstName(),
            lastName: getSeedOwnerLastName()
          },
          include: {
            passwordCredential: true,
            memberships: {
              include: { organization: true },
              orderBy: { createdAt: "asc" }
            }
          }
        });

        await publishDomainEvent(tx, {
          type: "user.created",
          aggregateType: "user",
          aggregateId: createdUser.id,
          userId: createdUser.id,
          idempotencyKey: `user.created:${createdUser.id}`,
          payload: {
            userId: createdUser.id,
            email: createdUser.email,
            source: "bootstrap-auth"
          }
        });

        return createdUser;
      });

  return { user: bootstrapUser, error: null };
}

async function resolveCurrentSession(options?: {
  redirectOnMissing?: boolean;
}): Promise<AppSession | null> {
  if (!isPasswordAuthEnabled()) {
    return buildDemoSession();
  }

  const config = getPasswordAuthConfig();
  if (!config.isComplete) {
    if (options?.redirectOnMissing ?? true) {
      redirectToSignIn("config");
    }

    return null;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  if (!token) {
    if (options?.redirectOnMissing ?? true) {
      redirectToSignIn();
    }

    return null;
  }

  const dbSession = await prisma.session.findFirst({
    where: {
      tokenHash: hashOpaqueToken(token),
      expiresAt: { gt: new Date() }
    },
    include: {
      user: {
        include: {
          passwordCredential: true,
          memberships: {
            include: { organization: true },
            orderBy: { createdAt: "asc" }
          }
        }
      }
    }
  });

  if (!dbSession) {
    if (options?.redirectOnMissing ?? true) {
      redirectToSignIn("expired");
    }

    return null;
  }

  if (
    dbSession.user.passwordCredential?.passwordUpdatedAt &&
    dbSession.createdAt < dbSession.user.passwordCredential.passwordUpdatedAt
  ) {
    await prisma.session.delete({
      where: { id: dbSession.id }
    });
    redirectToSignIn("expired");
  }

  await prisma.session.update({
    where: { id: dbSession.id },
    data: {
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000)
    }
  });

  const membership = dbSession.user.memberships[0] ?? null;
  const onboardingRequired =
    !membership ||
    !membership.organization.onboardingCompletedAt ||
    !dbSession.user.onboardingCompletedAt;

  return {
    user: {
      id: dbSession.user.id,
      email: dbSession.user.email,
      firstName: dbSession.user.firstName ?? "Account",
      lastName: dbSession.user.lastName ?? "Owner",
      platformRole: dbSession.user.platformRole
    },
    organization: membership
      ? {
          id: membership.organization.id,
          slug: membership.organization.slug,
          name: membership.organization.name,
          role: membership.role,
          isBillingAdmin: membership.isBillingAdmin
        }
      : null,
    onboardingRequired,
    authMode: "password"
  };
}

export async function getCurrentSession(): Promise<AppSession> {
  const session = await resolveCurrentSession({ redirectOnMissing: true });

  if (!session) {
    redirectToSignIn();
  }

  return session;
}

export async function getOptionalCurrentSession() {
  return resolveCurrentSession({ redirectOnMissing: false });
}

export async function requireCurrentSession(options?: {
  requireOrganization?: boolean;
}) {
  const session = await getCurrentSession();

  if (options?.requireOrganization && session.onboardingRequired) {
    redirect("/onboarding");
  }

  return session;
}

export async function requireOrganizationRole(
  allowedRoles: readonly OrganizationRole[]
) {
  const session = await requireCurrentSession({ requireOrganization: true });

  if (!session.organization || !hasOrganizationRole(session.organization.role, allowedRoles)) {
    redirect("/dashboard");
  }

  return session;
}

export function getSessionAuthorizationContext(session: AppSession) {
  return buildAuthorizationContext({
    user: {
      email: session.user.email,
      platformRole: session.user.platformRole
    },
    organization: session.organization
      ? {
          role: session.organization.role,
          isBillingAdmin: session.organization.isBillingAdmin
        }
      : null
  });
}

export async function requireOrganizationPermission(
  permission: OrganizationPermission
) {
  const session = await requireCurrentSession({ requireOrganization: true });

  if (!hasPermission(getSessionAuthorizationContext(session), permission)) {
    redirect("/dashboard");
  }

  return session;
}

export async function requirePlatformPermission(permission: PlatformPermission) {
  const session = await requireCurrentSession();

  if (!hasPermission(getSessionAuthorizationContext(session), permission)) {
    redirect("/dashboard");
  }

  return session;
}

export async function requireAdminSession() {
  return requirePlatformPermission("platform.console.view");
}
