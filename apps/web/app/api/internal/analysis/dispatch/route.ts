import { NextResponse } from "next/server";
import {
  dispatchQueuedAssessmentAnalysisJobs,
  requireDifyDispatchSecret
} from "../../../../../lib/dify";
import { sendOperationalAlert } from "../../../../../lib/monitoring";
import { isAuthorizedBearerRequest } from "../../../../../lib/security-auth";
import { applyRouteRateLimit } from "../../../../../lib/security-rate-limit";
import {
  readValidatedNumberFromSearchParams,
  ValidationError
} from "../../../../../lib/security-validation";

export async function POST(request: Request) {
  try {
    const rateLimited = applyRouteRateLimit(request, {
      key: "internal-analysis-dispatch",
      category: "webhook"
    });
    if (rateLimited) {
      return rateLimited;
    }

    if (!isAuthorizedBearerRequest(request, requireDifyDispatchSecret())) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = readValidatedNumberFromSearchParams({
      searchParams,
      field: "limit",
      defaultValue: 10,
      min: 1,
      max: 100
    });
    const result = await dispatchQueuedAssessmentAnalysisJobs({
      limit
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

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
