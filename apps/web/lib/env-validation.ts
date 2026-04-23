type EnvCategory =
  | "database"
  | "auth/session"
  | "stripe"
  | "hubspot"
  | "dify"
  | "n8n"
  | "monitoring"
  | "email/webhooks";

type AppRuntimeEnvironment = "development" | "preview" | "production";

type EnvValidationContext = {
  runtime: AppRuntimeEnvironment;
  features: {
    stripe: boolean;
    hubspot: boolean;
    dify: boolean;
    n8n: boolean;
    resendEmail: boolean;
    sentry: boolean;
  };
};

type EnvRule = {
  key: string;
  aliases?: string[];
  category: EnvCategory;
  requiredWhen: (context: EnvValidationContext) => boolean;
  notes?: string;
};

export type EnvValidationStatus = {
  key: string;
  category: EnvCategory;
  required: boolean;
  configured: boolean;
  notes?: string;
};

function readEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function readEnvWithAliases(name: string, aliases: string[] = []) {
  const keys = [name, ...aliases];
  for (const key of keys) {
    const value = readEnv(key);
    if (value) {
      return value;
    }
  }

  return "";
}

function getRuntimeEnvironment(): AppRuntimeEnvironment {
  const rawValue = readEnv("VERCEL_ENV") || readEnv("NODE_ENV") || "development";

  switch (rawValue) {
    case "production":
      return "production";
    case "preview":
      return "preview";
    default:
      return "development";
  }
}

function getNextPhase() {
  return readEnv("NEXT_PHASE");
}

function isEnabledViaFlag(name: string) {
  return readEnv(name).toLowerCase() === "true";
}

function isHubSpotFeatureEnabled() {
  const configured = readEnv("HUBSPOT_SYNC_ENABLED").toLowerCase();

  if (configured === "false") {
    return false;
  }

  if (configured === "true") {
    return true;
  }

  return Boolean(readEnv("HUBSPOT_ACCESS_TOKEN"));
}

function getValidationContext(): EnvValidationContext {
  const runtime = getRuntimeEnvironment();

  const hasStripeEnv =
    Boolean(readEnv("STRIPE_SECRET_KEY")) || Boolean(readEnv("STRIPE_WEBHOOK_SECRET"));
  const hasDifyEnv =
    Boolean(readEnvWithAliases("DIFY_API_BASE_URL", ["DIFY_BASE_URL"])) ||
    Boolean(readEnv("DIFY_API_KEY")) ||
    Boolean(readEnv("DIFY_WORKFLOW_ID"));
  const hasN8nEnv =
    Boolean(readEnv("N8N_WORKFLOW_DESTINATIONS")) ||
    Boolean(readEnv("N8N_WEBHOOK_URL")) ||
    Boolean(readEnv("N8N_CALLBACK_SECRET")) ||
    Boolean(readEnv("N8N_CALLBACK_SHARED_SECRET"));
  const hasResendEnv =
    (readEnv("EMAIL_PROVIDER") || "resend").toLowerCase() === "resend" &&
    Boolean(readEnv("RESEND_API_KEY"));

  return {
    runtime,
    features: {
      stripe: isEnabledViaFlag("STRIPE_FLOW_ENABLED") || runtime === "production" || hasStripeEnv,
      hubspot: isHubSpotFeatureEnabled(),
      dify: isEnabledViaFlag("DIFY_EXECUTION_ENABLED") || hasDifyEnv,
      n8n: isEnabledViaFlag("N8N_DISPATCH_ENABLED") || runtime === "production" || hasN8nEnv,
      resendEmail: hasResendEnv,
      sentry:
        Boolean(readEnv("SENTRY_DSN")) || Boolean(readEnv("NEXT_PUBLIC_SENTRY_DSN"))
    }
  };
}

