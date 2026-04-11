import { getOptionalEnv } from "./runtime-config";

export const FEATURE_FLAG_KEYS = [
  "advancedAdminConsole",
  "growthPipelineVisibility",
  "supportAccountSummaries",
  "opsConfigVisibility"
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

export type FeatureFlagSnapshot = Record<FeatureFlagKey, boolean>;

const DEFAULT_FEATURE_FLAGS: FeatureFlagSnapshot = {
  advancedAdminConsole: true,
  growthPipelineVisibility: true,
  supportAccountSummaries: true,
  opsConfigVisibility: true
};

function isFeatureFlagRecord(value: unknown): value is Partial<Record<FeatureFlagKey, boolean>> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function getFeatureFlags(): FeatureFlagSnapshot {
  const rawValue = getOptionalEnv("APP_FEATURE_FLAGS");
  if (!rawValue) {
    return DEFAULT_FEATURE_FLAGS;
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!isFeatureFlagRecord(parsed)) {
      return DEFAULT_FEATURE_FLAGS;
    }

    return FEATURE_FLAG_KEYS.reduce((result, key) => {
      result[key] =
        typeof parsed[key] === "boolean" ? parsed[key] : DEFAULT_FEATURE_FLAGS[key];
      return result;
    }, {} as FeatureFlagSnapshot);
  } catch {
    return DEFAULT_FEATURE_FLAGS;
  }
}

export function isFeatureFlagEnabled(key: FeatureFlagKey) {
  return getFeatureFlags()[key];
}
