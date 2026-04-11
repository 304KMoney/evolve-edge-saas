# Operator Console Workflows

## What existed before

Evolve Edge already had:

- `/admin` for global operational visibility
- `/admin/accounts/[organizationId]` for org-level support context
- `/admin/customers/[customerAccountId]` for customer lifecycle management
- customer run recovery for failed analysis and CRM sync
- audit logging for major admin reads and writes
- internal customer timeline notes and next-action tracking

The missing piece was a true operator console layer that could act as a daily control plane for a non-technical delivery or customer-success hire.

## What was implemented

This phase adds the first operator-first console workflow on top of the existing admin system:

- explicit founder escalation state on `CustomerAccount`
- queue-style operator filtering for:
  - follow-up due
  - founder review
  - failed runs
  - delivery review
- recent internal notes surfaced in the global admin console
- safer manual retry flows that require:
  - an operator reason
  - an explicit `RETRY` confirmation
- founder review controls on customer accounts
- org-level visibility into founder escalation state
- customer-level audit trail visibility

## Why it matters

This moves Evolve Edge from “engineering can inspect the system” to “operations can run the system.”

The founder or an operations hire can now:

- search and filter accounts by real operational states
- see which customers need follow-up now
- see which runs have failed and require intervention
- identify delivery packages waiting on QA, founder review, or briefing follow-through
- record internal-only notes and follow-up actions without leaving the app
- retry sensitive recovery actions with guardrails and audit traces

## Architecture decisions

- The console builds on `CustomerAccount`, `CustomerRun`, `ReportPackage`, and `AuditLog` instead of introducing a separate ops-only state machine.
- Founder escalation is explicit schema-backed state because it is operationally important and should not be inferred from notes.
- Sensitive retry flows require an operator reason and confirmation phrase to reduce accidental retries and improve auditability.
- Internal notes remain stored in `CustomerAccountTimelineEntry` and are only surfaced inside admin routes.
- Global operator queue aggregation lives in `apps/web/lib/operator-console.ts` so UI components remain thin.

## Routes and operator workflow

### Global console

Route: `/admin`

Use this page to:

- search for customers, orgs, reports, plans, and events
- filter operator queue views
- inspect failed runs
- inspect delivery-review work
- scan recent internal notes

### Customer control plane

Route: `/admin/customers/[customerAccountId]`

Use this page to:

- update lifecycle stage
- assign next actions
- add internal notes
- flag or clear founder review
- resync product-owned lifecycle data
- re-publish CRM lifecycle status
- retry failed customer runs with safeguards
- inspect account-specific audit trail

### Organization detail

Route: `/admin/accounts/[organizationId]`

Use this page to:

- inspect support-safe org state
- review customer run status
- retry failed runs with safeguards
- review executive delivery package state
- jump to the linked customer control plane

## Schema changes

`CustomerAccount`

- `founderReviewRequired Boolean @default(false)`
- `founderReviewReason String?`
- `founderReviewRequestedAt DateTime?`
- `founderReviewResolvedAt DateTime?`

`CustomerAccountTimelineEntryType`

- `ESCALATION_UPDATED`

## Environment variables required

No new environment variables are required for this phase.

Existing admin protection still depends on:

- `INTERNAL_ADMIN_EMAILS`

## Migrations required

- `packages/db/prisma/migrations/20260410170000_operator_console_founder_review/migration.sql`

## Test checklist

1. Open `/admin` as an allowlisted admin and confirm the operator queue renders.
2. Filter to `Founder review` and confirm only escalated accounts appear.
3. Add an internal note on a customer account and confirm it appears in the global recent-notes panel.
4. Set a next action due date within 7 days and confirm the account appears in the follow-up queue.
5. Flag founder review with a reason and confirm:
   - the account card reflects the escalation
   - a timeline entry is created
   - the customer account page shows the founder flag
6. Retry a failed customer run without a reason and confirm the action is blocked.
7. Retry a failed customer run with a reason but without typing `RETRY` and confirm the action is blocked.
8. Retry a failed customer run with both reason and confirmation and confirm:
   - recovery is queued
   - an audit log is written
   - the run page shows the success state
9. Re-publish CRM status with a short reason and confirm the action is blocked.
10. Re-publish CRM status with a valid reason and confirm the account shows a success banner.

## Manual setup steps

1. Run the migration.
2. Regenerate the Prisma client.
3. Ensure the operator email is present in `INTERNAL_ADMIN_EMAILS`.
4. Sign in as an admin user and open `/admin`.

Commands:

```powershell
pnpm db:migrate
pnpm db:generate
Set-Location apps/web
.\node_modules\.bin\tsc.cmd --noEmit
pnpm test
```

## Future expansion notes

- Add separate operator roles beyond the current admin allowlist.
- Add multi-step task objects if one `next action` field becomes limiting.
- Add bulk queue actions for common workflows once operator patterns stabilize.
- Add richer audit filtering directly inside the customer control plane.
- Add persisted operator assignments if the team grows beyond founder-led operations.
