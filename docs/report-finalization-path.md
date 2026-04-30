# Report Finalization Path

This note documents the canonical app-owned report finalization path used for Preview launch readiness.

## Lifecycle

1. `assessment`
   - The assessment remains the durable parent record.
   - Workflow activity may queue, run, fail, or complete against the assessment, but it does not become the source of truth for customer-visible report state.

2. `report` record
   - `apps/web/lib/report-records.ts` owns the durable report snapshot used by the dashboard and export route.
   - Valid normalized content is read from app-owned fields first:
     - `executiveSummary`
     - `overallRiskPostureJson`
     - normalized sections in `reportJson`
   - Artifact metadata is treated as a hint, not the canonical exportability signal.

3. report finalization mapping
   - `apps/web/lib/report-artifacts.ts` derives the canonical state:
     - `exportable`: normalized report content exists
     - `failed`: no usable content and workflow/report state indicates failure
     - `pending`: no usable content and output is still in progress
   - This prevents ambiguous `Export pending` states when the durable report already contains validated content.

4. report page
   - `apps/web/app/dashboard/reports/[reportId]/page.tsx` uses the canonical finalization mapping for:
     - `Download HTML`
     - retry visibility
     - pending/failed customer messaging

5. export route
   - `apps/web/app/api/reports/[reportId]/export/route.ts` reads canonical app-owned report data only.
   - The route returns:
     - `200` with downloadable HTML or JSON when normalized content exists
     - `400/403/404/422` when the request is invalid, unauthorized, missing, or not exportable

## Operator Notes

- A later failed workflow run must not hide a previously persisted normalized report snapshot.
- Regeneration continues to reuse the existing assessment/report relationship.
- Export readiness must not depend on n8n, Stripe, HubSpot, or raw AI payloads.
