# Phase 30: In-App Upsell and Expansion Revenue Engine

## What existed

Before this phase, Evolve Edge had the core SaaS monetization layers in place:

- typed plan and entitlement architecture
- Stripe checkout and customer portal flows
- usage metering and limit visibility
- pricing and contact-sales pages

What was still missing was an in-app expansion layer:

- upsells were not resolved from a shared catalog
- upgrade prompts were mostly usage-warning oriented
- add-on motions did not have a reusable model
- there was no durable in-app tracking for upsell impressions and clicks
- there was no consistent way to show the right commercial path by page, role, and account maturity

## What changed

This phase adds a reusable expansion engine with three main parts.

### 1. Shared offer catalog and placement resolver

`apps/web/lib/expansion-engine.ts` now centralizes:

- offer types
- placement types
- account maturity classification
- add-on catalog copy
- plan-upgrade recommendation logic
- role-aware CTA resolution
- placement-specific offer selection

The engine currently supports:

- plan upgrades
- seat expansion hooks
- monitored asset expansion hooks
- premium report hooks
- premium support hooks
- white-glove onboarding hooks

### 2. Reusable tracked upsell UI

`apps/web/components/upsell-offer-stack.tsx` renders expansion offers in a consistent premium card layout and tracks:

- impressions
- CTA clicks

Tracking is sent to:

- `apps/web/app/api/upsell/track/route.ts`

That route records:

- `upsell.impression`
- `upsell.clicked`

as durable domain events and audit logs.

### 3. Contextual in-app placements

Offers now appear on the highest-intent product surfaces:

- dashboard overview
- assessments page
- reports page
- billing and settings page

The sales path was also upgraded:

- `apps/web/app/contact-sales/page.tsx` now accepts `intent` and `source`
- add-on and premium service hooks can land on a tailored contact experience

## Where upsells appear

### Dashboard

Primary trigger:

- top usage warning or exceeded limit

Secondary trigger:

- new user maturity
- admin-user maturity

Typical offers:

- plan upgrade
- white-glove onboarding
- premium support

### Assessments

Primary trigger:

- active assessment warning or limit reached

Secondary trigger:

- very early account maturity

Typical offers:

- plan upgrade for more assessment capacity
- white-glove onboarding

### Reports

Primary trigger:

- report or AI-processing usage pressure

Secondary trigger:

- missing executive review capability

Typical offers:

- plan upgrade
- premium report workflow upgrade
- premium report add-on conversation

### Billing and Settings

Primary trigger:

- seats nearing limit
- seats at limit
- monitored assets nearing limit
- monitored assets above the recommended envelope

Secondary trigger:

- owner/admin maturity
- early rollout support need

Typical offers:

- plan upgrade
- seat pack hook
- asset pack hook
- premium support
- white-glove onboarding

## What triggers them

The resolver uses:

- current workspace role
- current plan code
- Stripe-customer presence
- entitlement state
- usage metering state
- account maturity

Account maturity is currently classified as:

- `new_user`: very early product usage
- `active_user`: engaged product use without strong commercial pressure
- `limit_reached`: at least one warning or exceeded usage signal
- `admin_user`: owner or admin account without stronger pressure taking precedence

## How add-ons are modeled

Add-ons are currently modeled as catalog-driven commercial hooks, not Stripe subscription items.

This is intentional.

It enables:

- contextual in-app monetization now
- durable event tracking now
- safe routing into sales now
- future Stripe add-on billing later without changing page-level placements

Current add-on intents:

- `seat-pack`
- `asset-pack`
- `premium-reports`
- `premium-support`
- `white-glove-onboarding`
- `enterprise-expansion`

## What future monetization paths are now enabled

This architecture now supports future extension into:

- Stripe-backed add-on checkout
- usage-based expansion packaging
- custom enterprise commercial bundles
- premium support SLA packaging
- implementation / onboarding packages
- premium report deliverable packages
- account-maturity-based lifecycle campaigns
- A/B testing on offer ranking, copy, and placement density

## Configuration points

Main configuration lives in:

- `apps/web/lib/expansion-engine.ts`

The easiest sections to customize later are:

- `ADD_ON_CATALOG`
- `getUpsellAccountMaturity`
- `selectUpgradePlan`
- `getExpansionOffers`

Copy routing can also be customized in:

