import { getOptionalEnv, getRuntimeEnvironment } from "./runtime-config";

export type StripeRuntimeMode = "test" | "live" | "unknown";

export function inferStripeModeFromSecretKey(secretKey: string | null | undefined): StripeRuntimeMode {
  const normalized = (secretKey ?? "").trim();

  if (normalized.startsWith("sk_live_")) {
    return "live";
  }

  if (normalized.startsWith("sk_test_")) {
    return "test";
  }

  return "unknown";
}

export function getConfiguredStripeRuntimeMode(): StripeRuntimeMode {
  return inferStripeModeFromSecretKey(getOptionalEnv("STRIPE_SECRET_KEY"));
}

export function getStripeModeLaunchExpectation() {
  const environment = getRuntimeEnvironment();
  const configuredMode = getConfiguredStripeRuntimeMode();

  return {
    environment,
    configuredMode,
    shouldUseLiveMode: environment === "production"
  };
}

export function isStripeWebhookLivemodeMismatch(input: {
  configuredMode: StripeRuntimeMode;
  eventLivemode: boolean | null | undefined;
}) {
  if (input.configuredMode === "unknown" || typeof input.eventLivemode !== "boolean") {
    return false;
  }

  return (
    (input.configuredMode === "live" && input.eventLivemode !== true) ||
    (input.configuredMode === "test" && input.eventLivemode !== false)
  );
}
