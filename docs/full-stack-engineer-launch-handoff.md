# Evolve Edge First-Customer Launch Handoff

Prepared for: Full-stack engineer  
Repo: `evolve-edge-saas`  
Current launch branch: `launch-hardening-clean`  
Latest launch-hardening commit: `815b7b7`  

## Mission

Get Evolve Edge safely ready for the first paying customer.

The product path is now implemented in code, but it still needs live-environment validation, deployment verification, and operational hardening. Your job is not to rewrite the app. Your job is to prove the flow works end to end, fix small launch blockers, and make failures observable and recoverable.

## Non-Negotiable Architecture Boundaries

- Next.js owns product logic, customer-visible state, signup, routing, entitlement, dashboard access, report visibility, and lifecycle state.
- Neon/Postgres is the system of record.
- Stripe is billing/payment authority only.
- n8n is orchestration/async dispatch only.
- OpenAI/LangGraph are AI execution only.
- HubSpot is CRM projection only.
- Dify is deprecated rollback only.
- Hostinger/top-of-funnel must not own checkout, signup, entitlement, routing, dashboard, or report access logic.

If you find any external tool acting as source of truth for product state, treat it as a launch risk.

## Current Customer Flow

1. Customer visits `/pricing`.
2. Customer clicks Starter or Scale CTA.
3. Logged-out customer is sent to `/signup?redirectTo=/onboarding?...`.
4. Signup creates the app user, sets a session, and preserves onboarding intent.
5. Customer completes `/onboarding`.
6. Intake data is validated and persisted in Postgres.
7. App starts Stripe Checkout for self-serve plans.
8. Stripe returns to `/billing/return`.
9. App reconciles the checkout session into a canonical subscription.
10. If intake is complete, app resumes first-customer journey.
11. App creates delivery state and routing snapshot.
12. App queues workflow dispatch.
13. n8n receives app-owned execution payload only.
14. Backend-only AI execution runs via OpenAI/LangGraph after snapshot/intake/plan gates.
15. Validated AI output is normalized and persisted.
16. Report builder creates structured report records.
17. Executive briefing is generated from finalized report data when eligible.
18. Dashboard displays audit status, latest report, briefing availability, and history.
19. Email notifications are queued and dispatched by app-owned notification jobs.

## Most Important Files To Review

### Signup/Auth

- `apps/web/app/signup/page.tsx`
- `apps/web/app/signup/actions.ts`
- `apps/web/app/signup/signup-form.tsx`
- `apps/web/lib/signup.ts`
- `apps/web/lib/auth.ts`
- `apps/web/app/sign-in/page.tsx`
- `apps/web/app/sign-in/actions.ts`

Review for:

- Email normalization.
- Duplicate account handling.
- Password hashing.
- Safe user-facing errors.
- Session cookie behavior.
- Redirect preservation from pricing to onboarding.

### Pricing And Checkout

- `apps/web/app/pricing/page.tsx`
- `apps/web/components/pricing-page.tsx`
- `apps/web/lib/pricing.ts`
- `apps/web/lib/pricing-access.ts`
- `apps/web/app/api/billing/checkout/route.ts`
- `apps/web/app/billing/return/page.tsx`
- `apps/web/app/api/stripe/webhook/route.ts`
- `apps/web/app/api/webhooks/stripe/route.ts`
- `apps/web/lib/billing.ts`
- `apps/web/lib/checkout-handoff.ts`
- `apps/web/lib/first-customer-journey.ts`

Review for:

- Starter/Scale checkout path works.
- Enterprise remains contact-sales unless explicitly configured.
- Stripe metadata is not the only source of truth.
- Checkout session maps to backend canonical plan.
- `/billing/return` has no dead ends.
- Webhook idempotency works.
- Missing Stripe context is logged/operator-visible.

### Onboarding And Intake

- `apps/web/app/onboarding/page.tsx`
- `apps/web/app/onboarding/actions.ts`
- `apps/web/lib/audit-intake.ts`
- `apps/web/app/intake/page.tsx`

Review for:

- Required intake fields are server-side validated.
- Intake completion state persists.
- Dashboard/workflow/AI are blocked until intake is complete.
- No workflow starts from the frontend.

### Routing And Workflow Dispatch

