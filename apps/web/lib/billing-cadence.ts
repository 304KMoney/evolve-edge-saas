export type BillingCadence = "monthly" | "annual";

export function resolveBillingCadenceFromPlanCode(
  value: string | null | undefined
): BillingCadence | null {
  const normalized = (value ?? "").trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized.endsWith("-monthly")) {
    return "monthly";
  }

  if (normalized.endsWith("-annual") || normalized.endsWith("-yearly")) {
    return "annual";
  }

  return null;
}
