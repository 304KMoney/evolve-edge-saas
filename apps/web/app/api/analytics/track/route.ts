import { Prisma } from "@evolve-edge/db";
import { NextResponse } from "next/server";
import { getOptionalCurrentSession } from "../../../../lib/auth";
import {
  isKnownProductAnalyticsEventName,
  trackProductAnalyticsEvent
} from "../../../../lib/product-analytics";
import { applyRouteRateLimit } from "../../../../lib/security-rate-limit";
import {
  expectObject,
  parseJsonRequestBody,
  readOptionalJsonValue,
  readOptionalString,
  readRequiredString,
  ValidationError
} from "../../../../lib/security-validation";
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
  const rateLimited = applyRouteRateLimit(request, {
    key: "analytics-track"
  });
  if (rateLimited) {
    return rateLimited;
  }

  let body: AnalyticsTrackRequest & Record<string, unknown>;
  try {
    body = expectObject(await parseJsonRequestBody(request)) as AnalyticsTrackRequest &
      Record<string, unknown>;
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const name = readRequiredString(body, "name", { maxLength: 120 });
  const source = readRequiredString(body, "source", { maxLength: 120 });
  const payload = readOptionalJsonValue(body, "payload");

  if (
    !isKnownProductAnalyticsEventName(name) ||
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
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
    name: name as ProductAnalyticsEventName,
    payload: payload as ProductAnalyticsEventMap[ProductAnalyticsEventName],
    source,
    path: readOptionalString(body, "path", { maxLength: 500 }) ?? new URL(request.url).pathname,
    referrer: readOptionalString(body, "referrer", { maxLength: 1000 }),
    anonymousId: readOptionalString(body, "anonymousId", { maxLength: 200 }),
    sessionId: readOptionalString(body, "sessionId", { maxLength: 200 }),
    session
  });

  return NextResponse.json({ ok: true });
}
