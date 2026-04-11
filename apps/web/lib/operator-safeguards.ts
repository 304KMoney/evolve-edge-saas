export function validateOperatorReason(value: FormDataEntryValue | null, minimumLength = 8) {
  const reason = String(value ?? "").trim();
  if (reason.length < minimumLength) {
    throw new Error("Provide a short operator reason before running this action.");
  }

  return reason;
}

export function requireOperatorConfirmation(
  value: FormDataEntryValue | null,
  expected: string
) {
  const normalizedValue = String(value ?? "").trim().toUpperCase();
  if (normalizedValue !== expected.toUpperCase()) {
    throw new Error(`Type ${expected.toUpperCase()} to confirm this action.`);
  }

  return expected.toUpperCase();
}
