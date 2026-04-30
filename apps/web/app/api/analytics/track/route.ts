import { Prisma } from "@evolve-edge/db";
import { NextResponse } from "next/server";
import { getOptionalCurrentSession } from "../../../../lib/auth";
import {
  isKnownProductAnalyticsEventName,
  trackProductAnalyticsEvent
} from "../../../../lib/product-analytics";
import {
  isPrismaRuntimeCompatibilityError,
  logPrismaRuntimeCompatibilityError
} from "../../../../lib/prisma-runtime";
import { logServerEvent } from "../../../../lib/monitoring";
import { applyRouteRateLimit } from "../../../../lib/security-rate-limit";
import {
  expectObject,
  parseJsonRequestBody,
  readOptionalJsonValue,
  readOptionalString,
  readRequiredString,
  ValidationError
} from "../../../../lib/security-validation";
import { enforceTrustedOrigin } from "../../../../lib/route-security";
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
  const invalidOrigin = enforceTrustedOrigin(request);
  if (invalidOrigin) {
    return invalidOrigin;
  }

  const rateLimited = await applyRouteRateLimit(request, {
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
  try {
    await trackProductAnalyticsEvent({
      name: name as ProductAnalyticsEventName,
      payload: payload as ProductAnalyticsEventMap[ProductAnalyticsEventName],
      source,
      path:
        readOptionalString(body, "path", { maxLength: 500 }) ?? new URL(request.url).pathname,
      referrer: readOptionalString(body, "referrer", { maxLength: 1000 }),
      anonymousId: readOptionalString(body, "anonymousId", { maxLength: 200 }),
      sessionId: readOptionalString(body, "sessionId", { maxLength: 200 }),
      session
    });
  } catch (error) {
    if (isPrismaRuntimeCompatibilityError(error)) {
      logPrismaRuntimeCompatibilityError("api.analytics.track", error, {
        name,
        source
      });
    } else {
      logServerEvent("warn", "product_analytics.track_failed", {
        route: "api.analytics.track",
        source,
        status: "failed",
        metadata: {
          name,
          message: error instanceof Error ? error.message : "Unknown error"
        }
      });
    }
  }

  return NextResponse.json({ ok: true });
}
