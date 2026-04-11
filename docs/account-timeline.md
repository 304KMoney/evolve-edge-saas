# Account Timeline

## What Existed Before

Evolve Edge already had several partial history surfaces:

- `CustomerAccountTimelineEntry` for operator notes, lifecycle changes, follow-up tasks, CRM sync requests, and escalation flags
- `AuditLog` for actor-level security and admin actions
- durable source records for leads, subscriptions, provisioning, assessments, reports, report packages, monitoring, and customer runs

The gap was that internal users still had to stitch those systems together mentally. The existing customer timeline was useful, but too narrow for a full account-history view.

## What Was Implemented

This phase upgrades the existing customer-account timeline into a normalized account-history model with:

- event category taxonomy
- severity and visibility labels
- source-system tracking
- source record references
- idempotent event keys for durable sync
- `occurredAt` timestamps separate from insertion time
- a centralized sync service that backfills high-signal lifecycle events from authoritative records
- filterable timeline rendering on the internal customer account page
- org-level preview cards linking into the full account timeline

## Why It Matters

Internal operators, founders, and future account managers can now inspect one coherent history for an account across:

- lead capture
- sales handoff
- billing lifecycle
- onboarding and intake
- delivery and briefing milestones
- monitoring activation
- retention signals
- operator interventions
- workflow failures and recoveries
- notable risk posture alerts

This reduces hidden founder memory and creates a stronger base for future customer 360 reporting.

## Architecture Decisions

### 1. Reuse the Existing Timeline Table

Instead of creating a second account-history table, this phase extends `CustomerAccountTimelineEntry`.

Why:

- existing operator notes and manual lifecycle edits already lived there
- admin/customer account pages already depended on it
- a single durable table is easier to query, backfill, paginate, and audit

### 2. Use Authoritative Records as Inputs

Timeline sync reads from authoritative app records:

- `LeadSubmission`
- `ProvisioningRequest`
- `Organization`
- `Subscription`
- `Assessment`
- `Report`
- `ReportPackage`
- `MonitoringSubscription`
- `MonitoringRiskSnapshot`
- `CustomerRun`

It does not treat analytics events, HubSpot, or n8n as the primary source of account history.

### 3. Keep Audit Logs Separate

`AuditLog` remains the source for security-sensitive actor auditing.

The account timeline is a business-facing internal history, not a replacement for audit logs.

## Timeline Taxonomy

Categories:

- `LEAD`
- `SALES`
- `BILLING`
- `ONBOARDING`
- `ACTIVATION`
- `DELIVERY`
- `MONITORING`
- `RETENTION`
- `SUPPORT`
- `SYSTEM`
- `RISK`

Visibility:

- `INTERNAL`
- `CUSTOMER`

Severity:

- `INFO`
- `WARNING`
- `CRITICAL`

Source systems:

- `APP`
- `STRIPE`
- `HUBSPOT`
- `N8N`
- `DIFY`
- `MANUAL`

## Ingestion Rules

The sync service records only high-signal lifecycle events. It intentionally avoids noisy low-value spam.

Examples:

- lead submitted
- lead qualified or converted
- provisioning requested, completed, or failed
- organization created
- onboarding completed
- subscription started
- payment received
- payment failed
- quota exceeded
- cancellation scheduled
- subscription reactivated or ended
- assessment created
- intake completed
- report generated
- executive package reviewed or sent
- briefing booked or completed
- monitoring activated, paused, or canceled
- monitoring risk alerts for materially elevated posture
- customer workflow started, failed, recovered, or completed

Phase 60 adds commercial hardening entries derived from authoritative billing and usage records:

- `billing.subscription_started`
- `billing.payment_failed`
- `billing.quota_exceeded`

## Source of Truth References

Every synced entry can store:

- `eventCode`
- `eventKey`
- `sourceRecordType`
- `sourceRecordId`
- `sourceSystem`

This makes the timeline expandable into a broader customer 360 layer later without losing traceability.

## Internal UI Behavior

The full timeline now appears on:

- `/admin/customers/[customerAccountId]`

That page supports filtering by:

- search query
- actor
- category
- source system
- severity
- visibility
- date range

The org detail page now includes:

- recent timeline preview
- link to the full account timeline

## Environment Variables Required

No new environment variables were added.

## Migrations Required

Run the Prisma migration that adds normalized account timeline fields:

- `20260411030000_account_timeline_unification`

## Test Checklist

1. Create or open a customer account with an organization and related lifecycle data.
2. Open `/admin/customers/[customerAccountId]`.
3. Confirm the timeline includes lead, billing, intake, delivery, monitoring, and workflow entries where those records exist.
4. Add an operator note and confirm it still appears in the unified timeline.
5. Change lifecycle stage and confirm the new entry is categorized and visible.
6. Filter by category and confirm only matching events render.
7. Filter by severity and confirm warning or critical events narrow correctly.
8. Filter by source system and date range.
9. Confirm the org detail page shows a recent timeline preview.
10. Confirm source record links open when supported.

## Manual Setup Steps

1. Run the migration and regenerate Prisma.
2. Open the internal admin customer account page for an existing account.
3. Let the page sync and backfill timeline entries automatically.
4. Review the timeline filters and pagination behavior.

## Future Expansion Notes

- Add support-ticket ingestion when a dedicated support model exists.
- Add richer source-record deep links for provisioning, subscriptions, runs, and report packages.
- Persist actor attribution for manual workflow recovery more directly on the run model.
- Add timeline export and account-360 aggregation views.
- Promote selected timeline events into BI snapshots if leadership reporting volume grows.
