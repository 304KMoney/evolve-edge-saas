import { initSentryRuntime } from "./lib/sentry-runtime";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  void initSentryRuntime({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0"),
    sendDefaultPii: false
  });
}
