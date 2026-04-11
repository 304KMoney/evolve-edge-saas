# Phase 34: Retention, Renewal, and Churn Prevention

## What Was Added

Phase 34 adds an app-owned retention layer that turns existing billing, activation, and usage data into renewal-ready product guidance.

New retention surfaces:

- A shared retention snapshot service in `apps/web/lib/retention.ts`
- A reusable retention UI surface in `apps/web/components/retention-overview.tsx`
- Dashboard renewal and account-health visibility
- Billing/settings renewal clarity, reactivation prompts, and downgrade save offers
- Billing source tagging on Stripe portal and checkout entry points so retention-triggered actions are observable

## Retention Surfaces Added

### Dashboard

The dashboard now shows:

- account health score
- renewal timing visibility
- activation and activity health signals
- usage decline warning when activity drops after activation
- reactivation prompt when access is read-only or inactive
- value reminders that reinforce reports, findings, and monitored assets already created

### Billing & Settings

The billing/settings page now shows:

- the same shared retention overview
- save-offer paths before or during risky lifecycle moments
- clearer renewal and end-of-access messaging
- plan-rightsizing guidance that routes to Stripe or pricing safely

## When They Appear

### Renewal Visibility

Always available when the workspace has:

- a trial end date
- a current subscription period end date
- a scheduled cancellation date through the current period end

### Account Health Indicators

Always available once the workspace has:

- billing state
- last activity state
- activation state

The score is derived from:

- activation completion
- report generation
- findings surfaced
- monitored assets registered
- team activity
- recent product activity
- billing friction
- cancellation state
- capacity pressure

### Usage Decline Warning

Appears when:

- the workspace has already reached activation
- last meaningful activity is 14+ days old

### Reactivation Prompt

Appears when:

- workspace mode is `READ_ONLY`
- workspace mode is `INACTIVE`

### Save Offer / Downgrade Offer

Appears when:

- cancellation is already scheduled
- workspace is already read-only
- renewal is near and the account shows risk
- usage is declining after value was reached
- hard capacity pressure suggests the current plan fit may be off

## Trigger States

Primary states used by the retention layer:

- `workspaceMode`
- `billingAccessState`
- `subscriptionStatus`
- `cancelAtPeriodEnd`
- `trialEndsAt`
- `currentPeriodEnd`
- `lastActivityAt`
- activation milestone state
- usage metering warning or exceeded states

## Cancellation Flow Notes

Cancellation is still owned by Stripe.

This phase does not add dark patterns or block cancellation. Instead it:

- clarifies what access remains available
- shows when access will end
- suggests a smaller-fit plan when appropriate
- offers support/contact help for procurement or rollout friction
- routes users into the existing Stripe billing portal for the actual mutation

## Reactivation Flow Notes

Reactivation is also still Stripe-owned.

This phase adds:

- read-only and inactive workspace prompts
- a direct portal CTA when a Stripe customer already exists
- a pricing CTA when the workspace needs a fresh plan selection path
- product copy that reminds the user their historical records remain valuable

## Required Backend State Additions

No new persistent backend state was required for this phase.

Everything is derived from existing trusted sources:

- subscription lifecycle state
- billing access state
- usage metering
- activation progress
- last activity
- existing product records

If you want deeper customer-success automation later, the next optional backend additions would be:

- persisted account health snapshots
- explicit customer lifecycle stage fields
- success-task or outreach queue records
- churn-risk annotations written by internal ops tooling

## File Map

- `apps/web/lib/retention.ts`
- `apps/web/components/retention-overview.tsx`
- `apps/web/lib/dashboard.ts`
- `apps/web/components/dashboard-shell.tsx`
- `apps/web/app/dashboard/settings/page.tsx`
- `apps/web/components/upsell-offer-stack.tsx`
- `docs/phase-34-retention-renewal.md`

## Future Automation Ideas

- Trigger owner outreach when a workspace is activated but inactive for 14+ days
- Trigger renewal prep outreach 21 days before term end for high-value accounts
- Trigger support offers automatically for past-due or read-only workspaces
- Trigger success plays when cancellation is scheduled but the workspace has strong value signals
- Create an internal admin queue for accounts with healthy usage but weak renewal posture

## Recommended Churn Prevention Strategy For The First 12 Months

1. Optimize for fast first value, then visible repeated value.
2. Make executive report generation the center of retention, because it is the clearest proof of value.
3. Keep renewal clarity inside the product so owners always know trial end, renewal timing, and access consequences.
4. Use light-touch health signals instead of heavy success dashboards that owners ignore.
5. Intercept likely churn with right-sizing options, not pressure tactics.
6. Focus early CS/ops effort on activated accounts whose activity drops, not on every signup.
7. Use billing friction states like `past_due`, `read_only`, and `cancel_at_period_end` as recovery moments with value reminders.
8. Prioritize continuity messaging: reports, findings, and inventories already created are expensive to lose.
9. Pair in-app save offers with optional human support for procurement, onboarding, and premium assistance.
10. After enough data accumulates, layer success automation on top of this derived retention snapshot instead of replacing it.

## Commands To Run

```powershell
Set-Location apps/web
.\node_modules\.bin\tsc.cmd --noEmit
```
