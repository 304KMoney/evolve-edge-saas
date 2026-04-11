# Phase 33: Product Analytics and Revenue Intelligence

## What Existed

Evolve Edge already had durable domain events, audit logs, usage threshold events, lead attribution capture, billing lifecycle sync, and a few feature-specific tracking hooks. That gave the app strong operational observability, but it did not yet provide a dedicated product analytics layer for activation, conversion, retention, and revenue reporting.

Before this phase:

- Domain events existed for operational and integration transitions.
- Audit logs existed for security and support workflows.
- Marketing and revenue funnel events were not stored in a normalized analytics table.
- CTA tracking, pricing views, signup milestones, and revenue milestones were not modeled as a shared typed taxonomy.
- There was no vendor-swappable analytics abstraction owned by the app.

## Chosen Analytics Strategy

The app remains the source of truth. Product analytics is implemented as an app-owned event layer that sits beside domain events instead of replacing them.

Principles:

- Track funnel and revenue behavior from the server-owned business transition whenever possible.
- Use lightweight client tracking only for anonymous marketing interactions such as landing-page CTA clicks and pricing page views.
- Persist analytics events in the application database first.
- Keep event names explicit, stable, and privacy-aware.
- Treat downstream vendor export as optional and replaceable.

## Event Taxonomy

### Marketing

| Event | When it fires | Required payload |
|---|---|---|
| `marketing.landing_cta_clicked` | Homepage CTA click | `ctaKey`, `location`, `href` |
| `marketing.pricing_viewed` | Pricing page render once per session | `location`, `authenticated` |

### Signup and Activation

| Event | When it fires | Required payload |
|---|---|---|
| `signup.started` | Sign-in/signup entry page viewed once per session | `source`, `intent`, `requestedPlanCode` |
| `signup.completed` | New self-serve user completes onboarding and workspace creation | `organizationId`, `requestedPlanCode` |
| `onboarding.completed` | Onboarding transaction completes | `organizationId`, `frameworkCount`, `requestedPlanCode` |
| `product.first_assessment_created` | First assessment is created for an org | `assessmentId`, `assessmentName` |
| `product.first_report_generated` | First executive report is generated for an org | `reportId`, `assessmentId` |

### Billing and Revenue

| Event | When it fires | Required payload |
|---|---|---|
| `billing.checkout_started` | Billing checkout route is invoked | `planCode`, `transition` |
| `billing.checkout_completed` | Checkout return successfully reconciles | `planCode`, `transition` |
| `billing.portal_opened` | Billing portal launch route is invoked | `source` |
| `revenue.upgrade_clicked` | Upgrade intent is triggered from billing flow | `fromPlanCode`, `toPlanCode`, `source` |
| `revenue.upgrade_completed` | Stripe-backed subscription sync confirms an upgrade | `fromPlanCode`, `toPlanCode` |

### Retention and Usage Pressure

| Event | When it fires | Required payload |
|---|---|---|
| `usage.limit_reached` | A hard threshold event reaches 100% | `metric`, `thresholdPercent`, `limit`, `used` |
| `billing.cancellation_scheduled` | Stripe sync confirms cancel-at-period-end | `planCode`, `accessEndsAt` |
| `billing.reactivated` | Stripe sync confirms restored paid access | `planCode` |

## Required Fields On Every Analytics Row

Every `ProductAnalyticsEvent` record includes:

- `id`
- `name`
- `category`
- `source`
- `payload`
- `occurredAt`
- `createdAt`

Optional context fields:

- `organizationId`
- `userId`
- `anonymousId`
- `sessionId`
- `path`
- `referrer`
- `billingPlanCode`
- `attribution`

## Implementation Pattern

### Database Layer

- Analytics events are stored in `ProductAnalyticsEvent`.
- The table is append-only from the application’s perspective.
- Records can be joined later to organizations, users, plans, and lead attribution.

### Shared Server Tracking

- `apps/web/lib/product-analytics.ts` contains the typed taxonomy and persistence helper.
- `trackProductAnalyticsEvent()` is the shared server-side write path.
- The helper accepts transactional Prisma clients so analytics can commit alongside the owning business change.

### Shared Client Tracking

- `apps/web/lib/product-analytics-client.ts` owns anonymous/session identity cookies and beacon delivery.
- `apps/web/components/page-analytics-tracker.tsx` is the one-shot page-view helper.
- `apps/web/components/tracked-cta-link.tsx` is the reusable homepage CTA tracker.

### Instrumentation Sources

- Marketing page interactions: client-side, once per session where appropriate.
- Signup completion, onboarding completion, first assessment, first report: server actions.
- Checkout start and billing portal open: billing routes.
- Upgrade completion, cancellation scheduling, reactivation: Stripe-synced billing service.
- Usage pressure: server actions when threshold events cross 100%.

