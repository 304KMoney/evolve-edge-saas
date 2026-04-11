import { randomUUID } from "node:crypto";

const DEFAULT_TIMEOUT_FALLBACK_MS = 10_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 60_000;

export type ExternalErrorCategory =
  | "timeout"
  | "network"
  | "rate_limit"
  | "upstream"
  | "bad_request"
  | "auth"
  | "conflict"
  | "unknown";

export type NormalizedExternalError = {
  message: string;
  retryable: boolean;
  category: ExternalErrorCategory;
  statusCode: number | null;
  isTimeout: boolean;
};

export function buildCorrelationId(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

export function clampTimeoutMs(
  value: number | null | undefined,
  fallback = DEFAULT_TIMEOUT_FALLBACK_MS
) {
  const normalized =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

  return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, Math.round(normalized)));
}

export function isRetryableHttpStatus(statusCode: number) {
  return (
    statusCode === 408 ||
    statusCode === 409 ||
    statusCode === 423 ||
    statusCode === 425 ||
    statusCode === 429 ||
    statusCode >= 500
  );
}

export function normalizeExternalError(
  error: unknown,
  fallbackMessage = "Unknown external system failure."
): NormalizedExternalError {
  const message =
    error instanceof Error && error.message.trim().length > 0
      ? error.message.trim().slice(0, 1_000)
      : fallbackMessage;
  const lowered = message.toLowerCase();
  const statusMatch =
    /(?:status|returned|error)\s*\(?(\d{3})\)?/.exec(lowered) ??
    /\b(\d{3})\b/.exec(lowered);
  const statusCode = statusMatch ? Number(statusMatch[1]) : null;
  const isTimeout =
    lowered.includes("timeout") ||
    lowered.includes("timed out") ||
    lowered.includes("aborted") ||
    lowered.includes("aborterror");

  if (isTimeout) {
    return {
      message,
      retryable: true,
      category: "timeout",
      statusCode,
      isTimeout: true
    };
  }

  if (statusCode === 401 || statusCode === 403) {
    return {
      message,
      retryable: false,
      category: "auth",
      statusCode,
      isTimeout: false
    };
  }

  if (statusCode === 400 || statusCode === 404 || statusCode === 422) {
    return {
      message,
      retryable: false,
      category: "bad_request",
      statusCode,
      isTimeout: false
    };
  }

  if (statusCode === 409) {
    return {
      message,
      retryable: true,
      category: "conflict",
      statusCode,
      isTimeout: false
    };
  }

  if (statusCode === 429) {
    return {
      message,
      retryable: true,
      category: "rate_limit",
      statusCode,
      isTimeout: false
    };
  }

  if (statusCode !== null) {
    return {
      message,
      retryable: isRetryableHttpStatus(statusCode),
      category: statusCode >= 500 ? "upstream" : "bad_request",
      statusCode,
      isTimeout: false
    };
  }

  const isNetworkLike =
    lowered.includes("fetch failed") ||
    lowered.includes("network") ||
    lowered.includes("socket") ||
    lowered.includes("econn") ||
    lowered.includes("enotfound") ||
    lowered.includes("reset");

  return {
    message,
    retryable: isNetworkLike,
    category: isNetworkLike ? "network" : "unknown",
    statusCode: null,
    isTimeout: false
  };
}

export function isProcessingClaimStale(input: {
  processingStartedAt?: Date | null;
  lastAttemptAt?: Date | null;
  now?: Date;
  staleAfterMs: number;
}) {
  const referenceTime = input.now ?? new Date();
  const startedAt = input.processingStartedAt ?? input.lastAttemptAt;

  if (!startedAt) {
    return false;
  }

  return referenceTime.getTime() - startedAt.getTime() >= input.staleAfterMs;
}
