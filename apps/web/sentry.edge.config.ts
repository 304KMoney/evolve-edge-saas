import { initSentryRuntime } from "./lib/sentry-runtime";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  void initSentryRuntime({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0"),
    sendDefaultPii: false
  });
}
