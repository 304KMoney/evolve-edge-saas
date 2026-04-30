# Manual Sales Control Plane

## What Existed Before

Evolve Edge already had strong product-side lifecycle records:

- `LeadSubmission` for top-of-funnel capture and attribution
- `ProvisioningRequest` for controlled customer provisioning handoff
- `Organization` and `OrganizationMember` for product tenancy
- `Assessment`, `AnalysisJob`, `Report`, and `CustomerRun` for delivery execution
- `DomainEvent` and `AuditLog` for integration and traceability
- internal admin views for org-level billing, retention, and workflow inspection

The missing operator layer was a durable customer lifecycle record that could span:

- pre-org sales stages
- post-sale onboarding
- intake and audit execution
- report readiness
- operator notes and follow-up tasks
- CRM-safe status syncs

## What Was Implemented

### New Control-Plane Data Model

- `CustomerAccount`
  - one durable operator-facing record per customer lifecycle
  - supports pre-org and post-org states
  - links to org, primary lead, and primary provisioning request
  - stores current lifecycle stage, source, CRM references, and next action
- `CustomerAccountTimelineEntry`
  - durable history for notes, stage changes, task updates, syncs, and workflow triggers

### Lifecycle Stages

The control plane now supports these stages:

1. `LEAD`
2. `QUALIFIED`
3. `PROPOSAL_SENT`
4. `WON`
5. `ONBOARDING`
6. `INTAKE_PENDING`
7. `INTAKE_COMPLETE`
8. `AUDIT_PROCESSING`
9. `REPORT_READY`
10. `BRIEFING_SCHEDULED`
11. `MONITORING_ACTIVE`

### Service Layer

`apps/web/lib/customer-accounts.ts` now owns:

- lifecycle stage ordering and formatting
- customer-account dedupe keys
- lead-to-customer account creation
- org-backed lifecycle synchronization
- manual stage updates
- next-action updates
- operator notes
- CRM-safe status republishing
- admin account snapshots

### Admin Surfaces

- `/admin`
  - now includes customer lifecycle control-plane summaries
- `/admin/customers/[customerAccountId]`
  - new operator page for lifecycle stage, tasks, notes, status sync, and workflow recovery
- `/admin/accounts/[organizationId]`
  - now links to the operator lifecycle account when one exists

## Why It Matters

This phase turns the app into a real SaaS control plane for founder-led and future operator-led sales:

- a manually closed deal now has a durable home inside the product
- pre-sales and post-sale state are visible in one place
- operator notes do not live in ad hoc spreadsheets
- workflow retries stay permissioned and traceable
- CRM updates can be triggered safely without making HubSpot product truth

## Architecture Decisions

### App-Owned Lifecycle Truth

The customer lifecycle is owned by Evolve Edge, not HubSpot.

- `CustomerAccount` is the control-plane record
- HubSpot receives lifecycle events downstream
- system sync can advance lifecycle based on product milestones
- manual operator stages are preserved unless product state clearly moves later

### Monotonic Lifecycle Progression

Automatic syncs advance lifecycle forward only.

This protects operator intent in cases like:

- a sales stage already set to `PROPOSAL_SENT`
- a briefing manually scheduled before a later product sync

### Timeline Instead Of Spreadsheet Comments

Notes and task changes are stored as first-class timeline entries so they are:

- scoped to the correct account
- searchable in admin
- audit-adjacent
- safe to expand later into richer support tooling

## Operator Workflow Map

1. Lead is captured
2. `CustomerAccount` is created or refreshed from lead data
3. Sales moves stage manually as needed:
   - qualified
   - proposal sent
   - won
4. Customer is provisioned / onboarding completes
5. Account auto-sync advances into onboarding or intake
6. Assessment starts and audit work begins
7. Report is generated and lifecycle moves to report ready
8. Operator schedules briefing and later monitoring
9. If automation fails, operator retries the core customer run or republishes CRM status