- `apps/web/app/contact-sales/page.tsx`

## Recommended upsell strategy by account maturity

### New user

Goal:

- reduce setup friction

Recommended motions:

- white-glove onboarding
- guided rollout support
- low-pressure, education-first copy

### Active user

Goal:

- attach premium reporting and support value to real workflow usage

Recommended motions:

- premium report hooks
- priority support hooks
- plan upgrade prompts only when the next plan adds clear value

### Limit-reached user

Goal:

- convert operational pain into expansion revenue quickly

Recommended motions:

- direct plan upgrade path
- seat pack hook
- monitored asset expansion hook
- enterprise expansion path when standard plans are insufficient

### Admin user

Goal:

- speak to ownership, rollout control, and support outcomes

Recommended motions:

- support tier upgrade
- plan governance upgrade
- rollout and implementation support

## File map

- `apps/web/lib/expansion-engine.ts`
- `apps/web/components/upsell-offer-stack.tsx`
- `apps/web/app/api/upsell/track/route.ts`
- `apps/web/lib/dashboard.ts`
- `apps/web/components/dashboard-shell.tsx`
- `apps/web/app/dashboard/assessments/page.tsx`
- `apps/web/app/dashboard/reports/page.tsx`
- `apps/web/app/dashboard/settings/page.tsx`
- `apps/web/app/contact-sales/page.tsx`

## Exact files changed

- `apps/web/lib/expansion-engine.ts`
- `apps/web/components/upsell-offer-stack.tsx`
- `apps/web/app/api/upsell/track/route.ts`
- `apps/web/lib/dashboard.ts`
- `apps/web/components/dashboard-shell.tsx`
- `apps/web/app/dashboard/assessments/page.tsx`
- `apps/web/app/dashboard/reports/page.tsx`
- `apps/web/app/dashboard/settings/page.tsx`
- `apps/web/app/contact-sales/page.tsx`

## Test checklist

1. Open the dashboard as a logged-in user with no meaningful usage and confirm only low-pressure onboarding or support offers appear.
2. Push a workspace near an assessment limit and confirm the assessments page shows an upgrade offer.
3. Push a workspace near a report or AI-run threshold and confirm the reports page shows a plan-aware reporting offer.
4. Push seat usage high enough to trigger a warning and confirm settings shows both upgrade and seat-pack paths.
5. Push monitored asset usage high enough to trigger a warning and confirm settings shows the asset-pack path.
6. Click a CTA and confirm `upsell.clicked` is written without breaking the navigation or form submit.
7. Refresh a page and confirm impressions are tracked idempotently per client-generated event ID.
8. Open a contact-sales link with `intent` and `source` and confirm the page copy adapts accordingly.

## Exact text copy sections that can be edited easily

The easiest copy blocks to edit are:

- `ADD_ON_CATALOG` in `apps/web/lib/expansion-engine.ts`
- the `title`, `body`, and `bullets` strings inside `getExpansionOffers`
- `getIntentContent` in `apps/web/app/contact-sales/page.tsx`
- the `title` and `description` props passed to `UpsellOfferStack` in each page

## Recommended upsell copy

Suggested short-form commercial framing:

- "Unlock more operating room without changing your governance workflow."
- "Expand capacity before this workspace becomes operationally constrained."
- "Add premium reporting support for stakeholder-ready deliverables."
- "Scale monitored asset coverage as production usage expands."
- "Move faster with priority support for recurring compliance operations."

## Suggested tier naming if current naming stays too generic

Current names are acceptable, but stronger SaaS naming options would be:

- `Growth` -> `Compliance Core`
- `Enterprise` -> `Governance Plus`

Or for a more executive tone:

- `Growth` -> `Operational`
- `Enterprise` -> `Executive`

If naming changes later, update:

- public pricing copy
- `REVENUE_PLAN_CATALOG`
- any outbound sales or investor messaging references

## Future A/B testing TODOs

- Test whether settings or dashboard is the better primary seat-expansion surface.
- Test whether report upsells convert better as capability language or outcome language.
- Test showing one offer versus two offers on dashboard for owner accounts.
- Test whether annual-upgrade framing outperforms enterprise-upgrade framing on `growth-monthly`.
- Test whether support-tier CTAs convert better as "priority support" or "faster response SLA".
