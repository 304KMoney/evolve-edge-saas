const MAX_UNTRUSTED_INPUT_LENGTH = 3_000;

export const KNOWN_FRAMEWORKS = [
  "SOC 2",
  "ISO 27001",
  "NIST CSF",
  "HIPAA",
  "GLBA",
  "PCI DSS",
  "AI Governance",
] as const;

const KNOWN_FRAMEWORK_SET = new Set<string>(KNOWN_FRAMEWORKS);

const FRAMEWORK_ALIASES: Record<string, (typeof KNOWN_FRAMEWORKS)[number]> = {
  "soc2": "SOC 2",
  "soc 2": "SOC 2",
  "iso27001": "ISO 27001",
  "iso 27001": "ISO 27001",
  "nist": "NIST CSF",
  "nist csf": "NIST CSF",
  "hipaa": "HIPAA",
  "glba": "GLBA",
  "pci": "PCI DSS",
  "pci dss": "PCI DSS",
  "ai governance": "AI Governance",
  "model risk management": "AI Governance",
  "ai governance / model risk management": "AI Governance",
};

const EMAIL_PATTERN =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/;
const PHONE_PATTERN = /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/;
const API_KEY_PATTERN = /\b(?:sk|rk|pk|api)[-_][A-Za-z0-9_-]{8,}\b/i;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._-]+\b/i;
const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z ]+PRIVATE KEY-----/i;

const UNSAFE_OUTPUT_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\bfully compliant\b/i,
    reason: "absolute compliance claims are not allowed",
  },
  {
    pattern: /\bguaranteed (?:compliance|certification|outcome|approval)\b/i,
    reason: "guaranteed outcomes are not allowed",
  },
  {
    pattern: /\bno risk remains\b/i,
    reason: "absolute risk-elimination claims are not allowed",
  },
  {
    pattern: /\blegal advice\b/i,
    reason: "legal-advice framing is not allowed",
  },
  {
    pattern: /\bcertified\b/i,
    reason: "fabricated certification claims are not allowed",
  },
  {
    pattern: /\bwill pass (?:the )?(?:audit|assessment|certification)\b/i,
    reason: "guaranteed certification or audit outcomes are not allowed",
  },
];

const PROMPT_INJECTION_PATTERNS = [
  /ignore (?:all|any|previous|prior) instructions/gi,
  /reveal (?:the )?(?:system|developer) prompt/gi,
  /return plain text/gi,
  /override (?:system|developer) instructions/gi,
  /act as/gi,
];

export function normalizeFrameworkName(value: string) {
  const normalized = value.trim();
  const aliasKey = normalized.toLowerCase();
  return FRAMEWORK_ALIASES[aliasKey] ?? normalized;
}

export function isAllowedFrameworkName(value: string) {
  return KNOWN_FRAMEWORK_SET.has(normalizeFrameworkName(value));
}

export function sanitizeUntrustedInputText(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  if (!normalized) {
    return normalized;
  }

  const redacted = normalized
    .replace(EMAIL_PATTERN, "[REDACTED_EMAIL]")
    .replace(API_KEY_PATTERN, "[REDACTED_SECRET]")
    .replace(BEARER_PATTERN, "Bearer [REDACTED_SECRET]")
    .replace(PRIVATE_KEY_PATTERN, "[REDACTED_PRIVATE_KEY]");

  const injectionNeutralized = PROMPT_INJECTION_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, "[UNTRUSTED_INSTRUCTION_REMOVED]"),
    redacted
  );

  return injectionNeutralized.length <= MAX_UNTRUSTED_INPUT_LENGTH
    ? injectionNeutralized
    : `${injectionNeutralized.slice(0, MAX_UNTRUSTED_INPUT_LENGTH)}... [TRUNCATED]`;
}

export function validateAiOutputSafety(value: unknown, label: string) {
  const violations: string[] = [];

  walkStringValues(value, (text, path) => {
    for (const unsafePattern of UNSAFE_OUTPUT_PATTERNS) {
      if (unsafePattern.pattern.test(text)) {
        violations.push(
          `${label} contains unsafe content at ${path}: ${unsafePattern.reason}.`
        );
      }
    }

    if (EMAIL_PATTERN.test(text)) {
      violations.push(`${label} contains email-like PII at ${path}.`);
    }
    if (SSN_PATTERN.test(text)) {
      violations.push(`${label} contains SSN-like PII at ${path}.`);
    }
    if (PHONE_PATTERN.test(text)) {
      violations.push(`${label} contains phone-like PII at ${path}.`);
    }
    if (API_KEY_PATTERN.test(text) || BEARER_PATTERN.test(text) || PRIVATE_KEY_PATTERN.test(text)) {
      violations.push(`${label} contains secret-like content at ${path}.`);
    }
  });

  if (violations.length > 0) {
    throw new Error(violations[0]);
  }
}

function walkStringValues(
  value: unknown,
  visit: (text: string, path: string) => void,
  path = "$"
) {
  if (typeof value === "string") {
    visit(value, path);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => walkStringValues(item, visit, `${path}[${index}]`));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    walkStringValues(nestedValue, visit, `${path}.${key}`);
  }
}
