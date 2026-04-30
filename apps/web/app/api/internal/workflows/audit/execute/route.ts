import { NextResponse } from "next/server";
import {
  handleAiExecutionDispatch,
  type AiExecutionDispatchPayload
} from "../../../../../../lib/ai-execution-route";
import {
  isAuthorizedAiExecutionDispatchRequest
} from "../../../../../../lib/ai-execution";
import { logServerEvent } from "../../../../../../lib/monitoring";
import {
  applyRouteRateLimit,
  buildRateLimitResponse,
  consumeRateLimit
} from "../../../../../../lib/security-rate-limit";
import { parseJsonRequestBody, ValidationError } from "../../../../../../lib/security-validation";
import { sanitizeWorkflowErrorMessage } from "../../../../../../src/server/ai/observability/trace";
import {
  getAiExecutionOrgRateLimitMaxRequests,
  getAiExecutionOrgRateLimitWindowMs,
  getAiExecutionWorkflowRateLimitMaxRequests,
  getAiExecutionWorkflowRateLimitWindowMs,
} from "../../../../../../lib/runtime-config";
import { getOrganizationAuditReadiness } from "../../../../../../lib/audit-intake";

export async function POST(request: Request) {
  try {
    const rateLimited = await applyRouteRateLimit(request, {
      key: "internal-workflows-audit-execute",
      category: "webhook",
      maxRequests: 30
    });
    if (rateLimited) {
      return rateLimited;
    }

    if (!isAuthorizedAiExecutionDispatchRequest(request)) {
      logServerEvent("warn", "security.ai_execute.unauthorized", {
        route: "/api/internal/workflows/audit/execute",
        source: "internal_api"
      });
      return NextResponse.json(
        {
          accepted: false,
          code: "unauthorized_request",
          message: "Unauthorized AI execution dispatch request."
        },
        { status: 401 }
      );
    }

    const payload = await parseJsonRequestBody(request);
    const payloadRecord =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : null;
    const orgId =
      payloadRecord && typeof payloadRecord.orgId === "string"
        ? payloadRecord.orgId.trim()
        : "";
    const workflowDispatchId =
      payloadRecord && typeof payloadRecord.workflowDispatchId === "string"
        ? payloadRecord.workflowDispatchId.trim()
        : "";

    if (orgId) {
      const readiness = await getOrganizationAuditReadiness({
        organizationId: orgId
      });

      if (!readiness.readyForAudit) {
        return NextResponse.json(
          {
            accepted: false,
            code: "intake_incomplete",
            message:
              "Required onboarding intake must be completed before AI execution."
          },
          { status: 409 }
        );
      }

      const orgRateLimit = await consumeRateLimit({
        storeKey: `internal-ai-execute:org:${orgId}`,
        maxRequests: getAiExecutionOrgRateLimitMaxRequests(),
        windowMs: getAiExecutionOrgRateLimitWindowMs(),
        metadata: {
          routeKey: "internal-workflows-audit-execute",
          category: "webhook",
          orgId
        }
      });

      if (orgRateLimit.limited) {
        return buildRateLimitResponse({
          maxRequests: orgRateLimit.maxRequests,
          retryAfterSeconds: orgRateLimit.retryAfterSeconds
        });
      }
    }

    if (workflowDispatchId) {
      const workflowRateLimit = await consumeRateLimit({
        storeKey: `internal-ai-execute:workflow:${workflowDispatchId}`,
        maxRequests: getAiExecutionWorkflowRateLimitMaxRequests(),
        windowMs: getAiExecutionWorkflowRateLimitWindowMs(),
        metadata: {
          routeKey: "internal-workflows-audit-execute",
          category: "webhook",
          workflowDispatchId
        }
      });

      if (workflowRateLimit.limited) {
        return buildRateLimitResponse({
          maxRequests: workflowRateLimit.maxRequests,
          retryAfterSeconds: workflowRateLimit.retryAfterSeconds
        });
      }
    }

    const result = await handleAiExecutionDispatch(payload as AiExecutionDispatchPayload);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ValidationError) {
      logServerEvent("warn", "security.ai_execute.invalid_payload", {
        route: "/api/internal/workflows/audit/execute",
        source: "internal_api",
        message: sanitizeWorkflowErrorMessage(error.message)
      });
      return NextResponse.json(
        {
          accepted: false,
          code: "invalid_payload",
          message: error.message
        },
        { status: 400 }
      );
    }

    logServerEvent("error", "security.ai_execute.dispatch_failed", {
      route: "/api/internal/workflows/audit/execute",
      source: "internal_api",
      message:
        error instanceof Error
          ? sanitizeWorkflowErrorMessage(error.message)
          : "Unknown error"
    });

    return NextResponse.json(
      {
        accepted: false,
        code: "dispatch_failed",
        message: "The AI execution dispatch could not be accepted."
      },
      { status: 500 }
    );
  }
}
