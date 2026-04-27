type EnvCategory =
  | "database"
  | "auth/session"
  | "stripe"
  | "hubspot"
  | "ai-execution"
  | "n8n"
  | "monitoring"
  | "email/webhooks";

type AppRuntimeEnvironment = "development" | "preview" | "production";

type EnvValidationContext = {
  runtime: AppRuntimeEnvironment;
  features: {
    stripe: boolean;
    hubspot: boolean;
    aiExecution: boolean;
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

function hasNamedWorkflowDestination(name: string) {
  const rawValue = readEnv("N8N_WORKFLOW_DESTINATIONS");
  if (!rawValue) {
    return false;
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return false;
    }

    return parsed.some((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return false;
      }

      const record = item as Record<string, unknown>;
      return (
        typeof record.name === "string" &&
        record.name.trim() === name &&
        typeof record.url === "string" &&
        record.url.trim().length > 0
      );
    });
  } catch {
    return false;
  }
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
  const hasAiExecutionEnv =
    Boolean(readEnv("AI_EXECUTION_PROVIDER")) ||
    Boolean(readEnv("OPENAI_API_KEY")) ||
    Boolean(readEnv("OPENAI_MODEL")) ||
    Boolean(readEnv("OPENAI_REASONING_MODEL"));
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
      aiExecution:
        runtime === "production" ||
        hasAiExecutionEnv ||
        readEnv("AI_EXECUTION_PROVIDER").toLowerCase() === "openai_langgraph",
      n8n: isEnabledViaFlag("N8N_DISPATCH_ENABLED") || runtime === "production" || hasN8nEnv,
      resendEmail: hasResendEnv,
      sentry:
        Boolean(readEnv("SENTRY_DSN")) || Boolean(readEnv("NEXT_PUBLIC_SENTRY_DSN"))
    }
  };
}

