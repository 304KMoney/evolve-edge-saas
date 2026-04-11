import { NextResponse } from "next/server";
import { sendOperationalAlert } from "../../../../../lib/monitoring";
import { requireEnv } from "../../../../../lib/runtime-config";
import { getHostingerSiteSyncReference } from "../../../../../lib/site-sync-reference";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const expected = requireEnv("COMMERCIAL_REFERENCE_SECRET");
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  return provided === expected;
}

export async function GET(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    return NextResponse.json(getHostingerSiteSyncReference());
  } catch (error) {
    await sendOperationalAlert({
      source: "api.internal.commercial.site-reference",
      title: "Commercial site reference route failed",
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
