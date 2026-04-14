import { Prisma } from "@evolve-edge/db";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export type JsonObject = Record<string, unknown>;

export async function parseJsonRequestBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }
}

export function expectObject(value: unknown, label = "payload"): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`${label} must be a JSON object.`);
  }

  return value as JsonObject;
}

export function readRequiredString(
  input: JsonObject,
  field: string,
  options?: { maxLength?: number; label?: string }
) {
  const value = input[field];
  if (typeof value !== "string") {
    throw new ValidationError(`${options?.label ?? field} is required.`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new ValidationError(`${options?.label ?? field} is required.`);
  }

  if (options?.maxLength && normalized.length > options.maxLength) {
    throw new ValidationError(
      `${options?.label ?? field} must be ${options.maxLength} characters or fewer.`
    );
  }

  return normalized;
}

export function readOptionalString(
  input: JsonObject,
  field: string,
  options?: { maxLength?: number; allowEmpty?: boolean }
) {
  const value = input[field];
  if (value == null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new ValidationError(`${field} must be a string.`);
  }

  const normalized = value.trim();
  if (!normalized && !options?.allowEmpty) {
    return null;
  }

  if (options?.maxLength && normalized.length > options.maxLength) {
    throw new ValidationError(`${field} must be ${options.maxLength} characters or fewer.`);
  }

  return normalized;
}

export function readOptionalStringArray(
  input: JsonObject,
  field: string,
  options?: { maxItems?: number; maxItemLength?: number }
) {
  const value = input[field];
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new ValidationError(`${field} must be an array of strings.`);
  }

  if (options?.maxItems && value.length > options.maxItems) {
    throw new ValidationError(`${field} must include ${options.maxItems} items or fewer.`);
  }

  return value.map((item, index) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new ValidationError(`${field}[${index}] must be a non-empty string.`);
    }

    const normalized = item.trim();
    if (options?.maxItemLength && normalized.length > options.maxItemLength) {
      throw new ValidationError(
        `${field}[${index}] must be ${options.maxItemLength} characters or fewer.`
      );
    }

    return normalized;
  });
}

export function readOptionalJsonValue(
  input: JsonObject,
  field: string
): Prisma.InputJsonValue | null {
  const value = input[field];
  return value == null ? null : (value as Prisma.InputJsonValue);
}

export function readOptionalJsonObject(
  input: JsonObject,
  field: string
): Prisma.InputJsonValue | undefined {
  const value = input[field];
  if (value == null) {
    return undefined;
  }

  return expectObject(value, field) as Prisma.InputJsonValue;
}

export function readOptionalEnumValue<T extends readonly string[]>(
  input: JsonObject,
  field: string,
  values: T
): T[number] | null {
  const value = input[field];
  if (value == null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new ValidationError(`${field} must be one of: ${values.join(", ")}.`);
  }

  const normalized = value.trim();
  if (!values.includes(normalized as T[number])) {
    throw new ValidationError(`${field} must be one of: ${values.join(", ")}.`);
  }

  return normalized as T[number];
}

export function readValidatedNumberFromSearchParams(input: {
  searchParams: URLSearchParams;
  field: string;
  defaultValue: number;
  min: number;
  max: number;
}) {
  const rawValue = input.searchParams.get(input.field);
  if (!rawValue) {
    return input.defaultValue;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    throw new ValidationError(`${input.field} must be a number.`);
  }

  return Math.max(input.min, Math.min(input.max, Math.trunc(parsed)));
}
