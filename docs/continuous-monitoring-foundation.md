# Continuous Monitoring Foundation

## What Existed Before

Evolve Edge already supported assessments, findings, recommendations, reports,
 executive delivery packages, and a premium dashboard overview. Those records
 were strong for one-time audit delivery, but they were still anchored to
 individual assessment snapshots.

Before this phase, the product did not yet have a first-class recurring
monitoring layer for:

- persistent remediation status
- framework posture over time
- risk trend history
- recurring monitoring check placeholders
- an org-level monitoring subscription concept

## What Was Implemented

This phase adds the first SaaS-grade continuous monitoring foundation.

### New Data Model

- `MonitoringSubscription`
  - one monitoring record per organization
  - stores cadence, current posture, latest synced report/assessment, and next review
- `MonitoringFinding`
  - org-level ongoing issue record separate from one-time assessment findings
  - supports statuses:
    - `OPEN`
    - `ACCEPTED`
    - `IN_REMEDIATION`
    - `RESOLVED`
    - `DEFERRED`
- `MonitoringFramework`
  - framework posture summary for each framework selected by the org
  - tracks score, counts, and trend delta
- `MonitoringRiskSnapshot`
  - point-in-time risk trend history
  - stores posture score, risk level, and finding counts
- `MonitoringCheck`
  - recurring check placeholder for future scheduled jobs and integrations

### New Service Layer

`apps/web/lib/continuous-monitoring.ts` now owns:

- monitoring subscription setup
- assessment/report sync into monitoring state
- dedupe rules for recurring findings
- framework posture updates
- trend snapshot creation
- recurring check placeholder creation
- monitoring finding status updates
- dashboard snapshot assembly

### UI Added

- new protected page: `/dashboard/monitoring`
- monitoring summary section added to the main dashboard
- findings remediation management for owner/admin/analyst roles
- framework posture view
- risk trend history
- report archive
- recurring checks placeholder section

## Why It Matters

This is the first step from “audit delivery product” to “subscription platform.”

Clients now have a reason to return after a report is published because the app
keeps showing:

- what is still open
- what is being remediated
- how posture is moving over time
- when the next monitoring cycle is due
- which reports exist in the archive

## Architecture Decisions

- Monitoring records are org-scoped and multi-tenant by default.
- Assessment `Finding` remains the audit-snapshot fact record.
- `MonitoringFinding` is the ongoing operational state record.
- Report generation is the first safe sync point into monitoring state.
- Default recurring checks are placeholders only; they are stored now so future
  jobs can attach to durable records later.

## Environment Variables Required

No new environment variables are required for this phase.

## Migrations Required

Apply the Prisma migration that adds:

- `MonitoringSubscriptionStatus`
- `MonitoringFindingStatus`
- `MonitoringFrameworkStatus`
- `MonitoringCheckStatus`
- `MonitoringSubscription`
- `MonitoringFinding`
- `MonitoringFramework`
- `MonitoringRiskSnapshot`
- `MonitoringCheck`

## Test Checklist

1. Run migrations and regenerate Prisma.
2. Generate a report from a completed assessment.
3. Confirm a monitoring subscription is created for the org.
4. Open `/dashboard/monitoring` and confirm summary cards render.
5. Confirm findings appear with ongoing statuses.
6. Change a finding status to `In Remediation` and confirm it persists.
7. Confirm framework posture cards render.
8. Confirm report archive entries render.
9. Confirm recurring check placeholders are visible.
10. Confirm the main dashboard overview shows monitoring summary cards.

## Manual Setup Steps

1. Run `pnpm db:migrate`
2. Run `pnpm db:generate`
3. Run `pnpm db:seed` if you want seeded demo monitoring data
4. Run TypeScript and tests

## Future Extension Notes

- Attach scheduled jobs to `MonitoringCheck`
- Add vendor-specific and framework-specific automated checks
- Add SLA rules and due-date enforcement for remediation
- Add assignee-based workflows instead of role-only ownership
- Add secure stakeholder sharing for ongoing monitoring views
- Add monitoring notifications and digest emails
