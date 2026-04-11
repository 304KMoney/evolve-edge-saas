# Hostinger Site Sync Guide

Use this guide to keep the Hostinger marketing site aligned with the backend-owned commercial model without moving plan logic into Hostinger.

## Ownership boundaries

### Backend-owned

The Evolve Edge application owns:

- public plan codes
- display names
- public pricing
- CTA intent and routing rules
- workflow codes
- billing and entitlement logic

Stripe remains billing authority, but the app owns the commercial model exposed to the website.

### Hostinger-owned

Hostinger owns presentation only:

- page layout
- marketing copy rendering
- visual presentation
- CTA placement

Hostinger must not own:

- plan resolution
- checkout logic
- billing logic
- workflow routing logic
- entitlement logic

## Canonical sync sources

Use these as the current source set:

- [commercial-catalog.ts](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\apps\web\lib\commercial-catalog.ts)
- [hostinger-commercial-reference.md](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\docs\hostinger-commercial-reference.md)
- [hostinger-ai-website-copy-reference.md](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\docs\hostinger-ai-website-copy-reference.md)
- internal export route:
  - `/api/internal/commercial/site-reference`

## Internal export route

The app now exposes a protected operator reference route:

- `GET /api/internal/commercial/site-reference`

Authentication:

- bearer token via `COMMERCIAL_REFERENCE_SECRET`

Purpose:

- operator reference only
- manual publishing aid
- copy-validation source for Hostinger updates

This route is not a public business-logic delegation surface.

## What the export contains

The site reference export includes:

- canonical public plans
- canonical display names
- canonical public prices
- canonical CTA targets
- safe Hostinger entry URLs
- workflow codes for reference
- compatibility notes
- operator publishing checklist

## Publishing workflow

1. Confirm pricing and CTA changes in the backend-owned catalog first.
2. Review [hostinger-commercial-reference.md](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\docs\hostinger-commercial-reference.md).
3. Review [hostinger-ai-website-copy-reference.md](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\docs\hostinger-ai-website-copy-reference.md).
4. Optionally fetch the internal export route and compare the JSON output to the website draft.
5. Update Hostinger content.
6. Verify CTA destinations and plan names before publishing.

## What must be updated when pricing changes

When pricing, naming, or CTA routing changes, update these together:

- [commercial-catalog.ts](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\apps\web\lib\commercial-catalog.ts)
- [pricing.ts](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\apps\web\lib\pricing.ts)
- [hostinger-commercial-reference.md](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\docs\hostinger-commercial-reference.md)
- [hostinger-ai-website-copy-reference.md](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\docs\hostinger-ai-website-copy-reference.md)
- [hostinger-site-sync-guide.md](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\docs\hostinger-site-sync-guide.md) if the workflow changes
- `.env.example` if required env/config changes

## Operator consistency checklist

Before publishing Hostinger changes, confirm:

- `Starter`, `Scale`, and `Enterprise` are the only public plan names shown
- `Growth` does not appear in public website copy
- Starter price is `$2,500 one-time`
- Scale price is `$7,500 one-time`
- Enterprise is `Custom`
- Starter CTA points to the app-owned Starter entry flow
- Scale CTA points to the app-owned Scale entry flow
- Enterprise CTA points to contact sales only
- No monthly or annual toggle language appears publicly
- No website copy implies Hostinger owns checkout, entitlement, or workflow logic
- No website copy implies n8n, Dify, or HubSpot owns commercial logic

## Deferred items

Still intentionally deferred:

- Hostinger automation that writes back into the app
- direct Hostinger-driven plan provisioning
- any Hostinger role in entitlement decisions
- exposing raw Stripe price IDs or internal revenue plan names to the marketing site
