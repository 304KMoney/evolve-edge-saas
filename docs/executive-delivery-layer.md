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
  - stores executive summary, roadmap summary, framework summary, and briefing
    packet JSON

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
- QA approval is required before a package can be sent.
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
5. If the package is red-flagged, complete founder review
6. Mark the package sent
7. Track briefing booked and briefing completed
8. Use prior package versions for historical reference

## Future Expansion Notes

- Add PDF briefing packet export from `packetJson`
- Add explicit delivery recipients and secure share links
- Add QA assignment queues for internal analysts
- Add delivery notifications once email delivery moves fully into package-aware
  flows
- Add operator analytics for time-to-review and time-to-briefing
