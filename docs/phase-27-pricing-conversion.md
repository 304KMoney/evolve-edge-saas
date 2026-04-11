# Phase 27: Pricing Page + Conversion Path Optimization

## Overview

Phase 27 introduces a real pricing and conversion surface for Evolve Edge instead of relying on an internal billing settings page as the only plan-selection experience.

The implementation now includes:

- a public `/pricing` page
- interval-aware plan presentation
- plan-selection persistence across sign-in and onboarding
- clearer CTA routing based on account state
- a premium comparison layout with trust-centered positioning
- a secondary `/contact-sales` path for guided enterprise conversion

## What Existed Before

Before this phase:

- the homepage was a minimal SaaS-foundation stub
- there was no public pricing page
- the primary plan-selection UI existed only inside authenticated workspace settings
- conversion routing did not preserve plan intent through sign-in and onboarding
- there was no dedicated contact/demo path for larger buyers

## Page Structure

The pricing experience is now structured as:

1. Sticky header
   - home link
   - sign-in or workspace CTA

2. Pricing hero
   - positioning headline
   - trust badges
   - current-session pricing state box

3. Billing interval toggle
   - monthly / annual
   - annual defaults when available

4. Plan cards
   - premium two-column layout
   - strong recommended-plan hierarchy
   - price, limits, included value, CTA, and helper copy

5. Trust signal section
   - compliance-focused by design
   - executive reporting included
   - ongoing monitoring posture

6. Feature comparison table
   - capability rows that map to actual product plan features and limits

7. FAQ
   - short friction-reducing answers

8. Secondary conversion block
   - contact sales / executive walkthrough path
   - direct email path

## Conversion Rationale

The new page is designed to convert more like a serious B2B SaaS motion because it now:

- gives buyers a clear self-serve evaluation path
- makes annual the default high-intent choice
- surfaces a clear recommended option
- separates self-serve purchase from guided enterprise conversations
- preserves plan selection into sign-in and onboarding
- adapts CTA behavior for anonymous, onboarding, and existing customers
- shows “current plan” state for authenticated users
- anchors messaging in compliance, risk reduction, and executive trust instead of generic SaaS language

## CTA Routing Map

### Anonymous visitor

- Primary plan CTA
  - `/sign-in?redirectTo=/onboarding?plan={planCode}`
- Secondary CTA
  - `/contact-sales`

### Signed in, onboarding not finished

- Primary plan CTA
  - `/onboarding?plan={planCode}`

### Signed in, existing workspace owner

- Current plan CTA
  - `/api/billing/portal` if Stripe customer exists
  - otherwise `/dashboard/settings`

- New plan CTA
  - `/api/billing/checkout` with selected `planCode`

### Signed in, non-owner workspace member

- Billing CTA
  - `/dashboard/settings`
  - copy explains that only owners can change billing

### Contact / demo path

- `/contact-sales`
- email CTA uses `NEXT_PUBLIC_SALES_CONTACT_EMAIL`

## Monthly / Yearly Support

The pricing architecture now supports both intervals because the typed revenue catalog was expanded to include:

- `growth-monthly`
- `growth-annual`
- `enterprise-monthly`
- `enterprise-annual`

Annual remains the default selected interval in the UI when both intervals are available.

## Recommended Pricing Copy

### Hero headline

`Choose the operating model for AI governance that executives will actually trust.`

### Hero body

`Evolve Edge helps regulated teams reduce AI risk, produce decision-ready reporting, and keep compliance programs moving without turning every review into a services engagement.`

### Growth positioning

`For lean compliance teams that need recurring governance discipline without heavyweight services.`

### Enterprise positioning

`For larger regulated programs that need broader coverage, executive workflows, and faster stakeholder alignment.`

### Annual savings message

`Save 20% on annual billing`

### Secondary CTA

`Book an executive walkthrough`

## Suggested Tier Naming

The current naming is workable, but stronger premium naming options for future tests:

- `Growth` -> `Compliance Core`
- `Enterprise` -> `Executive Assurance`

If you adopt those later, the strongest place to change the public label is the revenue catalog while keeping internal plan codes stable.

## What Can Be Customized Later

The easiest editing points are now centralized:

### Pricing hero, trust signals, FAQ, and reusable CTA labels

- `apps/web/lib/pricing-content.ts`

### Plan pricing, descriptions, limits, Stripe mappings, and recommendation metadata

- `apps/web/lib/revenue-catalog.ts`

### CTA behavior rules

- `apps/web/lib/pricing.ts`

### Public pricing layout and styling

- `apps/web/components/pricing-page.tsx`

### Contact/demo messaging

- `apps/web/app/contact-sales/page.tsx`

## Exact Text Copy Sections That Can Be Edited Easily

Edit in `apps/web/lib/pricing-content.ts`:

- `PRICING_HERO`
- `PRICING_TRUST_SIGNALS`
- `PRICING_FAQ`
- `PRICING_COPY_BLOCKS`

Edit in `apps/web/lib/revenue-catalog.ts`:

- plan `name`
- plan `description`
- plan `publicDescription`
- `adminMetadata.targetBuyer`
- `adminMetadata.recommendedFor`

## TODOs For Future A/B Testing

- Test annual-first vs monthly-first default interval
- Test Growth Annual vs Enterprise Annual as the visible recommendation badge
- Test `Start the 14-day trial` vs `Start with Growth` CTA copy
- Test trust badges above vs below the pricing cards
- Test contact-sales block mid-page vs end-page
- Test alternate enterprise naming like `Executive Assurance`
- Test whether showing exact monthly-equivalent math improves annual conversion

## Exact Files Changed

- `apps/web/app/page.tsx`
- `apps/web/app/pricing/page.tsx`
- `apps/web/app/contact-sales/page.tsx`
- `apps/web/app/sign-in/page.tsx`
- `apps/web/app/sign-in/actions.ts`
- `apps/web/app/onboarding/page.tsx`
- `apps/web/app/onboarding/actions.ts`
- `apps/web/components/pricing-page.tsx`
- `apps/web/lib/auth.ts`
- `apps/web/lib/pricing.ts`
- `apps/web/lib/pricing-content.ts`
- `apps/web/lib/revenue-catalog.ts`
- `apps/web/lib/runtime-config.ts`
- `.env.example`
- `docs/phase-27-pricing-conversion.md`

## Exact Text / Env That May Need Editing

### Sales contact email

```env
NEXT_PUBLIC_SALES_CONTACT_EMAIL="sales@evolveedge.ai"
```

### Stripe price IDs for interval support

```env
STRIPE_PRICE_GROWTH_MONTHLY=""
STRIPE_PRICE_GROWTH_ANNUAL=""
STRIPE_PRICE_ENTERPRISE_MONTHLY=""
STRIPE_PRICE_ENTERPRISE_ANNUAL=""
```

## Exact Commands To Run

```powershell
pnpm db:generate
Set-Location apps/web
.\node_modules\.bin\tsc.cmd --noEmit
```