- `apps/web/lib/commercial-routing.ts`
- `apps/web/lib/workflow-routing.ts`
- `apps/web/lib/workflow-dispatch.ts`
- `apps/web/app/api/internal/workflows/bootstrap-dispatch/route.ts`
- `apps/web/app/api/internal/workflows/dispatch/route.ts`
- `apps/web/app/api/internal/workflows/status/route.ts`
- `apps/web/app/api/internal/workflows/report-ready/route.ts`
- `apps/web/app/api/internal/workflows/report-writeback/route.ts`
- `apps/web/app/api/automation/intake-to-app-dispatch/route.ts`
- `apps/web/lib/public-app-dispatch.ts`

Review for:

- Routing snapshot is app-owned.
- Dispatch requires completed intake.
- Dispatch requires paid access where appropriate.
- Public app-dispatch does not trust purchased plan payload fields.
- n8n callbacks require shared secrets.
- n8n is never entitlement/routing authority.

### Plan And Entitlement Enforcement

- `apps/web/lib/plan-enforcement.ts`
- `apps/web/lib/entitlements.ts`
- `apps/web/lib/commercial-routing.ts`
- `apps/web/app/api/stripe/webhook/route.ts`

Review for:

- Missing plan fails closed.
- Expired/unpaid access blocks execution actions.
- Starter/Scale/Enterprise capabilities match product promises.
- Stripe webhook updates backend canonical subscription state.
- Paid users do not bypass intake.

### AI Execution

- `apps/web/lib/ai-execution.ts`
- `apps/web/lib/ai-execution-route.ts`
- `apps/web/app/api/internal/workflows/audit/execute/route.ts`
- `apps/web/app/api/internal/ai/execute/route.ts`
- `apps/web/src/server/ai/providers/openai-langgraph.ts`
- `apps/web/src/server/ai/providers/types.ts`
- `apps/web/src/server/ai/workflows/audit/graph.ts`
- `apps/web/src/server/ai/workflows/audit/nodes.ts`
- `apps/web/lib/dify.ts`

Review for:

- AI cannot be triggered directly by frontend.
- Missing snapshot is rejected.
- Incomplete intake is rejected.
- Missing/expired plan blocks execution.
- OpenAI keys stay server-only.
- AI output is schema-validated before persistence.
- Malformed output results in `failed_review_required`.
- Dify is not the default path.

### Reports

- `apps/web/lib/report-builder.ts`
- `apps/web/lib/report-records.ts`
- `apps/web/app/dashboard/reports/page.tsx`
- `apps/web/app/dashboard/reports/[reportId]/page.tsx`
- `apps/web/app/dashboard/reports/[reportId]/actions.ts`
- `apps/web/app/reports/page.tsx`
- `apps/web/app/reports/[id]/page.tsx`
- `apps/web/app/api/reports/[reportId]/export/route.ts`

Review for:

- Reports are generated only from normalized validated output.
- No raw AI output is exposed.
- Incomplete reports are hidden.
- Report ownership checks are enforced.
- Download/export requires valid access.

### Executive Briefings

- `apps/web/lib/executive-briefing.ts`
- `apps/web/app/briefings/[id]/page.tsx`
- `apps/web/app/api/briefings/[id]/export/route.ts`

Review for:

- Briefings derive strictly from finalized reports.
- Briefing access is tenant-scoped.
- Starter/Scale/Enterprise feature gating is intentional.

### Audit Lifecycle And Dashboard

- `apps/web/lib/audit-lifecycle.ts`
- `apps/web/lib/dashboard.ts`
- `apps/web/components/dashboard-shell.tsx`
- `apps/web/app/dashboard/page.tsx`

Review for:

- Lifecycle transitions cannot skip required stages.
- Dashboard does not show fake or placeholder reports.
- Status labels match real backend state.
- Customer sees clear status: intake pending, routing complete, analysis running, report ready, briefing ready, delivered, failed review required.

### Admin/Internal Debugging

- `apps/web/app/admin/page.tsx`
- `apps/web/app/admin/system-state/page.tsx`
- `docs/admin-system-state-debugger.md`

Review for:

- Admin-only access.
- Useful debugging fields: user, org, audit status, routing snapshot, report, last error, workflow run.
- No secrets or sensitive raw data exposed.

### Email And Jobs

- `apps/web/lib/email.ts`
- `apps/web/lib/jobs.ts`
- `apps/web/app/api/internal/jobs/run/route.ts`
- `apps/web/app/api/internal/notifications/dispatch/route.ts`
- `apps/web/app/api/webhooks/resend/route.ts`
- `apps/web/vercel.json`

