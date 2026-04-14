import { NextResponse } from "next/server";
import { logServerEvent } from "./monitoring";
import {
  getApiRateLimitMaxRequests,
  getApiRateLimitWindowMs,
  getWebhookRateLimitMaxRequests,
  getWebhookRateLimitWindowMs
} from "./runtime-config";

type RateLimitOptions = {
  key: string;
  maxRequests?: number;
  windowMs?: number;
  category?: "api" | "webhook";
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

function getClientIdentifier(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const primaryIp = forwardedFor?.split(",")[0]?.trim();

  return (
    primaryIp ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

export function buildRateLimitResponse(options: {
  maxRequests: number;
  retryAfterSeconds: number;
}) {
  return NextResponse.json(
    { error: "Rate limit exceeded. Please retry later." },
    {
      status: 429,
      headers: {
        "Retry-After": String(options.retryAfterSeconds),
        "X-RateLimit-Limit": String(options.maxRequests)
      }
    }
  );
}

export function applyRouteRateLimit(request: Request, options: RateLimitOptions) {
  const category = options.category ?? "api";
  const windowMs =
    options.windowMs ??
    (category === "webhook" ? getWebhookRateLimitWindowMs() : getApiRateLimitWindowMs());
  const maxRequests =
    options.maxRequests ??
    (category === "webhook" ? getWebhookRateLimitMaxRequests() : getApiRateLimitMaxRequests());
  const clientIdentifier = getClientIdentifier(request);
  const now = Date.now();
  const entryKey = `${options.key}:${clientIdentifier}`;
  const current = rateLimitStore.get(entryKey);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(entryKey, {
      count: 1,
      resetAt: now + windowMs
    });
    return null;
  }

  if (current.count >= maxRequests) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    logServerEvent("warn", "security.rate_limit.exceeded", {
      routeKey: options.key,
      category,
      clientIdentifier
    });
    return buildRateLimitResponse({
      maxRequests,
      retryAfterSeconds
    });
  }

  current.count += 1;
  rateLimitStore.set(entryKey, current);
  return null;
}
