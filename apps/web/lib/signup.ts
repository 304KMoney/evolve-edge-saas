import {
  Prisma,
  hashPassword,
  prisma,
  type User
} from "@evolve-edge/db";
import { normalizeAuthEmail } from "./auth";

export type SignupInput = {
  name: string;
  email: string;
  password: string;
  companyName?: string | null;
};

export type ValidSignupInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  companyName: string | null;
};

export type SignupValidationErrorCode =
  | "missing_name"
  | "invalid_email"
  | "weak_password"
  | "company_name_too_long";

export type SignupErrorCode =
  | SignupValidationErrorCode
  | "duplicate"
  | "config"
  | "rate_limited"
  | "unknown";

type SignupDbClient = Pick<typeof prisma, "user">;

const MIN_PASSWORD_LENGTH = 10;
const MAX_NAME_LENGTH = 120;
const MAX_COMPANY_NAME_LENGTH = 200;

function trimToLength(value: string, maxLength: number) {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function splitName(name: string) {
  const normalizedName = trimToLength(name, MAX_NAME_LENGTH);
  const [firstName, ...lastNameParts] = normalizedName.split(" ");

  return {
    firstName: firstName || "Account",
    lastName: lastNameParts.join(" ") || "Owner"
  };
}

export function validateSignupInput(input: SignupInput):
  | { ok: true; data: ValidSignupInput }
  | { ok: false; error: SignupValidationErrorCode } {
  const name = trimToLength(input.name, MAX_NAME_LENGTH);
  const email = normalizeAuthEmail(input.email);
  const password = input.password;
  const companyName = trimToLength(input.companyName ?? "", MAX_COMPANY_NAME_LENGTH);

  if (!name) {
    return { ok: false, error: "missing_name" };
  }

  if (!isValidEmail(email)) {
    return { ok: false, error: "invalid_email" };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: "weak_password" };
  }

  if ((input.companyName ?? "").trim().length > MAX_COMPANY_NAME_LENGTH) {
    return { ok: false, error: "company_name_too_long" };
  }

  return {
    ok: true,
    data: {
      ...splitName(name),
      email,
      password,
      companyName: companyName || null
    }
  };
}

export function getSignupErrorMessage(error?: string | null) {
  switch (error) {
    case "missing_name":
      return "Enter your name to create an account.";
    case "invalid_email":
      return "Enter a valid work email address.";
    case "weak_password":
      return `Use a password with at least ${MIN_PASSWORD_LENGTH} characters.`;
    case "company_name_too_long":
      return "Company name must be 200 characters or fewer.";
    case "duplicate":
      return "An account already exists for that email. Sign in instead.";
    case "config":
      return "Signup is currently unavailable because password auth is disabled.";
    case "rate_limited":
      return "Signup is temporarily rate limited. Please wait a few minutes and try again.";
    case "unknown":
      return "We could not create the account right now. Please try again.";
    default:
      return null;
  }
}

export function getSignupSuccessRedirectPath(input: {
  membershipCount: number;
  redirectTo?: string | null;
}) {
  if (
    input.redirectTo &&
    input.redirectTo.startsWith("/") &&
    !input.redirectTo.startsWith("//")
  ) {
    return input.redirectTo;
  }

  return input.membershipCount > 0 ? "/dashboard" : "/onboarding";
}

export async function createPasswordSignupAccount(
  input: ValidSignupInput,
  db: SignupDbClient = prisma
): Promise<
  | { ok: true; user: User }
  | { ok: false; error: Extract<SignupErrorCode, "duplicate"> }
> {
  const existingUser = await db.user.findUnique({
    where: { email: input.email },
    select: { id: true }
  });

  if (existingUser) {
    return { ok: false, error: "duplicate" };
  }

  try {
    const user = await db.user.create({
      data: {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        passwordCredential: {
          create: {
            passwordHash: hashPassword(input.password)
          }
        }
      }
    });

    return { ok: true, user };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, error: "duplicate" };
    }

    throw error;
  }
}
