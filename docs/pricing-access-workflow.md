# Pricing Access Workflow

## Source Of Truth

- Public Starter and Scale launch now begins in the Next.js app at `/start`.
- The app creates or refreshes the pre-onboarding user record, stores any password credential in Neon/Postgres, and queues customer emails through the app-owned email notification pipeline.
- Stripe remains the billing authority after onboarding and checkout.

## Public Flow

1. Customer selects `starter` or `scale` on `/pricing`.
2. CTA routes to `/signup?redirectTo=/onboarding?...` so account creation
   happens before workspace setup and checkout.
3. Customer creates a first-party app account.
4. The app redirects to onboarding with the selected plan and billing cadence.
5. Onboarding creates the organization/workspace and carries the plan selection.
6. For Starter and Scale, onboarding starts Stripe checkout after the workspace
   transaction completes, where the app can bind checkout metadata to
   `organizationId`.
7. If checkout startup is unavailable, the customer lands in dashboard billing
   settings with retry guidance instead of needing operator intervention.

## Compatibility Flow

The older `/start?plan=...` access-request path remains available for manual
handoffs or invite-like email delivery. In that path, the customer submits work
email and company name, and the app:
   - captures the pricing lead
   - creates or updates the user record
   - issues a temporary password when the customer does not already have an active workspace password
   - queues a login-guide email
   - queues a credentials email when a temporary password is issued
The sign-in link routes back into the canonical onboarding path so the selected
plan carries into workspace setup and the first assessment.

## Safety Rules

- Existing customers with active workspace access do not get a live password reset from the pricing start flow.
- Customers without a password credential can receive a temporary password from the app-owned flow.
- Anonymous Stripe checkout is intentionally not exposed because checkout
  reconciliation depends on app-owned organization context.
- Paid users return to dashboard billing settings after checkout success or
  cancel; they are not routed directly into reports before intake/workspace
  setup exists.
- No n8n, Stripe, HubSpot, or raw third-party payload decides export, auth, onboarding, or pricing state here.
