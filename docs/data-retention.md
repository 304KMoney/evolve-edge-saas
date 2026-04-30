# Data Retention And Compliance Controls

Evolve Edge keeps retention and access controls app-owned.

## Retention Policy

Configurable environment variables:

- `REPORT_RETENTION_DAYS`
  Default `365`
- `ASSESSMENT_RETENTION_DAYS`
  Default `365`
- `AUDIT_LOG_RETENTION_DAYS`
  Default `90`
- `WORKFLOW_TRACE_RETENTION_DAYS`
  Default `30`

## What Expires

- Reports:
  - delivered
  - superseded
  - failed
- Assessments:
  - archived
- Logs:
  - `AuditLog`
- Traces:
  - `AuditWorkflowCheckpoint`
  - completed/failed/canceled `AnalysisJob`
  - in-memory workflow traces

The app does not delete active in-flight analysis records through the retention job.

## Cleanup Execution

Scheduled job name:

- `data-retention-cleanup`

This job is now available through the existing internal scheduled-jobs runner.

## Export Capability

Customer-visible report export remains on:

- `GET /api/reports/{reportId}/export`

Supported formats:

- default HTML attachment
- `?format=json` for a structured export of the validated executive report view model

Raw AI payloads are not exported directly.

## Audit Logging

Audit logging now captures:

- report export access
- first report view in the dashboard detail experience

Each entry records:

- organization
- user when present
- action
- entity/resource identifiers
- request context
- timestamp

## Multi-Tenant Isolation

High-risk access paths now require explicit org scoping:

- report export remains organization-scoped through app-owned access checks
- internal workflow trace lookup now requires `orgId` and rejects cross-org access

## Operator Notes

- Keep production retention values aligned with contractual and regulatory requirements.
- Use longer retention only when there is a clear business or legal need.
- If a customer requests export before deletion, use the HTML or JSON report export route first.
