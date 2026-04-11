import { NextResponse } from "next/server";
import { sendOperationalAlert } from "../../../../../lib/monitoring";
import { getOpsReadinessSnapshot } from "../../../../../lib/ops-readiness";
import { requireEnv } from "../../../../../lib/runtime-config";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const expected = requireEnv("OPS_READINESS_SECRET");
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  return provided === expected;
}

export async function GET(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const snapshot = await getOpsReadinessSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    await sendOperationalAlert({
      source: "api.internal.ops.readiness",
      title: "Ops readiness route failed",
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