## CRM-Friendly Status Sync

The app now emits:

- `customer_account.created`
- `customer_account.stage_changed`

These events are safe for:

- HubSpot contact/company lifecycle updates
- n8n lead-pipeline workflow handling
- downstream ops visibility

`customer_account.stage_changed` intentionally includes a small set of CRM and
operator-facing fields such as `primaryContactEmail`, `crmCompanyId`,
`crmDealId`, `nextActionLabel`, and `reason`. Keep that payload operationally
minimal and do not expand it into a broader customer-state dump without a
deliberate contract review.

## Environment Variables Required

No new environment variables are required for this phase.

Existing integration variables remain relevant where enabled:

- `HUBSPOT_ACCESS_TOKEN`
- `N8N_WORKFLOW_DESTINATIONS`
- `OUTBOUND_DISPATCH_SECRET`
- `INTERNAL_ADMIN_EMAILS`

Optional sales-enrichment variables if Apollo is used through n8n or operator tooling:

- `APOLLO_API_KEY`
- `APOLLO_API_BASE_URL`

The repo also includes a project-scoped Codex MCP server that reuses these env
vars for Apollo search and enrichment tasks without making Apollo authoritative
for app-owned lead or customer state.

## Migrations Required

New migration:

- `packages/db/prisma/migrations/20260410114500_customer_accounts_control_plane/migration.sql`

## Exact Files Changed

- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/20260410114500_customer_accounts_control_plane/migration.sql`
- `apps/web/lib/customer-accounts.ts`
- `apps/web/lib/lead-pipeline.ts`
- `apps/web/app/onboarding/actions.ts`
- `apps/web/app/dashboard/assessments/actions.ts`
- `apps/web/app/dashboard/reports/actions.ts`
- `apps/web/lib/hubspot.ts`
- `apps/web/lib/n8n.ts`
- `apps/web/app/admin/page.tsx`
- `apps/web/app/admin/accounts/[organizationId]/page.tsx`
- `apps/web/app/admin/customers/[customerAccountId]/actions.ts`
- `apps/web/app/admin/customers/[customerAccountId]/page.tsx`
- `apps/web/package.json`
- `apps/web/test/customer-accounts.test.ts`

## Test Checklist

- create or capture a lead and confirm a `CustomerAccount` exists
- complete onboarding and confirm the account links to the created org
- create an assessment and confirm lifecycle advances to intake pending
- submit the assessment and confirm lifecycle advances to audit processing
- generate a report and confirm lifecycle advances to report ready
- manually update the lifecycle stage from admin and confirm a timeline entry is created
- update next action and confirm the task appears on the admin customer page
- add an operator note and confirm it appears in the timeline
- re-publish CRM status and confirm a `customer_account.stage_changed` event is written
- retry an action-required customer run and confirm recovery is queued

## Manual Setup Steps

1. Run the migration and regenerate Prisma client.
2. Ensure at least one admin email is in `INTERNAL_ADMIN_EMAILS`.
3. If CRM sync is enabled, confirm HubSpot accepts the existing custom properties plus:
   - `evolve_edge_customer_stage`
   - `evolve_edge_next_action_label`
4. If n8n is enabled, confirm the `leadPipeline` workflow is allowed to receive `customer_account.stage_changed`.
5. If Apollo is used for prospecting or enrichment, keep it behind n8n or operator tooling and do not let it overwrite app-owned lifecycle truth.

## Commands To Run

```powershell
pnpm db:generate
pnpm db:migrate
Set-Location apps/web
.\node_modules\.bin\tsc.cmd --noEmit
pnpm test
```

## Future Expansion Notes

- add explicit task records if next-action management grows beyond one active task
- add stage-specific SLAs and due-date warnings
- add operator ownership and queue views for multiple sales or success users
- add account-level attachments for proposals, briefs, or delivery artifacts
- add richer CRM object sync for deals once HubSpot deal ownership becomes necessary
