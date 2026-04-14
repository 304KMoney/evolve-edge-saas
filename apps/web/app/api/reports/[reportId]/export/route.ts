import {
  OperationsQueueSeverity,
  OperationsQueueSourceSystem,
  OperationsQueueType,
  prisma
} from "@evolve-edge/db";
import {
  getOptionalCurrentSession,
  requireCurrentSession,
  requireOrganizationPermission
} from "../../../../../lib/auth";
import { AuditActorType } from "@evolve-edge/db";
import { writeAuditLog, buildAuditRequestContextFromRequest } from "../../../../../lib/audit";
import { createPlaceholderCustomerAccessGrant } from "../../../../../lib/customer-access-grants";
import { findLatestCustomerAccessGrant } from "../../../../../lib/customer-access-grant-records";
import { toCustomerAccessSession } from "../../../../../lib/customer-access-session";
import { logServerEvent } from "../../../../../lib/monitoring";
import { recordOperationalFinding } from "../../../../../lib/operations-queues";
import {
  canUseSignedReportAccess,
  shouldRequireAuthenticatedReportAccessWhenSigned,
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
import { NextResponse } from "next/server";

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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function readReportJson(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function buildList(items: Array<Record<string, unknown>>, kind: "findings" | "roadmap") {
  if (items.length === 0) {
    return `<p class="empty">No ${kind} were generated for this report.</p>`;
  }

  return items
    .map((item) => {
      if (kind === "findings") {
        return `<article class="card">
  <h3>${escapeHtml(String(item.title ?? "Untitled finding"))}</h3>
  <p class="meta">${escapeHtml(String(item.severity ?? "Unknown severity"))} · ${escapeHtml(
    String(item.riskDomain ?? "Unknown domain")
  )}</p>
  <p>${escapeHtml(String(item.summary ?? "No finding summary available."))}</p>
</article>`;
      }

      return `<article class="card">
  <h3>${escapeHtml(String(item.title ?? "Untitled action"))}</h3>
  <p class="meta">${escapeHtml(String(item.priority ?? "Unknown priority"))} · ${escapeHtml(
    String(item.ownerRole ?? "Owner pending")
  )} · ${escapeHtml(String(item.timeline ?? "Timeline pending"))}</p>
  <p>${escapeHtml(String(item.description ?? "No roadmap detail was generated."))}</p>
</article>`;
    })
    .join("");
}

function buildSectionList(items: Array<Record<string, unknown>>) {
  if (items.length === 0) {
    return `<p class="empty">No intake evidence summary was captured.</p>`;
  }

  return items
    .map(
      (item) => `<article class="card">
  <h3>${escapeHtml(String(item.title ?? "Untitled section"))}</h3>
  <p class="meta">Status: ${escapeHtml(String(item.status ?? "Unknown"))}</p>
  <p>${escapeHtml(String(item.notes ?? "No intake summary captured."))}</p>
</article>`
    )
    .join("");
}

function buildReportHtml(input: {
  title: string;
  assessmentName: string;
  versionLabel: string;
  publishedAt: Date;
  reportJson: Record<string, unknown>;
}) {
  const findings = Array.isArray(input.reportJson.findings)
    ? (input.reportJson.findings as Array<Record<string, unknown>>)
    : [];
  const roadmap = Array.isArray(input.reportJson.roadmap)
    ? (input.reportJson.roadmap as Array<Record<string, unknown>>)
    : [];
  const sectionSummaries = Array.isArray(input.reportJson.sectionSummaries)
    ? (input.reportJson.sectionSummaries as Array<Record<string, unknown>>)
    : [];

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.title)}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; background: #f4f1ea; color: #16202a; }
      main { max-width: 980px; margin: 0 auto; padding: 32px 20px 48px; }
      .panel { background: #fff; border: 1px solid #e7ddd0; border-radius: 24px; padding: 32px; }
      .eyebrow { color: #0f766e; text-transform: uppercase; letter-spacing: 0.08em; font-size: 12px; font-weight: 700; }
      h1 { margin: 12px 0 8px; font-size: 34px; line-height: 1.2; }
      h2 { margin: 0 0 16px; font-size: 20px; }
      h3 { margin: 0 0 8px; font-size: 16px; }
      p { line-height: 1.6; margin: 0; }
      .meta { color: #5b6774; font-size: 14px; }
      .grid { display: grid; gap: 16px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 24px; }
      .section-grid { display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 24px; }
      .stat, .section, .card { border: 1px solid #e7ddd0; border-radius: 20px; background: #fcfaf7; padding: 20px; }
      .section { background: #fff; margin-top: 24px; }
      .card { margin-top: 12px; }
      .empty { color: #5b6774; }
      @media (max-width: 900px) { .grid, .section-grid { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main>
      <div class="panel">
        <p class="eyebrow">Evolve Edge Executive Report</p>
        <h1>${escapeHtml(input.title)}</h1>
        <p class="meta">${escapeHtml(input.assessmentName)} · ${escapeHtml(input.versionLabel)} · Published ${escapeHtml(
          formatDate(input.publishedAt)
        )}</p>

        <div class="grid">
          <div class="stat">
            <p class="meta">Posture Score</p>
            <h2>${escapeHtml(
              typeof input.reportJson.postureScore === "number"
                ? `${input.reportJson.postureScore}/100`
                : "Pending"
            )}</h2>
          </div>
          <div class="stat">
            <p class="meta">Risk Level</p>
            <h2>${escapeHtml(
              typeof input.reportJson.riskLevel === "string"
                ? input.reportJson.riskLevel
                : "Not scored"
            )}</h2>
          </div>
          <div class="stat">
            <p class="meta">Coverage</p>
            <h2>${escapeHtml(
              typeof input.reportJson.findingCount === "number"
                ? `${input.reportJson.findingCount} findings`
                : "0 findings"
            )}</h2>
            <p class="meta" style="margin-top: 8px;">${escapeHtml(
              typeof input.reportJson.recommendationCount === "number"
                ? `${input.reportJson.recommendationCount} recommendations`
                : "0 recommendations"
            )}</p>
          </div>
        </div>

        <section class="section">
          <h2>Executive Summary</h2>
          <p>${escapeHtml(
            typeof input.reportJson.executiveSummary === "string"
              ? input.reportJson.executiveSummary
              : "No executive summary was generated for this report yet."
          )}</p>
        </section>

        <section class="section-grid">
          <section class="section">
            <h2>Findings</h2>
            ${buildList(findings, "findings")}
          </section>
          <section class="section">
            <h2>Roadmap</h2>
            ${buildList(roadmap, "roadmap")}
          </section>
        </section>

        <section class="section">
          <h2>Intake Evidence Summary</h2>
          ${buildSectionList(sectionSummaries)}
        </section>
      </div>
    </main>
  </body>
</html>`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ reportId: string }> }
) {
  const { reportId } = await context.params;
  if (!reportId?.trim()) {
    return new Response("Missing report identifier.", { status: 400 });
  }
  const url = new URL(request.url);
  const signedToken = url.searchParams.get("token");
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

  let session = null;
  if (!signedAccess || shouldRequireAuthenticatedReportAccessWhenSigned()) {
    session = signedAccess
      ? await requireCurrentSession({ requireOrganization: true })
      : await requireOrganizationPermission("reports.view");
  } else {
    session = await getOptionalCurrentSession();
  }

  const accessSession = toCustomerAccessSession(session);
  const reportAccessCandidate = await getReportAccessCandidateById(reportId);

  if (!reportAccessCandidate) {
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

  // Current behavior:
  // - authenticated dashboard access is organization-scoped
  // - local/demo export can also flow through a signed organization binding
  // Future behavior should swap the organization check for a persisted
  // payment/customer/report binding. Durable grants are preferred here now,
  // with the existing placeholder session grant kept as a local/demo fallback.
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
      {
        status
      }
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
    status: report.status
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
      {
        status: 307
      }
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
      {
        status: 307
      }
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
      signedAccess: Boolean(signedAccess)
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

  const html = buildReportHtml({
    title: report.title,
    assessmentName: report.assessment.name,
    versionLabel: report.versionLabel,
    publishedAt: report.publishedAt ?? report.createdAt,
    reportJson: readReportJson(report.reportJson)
  });

  const filename =
    `${report.title
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
