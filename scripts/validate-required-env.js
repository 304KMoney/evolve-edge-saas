#!/usr/bin/env node

const profiles = {
  ci: [
    "DATABASE_URL",
    "AUTH_SECRET",
    "AUTH_ACCESS_EMAIL",
    "AUTH_ACCESS_PASSWORD",
    "OUTBOUND_DISPATCH_SECRET",
    "AI_EXECUTION_PROVIDER",
    "AI_EXECUTION_DISPATCH_SECRET",
    "OPENAI_API_KEY",
    "OPENAI_MODEL"
  ],
  preview: [
    "VERCEL_TOKEN",
    "VERCEL_ORG_ID",
    "VERCEL_PROJECT_ID",
    "DATABASE_URL",
    "AUTH_SECRET",
    "AUTH_ACCESS_EMAIL",
    "AUTH_ACCESS_PASSWORD",
    "OUTBOUND_DISPATCH_SECRET",
    "AI_EXECUTION_PROVIDER",
    "AI_EXECUTION_DISPATCH_SECRET",
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "NEXT_PUBLIC_APP_URL"
  ],
  production: [
    "VERCEL_TOKEN",
    "VERCEL_ORG_ID",
    "VERCEL_PROJECT_ID",
    "DATABASE_URL",
    "AUTH_SECRET",
    "AUTH_ACCESS_EMAIL",
    "AUTH_ACCESS_PASSWORD",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_STARTER_ANNUAL",
    "STRIPE_PRICE_SCALE_ANNUAL",
    "STRIPE_PRICE_ENTERPRISE_ANNUAL",
    "STRIPE_PRODUCT_STARTER",
    "STRIPE_PRODUCT_SCALE",
    "STRIPE_PRODUCT_ENTERPRISE",
    "OUTBOUND_DISPATCH_SECRET",
    {
      label: "N8N_CALLBACK_SECRET|N8N_CALLBACK_SHARED_SECRET",
      keys: ["N8N_CALLBACK_SECRET", "N8N_CALLBACK_SHARED_SECRET"]
    },
    {
      label: "N8N_WORKFLOW_DESTINATIONS[auditRequested]",
      validate: hasAuditRequestedDestination,
      message:
        "N8N_WORKFLOW_DESTINATIONS must include a valid auditRequested destination."
    },
    "AI_EXECUTION_PROVIDER",
    "AI_EXECUTION_DISPATCH_SECRET",
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "NEXT_PUBLIC_APP_URL",
    "REPORT_DOWNLOAD_SIGNING_SECRET",
    "EMAIL_FROM_ADDRESS",
    "RESEND_API_KEY",
    "RESEND_WEBHOOK_SIGNING_SECRET",
    "NOTIFICATION_DISPATCH_SECRET",
    "CRON_SECRET",
    "OPS_READINESS_SECRET",
    "PUBLIC_INTAKE_SHARED_SECRET"
  ]
};

function readEnv(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function hasAuditRequestedDestination() {
  const rawValue = readEnv("N8N_WORKFLOW_DESTINATIONS");
  if (!rawValue) {
    return false;
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return false;
    }

    return parsed.some((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return false;
      }

      return (
        typeof item.name === "string" &&
        item.name.trim() === "auditRequested" &&
        typeof item.url === "string" &&
        item.url.trim().length > 0
      );
    });
  } catch {
    return false;
  }
}

function validateRequirement(requirement) {
  if (typeof requirement === "string") {
    return {
      label: requirement,
      ok: Boolean(readEnv(requirement)),
      message: `${requirement} is missing.`
    };
  }

  if (Array.isArray(requirement.keys)) {
    const configuredKey = requirement.keys.find((key) => Boolean(readEnv(key)));
    return {
      label: requirement.label,
      ok: Boolean(configuredKey),
      message:
        requirement.message ??
        `${requirement.label} is missing.`,
      configuredKey: configuredKey ?? null
    };
  }

  if (typeof requirement.validate === "function") {
    return {
      label: requirement.label,
      ok: requirement.validate(),
      message:
        requirement.message ??
        `${requirement.label} is missing or invalid.`
    };
  }

  return {
    label: requirement.label ?? "unknown",
    ok: false,
    message: "Invalid requirement configuration."
  };
}

function main() {
  const profile = process.argv[2] || "ci";
  const required = profiles[profile];

  if (!required) {
    console.error(
      `[env-validate] unknown profile "${profile}". Expected one of: ${Object.keys(profiles).join(", ")}`
    );
    process.exit(1);
  }

  const results = required.map(validateRequirement);
  const missing = results.filter((result) => !result.ok);

  console.log(`[env-validate] profile=${profile}`);
  console.log(`[env-validate] required=${required.length}`);

  if (missing.length > 0) {
    console.error("[env-validate] missing required environment variables:");
    for (const result of missing) {
      console.error(`- ${result.label}: ${result.message}`);
    }
    process.exit(1);
  }

  console.log("[env-validate] all required environment variables are present");
}

main();
