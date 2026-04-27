type SentryScope = {
  setTag(key: string, value: string): void;
  setContext(name: string, context: Record<string, unknown>): void;
  setFingerprint(fingerprint: string[]): void;
};

type SentryModule = {
  init(options: Record<string, unknown>): void;
  captureException(error: unknown, context?: Record<string, unknown>): void;
  captureRequestError?: (...args: unknown[]) => unknown;
  withScope(callback: (scope: SentryScope) => void): void;
};

let sentryModulePromise: Promise<SentryModule | null> | null = null;

async function loadSentryModule() {
  if (!sentryModulePromise) {
    sentryModulePromise = (async () => {
      try {
        const moduleName = "@sentry/nextjs";
        return (await import(moduleName)) as SentryModule;
      } catch {
        return null;
      }
    })();
  }

  return sentryModulePromise;
}

export async function initSentryRuntime(options: {
  dsn: string | null | undefined;
  environment: string | null | undefined;
  tracesSampleRate: number;
  sendDefaultPii?: boolean;
  beforeSend?: (event: Record<string, any>) => Record<string, any> | null;
}) {
  if (!options.dsn) {
    return;
  }

  const Sentry = await loadSentryModule();
  if (!Sentry) {
    return;
  }

  const initOptions: Record<string, unknown> = {
    dsn: options.dsn,
    environment: options.environment ?? undefined,
    tracesSampleRate: options.tracesSampleRate,
    sendDefaultPii: options.sendDefaultPii ?? false
  };

  if (options.beforeSend) {
    initOptions.beforeSend = options.beforeSend;
  }

  Sentry.init(initOptions);
}

export async function captureClientException(
  error: unknown,
  context?: Record<string, unknown>
) {
  const Sentry = await loadSentryModule();
  if (!Sentry) {
    return;
  }

  Sentry.captureException(error, context);
}

export async function captureRequestError(...args: unknown[]) {
  const Sentry = await loadSentryModule();
  return Sentry?.captureRequestError?.(...args);
}

