import { captureRequestError, initSentryRuntime } from "./lib/sentry-runtime";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await initSentryRuntime({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0"),
      sendDefaultPii: false,
      beforeSend(event) {
        if (event.request?.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
          delete event.request.headers["x-api-key"];
        }

        return event;
      }
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await initSentryRuntime({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0"),
      sendDefaultPii: false
    });
  }
}

export async function onRequestError(...args: unknown[]) {
  return captureRequestError(...args);
}
