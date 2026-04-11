"use client";

import Link from "next/link";
import { sendProductAnalyticsEvent } from "../lib/product-analytics-client";

export function TrackedCtaLink({
  href,
  eventPayload,
  source,
  className,
  children
}: {
  href: string;
  eventPayload: {
    ctaKey: "view-pricing" | "open-workspace" | "book-demo";
    location: string;
    href: string;
  };
  source: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href as never}
      onClick={() =>
        sendProductAnalyticsEvent({
          name: "marketing.landing_cta_clicked",
          payload: eventPayload,
          source
        })
      }
      className={className}
    >
      {children}
    </Link>
  );
}
