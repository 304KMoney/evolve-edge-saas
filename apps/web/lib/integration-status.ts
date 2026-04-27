import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getEnvironmentParityStatus } from "./env-validation";
import {
  getN8nWorkflowDestinationByName,
  isLegacyN8nWebhookFallbackActive
} from "./n8n";
import { getRuntimeEnvironment } from "./runtime-config";

type IntegrationKey =
  | "neon"
  | "vercel"
  | "stripe"
  | "n8n"
  | "openai_langgraph"
  | "hubspot"
  | "apollo"
  | "dify";

export type IntegrationStatusEntry = {
  key: IntegrationKey;
  label: string;
  configured: boolean;
  required: boolean;
  notes: string[];
};

type VercelProjectJson = {
  projectId?: string;
  orgId?: string;
  projectName?: string;
  settings?: {
    rootDirectory?: string | null;
  };
};

function readEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function hasAllEnv(keys: string[]) {
  return keys.every((key) => readEnv(key).length > 0);
}

function hasAnyEnv(keys: string[]) {
  return keys.some((key) => readEnv(key).length > 0);
}

function findRepoFile(relativePath: string) {
  let current = process.cwd();

  for (let depth = 0; depth < 5; depth += 1) {
    const candidate = path.join(current, relativePath);
    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }

    current = parent;
  }

  return null;
}

function readLinkedVercelProject() {
  const projectPath = findRepoFile(path.join(".vercel", "project.json"));
  if (!projectPath) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      readFileSync(projectPath, "utf8")
    ) as VercelProjectJson;

    return {
      path: projectPath,
      projectId: typeof parsed.projectId === "string" ? parsed.projectId : null,
      orgId: typeof parsed.orgId === "string" ? parsed.orgId : null,
      projectName: typeof parsed.projectName === "string" ? parsed.projectName : null,
      rootDirectory:
        typeof parsed.settings?.rootDirectory === "string"
          ? parsed.settings.rootDirectory
          : null
    };
  } catch (error) {
    return {
      path: projectPath,
      projectId: null,
      orgId: null,
      projectName: null,
      rootDirectory: null,
      parseError: error instanceof Error ? error.message : "Unknown parse error"
    };
  }
}

function getParityEntryConfigured(key: string) {
  return (
    getEnvironmentParityStatus().find((entry) => entry.key === key)?.configured ?? false
  );
}

export function getIntegrationStatusSnapshot(): {
  environment: ReturnType<typeof getRuntimeEnvironment>;
  integrations: IntegrationStatusEntry[];
} {
  const runtime = getRuntimeEnvironment();
  const vercelProject = readLinkedVercelProject();
  const auditRequestedDestination = getN8nWorkflowDestinationByName("auditRequested");
  const hasLegacyN8nFallback = isLegacyN8nWebhookFallbackActive();
  const hasWorkflowDestinations = readEnv("N8N_WORKFLOW_DESTINATIONS").length > 0;
  const n8nCallbackConfigured =
    getParityEntryConfigured("N8N_CALLBACK_SECRET") ||
    getParityEntryConfigured("N8N_CALLBACK_SHARED_SECRET");
  const n8nPrimaryNote = auditRequestedDestination
    ? `auditRequested resolves to ${auditRequestedDestination.url}.`
    : hasWorkflowDestinations
      ? "N8N_WORKFLOW_DESTINATIONS is present, but auditRequested is missing or invalid."
      : hasLegacyN8nFallback
        ? "Using legacy N8N_WEBHOOK_URL fallback for auditRequested."
        : "No n8n destination env is present.";
  const n8nConfigurationModeNote = hasWorkflowDestinations
    ? "Explicit N8N_WORKFLOW_DESTINATIONS is present."
    : hasLegacyN8nFallback
      ? "Using legacy N8N_WEBHOOK_URL fallback."
      : null;

  const integrations: IntegrationStatusEntry[] = [
    {
      key: "neon",
      label: "Neon",
      configured: getParityEntryConfigured("DATABASE_URL"),
      required: true,
      notes: ["Canonical Postgres persistence via DATABASE_URL."]
    },
    {
      key: "vercel",
      label: "Vercel",
      configured: Boolean(vercelProject?.projectId && vercelProject?.orgId),
      required: false,
      notes: vercelProject
        ? [
            `Linked via ${vercelProject.path}.`,
            vercelProject.projectName
              ? `Project: ${vercelProject.projectName}.`
              : "Project name not present in linked config.",
            vercelProject.rootDirectory
              ? `Root directory: ${vercelProject.rootDirectory}.`
              : "Root directory not present in linked config.",
            ...(vercelProject.parseError
              ? [`Linked config could not be parsed: ${vercelProject.parseError}.`]
              : [])
          ]
        : ["No .vercel/project.json link found in the current workspace."]
    },
    {
      key: "stripe",
      label: "Stripe",
      configured:
        hasAllEnv([
          "STRIPE_SECRET_KEY",
          "STRIPE_WEBHOOK_SECRET",
          "STRIPE_PRICE_STARTER_ANNUAL",
          "STRIPE_PRICE_SCALE_ANNUAL",
          "STRIPE_PRICE_ENTERPRISE_ANNUAL",
          "STRIPE_PRODUCT_STARTER",
          "STRIPE_PRODUCT_SCALE",
          "STRIPE_PRODUCT_ENTERPRISE"
        ]),
      required: true,
      notes: [
        "Checks secret, webhook, and canonical Stripe price/product env presence only.",
        "Does not verify live mode alignment or webhook registration."
      ]
    },
    {
      key: "n8n",
      label: "n8n",
      configured: Boolean(auditRequestedDestination) && n8nCallbackConfigured,
      required: true,
      notes: [
        n8nPrimaryNote,
        ...(n8nConfigurationModeNote ? [n8nConfigurationModeNote] : []),
        n8nCallbackConfigured
          ? "Callback authentication secret is present."
          : "Callback authentication secret is missing."
      ]
    },
    {
      key: "openai_langgraph",
      label: "OpenAI/LangGraph",
      configured:
        readEnv("AI_EXECUTION_PROVIDER").toLowerCase() !== "dify" &&
        hasAllEnv([
          "AI_EXECUTION_DISPATCH_SECRET",
          "OPENAI_API_KEY",
          "OPENAI_MODEL"
        ]),
      required: true,
      notes: [
        "Checks app-owned OpenAI/LangGraph execution wiring only.",
        readEnv("AI_EXECUTION_DISPATCH_SECRET")
          ? "AI execution route auth secret is configured."
          : "AI execution route auth secret is missing.",
        readEnv("OPENAI_REASONING_MODEL")
          ? "OPENAI_REASONING_MODEL is configured."
          : "OPENAI_REASONING_MODEL is not configured; strong-model fallback will be used."
      ]
    },
    {
      key: "hubspot",
      label: "HubSpot",
      configured: getParityEntryConfigured("HUBSPOT_ACCESS_TOKEN"),
      required: false,
      notes: ["CRM projection only. Presence check does not verify scopes."]
    },
    {
      key: "apollo",
      label: "Apollo",
      configured: hasAllEnv(["APOLLO_API_KEY", "APOLLO_API_BASE_URL"]),
      required: false,
      notes: [
        "Optional enrichment-only wiring for n8n/operator workflows.",
        "No app-owned Apollo client or launch-critical repo workflow is currently wired.",
        "Absence does not block app-owned routing or customer state."
      ]
    }
  ];

  return {
    environment: runtime,
    integrations
  };
}
