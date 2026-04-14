import { logServerEvent } from "./monitoring";

type PrismaRuntimeError = Error & {
  code?: string;
  clientVersion?: string;
};

const PRISMA_SCHEMA_DRIFT_CODES = new Set(["P2021", "P2022"]);

export function isPrismaRuntimeCompatibilityError(
  error: unknown
): error is PrismaRuntimeError {
  if (!(error instanceof Error)) {
    return false;
  }

  const candidate = error as PrismaRuntimeError;
  const message = error.message.toLowerCase();

  if (
    candidate.name === "PrismaClientKnownRequestError" &&
    candidate.code &&
    PRISMA_SCHEMA_DRIFT_CODES.has(candidate.code)
  ) {
    return true;
  }

  if (candidate.name === "PrismaClientInitializationError") {
    return true;
  }

  return (
    message.includes("invalid `prisma.") ||
    message.includes("does not exist in the current database") ||
    message.includes("the table") ||
    message.includes("the column")
  );
}

export function logPrismaRuntimeCompatibilityError(
  scope: string,
  error: unknown,
  metadata?: Record<string, unknown>
) {
  const message = error instanceof Error ? error.message : "Unknown Prisma runtime error";

  logServerEvent("error", "prisma.runtime_compatibility_error", {
    scope,
    message,
    ...metadata
  });
}
