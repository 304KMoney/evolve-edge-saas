# Phase 28: Stripe Checkout, Customer Portal, and Billing Lifecycle

## What This Phase Hardens

Phase 28 turns the existing Stripe billing flow into a safer SaaS billing lifecycle:

- Stripe Checkout creation is now richer and more traceable.
- Stripe Customer Portal is the default path for existing subscription changes.
- Successful checkout returns through an application-owned reconciliation route.
- Webhooks remain the durable source of truth and are processed idempotently.
- Failed payments and customer-action-required states move the workspace into the correct access mode.
- Cancellation scheduling and reactivation are reflected through synced subscription state instead of UI guesses.

## Stripe Products And Prices Expected

The current public catalog expects four Stripe recurring prices:

| Product / Price | Plan code | Billing interval | Env var |
|---|---|---|---|
| Growth Monthly | `growth-monthly` | monthly | `STRIPE_PRICE_GROWTH_MONTHLY` |
| Growth Annual | `growth-annual` | annual | `STRIPE_PRICE_GROWTH_ANNUAL` |
| Enterprise Monthly | `enterprise-monthly` | monthly | `STRIPE_PRICE_ENTERPRISE_MONTHLY` |
| Enterprise Annual | `enterprise-annual` | annual | `STRIPE_PRICE_ENTERPRISE_ANNUAL` |

Recommended Stripe product structure:

- Product: `Evolve Edge Growth`
- Prices:
  - monthly recurring
  - yearly recurring
- Product: `Evolve Edge Enterprise`
- Prices:
  - monthly recurring
  - yearly recurring

The app maps access from the internal plan catalog, not from Stripe product names. Stripe price IDs are the binding layer.

## Environment Variables Required

Required:

```env
NEXT_PUBLIC_APP_URL="https://app.example.com"
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PRICE_GROWTH_MONTHLY="price_..."
STRIPE_PRICE_GROWTH_ANNUAL="price_..."
STRIPE_PRICE_ENTERPRISE_MONTHLY="price_..."
STRIPE_PRICE_ENTERPRISE_ANNUAL="price_..."
DEFAULT_PLAN_CODE="growth-annual"
```

Recommended supporting vars already used elsewhere in the app:

```env
NEXT_PUBLIC_SALES_CONTACT_EMAIL="sales@evolveedge.ai"
EMAIL_PROVIDER="resend"
RESEND_API_KEY="re_..."
EMAIL_FROM_ADDRESS="Evolve Edge <billing@yourdomain.com>"
```

## Webhook Events Expected

The webhook endpoint is:

```text
/api/stripe/webhook
```

The app now expects and handles these Stripe events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `customer.subscription.trial_will_end`
- `invoice.paid`
- `invoice.payment_failed`
- `invoice.payment_action_required`

Webhook behavior:

- Every Stripe event is claimed through the `BillingEvent` table.
- Duplicate deliveries are ignored after successful processing.
- stale `PROCESSING` events can be reclaimed.
- failed events are marked `FAILED` with the last error captured.

## Billing Flow Structure

### 1. New checkout

- Owner posts to `/api/billing/checkout`
- App ensures a Stripe customer exists and carries `organizationId` and `planCode` metadata
- App creates a Stripe Checkout Session for the mapped recurring price
- Stripe redirects to `/billing/return?status=success&session_id={CHECKOUT_SESSION_ID}` or `/billing/return?status=cancelled`

### 2. Existing customer changes

- Existing subscribed workspaces are routed to `/api/billing/portal`
- Stripe Customer Portal becomes the safe path for renewals, plan changes, and cancellation/reactivation
- Portal returns to `/billing/return?status=portal`

### 3. Return reconciliation

- `/billing/return` requires an authenticated org session
- On success, it retrieves the checkout session from Stripe
- If Stripe already created the subscription, the app immediately syncs it before redirecting to settings
- If Stripe is still finalizing lifecycle state, the app redirects with `billing=processing`

### 4. Authoritative lifecycle sync

- Webhooks reconcile subscription state into the app
- Access decisions come from synced subscription data plus entitlement logic
- The frontend only renders the current state; it does not own billing truth

## Billing States And Access Handling

The app uses synced Stripe lifecycle state to drive workspace access:

- `TRIALING`: normal access
- `ACTIVE`: normal access
- `GRACE_PERIOD`: normal access until scheduled end date
- `PAST_DUE`: read-only access
- `PAUSED`: read-only access
- `CANCELED`: read-only or inactive depending on remaining access window
- `INCOMPLETE`: inactive or limited until Stripe completes billing

Current app behavior:

- failed invoice or action required -> subscription sync moves access toward `PAST_DUE`
- scheduled cancellation -> `cancelAtPeriodEnd` is preserved and surfaced in settings
- payment recovery -> `invoice.paid` re-syncs the subscription and emits `payment.recovered`
- checkout failure -> subscription remains `INCOMPLETE`

## Stripe Dashboard Configuration

## Click-By-Click Setup Steps

### A. Create products and recurring prices

1. Open Stripe Dashboard.
2. Go to `Product catalog`.
3. Click `Add product`.
4. Create `Evolve Edge Growth`.
5. Under pricing, create:
   - one recurring monthly USD price
   - one recurring yearly USD price
6. Save the product.
7. Repeat for `Evolve Edge Enterprise`.
8. Copy each `price_...` ID into the matching environment variable.

### B. Configure the customer portal

1. In Stripe Dashboard, go to `Settings`.
2. Open `Billing`.
3. Open `Customer portal`.
4. Click `Configure`.
5. Enable:
   - invoice history
   - payment method updates
   - subscription cancellation
   - subscription reactivation
