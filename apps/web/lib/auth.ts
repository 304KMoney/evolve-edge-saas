import { prisma } from "@evolve-edge/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, timingSafeEqual } from "node:crypto";

export type AppSession = {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  organization: {
    id: string;
    slug: string;
    name: string;
    role: string;
  };
};

export const AUTH_SESSION_COOKIE = "evolve_edge_session";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getSeedOwnerEmail() {
  return normalizeEmail(
    process.env.SEED_OWNER_EMAIL ??
      process.env.AUTH_ACCESS_EMAIL ??
      "owner@example.com"
  );
}

function getSeedOwnerFirstName() {
  return process.env.SEED_OWNER_FIRST_NAME ?? "Primary";
}

function getSeedOwnerLastName() {
  return process.env.SEED_OWNER_LAST_NAME ?? "Owner";
}

function getSeedOrganizationName() {
  return process.env.SEED_ACCOUNT_NAME ?? "Primary Workspace";
}

function getSeedOrganizationSlug() {
  return process.env.SEED_ACCOUNT_SLUG ?? "primary-workspace";
}

export function isPasswordAuthEnabled() {
  return process.env.AUTH_MODE === "password";
}

export function getPasswordAuthConfig() {
  const email = normalizeEmail(
    process.env.AUTH_ACCESS_EMAIL ?? getSeedOwnerEmail()
  );
  const password = process.env.AUTH_ACCESS_PASSWORD ?? "";
  const secret = process.env.AUTH_SECRET ?? "";

  return {
    email,
    password,
    secret,
    isComplete: Boolean(email && password && secret)
  };
}

function buildDemoSession(): AppSession {
  return {
    user: {
      id: "seed_owner_user",
      email: getSeedOwnerEmail(),
      firstName: getSeedOwnerFirstName(),
      lastName: getSeedOwnerLastName()
    },
    organization: {
      id: "seed_org",
      slug: getSeedOrganizationSlug(),
      name: getSeedOrganizationName(),
      role: "OWNER"
    }
  };
}

function createSessionSignature(encodedEmail: string, secret: string) {
  return createHmac("sha256", secret).update(encodedEmail).digest("base64url");
}

export function createSessionToken(email: string) {
  const { secret, isComplete } = getPasswordAuthConfig();
  if (!isComplete) {
    throw new Error("Password auth is not fully configured.");
  }

  const normalizedEmail = normalizeEmail(email);
  const encodedEmail = Buffer.from(normalizedEmail, "utf8").toString("base64url");
  const signature = createSessionSignature(encodedEmail, secret);

  return `${encodedEmail}.${signature}`;
}

export function readEmailFromSessionToken(token: string) {
  const { secret, isComplete } = getPasswordAuthConfig();
  if (!isComplete) {
    return null;
  }

  const [encodedEmail, signature] = token.split(".");
  if (!encodedEmail || !signature) {
    return null;
  }

  const expectedSignature = createSessionSignature(encodedEmail, secret);
  if (signature.length !== expectedSignature.length) {
    return null;
  }

  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (!timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    return normalizeEmail(
      Buffer.from(encodedEmail, "base64url").toString("utf8")
    );
  } catch {
    return null;
  }
}

export function validatePasswordCredentials(email: string, password: string) {
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

export function getSignInErrorMessage(error?: string) {
  switch (error) {
    case "invalid":
      return "That email or password did not match the account owner credentials.";
    case "config":
      return "Password auth is enabled, but AUTH_ACCESS_EMAIL, AUTH_ACCESS_PASSWORD, or AUTH_SECRET is missing.";
    case "account":
      return "That login does not map to an organization member in the database yet.";
    default:
      return null;
  }
}

function redirectToSignIn(error?: string): never {
  redirect(error ? `/sign-in?error=${error}` : "/sign-in");
}

export async function getCurrentSession(): Promise<AppSession> {
  if (!isPasswordAuthEnabled()) {
    return buildDemoSession();
  }

  const config = getPasswordAuthConfig();
  if (!config.isComplete) {
    redirectToSignIn("config");
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const email = token ? readEmailFromSessionToken(token) : null;

  const sessionEmail = email ?? redirectToSignIn();

  const membership = await prisma.organizationMember.findFirst({
    where: { user: { email: sessionEmail } },
    include: {
      user: true,
      organization: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  if (!membership) {
    redirectToSignIn("account");
  }

  return {
    user: {
      id: membership.user.id,
      email: membership.user.email,
      firstName: membership.user.firstName ?? "Account",
      lastName: membership.user.lastName ?? "Owner"
    },
    organization: {
      id: membership.organization.id,
      slug: membership.organization.slug,
      name: membership.organization.name,
      role: membership.role
    }
  };
}
