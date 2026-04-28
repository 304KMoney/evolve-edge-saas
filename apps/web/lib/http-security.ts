type SecuritySurface = "public" | "private" | "api";

function buildScriptSourceDirective(isDevelopment: boolean, nonce?: string) {
  const sources = ["'self'"];

  if (nonce) {
    sources.push(`'nonce-${nonce}'`);
  } else {
    sources.push("'unsafe-inline'");
  }

  sources.push("https:");

  if (isDevelopment) {
    sources.push("'unsafe-eval'");
  }

  return `script-src ${sources.join(" ")}`;
}

export function buildContentSecurityPolicy(input?: { isDevelopment?: boolean; nonce?: string }) {
  const isDevelopment = input?.isDevelopment ?? false;
  const nonce = input?.nonce;
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "form-action 'self'",
    "object-src 'none'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline' https:",
    buildScriptSourceDirective(isDevelopment, nonce),
    "connect-src 'self' https: wss:",
    "manifest-src 'self'",
    "media-src 'self'",
    "worker-src 'self' blob:"
  ];

  if (!isDevelopment) {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}

export function classifySecuritySurface(pathname: string): SecuritySurface {
  if (pathname.startsWith("/api/")) {
    return "api";
  }

  if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-out") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/invite/") ||
    pathname.startsWith("/billing/return")
  ) {
    return "private";
  }

  return "public";
}

export function buildSecurityHeaders(input: {
  pathname: string;
  isDevelopment?: boolean;
  isPreview?: boolean;
  nonce?: string;
}) {
  const surface = classifySecuritySurface(input.pathname);
  const isDevelopment = input.isDevelopment ?? false;
  const isPreview = input.isPreview ?? false;
  const nonce = input.nonce;
  const headers: Record<string, string> = {
    "Content-Security-Policy": buildContentSecurityPolicy({ isDevelopment, nonce }),
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), browsing-topics=(), display-capture=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-site",
    "Origin-Agent-Cluster": "?1",
    "X-DNS-Prefetch-Control": "off"
  };

  if (surface !== "public") {
    headers["Cache-Control"] = "no-store, private, max-age=0, must-revalidate";
    headers.Pragma = "no-cache";
    headers.Expires = "0";
    headers["X-Robots-Tag"] = "noindex, nofollow, noarchive";
  } else if (isPreview) {
    headers["X-Robots-Tag"] = "noindex, nofollow";
  }

  return headers;
}

function normalizeOrigin(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function isTrustedOriginRequest(input: {
  requestUrl: string;
  originHeader?: string | null;
  refererHeader?: string | null;
  allowedOrigins?: string[];
}) {
  const requestOrigin = normalizeOrigin(input.requestUrl);
  const originHeader = normalizeOrigin(input.originHeader);
  const refererHeader = normalizeOrigin(input.refererHeader);
  const allowedOrigins = new Set(
    [requestOrigin, ...(input.allowedOrigins ?? []).map((origin) => normalizeOrigin(origin))]
      .filter((origin): origin is string => Boolean(origin))
  );

  if (originHeader) {
    return allowedOrigins.has(originHeader);
  }

  if (refererHeader) {
    return allowedOrigins.has(refererHeader);
  }

  return false;
}
