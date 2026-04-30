import { NextResponse } from "next/server";
import { logServerEvent } from "./monitoring";
import {
  getApiRateLimitMaxRequests,
  getApiRateLimitWindowMs,
  getUpstashRedisConfig,
  getWebhookRateLimitMaxRequests,
  getWebhookRateLimitWindowMs
} from "./runtime-config";

// -------------------------------------------------------------------------
// Optional Upstash Redis client — initialized once at module load
// -------------------------------------------------------------------------

type UpstashRedisClient = {
  incr: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number>;
};

let upstashClient: UpstashRedisClient | null = null;
let upstashWarningLogged = false;

function getUpstashClient(): UpstashRedisClient | null {
  if (upstashClient !== null) {
    return upstashClient;
  }

  const config = getUpstashRedisConfig();
  if (config.url && config.token) {
    try {
      // Dynamic import to avoid errors when @upstash/redis is not installed
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Redis } = require("@upstash/redis") as { Redis: new (opts: { url: string; token: string }) => UpstashRedisClient };
      upstashClient = new Redis({ url: config.url, token: config.token });
      return upstashClient;
    } catch (err) {
      console.warn("[rate-limit] Failed to initialize Upstash Redis client:", err);
      return null;
    }
  }

  if (process.env.NODE_ENV === "production" && !upstashWarningLogged) {
    upstashWarningLogged = true;
    console.warn(
      "[rate-limit] Rate limiting is using in-memory store. " +
        "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for durable rate limiting."
    );
  }

  return null;
}

// -------------------------------------------------------------------------
// In-memory fallback store
// -------------------------------------------------------------------------

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

function getClientIdentifier(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const primaryIp = forwardedFor?.split(",")[0]?.trim();

  return (
    primaryIp ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

export { getClientIdentifier };

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

// -------------------------------------------------------------------------
// Core rate-limit logic (in-memory path)
// -------------------------------------------------------------------------

function consumeRateLimitInMemory(
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

// -------------------------------------------------------------------------
// Core rate-limit logic (Upstash path)
// -------------------------------------------------------------------------

async function consumeRateLimitUpstash(
  client: UpstashRedisClient,
  options: ConsumeRateLimitOptions
): Promise<{ limited: false } | { limited: true; retryAfterSeconds: number; maxRequests: number }> {
  const windowBucket = Math.floor(Date.now() / options.windowMs);
  const redisKey = `rate:${options.storeKey}:${windowBucket}`;

  const count = await client.incr(redisKey);

  // Set TTL on first request; best-effort on subsequent (idempotent if already set)
  if (count === 1) {
    const ttlSeconds = Math.ceil(options.windowMs / 1000) + 1;
    await client.expire(redisKey, ttlSeconds);
  }

  if (count > options.maxRequests) {
    const msUntilNextWindow = options.windowMs - (Date.now() % options.windowMs);
    const retryAfterSeconds = Math.max(1, Math.ceil(msUntilNextWindow / 1000));
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

  return { limited: false };
}

// -------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------

export async function consumeRateLimit(
  options: ConsumeRateLimitOptions
): Promise<{ limited: false } | { limited: true; retryAfterSeconds: number; maxRequests: number }> {
  const client = getUpstashClient();

  if (client) {
    try {
      return await consumeRateLimitUpstash(client, options);
    } catch (err) {
      // Fail open: if Upstash is unavailable, fall back to in-memory
      console.warn("[rate-limit] Upstash error, falling back to in-memory:", err);
    }
  }

  return consumeRateLimitInMemory(options);
}

export async function applyRouteRateLimit(
  request: Request,
  options: RateLimitOptions
): Promise<NextResponse | null> {
  const category = options.category ?? "api";
  const windowMs =
    options.windowMs ??
    (category === "webhook" ? getWebhookRateLimitWindowMs() : getApiRateLimitWindowMs());
  const maxRequests =
    options.maxRequests ??
    (category === "webhook" ? getWebhookRateLimitMaxRequests() : getApiRateLimitMaxRequests());
  const clientIdentifier = getClientIdentifier(request);
  const entryKey = `${options.key}:${clientIdentifier}`;
  const result = await consumeRateLimit({
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