Review for:

- Welcome email queues.
- Report-ready email queues.
- Notification dispatch cron works.
- Resend webhook verifies signature.
- Email failure does not block signup/report generation.

### Database

- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/20260429163000_briefings/migration.sql`
- `packages/db/prisma/migrations/20260429170000_audit_lifecycle/migration.sql`

Review for:

- Migrations apply cleanly to the target Neon database.
- Prisma Client generation is part of build/deploy.
- New models are additive and safe.
- No destructive migration behavior.

## Required Environment Variables

Confirm these exist in the target environment:

- `AUTH_MODE=password`
- `AUTH_SECRET`
- `AUTH_ACCESS_EMAIL`
- `AUTH_ACCESS_PASSWORD`
- `DATABASE_URL`
- `NEXT_PUBLIC_APP_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRODUCT_STARTER`
- `STRIPE_PRODUCT_SCALE`
- `STRIPE_PRODUCT_ENTERPRISE`
- `STRIPE_PRICE_STARTER_ANNUAL`
- `STRIPE_PRICE_SCALE_ANNUAL`
- `STRIPE_PRICE_ENTERPRISE_ANNUAL`
- `OUTBOUND_DISPATCH_SECRET`
- `N8N_CALLBACK_SECRET`
- `N8N_WRITEBACK_SECRET`
- `N8N_WORKFLOW_DESTINATIONS`
- `PUBLIC_INTAKE_SHARED_SECRET`
- `AI_EXECUTION_PROVIDER=openai_langgraph`
- `AI_EXECUTION_DISPATCH_SECRET`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `EMAIL_FROM_ADDRESS`
- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SIGNING_SECRET`
- `NOTIFICATION_DISPATCH_SECRET`
- `CRON_SECRET`
- `OPS_READINESS_SECRET`
- `REPORT_DOWNLOAD_SIGNING_SECRET`
- `REPORT_DOWNLOAD_REQUIRE_AUTH=true`

Optional but recommended:

- `SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_DSN`
- `OPS_ALERT_WEBHOOK_URL`
- `OPS_ALERT_WEBHOOK_SECRET`
- HubSpot env vars if CRM projection is enabled.

## Commands To Run

