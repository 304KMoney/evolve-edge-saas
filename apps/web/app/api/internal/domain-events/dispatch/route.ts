import { NextResponse } from "next/server";
import {
  dispatchPendingWebhookDeliveries,
  requireOutboundDispatchSecret
} from "../../../../../lib/webhook-dispatcher";
import { sendOperationalAlert } from "../../../../../lib/monitoring";

function isAuthorized(request: Request) {
  const expected = requireOutboundDispatchSecret();
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  return provided === expected;
}

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") ?? "25");
    const result = await dispatchPendingWebhookDeliveries({
      limit: Number.isFinite(limit) ? limit : 25
    });

    return NextResponse.json(result);
  } catch (error) {
    await sendOperationalAlert({
      source: "api.internal.domain-events.dispatch",
      title: "Domain event dispatch API failed",
      metadata: {
        message: error instanceof Error ? error.message : "Unknown error"
      }
    });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
