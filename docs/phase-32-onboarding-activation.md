# Phase 32: Onboarding Funnel and Activation System

## Chosen activation milestone

Primary activation milestone:

- first executive report generated

## Rationale

This is the strongest first-value event for Evolve Edge because it proves the full product loop:

- workspace setup happened
- an assessment was actually started
- enough intake was completed to submit real data
- the system produced stakeholder-ready output

That is a much stronger SaaS activation signal than:

- account created
- workspace configured
- first asset added
- first checklist field saved

Those are useful progress signals, but they do not yet prove the product delivered meaningful compliance value.

## Activation strategy

The activation system now guides users through four primary steps:

1. Workspace configured
2. First assessment started
3. Assessment submitted for analysis
4. First executive report generated

Supporting adoption signals are also tracked:

- monitored assets connected
- first compliance gap surfaced
- first executive summary viewed

This creates a clean activation model:

- one core milestone for conversion
- a few secondary signals for adoption depth

## Onboarding flow map

### Pre-workspace onboarding

Page:

- `apps/web/app/onboarding/page.tsx`

Purpose:

- collect company and framework context
- preserve selected plan
- set expectations for the activation path

### Workspace overview

Page:

- `apps/web/components/dashboard-shell.tsx`

Purpose:

- show activation progress
- show the next best action
- make the guidance dismissible

### Assessment flow

Pages:

- `apps/web/app/dashboard/assessments/page.tsx`
- `apps/web/app/dashboard/assessments/[assessmentId]/page.tsx`

Purpose:

- push the workspace toward real intake completion
- reduce the gap between first assessment and report eligibility

### Report flow

Page:

- `apps/web/app/dashboard/reports/page.tsx`

Purpose:

- clearly position report generation as the first-value moment
- provide next-step guidance if the workspace is close but not activated

## What is tracked

Tracked primary steps:

- onboarding completed
- assessment count greater than zero
- assessment submitted or moved into analysis-capable statuses
- report count greater than zero

Tracked supporting signals:

- vendor or AI model count greater than zero
- finding count greater than zero
- report viewed count greater than zero

## What changed

### Shared activation logic

Added:

- `apps/web/lib/activation.ts`

This computes activation state from live org data and entitlements.

### Shared activation UI

Added:

- `apps/web/components/activation-guide.tsx`

This provides:

- premium checklist UI
- completion percentage
- next-action CTA
- supporting signals
- optional dismiss behavior using client-side storage

### Dashboard activation panel

Updated:

- `apps/web/lib/dashboard.ts`
- `apps/web/components/dashboard-shell.tsx`

The dashboard now shows:

- activation progress
- step-by-step checklist
- next best action

### Better onboarding framing

Updated:

- `apps/web/app/onboarding/page.tsx`

The onboarding page now explains:

- the first-value path
- the chosen activation milestone
- how plan state affects post-onboarding guidance

### Contextual empty states and tips

Updated:

- `apps/web/app/dashboard/assessments/page.tsx`
- `apps/web/app/dashboard/reports/page.tsx`

These pages now show:

- first-assessment guidance
- submit-intake guidance
- first-report guidance
- post-activation report-review guidance

## How to change onboarding later

Main configuration point:

- `apps/web/lib/activation.ts`

To change the activation model later:

1. Update the primary step definitions in `steps`
2. Change the `isActivated` rule
3. Adjust `nextAction` logic
4. Update any supporting signals

To change the onboarding narrative:

- edit `apps/web/app/onboarding/page.tsx`

To change dismissible behavior:

- edit `apps/web/components/activation-guide.tsx`

## File map

- `apps/web/lib/activation.ts`
- `apps/web/components/activation-guide.tsx`
- `apps/web/lib/dashboard.ts`
- `apps/web/components/dashboard-shell.tsx`
- `apps/web/app/onboarding/page.tsx`
- `apps/web/app/dashboard/assessments/page.tsx`
- `apps/web/app/dashboard/reports/page.tsx`

## Exact files changed

- `apps/web/lib/activation.ts`
- `apps/web/components/activation-guide.tsx`
- `apps/web/lib/dashboard.ts`
- `apps/web/components/dashboard-shell.tsx`
- `apps/web/app/onboarding/page.tsx`
- `apps/web/app/dashboard/assessments/page.tsx`
- `apps/web/app/dashboard/reports/page.tsx`
- `docs/phase-32-onboarding-activation.md`

## Test checklist

1. Create a brand-new account and confirm onboarding explains the activation path before workspace creation.
2. Complete onboarding and confirm the dashboard shows activation progress instead of a generic empty state.
3. Confirm the activation guide marks workspace setup complete immediately after onboarding.
4. Confirm creating the first assessment updates progress.
5. Confirm submitting an assessment updates progress.
6. Confirm generating the first report marks the activation milestone as reached.
7. Confirm the reports page shows first-value guidance before activation and review guidance after activation.
8. Confirm dismissing the dashboard activation guide hides it for that org in the browser.
9. Confirm plan states that block reports redirect the next-action guidance to billing rather than a broken report CTA.

## Schema changes

- none

## Env changes

- none