## Vendor Integration Notes

The current implementation stores analytics in-app only. That is intentional.

Recommended export pattern later:

1. Keep `ProductAnalyticsEvent` as the canonical app event store.
2. Add a dispatcher that forwards selected events to Segment, PostHog, Mixpanel, or a warehouse.
3. Use the stored `id` or a derived idempotency key to avoid duplicate downstream sends.
4. Never make product behavior depend on downstream analytics vendor delivery.

Suggested vendor mapping:

- `name` -> analytics event name
- `category` -> event group
- `organizationId` -> account/workspace id
- `userId` -> user id
- `anonymousId` -> anonymous visitor id
- `sessionId` -> session id
- `billingPlanCode` -> plan property
- `attribution` -> campaign properties
- `payload` -> event-specific properties

## Dashboard Recommendations

Build a leadership dashboard around these slices:

- Acquisition: homepage CTA clicks, pricing views, signup starts
- Conversion: signup completed, onboarding completed, checkout started, checkout completed
- Activation: first assessment created, first report generated
- Expansion: upgrade clicked, upgrade completed, usage limit reached
- Retention risk: billing portal opened, cancellation scheduled, reactivated

Recommended views:

- Weekly funnel by source and requested plan
- Time-to-first-assessment and time-to-first-report cohorts
- Checkout start to checkout completion by plan and traffic source
- Upgrade completion by current plan, target plan, and placement source
- Usage-limit reached events by metric and plan family
- Cancellation scheduled and reactivation trends by cohort

## North Star Metric

Recommended north star metric:

**Weekly active organizations that generated or viewed an executive report**

Why this works:

- It ties directly to customer value, not vanity activity.
- It reflects activation and repeated usage.
- It correlates with retention, executive visibility, and expansion potential.
- It aligns with Evolve Edge’s positioning around compliance oversight and executive reporting.

## Top 10 Weekly Metrics Leadership Should Watch

1. Pricing page visitor-to-signup-start rate
2. Signup start-to-onboarding-complete rate
3. Onboarding complete-to-first-assessment-created rate
4. Onboarding complete-to-first-report-generated rate
5. Median time from signup start to first report generated
6. Checkout started-to-checkout completed rate by plan
7. Weekly active organizations with executive report activity
8. Upgrade click-to-upgrade completed rate
9. Usage limit reached count by metric and plan
10. Cancellation scheduled count and reactivation count

## How To Query This Layer Later

Easy first slices to build:

- `category = 'marketing'` for top-of-funnel behavior
- `name in ('signup.completed', 'onboarding.completed')` for conversion
- `name in ('product.first_assessment_created', 'product.first_report_generated')` for activation
- `name like 'billing.%' or name like 'revenue.%'` for monetization
- `name = 'usage.limit_reached'` for expansion pressure

## Future BI Expansion Suggestions

- Add derived org-level lifecycle snapshots such as `activatedAt`, `firstReportGeneratedAt`, and `firstUpgradeAt`.
- Materialize daily organization metrics for faster dashboards.
- Forward analytics rows to a warehouse for cohort and retention analysis.
- Add experiment ids once pricing and onboarding A/B testing begins.
- Track report views and executive-summary opens separately if leadership engagement becomes a stronger product signal.
- Add account health scoring that combines activity recency, report generation cadence, and billing risk signals.

## Files Changed

- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/20260411012000_product_analytics/migration.sql`
- `apps/web/lib/product-analytics.ts`
- `apps/web/lib/product-analytics-client.ts`
- `apps/web/components/page-analytics-tracker.tsx`
- `apps/web/components/tracked-cta-link.tsx`
- `apps/web/app/api/analytics/track/route.ts`
- `apps/web/app/page.tsx`
- `apps/web/app/pricing/page.tsx`
- `apps/web/app/sign-in/page.tsx`
- `apps/web/app/onboarding/actions.ts`
- `apps/web/app/dashboard/assessments/actions.ts`
- `apps/web/app/dashboard/reports/actions.ts`
- `apps/web/app/dashboard/settings/page.tsx`
- `apps/web/app/api/billing/checkout/route.ts`
- `apps/web/app/api/billing/portal/route.ts`
- `apps/web/app/billing/return/page.tsx`
- `apps/web/lib/billing.ts`
- `docs/phase-33-product-analytics.md`

## Commands To Run

```powershell
pnpm db:migrate
pnpm db:generate
Set-Location apps/web
.\node_modules\.bin\tsc.cmd --noEmit
```

## Notes For Future Editing

If you want to add or rename analytics events later:

1. Update `ProductAnalyticsEventMap` in `apps/web/lib/product-analytics.ts`
2. Update `PRODUCT_ANALYTICS_EVENT_CATEGORY`
3. Instrument the owning server action or route
4. Update this document and any downstream dashboard queries
