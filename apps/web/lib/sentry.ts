import { redactSecrets } from "./security-redaction";
import { captureClientException } from "./sentry-runtime";

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

  const throwable =
    input.error instanceof Error ? input.error : new Error(String(input.error));
  await captureClientException(throwable, {
    tags: input.tags ?? {},
    extra: {
      safe_context: redactSecrets(input.context ?? {})
    },
    fingerprint:
      input.fingerprint && input.fingerprint.length > 0
        ? input.fingerprint
        : undefined
  });
}
