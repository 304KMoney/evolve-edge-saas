# Conversion Funnel Optimization

## What Existed Before

Evolve Edge already had the core building blocks for conversion:

- public pricing and plan-selection pages
- lead capture with attribution and dedupe
- Stripe checkout and billing return handling
- onboarding that provisions the first workspace
- assessment intake with per-section saves
- app-owned analytics events for signup, checkout, onboarding, first assessment, and first report

The main gap was that the founder still had to infer several key funnel transitions from separate events and UI states. The product also did not make intake resume state or post-payment next steps especially obvious.

## What Changed

This phase adds a small shared conversion funnel layer and instruments the missing milestones without introducing a second analytics system.

### Shared conversion helpers

File: `apps/web/lib/conversion-funnel.ts`

Added:

- weighted intake progress calculation
- reusable assessment intake progress summary
- reusable onboarding launch progress summary
- reusable post-billing next-step logic

### New tracked funnel events

Added typed analytics events in `apps/web/lib/product-analytics.ts`:

- `funnel.lead_captured`
- `funnel.lead_to_paid`
- `funnel.intake_progress_saved`
- `funnel.intake_completed`
- `funnel.briefing_booked`
- `funnel.monitoring_converted`

### Event firing points

- `funnel.lead_captured`
  - fires from `apps/web/app/sign-in/actions.ts`
  - fires from `apps/web/app/contact-sales/actions.ts`
  - fires from `apps/web/app/onboarding/actions.ts`
  - only fires for a non-deduped lead capture

- `funnel.lead_to_paid`
  - fires from `apps/web/app/billing/return/page.tsx`
  - uses the latest known lead record for source and requested plan context

- `funnel.intake_progress_saved`
  - fires from `apps/web/app/dashboard/assessments/actions.ts`
  - only fires when the section status actually changes

- `funnel.intake_completed`
  - fires from `apps/web/app/dashboard/assessments/actions.ts`
  - fires on first submission into analysis, not on every later save

- `funnel.briefing_booked`
  - fires from `apps/web/app/dashboard/reports/[reportId]/actions.ts`
  - only fires when the package first moves into briefing booked state

- `funnel.monitoring_converted`
  - fires from `apps/web/app/dashboard/reports/[reportId]/actions.ts`
  - fires when briefing is completed and the customer moves into the monitoring-active lifecycle

## UX Improvements

### Onboarding

File: `apps/web/app/onboarding/page.tsx`

Added:

- visible launch progress bar
- explicit step model from plan selection through first report
- clearer trust-oriented guidance that setup is short and intake becomes resumable after workspace creation

### Intake

File: `apps/web/app/dashboard/assessments/[assessmentId]/page.tsx`

Added:

- resumable draft messaging
- clearer progress and next-step guidance
- better distinction between draft state, submitted state, and queued analysis
- disabled submit button until at least one section is complete

### Post-payment handoff

File: `apps/web/app/dashboard/settings/page.tsx`

Added:

- billing success next-step CTA based on current workspace state
- direct routing guidance into assessments, reports, or dashboard instead of a generic success-only message

## Why It Matters

This phase improves founder visibility into where prospects and customers stall without adding analytics theater.

Practical outcomes:

- unique lead capture is visible as a real funnel milestone
- paid conversion is tied back to lead context
- intake progress and completion are now measurable
- briefing and monitoring conversion become measurable downstream retention moments
- users get clearer "what next" guidance after onboarding, during intake, and after payment

## Architecture Decisions

- The product analytics table remains the only analytics persistence layer.
- Funnel milestones are tracked from server-owned transitions where practical.
- Existing pricing, billing, and onboarding services were reused instead of replaced.
- Lead capture dedupe remains source-of-truth in the lead pipeline; analytics only mirrors non-deduped entries for unique funnel visibility.

## Environment Variables Required

No new environment variables were added for this phase.

Existing analytics, Stripe, and auth environment variables remain required for the related flows to work end to end.

## Migrations Required

None.

## Tests Added

File: `apps/web/test/conversion-funnel.test.ts`

Covers:

- weighted intake progress math
- intake resume summary behavior
- onboarding launch progress behavior
- post-billing next-step routing logic

## Test Checklist

1. Start from the homepage and pricing page, then confirm existing marketing events still fire.
2. Submit a new contact/demo lead and confirm a `funnel.lead_captured` analytics event is written once for the unique lead.
3. Sign in as a net-new user, complete onboarding, and confirm the onboarding page shows the new progress scaffolding.
4. Open a new assessment and verify the intake page shows resumable-draft guidance.
5. Save a section with a new status and confirm a `funnel.intake_progress_saved` event is written.
6. Submit the assessment and confirm a `funnel.intake_completed` event is written once.
7. Complete checkout and confirm `funnel.lead_to_paid` is recorded.
8. Book a briefing on a report package and confirm `funnel.briefing_booked` is recorded once.
9. Complete the briefing and confirm `funnel.monitoring_converted` is recorded.
10. Return to billing success and verify the next-step CTA routes to the correct workspace destination.

## Manual Setup Notes

No external vendor setup changes are required for this phase.

If you want to analyze these events operationally, query the `ProductAnalyticsEvent` table by:

- `name`
- `organizationId`
- `occurredAt`
- `billingPlanCode`

Recommended weekly funnel slice:

- `marketing.landing_cta_clicked`
- `funnel.lead_captured`
- `funnel.lead_to_paid`
- `funnel.intake_completed`
- `product.first_report_generated`
- `funnel.briefing_booked`
- `funnel.monitoring_converted`

## Future Expansion Notes

- Add a lightweight founder dashboard that groups these events into conversion drop-off percentages by week.
- Add cohort slicing by lead source, requested plan, and billing plan.
- Promote frequent intake abandonment patterns into lifecycle automation or success prompts.
- If pricing experiments expand, keep reusing the existing pricing and revenue catalog abstractions rather than introducing page-level plan logic.
