const REDACTED_VALUE = "[REDACTED]";
const SECRET_KEY_PATTERN =
  /(authorization|password|secret|token|key|cookie|session|signature)/i;

function redactPrimitiveKeyValue(key: string, value: unknown) {
  if (!SECRET_KEY_PATTERN.test(key)) {
    return value;
  }

  return value == null ? value : REDACTED_VALUE;
}

export function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item)) as T;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
      key,
      nestedValue && typeof nestedValue === "object"
        ? redactSecrets(nestedValue)
        : redactPrimitiveKeyValue(key, nestedValue)
    ])
  ) as T;
}
