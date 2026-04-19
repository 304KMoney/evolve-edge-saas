import { logServerEvent } from "./monitoring";
import { redactSecrets } from "./security-redaction";
import { captureServerException } from "./sentry";

export async function logAndCaptureServerError(input: {
  route: string;
  event: string;
  error: unknown;
  context?: Record<string, unknown>;
  request?: Request;
}) {
  const safeContext = redactSecrets(input.context ?? {});
  const message = input.error instanceof Error ? input.error.message : "Unknown error";

  logServerEvent("error", input.event, {
    route: input.route,
    source: "server",
    status: "failed",
    metadata: {
      message,
      method: input.request?.method ?? null,
      path: input.request ? new URL(input.request.url).pathname : null,
      ...safeContext
    }
  });

  await captureServerException({
    error: input.error,
    tags: {
      route: input.route,
      source: "server"
    },
    context: {
      method: input.request?.method ?? null,
      path: input.request ? new URL(input.request.url).pathname : null,
      ...safeContext
    },
    fingerprint: [input.route, input.event]
  });
}
