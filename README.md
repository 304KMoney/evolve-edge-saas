# Evolve Edge SaaS MVP

Initial implementation scaffold for the Evolve Edge SaaS MVP.

## Stack choice

- Frontend: Next.js 15 + TypeScript + Tailwind CSS
- Backend pattern: Next.js app + server-side services for MVP
- Database: PostgreSQL + Prisma
- Auth: Clerk (recommended, not yet wired in this scaffold)
- Billing: Stripe Billing (temporary external system of record for invoices)
- Jobs: Trigger.dev or Inngest (not yet wired in this scaffold)

## Why this stack

- Faster MVP delivery than splitting frontend and backend too early
- Strong path to multi-tenant SaaS scale
- Clear separation between product code and temporary integrations

## Repo layout

- `apps/web` customer-facing SaaS app
- `apps/admin` internal operations console
- `packages/db` Prisma schema, migrations, seed data
- `packages/ui` shared UI components
- `packages/config` shared TypeScript and lint config
- `docs` architecture, route maps, implementation plans

## Immediate next steps

1. Install dependencies with `pnpm install`
2. Create a Postgres database
3. Add `.env` values for `DATABASE_URL`
4. Run `pnpm db:generate`
5. Run `pnpm dev`
6. Open `/dashboard`

