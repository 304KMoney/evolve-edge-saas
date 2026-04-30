# Self-Serve Signup Flow

## Purpose

Evolve Edge now supports a public self-serve account creation route at `/signup`.
The flow creates a first-party password credential in the Next.js app, issues an
app session, and sends new users to `/onboarding` unless they already have an
organization membership.

## Source-Of-Truth Boundaries

- Next.js owns signup, validation, session creation, and customer-visible routing.
- Neon/Postgres remains the system of record for `User`, `PasswordCredential`,
  `Session`, lead capture, and customer account projection records.
- Stripe is not involved in signup and does not grant entitlements during account
  creation.
- HubSpot remains a projection surface only. Signup emits app-owned lead/user
  events that may be projected later; CRM failure must not block signup.
- n8n, LangGraph, OpenAI, Dify, and Hostinger do not own signup or dashboard
  access decisions.

## Routes

- `GET /signup`: public signup page.
- `POST /signup` server action: validates form data, creates the user/password
  credential, issues a session cookie, and redirects.
- `GET /sign-in`: includes a link for users who need to create a new account.
- Public pricing CTAs for Starter and Scale route to `/signup?redirectTo=...`
  so the selected plan and billing cadence carry into onboarding.

## Data Model Notes

No schema migration is required. The flow reuses existing models:

- `User`
- `PasswordCredential`
- `Session`
- `LeadSubmission`
- `CustomerAccount`

Signup creates only the user and password credential directly. It does not create
an organization or subscription. Organization setup remains owned by onboarding,
which preserves the existing entitlement and trial-subscription logic.

## Pricing And Checkout Order

The safest current-stage flow is:

1. Public pricing selection.
2. Signup or sign-in.
3. Onboarding creates or completes the workspace and carries the selected plan.
4. Pricing-origin Starter/Scale onboarding starts Stripe checkout after the
   workspace transaction completes.
5. Stripe webhooks reconcile payment back to the existing organization.
6. Success and cancel returns land in dashboard billing settings, never reports.

Checkout should not be anonymous right now. The checkout route requires an
authenticated organization user with billing permission, and Stripe metadata
binds payment events back to the app-owned `organizationId`. This preserves
idempotency and avoids orphaned Stripe payments that cannot safely map to a
workspace.

If Stripe is not configured, demo side effects are blocked, or checkout startup
fails, onboarding still succeeds and the user lands in dashboard billing
settings with a retry/status message. This keeps account/workspace creation
independent from billing-provider availability.

The older `/start` access-request path remains available as a compatibility path
for manual/customer-access email handoffs, but it is not the preferred public
self-serve pricing CTA now that `/signup` exists.

## Environment Variables

- `AUTH_MODE=password` must be enabled for signup.
- `DATABASE_URL` must point to the Neon/Postgres database.
- `AUTH_ACCESS_EMAIL` and `AUTH_ACCESS_PASSWORD` are still used for bootstrap
  sign-in, but an already-created database session can resolve without depending
  on bootstrap credential completeness.
- Optional lead/CRM projection variables remain unchanged, including HubSpot
  and domain-event worker settings already documented elsewhere.

## Validation And Security

- Email is normalized to lowercase before duplicate checks and storage.
- Passwords are hashed with the existing scrypt password utility.
- Duplicate email accounts are blocked with a safe user-facing error.
- Server-side validation rejects missing names, invalid emails, weak passwords,
  and overly long company names.
- Passwords are never logged and are not included in redirect query strings.
- Signup lead/customer projection is best-effort and non-blocking.
- New users without an organization are redirected to `/onboarding`, not granted
  dashboard access or paid entitlements.

## Test Commands

Targeted tests:

```bash
pnpm --filter @evolve-edge/web exec tsx --require ./scripts/shims/server-only.js test/signup.test.ts
pnpm --filter @evolve-edge/web exec tsx --require ./scripts/shims/server-only.js test/checkout-handoff.test.ts
pnpm --filter @evolve-edge/web exec tsx --require ./scripts/shims/server-only.js test/auth-routing.test.ts
pnpm --filter @evolve-edge/web exec tsx --require ./scripts/shims/server-only.js test/button-routes.test.ts
```

Full web test suite:

```bash
pnpm --filter @evolve-edge/web test
```

Typecheck:

```bash
pnpm typecheck
```

## Manual QA Checklist

1. Visit `/signup`.
2. Create a new account with valid name, email, password, and optional company
   name.
3. Confirm signup redirects to `/onboarding` for a user with no organization.
4. Confirm duplicate email signup is blocked with a friendly error.
5. Confirm invalid email and short password errors display correctly.
6. Confirm `/dashboard` redirects logged-out users to `/sign-in`.
7. Confirm finishing onboarding, not signup alone, creates the organization and
   any trial subscription.
8. Confirm HubSpot/CRM projection failures do not block signup.
