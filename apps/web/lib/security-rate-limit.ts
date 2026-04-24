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

type ConsumeRateLimitOptions = {
  storeKey: string;
  maxRequests: number;
  windowMs: number;
  metadata?: Record<string, unknown>;
};

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

export function consumeRateLimit(
  options: ConsumeRateLimitOptions
): { limited: false } | { limited: true; retryAfterSeconds: number; maxRequests: number } {
  const now = Date.now();
  const current = rateLimitStore.get(options.storeKey);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(options.storeKey, {
      count: 1,
      resetAt: now + options.windowMs
    });
    return { limited: false };
  }

  if (current.count >= options.maxRequests) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    logServerEvent("warn", "security.rate_limit.exceeded", {
      ...options.metadata,
      storeKey: options.storeKey
    });
    return {
      limited: true,
      retryAfterSeconds,
      maxRequests: options.maxRequests
    };
  }

  current.count += 1;
  rateLimitStore.set(options.storeKey, current);
  return { limited: false };
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
  const entryKey = `${options.key}:${clientIdentifier}`;
  const result = consumeRateLimit({
    storeKey: entryKey,
    maxRequests,
    windowMs,
    metadata: {
      routeKey: options.key,
      category,
      clientIdentifier
    }
  });

  if (result.limited) {
    return buildRateLimitResponse({
      maxRequests: result.maxRequests,
      retryAfterSeconds: result.retryAfterSeconds
    });
  }
  return null;
}
