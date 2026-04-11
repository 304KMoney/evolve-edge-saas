"use client";

import { PRODUCT_ANALYTICS_COOKIE, type ProductAnalyticsEventMap, type ProductAnalyticsEventName } from "./product-analytics";

function readAnalyticsCookie() {
  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${PRODUCT_ANALYTICS_COOKIE}=`));

  if (!match) {
    return null;
  }

  try {
    return JSON.parse(decodeURIComponent(match.split("=")[1] ?? "")) as {
      anonymousId?: string;
      sessionId?: string;
    };
  } catch {
    return null;
  }
}

function ensureAnalyticsIdentity() {
  const existing = readAnalyticsCookie();
  const nextValue = {
    anonymousId: existing?.anonymousId ?? crypto.randomUUID(),
    sessionId: existing?.sessionId ?? crypto.randomUUID()
  };

  document.cookie = `${PRODUCT_ANALYTICS_COOKIE}=${encodeURIComponent(
    JSON.stringify(nextValue)
  )}; Max-Age=${60 * 60 * 24 * 365}; Path=/; SameSite=Lax`;

  return nextValue;
}

export function sendProductAnalyticsEvent<TName extends ProductAnalyticsEventName>(input: {
  name: TName;
  payload: ProductAnalyticsEventMap[TName];
  source: string;
  path?: string;
  referrer?: string | null;
}) {
  const identity = ensureAnalyticsIdentity();
  const body = JSON.stringify({
    name: input.name,
    payload: input.payload,
    source: input.source,
    path: input.path ?? window.location.pathname,
    referrer: input.referrer ?? document.referrer ?? null,
    anonymousId: identity.anonymousId,
    sessionId: identity.sessionId
  });

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon("/api/analytics/track", blob);
    return;
  }

  void fetch("/api/analytics/track", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body,
    keepalive: true
  });
}
