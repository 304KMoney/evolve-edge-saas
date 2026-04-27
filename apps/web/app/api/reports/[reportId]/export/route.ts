import {
  AuditActorType,
  OperationsQueueSeverity,
  OperationsQueueSourceSystem,
  OperationsQueueType,
  prisma
} from "@evolve-edge/db";
import { NextResponse } from "next/server";
import {
  getOptionalCurrentSession,
  resolveScopedOrganizationSession
} from "../../../../../lib/auth";
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
  buildReportExportPayload,
  readReportArtifactMetadata
} from "../../../../../lib/report-export";
import {
  canUseSignedReportAccess,
  verifySignedReportAccessToken
} from "../../../../../lib/report-access";
import {
  evaluateCustomerReportAccess
} from "../../../../../lib/report-access-control";
import {
  getExportableReportById,
  getReportAccessCandidateById
} from "../../../../../lib/report-records";
import {
  getLatestAssessmentWorkflowSnapshot
} from "../../../../../lib/report-view-model";
import { applyRouteRateLimit } from "../../../../../lib/security-rate-limit";

export const dynamic = "force-dynamic";

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
      logServerEvent("warn", "report.export.invalid_signed_token", {
        resource_id: reportId,
        status: "forbidden",
        source: "report.delivery",
        requestContext
      });
      return new Response("Invalid or expired report export token.", { status: 403 });
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
    return new Response("Report export token does not match this report.", {
      status: 403
    });
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

  const session = await getOptionalCurrentSession();
  if (!session) {
    logServerEvent("warn", "report.export.unauthenticated", {
      resource_id: reportId,
      org_id: signedAccess?.organizationId ?? reportAccessCandidate.organizationId,
      user_id: null,
      status: "forbidden",
      source: "report.delivery",
      requestContext
    });
    return new Response("Authentication is required to export this report.", {
      status: 403
    });
  }

  const scopedSession = await resolveScopedOrganizationSession({
    session,
    organizationId: reportAccessCandidate.organizationId,
    permission: "reports.view"
  });

  if (!scopedSession) {
    logServerEvent("warn", "report.export.permission_denied", {
      resource_id: reportId,
      org_id: signedAccess?.organizationId ?? reportAccessCandidate.organizationId,
      user_id: session.user.id,
      status: "forbidden",
      source: "report.delivery",
      requestContext
    });
    return new Response("You are not allowed to export this report.", {
      status: 403
    });
  }

  const accessSession = toCustomerAccessSession(scopedSession);

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
      org_id: signedAccess?.organizationId ?? scopedSession.organization?.id ?? null,
      user_id: scopedSession.user.id,
      status: status === 403 ? "forbidden" : "not_found",
      source: "report.delivery",
      requestContext,
      metadata: {
        accessReason: reportAccessDecision.reason
      }
    });

    return new Response(
      status === 403
        ? "You are not allowed to export this report."
        : "Report not found.",
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
      org_id: signedAccess?.organizationId ?? scopedSession.organization?.id ?? null,
      user_id: scopedSession.user.id,
      status: "not_found",
      source: "report.delivery",
      requestContext
    });
    return new Response("Report not found.", { status: 404 });
  }
  const workflowSnapshot = await getLatestAssessmentWorkflowSnapshot(report.assessmentId);
  const exportPayload = buildReportExportPayload({
    report,
    workflowSnapshot
  });

  if (!exportPayload.ok) {
    logServerEvent("warn", "report.export.not_exportable", {
      resource_id: report.id,
      org_id: report.organizationId,
      user_id: scopedSession.user.id,
      status: "unprocessable_entity",
      source: "report.delivery",
      requestContext,
      metadata: {
        reportStatus: report.status,
        artifactMetadata: readReportArtifactMetadata(report.artifactMetadataJson)
      }
    });
    return new Response(exportPayload.message, { status: exportPayload.status });
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
      user_id: scopedSession.user.id,
      status: "forbidden",
      source: "report.delivery",
      requestContext,
      metadata: {
        reportStatus: report.status,
        deliveredAt: report.deliveredAt?.toISOString() ?? null
      }
    });
    return new Response("Signed export is not available until the report is delivered.", {
      status: 403
    });
  }

  await writeAuditLog(prisma, {
    organizationId: report.organizationId,
    userId: scopedSession.user.id,
    actorType: signedAccess ? AuditActorType.SYSTEM : AuditActorType.USER,
    actorLabel: signedAccess ? "signed-report-link" : scopedSession.user.email,
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
    user_id: scopedSession.user.id,
    status: "delivered",
    source: "report.delivery",
    requestContext,
    metadata: {
      assessmentId: report.assessmentId,
      signedAccess: Boolean(signedAccess),
      dataClassification: report.dataClassification
    }
  });

  if (format === "json") {
    const filename = `${exportPayload.filenameBase}.json`;

    return NextResponse.json(exportPayload.reportViewModel, {
      headers: {
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store"
      }
    });
  }
  const filename = `${exportPayload.filenameBase}.html`;

  return new Response(exportPayload.html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store"
    }
  });
}
