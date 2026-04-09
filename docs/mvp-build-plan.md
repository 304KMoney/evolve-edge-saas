# Evolve Edge SaaS MVP Build Plan

## Chosen architecture

Tradeoff:
- A split frontend + backend can be cleaner long term.
- For MVP, a single Next.js app with service modules is faster and easier to operate.

Decision:
- Use a monorepo with `apps/web` as the primary product app.
- Keep product state in Postgres.
- Treat Dify and n8n as temporary external workers, not the source of truth.

## Phase 1

- Bootstrap monorepo
- Finalize database schema
- Add auth and organizations
- Add Stripe subscription sync
- Build onboarding and dashboard shell

## Phase 2

- Build assessment intake
- Add file uploads and evidence records
- Add analysis jobs and report generation pipeline
- Add findings and recommendations views

## Phase 3

- Add internal admin console
- Add notifications and audit logs
- Add recurring reassessment workflows
- Reduce n8n responsibility to integration-only workflows

## Route map

- `/` marketing homepage
- `/pricing`
- `/sign-in`
- `/sign-up`
- `/onboarding`
- `/dashboard`
- `/dashboard/assessments`
- `/dashboard/reports`
- `/dashboard/roadmap`
- `/dashboard/settings`
- `/admin`

