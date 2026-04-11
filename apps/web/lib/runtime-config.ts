function readEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

export function getAppUrl() {
  return readEnv("NEXT_PUBLIC_APP_URL") || "http://localhost:3000";
}

export function getSalesContactEmail() {
  return readEnv("NEXT_PUBLIC_SALES_CONTACT_EMAIL") || "sales@evolveedge.ai";
}

export function getContactSalesUrl() {
  return (
    readEnv("NEXT_PUBLIC_CONTACT_SALES_URL") ||
    `${getAppUrl()}/contact-sales`
  );
}

export function getHostingerReferenceUrl() {
  return readEnv("HOSTINGER_REFERENCE_URL") || "https://evolveedge.ai/pricing";
}

export function getAuthMode() {
  const mode = readEnv("AUTH_MODE");
  return mode === "password" ? "password" : "demo";
}

export function isPasswordAuthMode() {
  return getAuthMode() === "password";
}

export function getOptionalEnv(name: string) {
  const value = readEnv(name);
  return value || null;
}

export function requireEnv(name: string) {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getOptionalJsonEnv<T>(name: string): T | null {
  const value = readEnv(name);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw new Error(
      `Environment variable ${name} contains invalid JSON: ${
        error instanceof Error ? error.message : "Unknown parse error"
      }`
    );
  }
}

export function getOptionalListEnv(name: string) {
  const value = readEnv(name);
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}
