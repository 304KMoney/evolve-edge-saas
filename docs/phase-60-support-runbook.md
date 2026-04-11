# Phase 60 Support Runbook

This runbook is for support, founders, and internal operators handling billing or quota-related customer issues.

## Where to look first

Primary workspace view:

- `/admin/accounts/[organizationId]`

Use this page to inspect:

1. current plan and access state
2. Stripe-linked billing customer and subscription ids
3. billing webhook health summary
4. entitlement debug and active overrides
5. recent billing event log
6. recent usage event log
7. recent unified account timeline

## Common support workflows

### Payment failed

1. Open the org admin page.
2. Check `Billing snapshot and sync health`.
3. Review the latest payment failure message and recent billing event log.
4. If Stripe is already correct but internal state looks stale, run guarded `Resync billing from Stripe`.
5. If receipts failed repeatedly, inspect `/admin/replays` before retrying manually.

### Trial converted but access looks wrong

1. Confirm Stripe shows an active subscription and paid invoice.
2. Check whether the org has open webhook failures.
3. Review recent billing event logs and subscription status.
4. If needed, run guarded manual resync.

### Quota exceeded

1. Review `Usage and activation` and `Usage event log`.
2. Confirm which meter crossed its limit.
3. Check whether the org has an active override.
4. If the limit is correct, direct the customer to upgrade.
5. If the org has a manually approved exception, create or review entitlement overrides in workspace billing settings.

### Cancellation confusion

1. Confirm `cancelAtPeriodEnd`, current period end, and final canceled/ended state.
2. Review account timeline retention events.
3. Confirm monitoring and other services are aligned with the billing state.

## Manual billing resync safety rule

Only use `Resync billing from Stripe` when:

1. Stripe is believed to hold the correct subscription truth.
2. The operator can state why resync is safe.
3. The operator types `RESYNC`.

Each resync leaves:

1. an audit log
2. an append-only billing event log entry
3. refreshed internal subscription state if Stripe can be resolved

## When to escalate

Escalate to engineering when:

1. Stripe and internal state disagree after resync.
2. replay and resync both fail
3. price mapping or webhook signature problems are suspected
4. duplicate or missing commercial events appear across multiple orgs
