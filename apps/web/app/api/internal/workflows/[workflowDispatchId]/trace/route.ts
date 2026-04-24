import { NextResponse } from "next/server";
import { isAuthorizedAiExecutionDispatchRequest } from "../../../../../../lib/ai-execution";
import { applyRouteRateLimit } from "../../../../../../lib/security-rate-limit";
import { isAiDebugModeEnabled } from "../../../../../../lib/runtime-config";
import { getWorkflowTraceByDispatchId } from "../../../../../../src/server/ai/observability/workflow-tracker";

type RouteContext = {
  params: Promise<{
    workflowDispatchId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const rateLimited = applyRouteRateLimit(request, {
    key: "internal-workflows-trace",
    category: "webhook",
  });
  if (rateLimited) {
    return rateLimited;
  }

  if (!isAuthorizedAiExecutionDispatchRequest(request)) {
    return NextResponse.json(
      {
        accepted: false,
        code: "unauthorized_request",
        message: "Unauthorized workflow trace request.",
      },
      { status: 401 }
    );
  }

  const { workflowDispatchId } = await context.params;
  const url = new URL(request.url);
  const organizationId =
    url.searchParams.get("orgId")?.trim() ||
    request.headers.get("x-evolve-edge-org-id")?.trim() ||
    null;

  if (!organizationId) {
    return NextResponse.json(
      {
        accepted: false,
        code: "missing_org_scope",
        message: "An orgId query parameter or x-evolve-edge-org-id header is required.",
      },
      { status: 400 }
    );
  }

  const trace = await getWorkflowTraceByDispatchId(workflowDispatchId, {
    includeDebug: isAiDebugModeEnabled(),
    organizationId,
  });

  if (!trace) {
    return NextResponse.json(
      {
        accepted: false,
        code: "trace_not_found",
        message: "Workflow trace was not found.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json(trace);
}
