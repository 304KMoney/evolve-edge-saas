# Report Generation And Delivery

## Purpose

Reports are the primary customer deliverable in Evolve Edge. The app builds reports from normalized, validated AI output only. OpenAI/LangGraph may produce analysis, but Next.js owns formatting, lifecycle state, and persistence in Neon/Postgres.

## Data Model

No Prisma migration is required for this slice. The implementation reuses the existing `Report` model:

- `Report.id`
- `Report.organizationId`
- `Report.assessmentId`
- `Report.createdByUserId`
- `Report.status`
- `Report.executiveSummary`
- `Report.overallRiskPostureJson`
- `Report.reportJson`
- `Report.pdfUrl`
- `Report.artifactMetadataJson`
- `Report.publishedAt`
- `Report.deliveredAt`
- `Report.createdAt`

Routing snapshot linkage is stored in the structured `reportJson.snapshotId` field because the current schema does not have a direct `Report.routingSnapshotId` column.

## Report Builder

Backend function:

```ts
buildAuditReport(normalizedAiOutput, snapshot)
```

Location:

- `apps/web/lib/report-builder.ts`

The builder enforces the report sections:

- Executive Summary
- Overall Risk Posture
- Top Risks
- Governance & Compliance Gaps
- Priority Actions
- 30-90 Day Roadmap
- Advisory Note / Disclaimer

The builder redacts secret-like tokens, SSN-like identifiers, and payment-card-like numbers from report text before persistence.

## Lifecycle

Current app status mapping:

- Draft: `ReportStatus.PENDING`
- Ready: `ReportStatus.GENERATED` or `ReportStatus.PENDING_REVIEW`
- Delivered: `ReportStatus.DELIVERED`
- Failed: `ReportStatus.FAILED`

Reports are exportable only when usable normalized content exists. Incomplete or malformed reports fail closed and are not downloadable.

## Rendering And Export

Dashboard routes:

- `/dashboard/reports`
- `/dashboard/reports/[reportId]`
- `/reports/[id]`, alias redirect to `/dashboard/reports/[id]`

Export route:

- `/api/reports/[reportId]/export`

Supported exports:

- HTML download
- JSON download with `?format=json`

PDF is deferred. `artifactMetadataJson.pdfStatus = "deferred"` and `pdfUrl` remains nullable until a PDF renderer/storage integration is selected.

## Security

- Report detail and export routes require authenticated organization-scoped access.
- Users can only access reports for organizations they are authorized to view.
- Final report JSON is built from normalized output only.
- Raw malformed AI output is not persisted as a customer-visible final report.
- Sensitive raw data is summarized and secret-like text is redacted before report persistence.

## Required Env Vars

No new env vars were added.

Existing related vars:

- `DATABASE_URL`
- `AI_EXECUTION_PROVIDER=openai_langgraph`
- `AI_EXECUTION_DISPATCH_SECRET`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `REPORT_DOWNLOAD_SIGNING_SECRET`, for signed report delivery links

## Test Commands

```powershell
cd apps/web
.\node_modules\.bin\tsx.CMD --require .\scripts\shims\server-only.js .\test\report-builder.test.ts
.\node_modules\.bin\tsx.CMD --require .\scripts\shims\server-only.js .\test\report-access.test.ts
.\node_modules\.bin\tsx.CMD --require .\scripts\shims\server-only.js .\test\report-view-model.test.ts
.\node_modules\.bin\tsx.CMD --require .\scripts\shims\server-only.js .\test\ai-execution-worker.test.ts
```

## Manual QA Checklist

1. Complete intake.
2. Trigger AI execution.
3. Confirm `AnalysisJob.outputPayload.normalizedOutput` exists.
4. Confirm a `Report` record is created.
5. Confirm report status becomes `GENERATED` or `PENDING_REVIEW`.
6. Confirm `Report.reportJson.schemaVersion` is `evolve-edge.audit-report.v1`.
7. Open `/dashboard/reports`.
8. Open a report detail page.
9. Confirm sections render consistently.
10. Download HTML from `/api/reports/[reportId]/export`.
11. Confirm unauthorized users cannot access the report.
12. Confirm incomplete/malformed report data is not exportable.

