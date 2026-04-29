# First Customer Journey

This is the app-owned path for closing the first self-serve customer without
manual operator stitching.

## Flow Map

1. Customer lands on the public site and opens `/pricing`.
2. `Start Audit` / `Buy Audit` sends anonymous users to
   `/signup?redirectTo=/onboarding?...` with selected plan context.
3. Signup creates or matches the app user in Postgres and preserves the
   app-owned onboarding redirect.
4. The app sends incomplete workspaces to `/onboarding`.
5. Onboarding stores required intake data and marks the organization ready for
   audit only after server-side validation passes.
6. If onboarding was started from pricing, the app starts Stripe Checkout after
   intake completion.
7. Stripe Checkout returns to `/billing/return`.
8. The app reconciles Checkout into the canonical subscription and redirects:
   `/onboarding?billing=success` when intake is incomplete, or
   `/dashboard?billing=success` when intake is complete.
9. Stripe webhook reconciliation persists payment/access state and creates the
   routing snapshot only from backend-owned plan mappings.
10. If a paid customer completed checkout before intake, onboarding completion
    resumes the existing snapshot or creates a subscription-backed snapshot.
11. Workflow dispatch is queued only after intake and plan checks pass.
12. n8n may receive the app-owned dispatch, but execution logic remains in the
    backend AI execution layer.
13. Validated AI output is persisted as normalized report data.
14. Report generation creates customer-visible report records/artifacts and
    queues a non-blocking `report-ready` email when a customer email is known.
15. Enterprise-eligible workspaces can generate executive briefings from the
    finalized report.
16. `/dashboard` shows current status, latest report, briefing availability, and
    audit history.

## Safe Flow Recommendation

For the current Evolve Edge stage, keep signup and intake before Checkout for
public pricing CTAs. This lets the app bind payment to an organization, collect
required audit context before execution, and avoid Stripe becoming a customer or
entitlement source of truth.

The app also supports checkout-before-intake recovery for returning or operator
assisted customers: a successful paid return routes incomplete customers to
onboarding, and onboarding completion resumes queued routing/dispatch.

## Persistence Guarantees

- User, organization, onboarding, subscription, routing, dispatch, report, and
  briefing state are persisted in Postgres.
- Stripe remains billing authority only.
- Plan and workflow decisions are derived from backend canonical mappings.
- Public automation dispatch cannot derive paid access from payload metadata; it
  requires an active Stripe-backed subscription stored in Postgres and uses the
  app-owned subscription plan for routing.
- Intake is required before routing dispatch or AI execution.
- AI output must validate before report generation.
- Briefings are derived from finalized report data only.

## Operational Notes

- `/billing/return` now avoids a settings-page dead end after successful
  checkout by sending ready customers to `/dashboard` and incomplete customers
  to `/onboarding`.
- AI-generated reports now queue the same `report-ready` notification used by
  manual report generation. Delivery is still controlled by the app-owned email
  queue and scheduled notification dispatcher.
- `resumeFirstCustomerJourneyAfterReadiness` is best-effort and non-blocking for
  customer redirects. If n8n dispatch configuration is missing, dispatch remains
  queued and operator-visible logs capture the deferral.
- Starter routing allows the first already-created onboarding assessment to
  proceed, but blocks when the organization is above its audit limit.

## Env Vars

Required for the full paid execution path:

- `DATABASE_URL`
- `AUTH_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_URL` or equivalent app URL config
- `OUTBOUND_DISPATCH_SECRET`
- `N8N_AUDIT_REQUESTED_URL`
- `N8N_AUDIT_REQUESTED_SECRET`
- `AI_EXECUTION_PROVIDER=openai_langgraph`
- `AI_EXECUTION_DISPATCH_SECRET`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

Optional:

- HubSpot projection env vars, if CRM sync is enabled
- Email provider env vars, if report notifications are enabled

## QA Checklist

1. Visit `/pricing`.
2. Click Starter or Scale CTA while logged out.
3. Confirm `/signup` opens with selected plan context.
4. Create an account.
5. Confirm onboarding is required before dashboard execution surfaces.
6. Complete intake.
7. Confirm Stripe Checkout starts for self-serve plan selections.
8. Complete Stripe test checkout.
9. Confirm return lands on `/dashboard?billing=success` when intake is complete.
10. Repeat with checkout-before-intake and confirm return lands on
    `/onboarding?billing=success`.
11. Confirm intake completion resumes routing/dispatch for the paid customer.
12. Confirm no workflow dispatch occurs with incomplete intake.
13. Confirm missing/expired plan blocks routing, AI execution, and report generation.
14. Confirm validated AI output creates a report.
15. Confirm the dashboard shows current audit status and latest report.
16. Confirm Enterprise-only briefing behavior is enforced.
17. Confirm unauthorized users cannot access reports or briefings.
