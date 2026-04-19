import { redactSecrets } from "./security-redaction";

export function isSentryServerEnabled() {
  return Boolean(process.env.SENTRY_DSN);
}

export function isSentryBrowserEnabled() {
  return Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);
}

export async function captureServerException(input: {
  error: unknown;
  tags?: Record<string, string>;
  context?: Record<string, unknown>;
  fingerprint?: string[];
}) {
  if (!isSentryServerEnabled()) {
    return;
  }

  const Sentry = await import("@sentry/nextjs");
  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(input.tags ?? {})) {
      scope.setTag(key, value);
    }
    scope.setContext("safe_context", redactSecrets(input.context ?? {}));
    if (input.fingerprint && input.fingerprint.length > 0) {
      scope.setFingerprint(input.fingerprint);
    }

    const throwable = input.error instanceof Error ? input.error : new Error(String(input.error));
    Sentry.captureException(throwable);
  });
}
