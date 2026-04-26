import {
  createOpaqueToken,
  hashOpaqueToken,
  prisma,
  verifyPassword
} from "@evolve-edge/db";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { timingSafeEqual } from "node:crypto";
import {
  buildAuthorizationContext,
  hasPermission,
  type OrganizationPermission,
  type PlatformPermission
} from "./authorization";
import { publishDomainEvent } from "./domain-events";
import {
  hasOrganizationRole,
  type OrganizationRole,
  type PlatformUserRole
} from "./roles";
import { consumeRateLimit } from "./security-rate-limit";
import { requireActiveOrganization } from "./org-scope";
import {
  getAuthMode,
  getOptionalEnv,
  getRuntimeEnvironment,
  isPreviewGuestAccessEnabled
} from "./runtime-config";

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
const SESSION_INACTIVITY_TIMEOUT_SECONDS = 60 * 60 * 2;
const MAX_ACTIVE_SESSIONS = 5;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MINUTES = 15;
const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const AUTH_RATE_LIMIT_MAX_REQUESTS = 10;
const AUTH_RATE_LIMIT_ACTIONS = ["auth.sign_in_failed", "auth.sign_in_rate_limited"] as const;

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
    secure: getRuntimeEnvironment() !== "development",
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  };
}

type CreateUserSessionContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export function getSessionInactivityTimeoutSeconds() {
  const configured = Number(getOptionalEnv("SESSION_INACTIVITY_TIMEOUT_SECONDS") ?? "");
  if (Number.isFinite(configured) && configured > 0) {
    return Math.min(configured, SESSION_TTL_SECONDS);
  }

  return SESSION_INACTIVITY_TIMEOUT_SECONDS;
}

export async function createUserSession(userId: string, context?: CreateUserSessionContext) {
  void context;

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
    where: {
      userId
    },
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

export async function revokeAllUserSessions(
  userId: string,
  reason = "logout_everywhere"
) {
  void reason;

  await prisma.session.deleteMany({
    where: {
      userId
    }
  });
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
    case "rate_limited":
      return "Sign-in is temporarily rate limited. Please wait a few minutes and try again.";
    default:
      return null;
  }
}

