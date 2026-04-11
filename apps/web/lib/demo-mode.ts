import {
  DEMO_PRESENTATION_STEPS,
  DEMO_SAMPLE_ORGANIZATIONS
} from "@evolve-edge/db";
import { getAuthMode, getOptionalEnv } from "./runtime-config";

export type DemoModeConfig = {
  enabled: boolean;
  source: "auth" | "flag" | "none";
  allowExternalSideEffects: boolean;
  resetCommand: string;
  label: string;
};

function readBooleanEnv(name: string, fallback: boolean) {
  const raw = getOptionalEnv(name);
  if (!raw) {
    return fallback;
  }

  switch (raw.toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      return fallback;
  }
}

export function getDemoModeConfig(): DemoModeConfig {
  const authMode = getAuthMode();
  const enabledByFlag = readBooleanEnv("DEMO_MODE_ENABLED", false);
  const enabledByAuth = authMode === "demo";
  const enabled = enabledByFlag || enabledByAuth;

  return {
    enabled,
    source: enabledByFlag ? "flag" : enabledByAuth ? "auth" : "none",
    allowExternalSideEffects: enabled
      ? readBooleanEnv("DEMO_EXTERNAL_SIDE_EFFECTS", false)
      : true,
    resetCommand:
      getOptionalEnv("DEMO_RESET_COMMAND") ?? "pnpm db:reset:demo",
    label: getOptionalEnv("DEMO_MODE_LABEL") ?? "Demo environment"
  };
}

export function isDemoModeEnabled() {
  return getDemoModeConfig().enabled;
}

export function shouldBlockDemoExternalSideEffects() {
  const config = getDemoModeConfig();
  return config.enabled && !config.allowExternalSideEffects;
}

export function getDemoPresentationGuide() {
  return {
    title: "Founder demo guide",
    summary:
      "This environment is seeded with polished, non-sensitive sample data so product, operations, and revenue workflows can be demonstrated without touching live customer records.",
    workspaces: DEMO_SAMPLE_ORGANIZATIONS,
    steps: DEMO_PRESENTATION_STEPS
  };
}
