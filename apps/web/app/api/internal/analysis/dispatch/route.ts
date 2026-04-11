import { NextResponse } from "next/server";
import {
  dispatchQueuedAssessmentAnalysisJobs,
  requireDifyDispatchSecret
} from "../../../../../lib/dify";
import { sendOperationalAlert } from "../../../../../lib/monitoring";

function isAuthorized(request: Request) {
  const expected = requireDifyDispatchSecret();
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
    const limit = Number(searchParams.get("limit") ?? "10");
    const result = await dispatchQueuedAssessmentAnalysisJobs({
      limit: Number.isFinite(limit) ? limit : 10
    });

    return NextResponse.json(result);
  } catch (error) {
    await sendOperationalAlert({
      source: "api.internal.analysis.dispatch",
      title: "Analysis dispatch API failed",
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
