import { prisma } from "@evolve-edge/db";
import { requireCurrentSession } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

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
  _request: Request,
  context: { params: Promise<{ reportId: string }> }
) {
  const session = await requireCurrentSession({ requireOrganization: true });
  const { reportId } = await context.params;

  const report = await prisma.report.findFirst({
    where: {
      id: reportId,
      organizationId: session.organization!.id
    },
    include: {
      assessment: true
    }
  });

  if (!report) {
    return new Response("Report not found.", { status: 404 });
  }

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
