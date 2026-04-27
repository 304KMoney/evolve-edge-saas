import {
  AuditActorType,
  OperationsQueueSeverity,
  OperationsQueueSourceSystem,
  OperationsQueueType,
  prisma
} from "@evolve-edge/db";
import { NextResponse } from "next/server";
import { requireOrganizationPermissionForOrganization } from "../../../../../lib/auth";
import {
  buildAuditRequestContextFromRequest,
  writeAuditLog
} from "../../../../../lib/audit";
import { createPlaceholderCustomerAccessGrant } from "../../../../../lib/customer-access-grants";
import { findLatestCustomerAccessGrant } from "../../../../../lib/customer-access-grant-records";
import { toCustomerAccessSession } from "../../../../../lib/customer-access-session";
import { logServerEvent } from "../../../../../lib/monitoring";
import { recordOperationalFinding } from "../../../../../lib/operations-queues";
import {
  canUseSignedReportAccess,
  verifySignedReportAccessToken
} from "../../../../../lib/report-access";
import {
  buildReportAccessStateHref,
  evaluateCustomerReportAccess,
  mapReportAccessDecisionToStateReason,
  type ReportAccessStateReason
} from "../../../../../lib/report-access-control";
import { getReportArtifactAvailability } from "../../../../../lib/report-artifacts";
import {
  getExportableReportById,
  getReportAccessCandidateById
} from "../../../../../lib/report-records";
import {
  buildExecutiveReportHtml,
  buildExecutiveReportViewModel,
  getLatestAssessmentWorkflowSnapshot
} from "../../../../../lib/report-view-model";
import { applyRouteRateLimit } from "../../../../../lib/security-rate-limit";

export const dynamic = "force-dynamic";

function buildAccessRedirectUrl(input: {
  request: Request;
  reason: ReportAccessStateReason;
  reportId?: string | null;
}) {
  return new URL(
    buildReportAccessStateHref({
      reason: input.reason,
      reportId: input.reportId
    }),
    input.request.url
  );
}

function readOverallRiskPosture(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      score: null,
      level: null,
      summary: null
    };
  }

  const posture = value as Record<string, unknown>;
  return {
    score: typeof posture.score === "number" ? posture.score : null,
    level: typeof posture.level === "string" ? posture.level : null,
    summary: typeof posture.summary === "string" ? posture.summary : null
  };
}

function readArtifactMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ reportId: string }> }
) {
  const rateLimited = applyRouteRateLimit(request, {
    key: "reports-export",
    category: "api"
  });
  if (rateLimited) {
    return rateLimited;
  }

  const { reportId } = await context.params;
  if (!reportId?.trim()) {
    return new Response("Missing report identifier.", { status: 400 });
  }

  const url = new URL(request.url);
  const signedToken = url.searchParams.get("token");
  const format = url.searchParams.get("format")?.trim().toLowerCase() ?? "html";
  let signedAccess = null;
  const requestContext = buildAuditRequestContextFromRequest(request);

  if (signedToken) {
    try {
      signedAccess = verifySignedReportAccessToken(signedToken);
    } catch (error) {
      const message =
        error instanceof Error ? error.message.toLowerCase() : "invalid signed report token";
      const reason = message.includes("expired") ? "expired" : "unauthorized";

      logServerEvent("warn", "report.export.invalid_signed_token", {
        resource_id: reportId,
        status: "forbidden",
        source: "report.delivery",
        requestContext
      });
      return NextResponse.redirect(
        buildAccessRedirectUrl({
          request,
          reason,
          reportId
        })
      );
    }
  }

  if (signedAccess && signedAccess.reportId !== reportId) {
    logServerEvent("warn", "report.export.signed_token_mismatch", {
      resource_id: reportId,
      org_id: signedAccess.organizationId,
      status: "forbidden",
      source: "report.delivery",
      requestContext
    });
    return NextResponse.redirect(
      buildAccessRedirectUrl({
        request,
        reason: "not-bound",
        reportId
      })
    );
  }

  const reportAccessCandidate = await getReportAccessCandidateById(reportId);

  if (!reportAccessCandidate) {
    logServerEvent("warn", "report.export.not_found", {
      resource_id: reportId,
      org_id: signedAccess?.organizationId ?? null,
      user_id: null,
      status: "not_found",
      source: "report.delivery",
      requestContext
    });
    return new Response("Report not found.", { status: 404 });
  }

  const session = await requireOrganizationPermissionForOrganization(
    "reports.view",
    reportAccessCandidate.organizationId
  );
  const accessSession = toCustomerAccessSession(session);

  const durableAccessGrant = await findLatestCustomerAccessGrant({
    organizationId:
      signedAccess?.organizationId ?? accessSession.organizationId ?? null,
    userId: accessSession.customerId,
    reportId
  });

  const reportAccessDecision = evaluateCustomerReportAccess({
    reportId,
    reportOrganizationId: reportAccessCandidate.organizationId,
    accessSession,
    requiredScope: "report_artifacts",
    accessGrant:
      durableAccessGrant ??
      createPlaceholderCustomerAccessGrant({
        accessSession,
        requiredScope: "report_artifacts",
        reportId,
        boundOrganizationId: signedAccess?.organizationId ?? null
      }),
    boundOrganizationId: signedAccess?.organizationId ?? null
  });

  if (!reportAccessDecision.allowed) {
    const status =
      reportAccessDecision.reason === "missing_access_scope" ||
      reportAccessDecision.reason === "unauthenticated"
        ? 403
        : 404;

    logServerEvent("warn", "report.export.access_denied", {
      resource_id: reportId,
      org_id: signedAccess?.organizationId ?? session?.organization?.id ?? null,
      user_id: session?.user.id ?? null,
      status: status === 403 ? "forbidden" : "not_found",
      source: "report.delivery",
      requestContext,
      metadata: {
        accessReason: reportAccessDecision.reason
      }
    });

    return NextResponse.redirect(
      buildAccessRedirectUrl({
        request,
        reason: mapReportAccessDecisionToStateReason(reportAccessDecision),
        reportId
      }),
      { status }
    );
  }

  const report = await getExportableReportById({
    reportId,
    organizationId: reportAccessCandidate.organizationId
  });

  if (!report) {
    logServerEvent("warn", "report.export.not_found", {
      resource_id: reportId,
      org_id: signedAccess?.organizationId ?? session?.organization?.id ?? null,
      user_id: session?.user.id ?? null,
      status: "not_found",
      source: "report.delivery",
      requestContext
    });
    return new Response("Report not found.", { status: 404 });
  }

  const artifactAvailability = getReportArtifactAvailability({
    reportId: report.id,
    status: report.status,
    artifactMetadata: readArtifactMetadata(report.artifactMetadataJson)
  });

  if (!artifactAvailability.canDownload) {
    logServerEvent("warn", "report.export.not_ready", {
      resource_id: report.id,
      org_id: report.organizationId,
      user_id: session?.user.id ?? null,
      status: "conflict",
      source: "report.delivery",
      requestContext,
      metadata: {
        reportStatus: report.status,
        artifactState: artifactAvailability.state
      }
    });
    return NextResponse.redirect(
      buildAccessRedirectUrl({
        request,
        reason: "unavailable",
        reportId: report.id
      }),
      { status: 307 }
    );
  }

  if (
    signedAccess &&
    !canUseSignedReportAccess({
      status: report.status,
      deliveredAt: report.deliveredAt
    })
  ) {
    await recordOperationalFinding({
      organizationId: report.organizationId,
      queueType: OperationsQueueType.SUCCESS_RISK,
      ruleCode: "delivery.signed_export_before_delivery",
      severity: OperationsQueueSeverity.MEDIUM,
      sourceSystem: OperationsQueueSourceSystem.APP,
      sourceRecordType: "report",
      sourceRecordId: report.id,
      title: "Signed report access attempted before delivery",
      summary:
        "A signed report link was used before the report reached a delivered state, which suggests early sharing, delivery confusion, or an operator workflow gap.",
      recommendedAction:
        "Confirm whether the report package was actually sent, then review delivery-state progression and signed-link issuance timing before sharing the report again.",
      metadata: {
        reportId: report.id,
        assessmentId: report.assessmentId,
        reportStatus: report.status,
        deliveredAt: report.deliveredAt?.toISOString() ?? null
      }
    });
    logServerEvent("warn", "report.export.signed_token_not_delivered", {
      resource_id: reportId,
      org_id: report.organizationId,
      user_id: session?.user.id ?? null,
      status: "forbidden",
      source: "report.delivery",
      requestContext,
      metadata: {
        reportStatus: report.status,
        deliveredAt: report.deliveredAt?.toISOString() ?? null
      }
    });
    return NextResponse.redirect(
      buildAccessRedirectUrl({
        request,
        reason: "unavailable",
        reportId: report.id
      }),
      { status: 307 }
    );
  }

  await writeAuditLog(prisma, {
    organizationId: report.organizationId,
    userId: session?.user.id ?? null,
    actorType: signedAccess ? AuditActorType.SYSTEM : AuditActorType.USER,
    actorLabel: signedAccess ? "signed-report-link" : session?.user.email ?? null,
    action: "report.exported",
    entityType: "report",
    entityId: report.id,
    resourceType: "report",
    resourceId: report.id,
    dataClassification: report.dataClassification,
    metadata: {
      assessmentId: report.assessmentId,
      signedAccess: Boolean(signedAccess),
      format
    },
    requestContext
  });

  logServerEvent("info", "report.export.delivered", {
    resource_id: report.id,
    org_id: report.organizationId,
    user_id: session?.user.id ?? null,
    status: "delivered",
    source: "report.delivery",
    requestContext,
    metadata: {
      assessmentId: report.assessmentId,
      signedAccess: Boolean(signedAccess),
      dataClassification: report.dataClassification
    }
  });

  const workflowSnapshot = await getLatestAssessmentWorkflowSnapshot(report.assessmentId);
  const reportViewModel = buildExecutiveReportViewModel({
    report,
    overallRiskPosture: readOverallRiskPosture(report.overallRiskPostureJson),
    workflowSnapshot
  });

  if (format === "json") {
    const filename =
      `${reportViewModel.title
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, "-")
        .replaceAll(/^-|-$/g, "") || "executive-report"}.json`;

    return NextResponse.json(reportViewModel, {
      headers: {
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store"
      }
    });
  }

  const html = buildExecutiveReportHtml(reportViewModel);

  const filename =
    `${reportViewModel.title
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-|-$/g, "") || "executive-report"}.html`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store"
    }
  });
}
