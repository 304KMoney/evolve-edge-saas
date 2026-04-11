import { Prisma } from "@evolve-edge/db";
import { NextResponse } from "next/server";
import { buildAuditRequestContextFromRequest } from "../../../../../lib/audit";
import { sendOperationalAlert } from "../../../../../lib/monitoring";
import {
  recordWorkflowReportReady,
  requireWorkflowCallbackSecret
} from "../../../../../lib/workflow-dispatch";

function isAuthorized(request: Request) {
  const expected = requireWorkflowCallbackSecret();
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  return provided === expected;
}

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = (await request.json()) as {
      dispatchId?: string;
      reportReference?: string | null;
      reportUrl?: string | null;
      externalExecutionId?: string | null;
      executiveSummary?: string | null;
      riskLevel?: string | null;
      topConcerns?: string[] | null;
      metadata?: unknown;
    };

    if (!body.dispatchId) {
      return NextResponse.json(
        { error: "dispatchId is required." },
        { status: 400 }
      );
    }

    const result = await recordWorkflowReportReady({
      dispatchId: body.dispatchId,
      reportReference: body.reportReference ?? null,
      reportUrl: body.reportUrl ?? null,
      externalExecutionId: body.externalExecutionId ?? null,
      executiveSummary: body.executiveSummary ?? null,
      riskLevel: body.riskLevel ?? null,
      topConcerns: body.topConcerns ?? [],
      metadata: (body.metadata ?? null) as Prisma.InputJsonValue | null,
      requestContext: buildAuditRequestContextFromRequest(request)
    });

    return NextResponse.json({
      ok: true,
      dispatchId: result.id,
      status: result.status
    });
  } catch (error) {
    await sendOperationalAlert({
      source: "api.internal.workflows.report-ready",
      title: "Workflow report-ready callback failed",
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
