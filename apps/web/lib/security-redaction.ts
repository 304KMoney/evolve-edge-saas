const REDACTED_VALUE = "[REDACTED]";
const SECRET_KEY_PATTERN =
  /(authorization|password|secret|token|key|cookie|session|signature)/i;
const SENSITIVE_CONTENT_KEY_PATTERN =
  /(prompt|evidence|assessmentanswers|customeremail|email|upload|attachment|body|content)/i;
const EMAIL_PATTERN =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const API_KEY_PATTERN =
  /\b(?:sk|rk|pk|api)[-_][A-Za-z0-9_-]{8,}\b/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._-]+\b/gi;
const URL_WITH_TOKEN_PATTERN =
  /\bhttps?:\/\/\S*(?:token|signature|key|secret)=\S+/gi;

function redactPrimitiveKeyValue(key: string, value: unknown) {
  if (value == null) {
    return value;
  }

  if (SECRET_KEY_PATTERN.test(key) || SENSITIVE_CONTENT_KEY_PATTERN.test(key)) {
    return REDACTED_VALUE;
  }

  if (typeof value === "string") {
    return value
      .replace(EMAIL_PATTERN, "[REDACTED_EMAIL]")
      .replace(API_KEY_PATTERN, "[REDACTED_SECRET]")
      .replace(BEARER_PATTERN, "Bearer [REDACTED_SECRET]")
      .replace(URL_WITH_TOKEN_PATTERN, "[REDACTED_URL]");
  }

  return value;
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