function isRuleConfigured(rule: EnvRule) {
  if (rule.key === "N8N_WORKFLOW_DESTINATIONS") {
    return hasNamedWorkflowDestination("auditRequested");
  }

  return Boolean(readEnvWithAliases(rule.key, rule.aliases ?? []));
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
    key: "STRIPE_PRICE_STARTER_ANNUAL",
    category: "stripe",
    requiredWhen: (context) => context.features.stripe,
    notes: "Canonical Stripe price for starter."
  },
  {
    key: "STRIPE_PRICE_SCALE_ANNUAL",
    category: "stripe",
    requiredWhen: (context) => context.features.stripe,
    notes: "Canonical Stripe price for scale."
  },
  {
    key: "STRIPE_PRICE_ENTERPRISE_ANNUAL",
    category: "stripe",
    requiredWhen: (context) => context.features.stripe,
    notes: "Canonical Stripe price for enterprise."
  },
  {
    key: "STRIPE_PRODUCT_STARTER",
    category: "stripe",
    requiredWhen: (context) => context.features.stripe,
    notes: "Canonical Stripe product for starter."
  },
  {
    key: "STRIPE_PRODUCT_SCALE",
    category: "stripe",
    requiredWhen: (context) => context.features.stripe,
    notes: "Canonical Stripe product for scale."
  },
  {
    key: "STRIPE_PRODUCT_ENTERPRISE",
    category: "stripe",
    requiredWhen: (context) => context.features.stripe,
    notes: "Canonical Stripe product for enterprise."
  },
  {
    key: "N8N_WORKFLOW_DESTINATIONS",
    category: "n8n",
    requiredWhen: (context) => context.features.n8n,
    notes:
      "Required to include a valid auditRequested destination; legacy N8N_WEBHOOK_URL fallback is not enough for canonical launch readiness."
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
    category: "n8n",
    requiredWhen: (context) => context.runtime === "production",
    notes:
      "Required to authenticate public intake POST requests and prevent spoofed workflow triggers."
  },
  {
    key: "AI_EXECUTION_PROVIDER",
    category: "ai-execution",
    requiredWhen: (context) => context.features.aiExecution
  },
  {
    key: "AI_EXECUTION_DISPATCH_SECRET",
    category: "ai-execution",
    requiredWhen: (context) => context.features.aiExecution,
    notes: "Bearer secret for POST /api/internal/ai/execute."
  },
  {
    key: "OPENAI_API_KEY",
    category: "ai-execution",
    requiredWhen: (context) =>
      context.features.aiExecution &&
      readEnv("AI_EXECUTION_PROVIDER").toLowerCase() !== "dify"
  },
  {
    key: "OPENAI_CHEAP_MODEL",
    category: "ai-execution",
    requiredWhen: () => false,
    notes: "Optional. Overrides the lower-cost model used for lighter audit workflow nodes."
  },
  {
    key: "OPENAI_MODEL",
    category: "ai-execution",
    requiredWhen: (context) =>
      context.features.aiExecution &&
      readEnv("AI_EXECUTION_PROVIDER").toLowerCase() !== "dify"
  },
  {
    key: "OPENAI_REASONING_MODEL",
    category: "ai-execution",
    requiredWhen: () => false,
    notes: "Optional. Used for deeper reasoning nodes in the LangGraph audit workflow."
  },
  {
    key: "OPENAI_STRONG_MODEL",
    category: "ai-execution",
    requiredWhen: () => false,
    notes: "Optional. Overrides the stronger model used for higher-value audit workflow nodes."
  },
  {
    key: "AI_EXECUTION_TIMEOUT_MS",
    category: "ai-execution",
    requiredWhen: () => false,
    notes: "Optional. Defaults to 20000ms when omitted."
  },
  {
    key: "AI_EXECUTION_MAX_INPUT_CHARS",
    category: "ai-execution",
    requiredWhen: () => false,
    notes: "Optional global guardrail for total workflow input size."
  },
  {
    key: "AI_EXECUTION_STARTER_MAX_INPUT_CHARS",
    category: "ai-execution",
    requiredWhen: () => false,
    notes: "Optional plan-aware cap for starter audit input size."
  },
  {
    key: "AI_EXECUTION_SCALE_MAX_INPUT_CHARS",
    category: "ai-execution",
    requiredWhen: () => false,
    notes: "Optional plan-aware cap for scale audit input size."
  },
  {
    key: "AI_EXECUTION_ENTERPRISE_MAX_INPUT_CHARS",
    category: "ai-execution",
    requiredWhen: () => false,
    notes: "Optional plan-aware cap for enterprise audit input size."
  },
  {
    key: "AI_EXECUTION_MAX_CONCURRENCY",
    category: "ai-execution",
    requiredWhen: () => false,
    notes: "Optional global cap for simultaneous OpenAI/LangGraph workflow executions."
  },
  {
    key: "AI_EXECUTION_MAX_CONCURRENT_PER_ORG",
    category: "ai-execution",
    requiredWhen: () => false,
    notes: "Optional per-organization cap for simultaneous OpenAI/LangGraph workflow executions."
  },
  {
    key: "AI_EXECUTION_ORG_RATE_LIMIT_WINDOW_MS",
    category: "ai-execution",
    requiredWhen: () => false,
    notes: "Optional org-scoped acceptance rate-limit window for AI execution triggers."
  },
  {
    key: "AI_EXECUTION_ORG_RATE_LIMIT_MAX_REQUESTS",
    category: "ai-execution",
    requiredWhen: () => false,
    notes: "Optional org-scoped acceptance rate-limit cap for AI execution triggers."
  },
  {
    key: "AI_EXECUTION_WORKFLOW_RATE_LIMIT_WINDOW_MS",
    category: "ai-execution",
    requiredWhen: () => false,
    notes: "Optional workflow-dispatch scoped rate-limit window for duplicate AI triggers."
  },
  {
    key: "AI_EXECUTION_WORKFLOW_RATE_LIMIT_MAX_REQUESTS",
    category: "ai-execution",
    requiredWhen: () => false,
    notes: "Optional workflow-dispatch scoped rate-limit cap for duplicate AI triggers."
  },
  {
    key: "REPORT_RETENTION_DAYS",
    category: "monitoring",
    requiredWhen: () => false,
    notes: "Optional retention period for delivered, failed, and superseded reports."
  },
  {
    key: "ASSESSMENT_RETENTION_DAYS",
    category: "monitoring",
    requiredWhen: () => false,
    notes: "Optional retention period for archived assessments."
  },
  {
    key: "AUDIT_LOG_RETENTION_DAYS",
    category: "monitoring",
    requiredWhen: () => false,
    notes: "Optional retention period for audit access logs."
  },
  {
    key: "WORKFLOW_TRACE_RETENTION_DAYS",
    category: "monitoring",
    requiredWhen: () => false,
    notes: "Optional retention period for workflow traces, checkpoints, and analysis jobs."
  },
  {
    key: "HUBSPOT_ACCESS_TOKEN",
    category: "hubspot",
    requiredWhen: (context) => context.features.hubspot
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
    const configured = isRuleConfigured(rule);

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
        "ai-execution",
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
