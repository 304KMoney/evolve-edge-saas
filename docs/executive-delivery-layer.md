# Executive Delivery Layer

## What Existed Before

Evolve Edge already generated `Report` records from completed assessments and
stored report content in `reportJson`. Delivery state was limited to the report
status itself plus a simple delivered marker. That was enough for internal
testing, but it did not create a clean, reviewable executive delivery workflow.

Before this change the platform did not have:

- a first-class executive package model
- internal QA approval before send
- founder-review escalation for high-risk clients
- briefing status tracking
- reusable version snapshots for executive packaging

## What Was Implemented

This phase adds a productized executive delivery layer on top of the existing
report generation flow.

### New Domain Model

- `ReportPackage`
  - one delivery package per `organizationId + assessmentId`
  - owns delivery state, QA state, founder review state, and briefing state
  - package mutation helpers must resolve the package inside the expected `organizationId`; a global `packageId` alone is not treated as sufficient tenant proof
  - shared tenant-scoped lookup helpers should be preferred over ad hoc global-id fetches when this mutation surface expands
- `ReportPackageVersion`
  - immutable package snapshot for each generated report version
  - stores executive summary, roadmap summary, framework summary, executive
    briefing JSON, and briefing packet JSON

### Delivery Lifecycle

Supported delivery states:

1. `GENERATED`
2. `REVIEWED`
3. `SENT`
4. `BRIEFING_BOOKED`
5. `BRIEFING_COMPLETED`

Supported QA states:

1. `PENDING`
2. `APPROVED`
3. `CHANGES_REQUESTED`

### Workflow Behavior

- Every generated report now upserts a package and creates a new package
  version.
- `scale` and `enterprise` reports now generate a separate executive briefing
  artifact from validated report data.
- The executive briefing artifact is stored on `ReportPackageVersion`, not in
  `Report.reportJson`, and includes:
  - 3-5 key risks
  - business impact framing
  - urgency framing
  - roadmap highlights
  - talking points
  - slide-ready bullets
  - a meeting script
- Validated LangGraph reports now move the underlying `Report` through an
  explicit human-review gate:
  - `GENERATED`
  - `PENDING_REVIEW`
  - `APPROVED`
  - `REJECTED`
  - `DELIVERED`
- QA approval is required before a package can be sent.
- Report delivery actions are now blocked until the report status is
  `APPROVED`.
- Reviewers can save internal notes, reject with reason, or request
  regeneration without exposing prompts or backend internals.
- High-risk packages can require founder review before delivery.
- Sending the package still updates the underlying `Report` to `DELIVERED` for
  backward compatibility.
- Booking and completing a briefing updates customer lifecycle progression.
- If an operator attempts to send a package before QA/founder-review gates are
  satisfied, the backend now records a durable operations-queue finding for
  follow-up instead of relying on logs alone.

## Why It Matters

Premium delivery is now treated as an explicit product workflow instead of an
informal operator convention.

This matters because it gives Evolve Edge:

- clearer executive-grade packaging for premium customers
- internal quality control before external delivery
- traceable delivery state for support and founders
- a reusable packet model for future exports, PDFs, and board-ready output
- historical package versions without replacing the core report record

## Architecture Decisions

- `Report` remains the generated analytical artifact and the existing source for
  rendered report content.
- `ReportPackage` is the operator-facing delivery control layer.
- `ReportPackageVersion` stores frozen snapshots so prior executive packages can
  be reopened even after new reports are generated.
- Founder review is rule-based and derived from report risk signals instead of
  being manually remembered.
- Delivery gating lives in the application service layer, not only in UI forms.

## Environment Variables Required

No new environment variables are required for this phase.

Existing auth, admin, Stripe, HubSpot, and n8n variables continue to apply.

## Migrations Required

Apply the Prisma migration that creates:

- `ReportPackage`
- `ReportPackageVersion`
- `ReportPackageDeliveryStatus`
- `ReportPackageQaStatus`

## Test Checklist

1. Generate a report from a completed assessment.
2. Confirm a package is created automatically for that assessment.
3. Open the report detail page and verify executive summary, roadmap summary,
   and framework summary render from the package snapshot.
4. Approve QA and confirm the package moves to `REVIEWED`.
5. Request changes on a newly generated package and confirm QA becomes
   `CHANGES_REQUESTED`.
6. Generate a high-risk report and confirm founder review is required.
7. Complete founder review and confirm the package can then be sent.
8. Mark the package sent and confirm the underlying report is marked delivered.
9. Mark briefing booked and completed and confirm statuses advance.
10. Generate a second report for the same assessment and confirm prior package
    versions remain visible.

## Manual Setup Steps

1. Run the Prisma migration.
2. Regenerate the Prisma client.
3. Re-run TypeScript checks and tests.
4. Verify internal admin users can see executive package state on the
   organization admin page.

## Operator Workflow

1. Generate report
2. Open report detail page
3. Review the packaged leadership summary
4. Approve QA or request changes
5. Save any internal notes needed for future reviewers
6. If the report needs revision, reject it or request regeneration
7. If the package is red-flagged, complete founder review
8. Mark the package sent
9. Track briefing booked and briefing completed
10. Use prior package versions for historical reference

## Future Expansion Notes

- Add PDF briefing packet export from `packetJson`
- Add explicit delivery recipients and secure share links
- Add QA assignment queues for internal analysts
- Add delivery notifications once email delivery moves fully into package-aware
  flows
- Add operator analytics for time-to-review and time-to-briefing

## Automated Customer Delivery

After a reviewer approves a report and an operator marks it delivered, the app
now owns the post-report flow end to end:

- delivery is blocked unless the organization has a paid Stripe-backed access
  state in the app (`ACTIVE` or `GRACE_PERIOD`)
- the app queues the customer delivery email with:
  - executive summary
  - report link
  - executive briefing booking link
- the app schedules follow-up emails for:
  - day 3
  - day 7
- the app refreshes engagement opportunities so monitoring, remediation
  support, and advisory follow-on motions are surfaced internally
- the app publishes delivery events that HubSpot can observe through the
  existing projection dispatcher

This keeps delivery, billing checks, follow-up logic, and CRM updates inside
the Evolve Edge backend instead of pushing them into n8n or HubSpot.

## HubSpot And Scheduling Notes

- `report.delivered` is now a first-class HubSpot projection event.
- The existing `customer_account.stage_changed` event continues to project
  customer lifecycle changes after delivery.
- If `HUBSPOT_REPORT_DELIVERED_DEAL_STAGE_ID` is configured and the customer
  account has a `crmDealId`, the HubSpot projection layer will also patch the
  HubSpot deal stage on report delivery.
- Delayed follow-up emails are stored in the existing `EmailNotification`
  queue using `nextRetryAt`.
- Operators should ensure the scheduled jobs runner includes the
  `dispatch-email-notifications` job so queued delivery and follow-up emails are
  actually sent.

## Delivery Operations Visibility

- The report detail page now shows an internal-only delivery operations panel
  with:
  - paid-delivery eligibility from the app-owned subscription state
  - delivery email dispatch environment readiness
  - queued, sent, failed, and scheduled delivery notifications for that report
- The admin account detail page now shows organization-level delivery
  automation health for recent report delivery and follow-up notifications.
- If an operator tries to deliver an approved report while billing is not in an
  active paid state, the app now records a durable operations-queue finding so
  the blocked attempt is visible in admin workflows instead of only surfacing as
  a redirect error.
