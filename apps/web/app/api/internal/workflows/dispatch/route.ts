import { NextResponse } from "next/server";
import { dispatchPendingWorkflowDispatches } from "../../../../../lib/workflow-dispatch";
import { requireOutboundDispatchSecret } from "../../../../../lib/webhook-dispatcher";
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
    const limit = Number(searchParams.get("limit") ?? "20");
    const result = await dispatchPendingWorkflowDispatches({
      limit: Number.isFinite(limit) ? limit : 20
    });

    return NextResponse.json(result);
  } catch (error) {
    await sendOperationalAlert({
      source: "api.internal.workflows.dispatch",
      title: "Workflow dispatch API failed",
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
