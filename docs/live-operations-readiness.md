# Live Operations Readiness Audit

## Current Architecture

The production path already had the right building blocks before this pass:

- password-based auth and revocable sessions in `apps/web/lib/auth.ts`
- tenant-scoped dashboard actions for assessments and reports
- app-owned provisioning in `apps/web/lib/provisioning.ts`
- Dify-backed analysis jobs in `apps/web/lib/dify.ts`
- app-owned report generation in `apps/web/app/dashboard/reports/actions.ts`
- async outbound delivery through domain events, webhook deliveries, and email notifications
- internal admin visibility through `/admin`
- audit logs, domain events, billing events, and scheduled job runs in Prisma

That meant the main production risk was not missing infrastructure from zero. It was fragmented operational truth.

## Prioritized Production Risks

1. A customer workflow could fail across multiple systems without one durable record tying intake, analysis, report generation, CRM sync, and delivery together.
2. Manual recovery existed in fragments, but operators lacked one obvious place to recover a failed customer workflow safely.
3. Failures were durable at the component level, but customer-impacting state was not summarized at the run level for support and launch operations.
4. The report-generation path could succeed even when analysis or downstream CRM delivery had partial failures, making follow-up diagnosis slower than it should be.
5. Automated validation existed in the platform, but the new run-state logic had no dedicated coverage.

## What Was Implemented

### Customer Run Model

Added `CustomerRun` plus:

- `CustomerRunStatus`
- `CustomerRunStep`

This is the durable, operator-facing run-status model for the main customer workflow:

`intake -> analysis -> report generation -> CRM sync -> delivery`

It stores:

- tenant ownership
- linked assessment/report
- current step
- overall status
- step-by-step JSON state
- last error
- recovery hint
- retry metadata

### Shared Run Service

Added `apps/web/lib/customer-runs.ts`.

This service:

- creates a run when the first assessment is created
- advances the run when intake is submitted for analysis
- marks analysis success/failure from the Dify worker
- marks report generation completion
- marks HubSpot CRM sync success/failure from the outbound dispatcher
- marks delivery completion when the report is delivered
- exposes recent runs per organization
- supports safe admin-triggered recovery for:
  - failed analysis jobs
  - failed HubSpot CRM sync deliveries

### Report-Generation Join Keys

For the assessment-to-report path, operators should follow these durable join
keys in order:

- `assessmentId`
  - starting point for intake state, section completeness, and the customer run
- latest `AnalysisJob.id`
  - join for Dify execution state, retries, and validated analysis output
- `workflowRoutingDecisionId`
  - join for the in-app report-pipeline routing decision used during report generation
- `reportId`
  - join for the generated report, export access, executive delivery package, and
    later delivery-state references

The report-generation path does not rely on one universal trace id. The
important rule is to pivot to the next durable record once that record becomes
the source of truth for the next stage.

### Flow Integration

Updated:

- `apps/web/app/dashboard/assessments/actions.ts`
- `apps/web/lib/dify.ts`
- `apps/web/app/dashboard/reports/actions.ts`
- `apps/web/app/dashboard/reports/[reportId]/actions.ts`
- `apps/web/lib/webhook-dispatcher.ts`

These changes keep the existing product logic intact, but attach each stage transition to the shared run record.

### Admin Recovery Surface

Updated the admin org detail page:

- `apps/web/app/admin/accounts/[organizationId]/page.tsx`
- `apps/web/app/admin/accounts/[organizationId]/actions.ts`

Operators can now:

- see recent customer runs for an account
- identify the failed step
- read the last error and recovery hint
- trigger a safe recovery action

### Test Coverage

Added `apps/web/test/customer-runs.test.ts` for the critical run-transition logic:

- intake -> analysis
- analysis failure -> action required
- report generation -> CRM sync
- CRM sync success -> delivery
- delivery completion -> overall complete

## Why It Matters

For real customers, the biggest trust failure is not just that a background task fails. It is that support cannot quickly answer:

- where the customer is stuck
- what failed
- whether the failure is recoverable
- what recovery action is safe

The new run model makes the end-to-end workflow visible and recoverable without moving business logic out of the app or hiding state in external automation.

## Recovery Strategy

### Analysis Failures

If Dify analysis fails:

- the `CustomerRun` moves to `ACTION_REQUIRED`
- the failed step becomes `ANALYSIS`
- the last error is stored on the run
- admin recovery requeues the latest analysis job or creates a queued one if missing
- the assessment is returned to `ANALYSIS_QUEUED`
- dispatch is re-attempted through the existing analysis dispatcher