const ENV_RULES: EnvRule[] = [
  {
    key: "DATABASE_URL",
    category: "database",
    requiredWhen: () => true,
    notes: "Canonical Neon/Postgres persistence."
  },
  {
    key: "AUTH_SECRET",
    category: "auth/session",
    requiredWhen: (context) => context.runtime !== "development",
    notes: "Required for production/preview auth session integrity."
  },
  {
    key: "AUTH_ACCESS_EMAIL",
    category: "auth/session",
    requiredWhen: () => readEnv("AUTH_MODE") !== "demo"
  },
  {
    key: "AUTH_ACCESS_PASSWORD",
    category: "auth/session",
    requiredWhen: () => readEnv("AUTH_MODE") !== "demo"
  },
  {
    key: "STRIPE_SECRET_KEY",
    category: "stripe",
    requiredWhen: (context) => context.features.stripe
  },
  {
    key: "STRIPE_WEBHOOK_SECRET",
    category: "stripe",
    requiredWhen: (context) => context.features.stripe
  },
  {
    key: "N8N_WORKFLOW_DESTINATIONS",
    category: "n8n",
    requiredWhen: (context) => context.features.n8n,
    notes: "Preferred over legacy N8N_WEBHOOK_URL fallback."
  },
  {
    key: "N8N_CALLBACK_SECRET",
    aliases: ["N8N_CALLBACK_SHARED_SECRET", "N8N_SECRET"],
    category: "n8n",
    requiredWhen: (context) => context.features.n8n
  },
  {
    key: "OUTBOUND_DISPATCH_SECRET",
    category: "n8n",
    requiredWhen: (context) => context.features.n8n
  },
  {
    key: "PUBLIC_INTAKE_SHARED_SECRET",
    aliases: ["OUTBOUND_DISPATCH_SECRET"],
    category: "n8n",
    requiredWhen: (context) => context.runtime === "production",
    notes:
      "Required to authenticate public intake POST requests and prevent spoofed workflow triggers."
  },
  {
    key: "HUBSPOT_ACCESS_TOKEN",
    category: "hubspot",
    requiredWhen: (context) => context.features.hubspot
  },
  {
    key: "DIFY_API_BASE_URL",
    aliases: ["DIFY_BASE_URL"],
    category: "dify",
    requiredWhen: (context) => context.features.dify
  },
  {
    key: "DIFY_API_KEY",
    category: "dify",
    requiredWhen: (context) => context.features.dify
  },
  {
    key: "DIFY_WORKFLOW_ID",
    category: "dify",
    requiredWhen: (context) => context.features.dify
  },
  {
    key: "NEXT_PUBLIC_APP_URL",
    aliases: ["APP_BASE_URL"],
    category: "monitoring",
    requiredWhen: () => true
  },
  {
    key: "OPS_READINESS_SECRET",
    category: "monitoring",
    requiredWhen: (context) => context.runtime === "production",
    notes: "Protects health/readiness endpoints from public environment disclosure."
  },
  {
    key: "SENTRY_DSN",
    category: "monitoring",
    requiredWhen: () => false,
    notes: "Optional. Enables server/runtime Sentry capture when set."
  },
  {
    key: "NEXT_PUBLIC_SENTRY_DSN",
    category: "monitoring",
    requiredWhen: () => false,
    notes: "Optional. Enables browser Sentry capture when set."
  },
  {
    key: "EMAIL_PROVIDER",
    category: "email/webhooks",
    requiredWhen: () => true
  },
  {
    key: "EMAIL_FROM_ADDRESS",
    category: "email/webhooks",
    requiredWhen: (context) => context.features.resendEmail
  },
  {
    key: "RESEND_API_KEY",
    category: "email/webhooks",
    requiredWhen: (context) => context.features.resendEmail
  },
  {
    key: "RESEND_WEBHOOK_SIGNING_SECRET",
    category: "email/webhooks",
    requiredWhen: (context) => context.features.resendEmail,
    notes: "Required for signature verification on Resend webhooks."
  }
];

let parityStatusLogged = false;

export function getEnvironmentParityStatus() {
  const context = getValidationContext();

  return ENV_RULES.map((rule) => {
    const required = rule.requiredWhen(context);
    const configured = Boolean(readEnvWithAliases(rule.key, rule.aliases ?? []));

    return {
      key: rule.key,
      category: rule.category,
      required,
      configured,
      notes: rule.notes
    } satisfies EnvValidationStatus;
  });
}

export function assertCriticalEnvironmentParity() {
  const missing = getEnvironmentParityStatus()
    .filter((entry) => entry.required && !entry.configured)
    .map((entry) => `${entry.key} [${entry.category}]`);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment configuration: ${missing.join(", ")}. ` +
        "Run env parity audit and update Vercel/local/Codex envs before continuing."
    );
  }
}

export function shouldEnforceCriticalEnvironmentParity() {
  return (
    getRuntimeEnvironment() === "production" &&
    getNextPhase() !== "phase-production-build"
  );
}

export function logEnvironmentParityStatus() {
  if (parityStatusLogged) {
    return;
  }

  parityStatusLogged = true;
  const status = getEnvironmentParityStatus();
  const required = status.filter((entry) => entry.required);
  const missing = required.filter((entry) => !entry.configured).map((entry) => entry.key);

  console.info("[env-parity] startup audit", {
    runtime: getRuntimeEnvironment(),
    requiredConfigured: required.length - missing.length,
    requiredTotal: required.length,
    missing,
    categories: Object.fromEntries(
      [
        "database",
        "auth/session",
        "stripe",
        "hubspot",
        "dify",
        "n8n",
        "monitoring",
        "email/webhooks"
      ].map((category) => [
        category,
        status
          .filter((entry) => entry.category === category)
          .map((entry) => ({
            key: entry.key,
            required: entry.required,
            configured: entry.configured
          }))
      ])
    )
  });
}
