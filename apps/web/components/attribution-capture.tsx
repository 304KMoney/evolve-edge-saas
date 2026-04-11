"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const ATTRIBUTION_COOKIE = "evolve_edge_attribution";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

type AttributionCookiePayload = {
  landingPath?: string | null;
  lastPath?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  msclkid?: string | null;
  capturedAt?: string | null;
};

function readExistingCookie() {
  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${ATTRIBUTION_COOKIE}=`));

  if (!match) {
    return null;
  }

  try {
    return JSON.parse(decodeURIComponent(match.split("=")[1] ?? "")) as AttributionCookiePayload;
  } catch {
    return null;
  }
}

function getSearchParam(searchParams: URLSearchParams, key: string) {
  const value = searchParams.get(key);
  return value?.trim() ? value.trim() : null;
}

export function AttributionCapture() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const existing = readExistingCookie();
    const nextPayload: AttributionCookiePayload = {
      landingPath: existing?.landingPath ?? pathname,
      lastPath: pathname,
      referrer: existing?.referrer ?? (document.referrer || null),
      utmSource: getSearchParam(searchParams, "utm_source") ?? existing?.utmSource ?? null,
      utmMedium: getSearchParam(searchParams, "utm_medium") ?? existing?.utmMedium ?? null,
      utmCampaign:
        getSearchParam(searchParams, "utm_campaign") ?? existing?.utmCampaign ?? null,
      utmTerm: getSearchParam(searchParams, "utm_term") ?? existing?.utmTerm ?? null,
      utmContent:
        getSearchParam(searchParams, "utm_content") ?? existing?.utmContent ?? null,
      gclid: getSearchParam(searchParams, "gclid") ?? existing?.gclid ?? null,
      fbclid: getSearchParam(searchParams, "fbclid") ?? existing?.fbclid ?? null,
      msclkid: getSearchParam(searchParams, "msclkid") ?? existing?.msclkid ?? null,
      capturedAt: existing?.capturedAt ?? new Date().toISOString()
    };

    document.cookie = `${ATTRIBUTION_COOKIE}=${encodeURIComponent(
      JSON.stringify(nextPayload)
    )}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
  }, [pathname, searchParams]);

  return null;
}