async function redirectToSignIn(error?: string): Promise<never> {
  const headerStore = await headers();
  const requestPath = sanitizeInternalRedirect(
    headerStore.get("x-request-path"),
    ""
  );
  const redirectTo =
    requestPath && requestPath !== "/sign-in" ? requestPath : "";
  const params = new URLSearchParams();

  if (error) {
    params.set("error", error);
  }

  if (redirectTo) {
    params.set("redirectTo", redirectTo);
  }

  const destination = params.size > 0 ? `/sign-in?${params.toString()}` : "/sign-in";
  redirect(destination as never);
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

  try {
    const url = new URL(trimmed, "https://evolve-edge.local");
    const sensitiveSearchParams = [
      "token",
      "code",
      "secret",
      "signature",
      "session",
      "password",
      "key",
      "auth"
    ];

    for (const parameter of sensitiveSearchParams) {
      url.searchParams.delete(parameter);
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function shouldUsePreviewGuestSession(input: {
  requestPath: string | null | undefined;
  previewGuestAccessEnabled: boolean;
}) {
  if (!input.previewGuestAccessEnabled) {
    return false;
  }

  const requestPath = sanitizeInternalRedirect(input.requestPath, "");
  return requestPath.startsWith("/dashboard");
}

export function shouldLimitAuthenticationAttempt(input: {
  recentPersistentFailures: number;
  maxRequests: number;
  localRateLimitLimited: boolean;
}) {
  return input.localRateLimitLimited || input.recentPersistentFailures >= input.maxRequests;
}

export async function consumeAuthenticationRateLimit(email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return { limited: false } as const;
  }

  const localRateLimit = consumeRateLimit({
    storeKey: `auth:sign-in:${normalizedEmail}`,
    maxRequests: AUTH_RATE_LIMIT_MAX_REQUESTS,
    windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
    metadata: {
      routeKey: "sign-in",
      category: "auth",
      email: normalizedEmail
    }
  });

  const recentPersistentFailures = await prisma.auditLog.count({
    where: {
      action: {
        in: [...AUTH_RATE_LIMIT_ACTIONS]
      },
      entityType: "user",
      entityId: normalizedEmail,
      createdAt: {
        gte: new Date(Date.now() - AUTH_RATE_LIMIT_WINDOW_MS)
      }
    }
  });

  if (
    shouldLimitAuthenticationAttempt({
      recentPersistentFailures,
      maxRequests: AUTH_RATE_LIMIT_MAX_REQUESTS,
      localRateLimitLimited: localRateLimit.limited
    })
  ) {
    return {
      limited: true,
      retryAfterSeconds: localRateLimit.limited ? localRateLimit.retryAfterSeconds : 60,
      maxRequests: AUTH_RATE_LIMIT_MAX_REQUESTS
    } as const;
  }

  return { limited: false } as const;
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

async function resolvePreviewGuestSession(requestPath: string | null | undefined) {
  if (
    !shouldUsePreviewGuestSession({
      requestPath,
      previewGuestAccessEnabled: isPreviewGuestAccessEnabled()
    })
  ) {
    return null;
  }

  const organization = await prisma.organization.findFirst({
    where: {
      members: {
        some: {}
      }
    },
    include: {
      members: {
        orderBy: { createdAt: "asc" },
        take: 1,
        include: {
          user: true
        }
      }
    },
    orderBy: {
      onboardingCompletedAt: "desc"
    }
  });

  const membership = organization?.members[0];
  if (!organization || !membership) {
    return null;
  }

  return {
    user: {
      id: membership.user.id,
      email: membership.user.email,
      firstName: membership.user.firstName ?? "Demo",
      lastName: membership.user.lastName ?? "Operator",
      platformRole: membership.user.platformRole
    },
    organization: {
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      role: membership.role,
      isBillingAdmin: membership.isBillingAdmin
    },
    onboardingRequired: false,
    authMode: "demo" as const
  } satisfies AppSession;
}

async function resolveCurrentSession(options?: {
  redirectOnMissing?: boolean;
}): Promise<AppSession | null> {
  const headerStore = await headers();
  const requestPath = headerStore.get("x-request-path");

  if (!isPasswordAuthEnabled()) {
    const previewGuestSession = await resolvePreviewGuestSession(requestPath);
    if (previewGuestSession) {
      return previewGuestSession;
    }

    if (options?.redirectOnMissing ?? true) {
      await redirectToSignIn("config");
    }

    return null;
  }

  const config = getPasswordAuthConfig();
  if (!config.isComplete) {
    const previewGuestSession = await resolvePreviewGuestSession(requestPath);
    if (previewGuestSession) {
      return previewGuestSession;
    }

    if (options?.redirectOnMissing ?? true) {
      await redirectToSignIn("config");
    }

    return null;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  if (!token) {
    const previewGuestSession = await resolvePreviewGuestSession(requestPath);
    if (previewGuestSession) {
      return previewGuestSession;
    }

    if (options?.redirectOnMissing ?? true) {
      await redirectToSignIn();
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
    const previewGuestSession = await resolvePreviewGuestSession(requestPath);
    if (previewGuestSession) {
      return previewGuestSession;
    }

    if (options?.redirectOnMissing ?? true) {
      await redirectToSignIn("expired");
    }

    return null;
  }

  if (
    dbSession.user.passwordCredential?.passwordUpdatedAt &&
    dbSession.createdAt < dbSession.user.passwordCredential.passwordUpdatedAt
  ) {
    await prisma.session.delete({
      where: { id: dbSession.id },
    });
    await redirectToSignIn("expired");
  }

  const sessionLastSeenAt = dbSession.lastSeenAt ?? dbSession.lastAuthenticatedAt ?? dbSession.createdAt;
  if (Date.now() - sessionLastSeenAt.getTime() > getSessionInactivityTimeoutSeconds() * 1000) {
    await prisma.session.delete({
      where: { id: dbSession.id },
    });
    await redirectToSignIn("expired");
  }

  await prisma.session.update({
    where: { id: dbSession.id },
    data: {
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000)
    }
  });

  const membership = dbSession.user.memberships[0] ?? null;
  if (membership) {
    await requireActiveOrganization(membership.organization.id);
  }
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
    await redirectToSignIn();
  }

  return session as AppSession;
}

export async function getOptionalCurrentSession() {
  try {
    return await resolveCurrentSession({ redirectOnMissing: false });
  } catch (error) {
    console.error("[auth] Optional session resolution failed.", error);
    return null;
  }
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