### CRM Sync Failures

If HubSpot delivery fails for report lifecycle events:

- the `CustomerRun` moves to `ACTION_REQUIRED`
- the failed step becomes `CRM_SYNC`
- the run stores the failure message
- admin recovery clears failed/retrying HubSpot deliveries for the related report events
- the related domain events are returned to `PENDING`
- dispatch is re-attempted through the existing outbound dispatcher

## Architecture Decisions

- The run record is additive, not a rewrite of `AnalysisJob`, `DomainEvent`, `WebhookDelivery`, or `EmailNotification`.
- Existing authoritative tables remain the source of truth for their own domains.
- `CustomerRun` is an app-owned operational summary and recovery anchor.
- Recovery is intentionally narrow and safe. It does not add general mutation-heavy admin tooling.
- recovery now resolves the run inside the expected `organizationId` boundary at
  the service layer instead of trusting a global `runId` alone

## Environment Variables

No new environment variables were introduced in this pass.

The new run-recovery flow still depends on the existing production secrets for:

- Dify dispatch
- outbound webhook dispatch
- admin session access
- database connectivity

## Migrations Required

Apply the new Prisma migration:

- `packages/db/prisma/migrations/20260410103000_customer_runs/migration.sql`

## Tests Added

- `apps/web/test/customer-runs.test.ts`

## Commands To Run

```powershell
pnpm db:generate
pnpm db:migrate
Set-Location apps/web
.\node_modules\.bin\tsc.cmd --noEmit
.\node_modules\.bin\tsx.cmd test\customer-runs.test.ts
```

## Manual QA Checklist

1. Sign in as an internal admin and as a normal workspace user.
2. Create a new assessment.
3. Confirm a `CustomerRun` appears on `/admin/accounts/[organizationId]` with `INTAKE` or `ANALYSIS` state after submission.
4. Submit the assessment for analysis.
5. Confirm the run advances to `ANALYSIS`.
6. Complete or simulate a successful analysis run and generate a report.
7. Confirm the run advances through `REPORT_GENERATION` and `CRM_SYNC`.
8. Verify the HubSpot delivery succeeds or intentionally fails if you are testing recovery.
9. Mark the report delivered.
10. Confirm the run moves to `COMPLETED` once CRM sync and delivery are both done.
11. Force a Dify failure and verify the run becomes `ACTION_REQUIRED`.
12. Trigger admin recovery and verify the analysis job is requeued.
13. Force a HubSpot failure and verify the run becomes `ACTION_REQUIRED`.
14. Trigger admin recovery and verify the related webhook delivery is retried.

## Remaining Risks

- `CustomerRun` currently focuses on the assessment/report workflow, not the full pre-product lead/payment/provisioning path.
- Email delivery is still tracked separately through `EmailNotification` rather than being folded into the run as a first-class recoverable step.
- The automated test file was added, but on this sandbox the `tsx` runtime is blocked by a Windows `spawn EPERM` restriction, so local execution may require a normal terminal or CI runner.
- Report generation now emits a dedicated structured boundary signal for
  validation fallback and terminal generation failure, but operators still need
  to correlate that boundary signal with customer-run state and downstream
  delivery records during recovery.
- Dify execution failures now become durable operator findings when they are
  terminal or retries are exhausted, but auto-retryable failures remain log-
  first until they cross that operator-actionable threshold.
- Stripe missing-context webhook failures now create durable operator findings
  only when the webhook can still be tied to an `organizationId`. Tenant-
  unscoped webhook failures remain intentionally fail-closed and log/alert-only.

## Current Failure Visibility

The current first-customer visibility posture is:

- report generation emits structured boundary classifications for validation
  fallback, routing failure, persistence failure, and downstream sync failure
- Dify terminal and retry-exhausted execution failures create durable
  operations-queue findings for operators
- Stripe missing-context webhook failures create durable operations-queue
  findings when tenant context can be resolved safely

This is materially safer than a log-only posture, but it is not yet one
universal durable incident model across every integration boundary.

## Future Expansion Notes

- Link provisioning and checkout milestones into the same run model for a fuller website-to-delivery timeline.
- Add a unified account timeline view combining lead, billing, customer runs, domain events, and support actions.
- Add email-delivery recovery hooks for report-ready notifications when customer communication becomes a stronger delivery dependency.
- Add metrics and alerting on `CustomerRun` states so stuck runs can trigger proactive operator notifications.
