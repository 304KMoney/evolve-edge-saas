import { getOptionalEnv, requireEnv } from "./runtime-config";

export function requireWorkflowCallbackSecret() {
  return (
    getOptionalEnv("N8N_CALLBACK_SHARED_SECRET") ??
    requireEnv("N8N_CALLBACK_SECRET")
  );
}

export function requireWorkflowWritebackSecret() {
  return getOptionalEnv("N8N_WRITEBACK_SECRET") ?? requireWorkflowCallbackSecret();
}
