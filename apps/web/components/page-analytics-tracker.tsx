"use client";

import { useEffect } from "react";
import { sendProductAnalyticsEvent } from "../lib/product-analytics-client";
import type { ProductAnalyticsEventMap, ProductAnalyticsEventName } from "../lib/product-analytics";

export function PageAnalyticsTracker<TName extends ProductAnalyticsEventName>({
  eventName,
  payload,
  source,
  storageKey
}: {
  eventName: TName;
  payload: ProductAnalyticsEventMap[TName];
  source: string;
  storageKey: string;
}) {
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(storageKey) === "sent") {
        return;
      }

      window.sessionStorage.setItem(storageKey, "sent");
    } catch {}

    sendProductAnalyticsEvent({
      name: eventName,
      payload,
      source
    });
  }, [eventName, payload, source, storageKey]);

  return null;
}
