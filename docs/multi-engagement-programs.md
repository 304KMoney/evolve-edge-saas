# Multi-Engagement Programs

## What Existed Before

Before this phase, Evolve Edge already had strong records for:

- subscriptions and entitlements
- one-time assessments
- reports and executive delivery packages
- continuous monitoring
- customer lifecycle and operator visibility

Those records were durable, but they still described the customer mostly through
individual assets:

- one subscription
- one assessment at a time
- one report package at a time
- one monitoring subscription

The system did not yet have a clean commercial/service abstraction for
representing a customer relationship that can include multiple active revenue
streams and a long-lived engagement history.

## What Was Implemented

This phase adds an app-owned engagement model that sits above billing and below
UI.

### New Domain Model

- `EngagementProgram`
  - durable service/program record scoped to one org
  - supports multiple parallel services for the same customer
  - current program types:
    - `ONE_TIME_AUDIT`
    - `ONGOING_MONITORING`
    - `REMEDIATION_SUPPORT`
    - `ADVISORY_ADD_ON`
    - `FRAMEWORK_FOLLOW_ON`
    - `PERIODIC_REASSESSMENT`
- `EngagementDeliverable`
  - scoped outputs attached to a program
  - current deliverable types:
    - `ASSESSMENT`
    - `REPORT`
    - `EXECUTIVE_PACKAGE`
    - `MONITORING_REVIEW`
    - `REMEDIATION_CHECKPOINT`
    - `ADVISORY_MEMO`
- `EngagementOpportunity`
  - internal categorization layer for follow-on and expansion opportunities
  - current opportunity categories:
    - `ONGOING_MONITORING`
    - `REMEDIATION_SUPPORT`
    - `ADVISORY_ADD_ON`
    - `FRAMEWORK_FOLLOW_ON`
    - `PERIODIC_REASSESSMENT`

### Service Layer

`apps/web/lib/engagement-programs.ts` now owns:

- program and deliverable labels
- derived opportunity rules
- org-level engagement sync
- customer-facing engagement snapshots

### Sync Behavior

The first sync hook is wired into report generation because that is the safest
point where:

- the audit cycle is real
- monitoring state exists
- executive delivery exists
- customer lifecycle is advanced

From that point, the app derives:

- one project program per assessment cycle
- one subscription-style program for ongoing monitoring
- scoped deliverables for assessments, reports, executive packages, and
  monitoring reviews
- internal opportunity tags for follow-on motions

### UI Added

- `/dashboard/programs`
  - customer-visible view of active services, engagement archive, deliverable
    history, and remediation continuity
- `/admin/accounts/[organizationId]`
  - internal engagement program view
  - internal expansion opportunity view
- dashboard navigation now includes `Programs`

## Why It Matters

This phase moves Evolve Edge closer to a true recurring SaaS + program platform.

The app can now represent a customer as:

- an initial audit engagement
- a monitoring subscription
- future reassessment cycles
- derived follow-on opportunities

instead of reducing the relationship to a single report or a single plan.

## Architecture Decisions

### Billing Is Not The Program Layer

Subscriptions still represent billing/access state.

Programs represent customer-facing service layers and internal delivery scope.
This separation is intentional so future packaging can support:

- project work without a subscription
- subscription work without a one-time project
- hybrid relationships with both

### Monitoring And Audit Stay Separate

Assessment findings remain point-in-time audit facts.

Monitoring findings remain ongoing operational records.

Programs sit above both and give the customer/operator a readable commercial and
delivery history.

### Opportunities Are Internal By Default

`EngagementOpportunity` is intentionally internal.

It supports founder/operator follow-up without pretending every opportunity is
already an active service. This keeps expansion logic visible without faking
revenue activation.

## Commercial Model Assumptions Built Into Code

- First assessment cycle is treated as `ONE_TIME_AUDIT`
- Later assessment cycles are treated as `PERIODIC_REASSESSMENT`
- Ongoing monitoring is modeled as a separate `SUBSCRIPTION`-style program
- Remediation support, advisory work, and framework-specific follow-on are
  initially created as internal opportunities until explicitly activated later
- One org can have multiple active programs at once

## Environment Variables Required

No new environment variables are required for this phase.

## Migrations Required

Apply the Prisma migration that adds:

- `EngagementProgramType`
- `EngagementProgramStatus`
- `EngagementCommercialModel`
- `EngagementDeliverableType`
- `EngagementDeliverableStatus`
- `EngagementOpportunityCategory`
- `EngagementOpportunityStatus`
- `EngagementProgram`
- `EngagementDeliverable`
- `EngagementOpportunity`
- new `engagementProgramId` references on:
  - `Assessment`
  - `Report`
  - `ReportPackage`
  - `MonitoringSubscription`
  - `MonitoringFinding`

## Test Checklist

1. Run `pnpm db:migrate`
2. Run `pnpm db:generate`
3. Run app TypeScript validation
4. Run app tests
5. Generate a report from a completed assessment
6. Open `/dashboard/programs` and confirm:
   - audit or reassessment programs appear
   - deliverables appear
   - remediation continuity summary appears
7. Confirm monitoring-backed orgs show an `Ongoing Monitoring Program`
8. Open `/admin/accounts/[organizationId]` and confirm:
   - engagement programs render
   - expansion opportunities render

## Manual Setup Steps

1. Run:

```powershell
pnpm db:migrate
pnpm db:generate
Set-Location apps/web
.\node_modules\.bin\tsc.cmd --noEmit
pnpm test
```

2. Generate at least one live report in a non-demo org to initialize the first
   engagement records automatically.

3. Open the customer `Programs` page to review the engagement history.

## Future Expansion Notes

- Add explicit operator activation flows for advisory and remediation programs
- Add assignment and ownership for engagement opportunities
- Add secure customer-visible milestone tracking per program
- Attach future add-on billing items to programs without making billing the
  primary service model
- Add contract, SOW, or renewal metadata if legal/commercial ops need it later