6. If you want self-serve plan changes in portal, enable subscription updates there and map the allowed products carefully.
7. Save the portal configuration.

Recommended portal settings:

- allow cancellation at period end
- allow reactivation before the term ends
- allow payment method updates
- allow billing address updates

### C. Configure webhooks

1. In Stripe Dashboard, go to `Developers`.
2. Click `Webhooks`.
3. Click `Add endpoint`.
4. Endpoint URL:

```text
https://your-app-domain.com/api/stripe/webhook
```

5. Select these events:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.trial_will_end`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `invoice.payment_action_required`
6. Save the endpoint.
7. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

### D. Validate app URLs

1. Confirm `NEXT_PUBLIC_APP_URL` matches the deployed app origin.
2. Confirm checkout success URLs resolve to `/billing/return`.
3. Confirm portal return URLs resolve to `/billing/return?status=portal`.
4. Confirm the webhook endpoint is publicly reachable from Stripe.

## Local Testing Steps

### App setup

Run:

```powershell
pnpm db:generate
pnpm db:seed
Set-Location apps/web
.\node_modules\.bin\tsc.cmd --noEmit
```

If you changed schema in another phase and have not applied it yet:

```powershell
pnpm db:migrate
```

### Stripe CLI setup

1. Install the Stripe CLI.
2. Run:

```powershell
stripe login
```

3. Forward events to local dev:

```powershell
stripe listen --forward-to http://localhost:3000/api/stripe/webhook
```

4. Copy the emitted `whsec_...` secret into `.env.local` as `STRIPE_WEBHOOK_SECRET`.

### End-to-end local checkout test

1. Start the app locally.
2. Sign in as an owner account.
3. Open `/pricing` or `/dashboard/settings`.
4. Start checkout on a plan that has a valid Stripe test price.
5. Complete checkout with a Stripe test card:

```text
4242 4242 4242 4242
```

6. Confirm redirect lands on `/billing/return`.
7. Confirm settings shows `billing=success` or `billing=processing`.
8. Confirm the `Subscription` row is updated with:
   - `stripeCustomerId`
   - `stripeSubscriptionId`
   - plan snapshot
   - current period dates
   - correct access state

### Failure-path local test

Use a Stripe test card that simulates billing issues for subscription flows and confirm:

- webhook event is recorded in `BillingEvent`
- subscription becomes `PAST_DUE` or `INCOMPLETE`
- workspace becomes read-only where expected
- settings page shows the warning state

## Production Setup Steps

1. Create live Stripe products and recurring prices.
2. Update production environment variables with live `price_...` IDs.
3. Configure the Stripe customer portal.
4. Register the production webhook endpoint.
5. Set the live `STRIPE_WEBHOOK_SECRET`.
6. Deploy the app.
7. Run a live-mode smoke test with a controlled internal billing account.
8. Verify webhook processing logs and `BillingEvent` rows after the smoke test.

## Failure Scenarios And Handling

### Duplicate Stripe webhook delivery

- handled by `BillingEvent` deduplication
- already processed events return safely without replaying side effects

### Checkout returns before webhook finishes

- `/billing/return` attempts immediate reconciliation from Stripe
- if Stripe is still finalizing, the app redirects with `billing=processing`

### Payment fails after subscription exists

- `invoice.payment_failed` marks the synced subscription as `PAST_DUE`
- workspace entitlement mode becomes read-only
- a `payment.failed` domain event is emitted
- owner email notification is queued when email delivery is configured

### Customer action required

- `invoice.payment_action_required` also moves the workspace toward `PAST_DUE`
- the failure message explains that Stripe customer action is required

### Customer cancels in portal

- Stripe emits subscription update/delete lifecycle events
- the app preserves `cancelAtPeriodEnd`, end dates, and access transition windows

### Customer reactivates before end of term

- Stripe emits an updated subscription event
- the app clears cancellation timing and restores active access when Stripe status returns to active/trialing

### Webhook processing throws

- billing event row is marked `FAILED`
- error details are captured
- operational alerting is triggered through the app monitoring path

## End-To-End Verification Checklist

- Stripe prices exist for all public plans.
- The correct `price_...` IDs are present in environment variables.
- `STRIPE_SECRET_KEY` is set.
- `STRIPE_WEBHOOK_SECRET` is set.
- `/pricing` and `/dashboard/settings` can launch checkout.
- New checkout creates or reuses the Stripe customer.
- Successful checkout redirects through `/billing/return`.
- Successful checkout leads to a synced subscription row.
- Existing subscribed owners are routed to the customer portal for plan management.
- Portal return lands back in settings cleanly.
- Webhook deliveries create `BillingEvent` records.
- Duplicate webhook deliveries do not create duplicate side effects.
- Failed payment moves the workspace to read-only.
- Paid invoice recovery restores active access.
- Scheduled cancellation remains active until end of term.

## Commands To Run

```powershell
pnpm db:generate
pnpm db:seed
Set-Location apps/web
.\node_modules\.bin\tsc.cmd --noEmit
```

Schema migrations for this phase:

- none

## Files Changed

- `apps/web/lib/billing.ts`
- `apps/web/app/api/stripe/webhook/route.ts`
- `apps/web/app/api/billing/checkout/route.ts`
- `apps/web/app/api/billing/portal/route.ts`
- `apps/web/app/billing/return/page.tsx`
- `apps/web/app/dashboard/settings/page.tsx`
- `apps/web/lib/pricing.ts`
- `docs/phase-28-stripe-lifecycle.md`