From repo root:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @evolve-edge/db prisma:generate
corepack pnpm db:migrate:deploy
corepack pnpm --filter @evolve-edge/web typecheck
corepack pnpm --filter @evolve-edge/web build
```

Focused tests:

```bash
cd apps/web
.\node_modules\.bin\tsx.CMD --require .\scripts\shims\server-only.js test\launch-preflight.test.ts
.\node_modules\.bin\tsx.CMD --require .\scripts\shims\server-only.js test\env-validation.test.ts
.\node_modules\.bin\tsx.CMD --require .\scripts\shims\server-only.js test\pricing-access.test.ts
.\node_modules\.bin\tsx.CMD --require .\scripts\shims\server-only.js test\checkout-handoff.test.ts
.\node_modules\.bin\tsx.CMD --require .\scripts\shims\server-only.js test\signup.test.ts
.\node_modules\.bin\tsx.CMD --require .\scripts\shims\server-only.js test\audit-intake.test.ts
.\node_modules\.bin\tsx.CMD --require .\scripts\shims\server-only.js test\first-customer-journey.test.ts
.\node_modules\.bin\tsx.CMD --require .\scripts\shims\server-only.js test\workflow-dispatch.test.ts
.\node_modules\.bin\tsx.CMD --require .\scripts\shims\server-only.js test\ai-execution-worker.test.ts
.\node_modules\.bin\tsx.CMD --require .\scripts\shims\server-only.js test\audit-execution.test.ts
.\node_modules\.bin\tsx.CMD --require .\scripts\shims\server-only.js test\report-builder.test.ts
.\node_modules\.bin\tsx.CMD --require .\scripts\shims\server-only.js test\report-access.test.ts
.\node_modules\.bin\tsx.CMD --require .\scripts\shims\server-only.js test\executive-briefing.test.ts
.\node_modules\.bin\tsx.CMD --require .\scripts\shims\server-only.js test\plan-enforcement.test.ts
.\node_modules\.bin\tsx.CMD --require .\scripts\shims\server-only.js test\intake-to-app-dispatch.test.ts
.\node_modules\.bin\tsx.CMD --require .\scripts\shims\server-only.js test\button-routes.test.ts
```

If on macOS/Linux, use the equivalent `./node_modules/.bin/tsx`.

## Manual QA Script

Use a real staging environment connected to test-mode Stripe, test n8n, test OpenAI, and test Resend.

1. Visit `/pricing`.
2. Choose Starter.
3. Confirm logged-out users land on `/signup`.
4. Create a new account.
5. Confirm redirect to `/onboarding`.
6. Submit invalid intake and confirm validation errors.
7. Submit valid intake.
8. Confirm Stripe Checkout opens.
9. Complete test payment.
10. Confirm `/billing/return` redirects to `/dashboard`.
11. Confirm subscription exists in Postgres.
12. Confirm delivery state exists.
13. Confirm routing snapshot exists.
14. Confirm workflow dispatch exists.
15. Confirm n8n receives the dispatch.
16. Trigger or allow AI execution.
17. Confirm AI execution rejects missing snapshot.
18. Confirm AI execution rejects incomplete intake.
19. Confirm valid execution writes normalized output.
20. Confirm report record is created.
21. Confirm dashboard shows report ready.
22. Confirm unauthorized user cannot open the report.
23. Confirm eligible briefing can be generated/opened.
24. Confirm report-ready email is queued.
25. Confirm notification dispatch sends email.
26. Confirm admin `/admin/system-state` shows useful debugging state.

## Known Build Notes

The current build passes, but may show warnings from Sentry/OpenTelemetry dynamic require behavior. Treat those as observability dependency warnings unless they become runtime errors.

Also ensure `metadataBase` is set appropriately for production metadata/social image URLs if marketing polish matters before launch.

## Launch Risks To Watch Closely

### Stripe

- Live/test key mismatch.
- Product/price IDs not matching backend canonical plan mapping.
- Webhook endpoint pointing at old route.
- Missing webhook secret.
- Duplicate webhook handling.

Canonical webhook route:

- `/api/stripe/webhook`

Legacy route:

- `/api/webhooks/stripe`

The legacy route should not be the production Stripe endpoint.

### n8n

- Missing `auditRequested` destination in `N8N_WORKFLOW_DESTINATIONS`.
- Wrong callback secret.
- n8n attempting to own routing, entitlement, or report state.
- Dispatch rows stuck in pending/dispatching.

### OpenAI/LangGraph

- Missing `OPENAI_API_KEY`.
- Invalid `OPENAI_MODEL`.
- Malformed model output.
- Long-running execution without clear failed state.

### Email

- Resend domain not verified.
- From address rejected.
- Notification cron too slow for desired customer experience.
- Report-ready email queued but not dispatched.

### Dashboard

- User reaches dashboard before intake.
- User sees fake/incomplete report.
- User sees report from another organization.
- Paid user has no clear status after checkout.

## What To Fix If Something Fails

Prefer small, safe fixes:

- Add missing env/config validation.
- Fix redirect dead ends.
- Add idempotency checks.
- Tighten access control.
- Add operator-visible logs.
- Add tests for the specific broken path.

Avoid:

- Replacing auth provider.
- Moving product logic into Stripe/n8n/HubSpot.
- Making AI output directly customer-visible.
- Creating broad schema rewrites.
- Disabling fail-closed gates just to get a demo through.

## Go/No-Go Criteria

Code-level GO requires:

- Typecheck passes.
- Production build passes.
- Focused launch tests pass.
- Migrations apply cleanly.

Operational GO requires:

- Stripe checkout and webhook smoke test passes.
- Onboarding/intake smoke test passes.
- Routing snapshot and workflow dispatch smoke test passes.
- AI execution smoke test passes.
- Report and briefing smoke test passes.
- Email queue and send smoke test passes.
- Admin debugging view works.

If any one of those live smoke tests fails, do not onboard the first paying customer until it is fixed or there is a documented manual fallback.

## Suggested Engineer Deliverable Back To Founder

Ask the engineer to return:

1. Deployment URL.
2. Commit/branch deployed.
3. Migration status.
4. Env readiness result.
5. Stripe smoke test result.
6. n8n dispatch result.
7. OpenAI/LangGraph execution result.
8. Report/briefing result.
9. Email delivery result.
10. Any remaining launch blockers.
11. Clear GO/NO-GO recommendation.

