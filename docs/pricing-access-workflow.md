# Pricing Access Workflow

## Source Of Truth

- Public Starter and Scale launch now begins in the Next.js app at `/start`.
- The app creates or refreshes the pre-onboarding user record, stores any password credential in Neon/Postgres, and queues customer emails through the app-owned email notification pipeline.
- Stripe remains the billing authority after onboarding and checkout.

## Public Flow

1. Customer selects `starter` or `scale` on `/pricing`.
2. CTA routes to `/start?plan=...` instead of `/sign-in`.
3. Customer submits work email and company name.
4. The app:
   - captures the pricing lead
   - creates or updates the user record
   - issues a temporary password when the customer does not already have an active workspace password
   - queues a login-guide email
   - queues a credentials email when a temporary password is issued
5. The sign-in link routes back into the canonical onboarding path so the selected plan carries into workspace setup and the first assessment.

## Safety Rules

- Existing customers with active workspace access do not get a live password reset from the pricing start flow.
- Customers without a password credential can receive a temporary password from the app-owned flow.
- No n8n, Stripe, HubSpot, or raw third-party payload decides export, auth, onboarding, or pricing state here.
