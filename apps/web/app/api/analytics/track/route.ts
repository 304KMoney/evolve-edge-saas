import { Prisma } from "@evolve-edge/db";
import { NextResponse } from "next/server";
import { getOptionalCurrentSession } from "../../../../lib/auth";
import {
  isKnownProductAnalyticsEventName,
  trackProductAnalyticsEvent
} from "../../../../lib/product-analytics";
import type {
  ProductAnalyticsEventMap,
  ProductAnalyticsEventName
} from "../../../../lib/product-analytics-shared";

type AnalyticsTrackRequest = {
  name?: string;
  payload?: Prisma.JsonValue;
  source?: string;
  path?: string;
  referrer?: string | null;
  anonymousId?: string;
  sessionId?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as AnalyticsTrackRequest;

  if (
    !body.name ||
    !isKnownProductAnalyticsEventName(body.name) ||
    !body.source ||
    !body.payload ||
    typeof body.payload !== "object" ||
    Array.isArray(body.payload)
  ) {
    return NextResponse.json(
      {
        error: "Invalid analytics payload."
      },
      { status: 400 }
    );
  }

  const session = await getOptionalCurrentSession();
  await trackProductAnalyticsEvent({
    name: body.name as ProductAnalyticsEventName,
    payload: body.payload as ProductAnalyticsEventMap[ProductAnalyticsEventName],
    source: body.source,
    path: body.path ?? new URL(request.url).pathname,
    referrer: body.referrer ?? null,
    anonymousId: body.anonymousId ?? null,
    sessionId: body.sessionId ?? null,
    session
  });

  return NextResponse.json({ ok: true });
}
