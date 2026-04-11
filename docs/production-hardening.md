# Production Hardening Notes

## Deployment defaults

- Run `pnpm db:generate` after dependency changes that affect Prisma client output.
- Run `pnpm db:migrate:deploy` in Vercel or CI before promoting a new web build.
- Keep `AUTH_MODE=password` in production. Demo mode is for internal previews only.
- Configure `NEXT_PUBLIC_APP_URL` with the canonical production domain so invites and billing return URLs are correct.

## Required production environment variables

- `DATABASE_URL`
- `NEXT_PUBLIC_APP_URL`
- `AUTH_MODE`
- `AUTH_ACCESS_EMAIL`
- `AUTH_ACCESS_PASSWORD`
- `DEFAULT_PLAN_CODE`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_GROWTH_ANNUAL`
- `STRIPE_PRICE_ENTERPRISE_ANNUAL`

## Seed data posture

- Seed variables remain available for local bootstrap and demo workspaces.
- Seed content should not be the primary customer path in production.
- Keep demo accounts isolated from real customer tenants.

## Logging and visibility

- Stripe webhook failures now emit structured server logs.
- Dashboard data fallbacks now emit structured server logs.
- Notifications inside the product act as lightweight admin visibility for onboarding, billing, inventory, assessment, and report events.

## Repo cleanup recommended next

- Move pitch decks, PDFs, videos, and brainstorming assets out of the deploy repo.
- The current root-level media files significantly increase repository noise and sync overhead.
- Recommended destinations:
  - a separate `brand-assets` or `sales-assets` repository
  - a cloud drive folder referenced from the README
  - a dedicated `/docs/assets` folder only if those files are truly required for engineering work
