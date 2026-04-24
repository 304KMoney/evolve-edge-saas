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
    "OUTBOUND_DISPATCH_SECRET",
    "AI_EXECUTION_PROVIDER",
    "AI_EXECUTION_DISPATCH_SECRET",
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "NEXT_PUBLIC_APP_URL",
    "N8N_WORKFLOW_DESTINATIONS",
    "N8N_CALLBACK_SHARED_SECRET"
  ]
};

function readEnv(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
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

  const missing = required.filter((name) => !readEnv(name));

  console.log(`[env-validate] profile=${profile}`);
  console.log(`[env-validate] required=${required.length}`);

  if (missing.length > 0) {
    console.error("[env-validate] missing required environment variables:");
    for (const name of missing) {
      console.error(`- ${name}`);
    }
    process.exit(1);
  }

  console.log("[env-validate] all required environment variables are present");
}

main();
