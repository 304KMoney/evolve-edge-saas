# Harshay Day-One Package

Use this package to onboard Harshay as a full stack engineer working on the
final launch-critical slice of Evolve Edge.

This package assumes the NDA is already signed.

## What You Need To Provide Before Day One

### 1. Written role and success context

Provide Harshay with:

- role title: `Full Stack Engineer`
- engagement type: employee or contractor
- working cadence and expected weekly hours
- reporting line
- expected async communication cadence
- first 2-week success definition

Recommended wording:

> Your goal is to help Evolve Edge safely complete the remaining launch-critical
> work required to support the first paying client. This is not a rewrite role.
> Success means tightening reliability, operator visibility, test coverage, and
> launch readiness without changing source-of-truth boundaries.

### 2. Access package

Provide working access to:

- GitHub repository
- Vercel project
- Neon database project
- Stripe dashboard
- n8n instance
- Dify workspace
- HubSpot workspace, if applicable
- shared password manager or credential vault
- company email and calendar, if applicable
- shared chat tool
- issue tracker or task tracker

Do not send credentials in scattered messages. Use one secure vault and one
written access checklist.

### 3. Local environment setup material

Provide:

- the repo URL
- the expected Node and package manager setup
- `.env` population instructions
- which secrets are required locally versus only in hosted environments
- the commands to install, generate Prisma, migrate, seed, typecheck, and test

### 4. Architecture boundaries

Make sure Harshay receives these non-negotiable rules on day one:

- the Next.js app owns product logic and customer-visible state
- Neon/Postgres is the canonical persistence layer
- Stripe is billing authority and payment-event source only
- n8n is orchestration and async execution only
- Dify is AI execution only
- HubSpot is CRM projection only
- Hostinger is brochure and top-of-funnel only

### 5. Commercial model

Provide the canonical commercial model:

- plans:
  - `starter`
  - `scale`
  - `enterprise`
- workflow codes:
  - `audit_starter`
  - `audit_scale`
  - `audit_enterprise`
  - `briefing_only`
  - `intake_review`

Also state clearly:

- Stripe identifiers must map through backend-owned plan mapping
- no raw Stripe product-name or price-name inference downstream

### 6. Launch-critical documents

Give Harshay these docs first:

- [Evolve Edge Contractor Launch Scope](/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/docs/contractor-launch-scope.md)
- [Launch Environment Readiness](/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/docs/launch-environment-readiness.md)
- [First-Customer Launch Checks](/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/docs/first-customer-launch-checks.md)
- [End-To-End Paid Flow Smoke Test](/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/docs/end-to-end-paid-flow-smoke-test.md)
- [How To Operate The Platform](/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/docs/how-to-operate-platform.md)

### 7. High-risk code areas

Tell Harshay to read these carefully before making edits:

- `apps/web/app/api/stripe/webhook/route.ts`
- `apps/web/lib/billing.ts`
- `apps/web/lib/commercial-routing.ts`
- `apps/web/lib/workflow-routing.ts`
- `apps/web/lib/workflow-dispatch.ts`
- `apps/web/lib/dify.ts`
- `apps/web/lib/hubspot.ts`
- `packages/db/prisma/schema.prisma`

## What Harshay Should Have By End Of Day One

- repo access confirmed
- local app booted or blockers documented
- required docs read
- architecture boundaries understood
- first milestone agreed in writing
- first narrow launch-critical slice selected
- daily update format agreed

## Day-One Founder Agenda

Use this agenda for the first call:

1. Explain the company, offer, and current launch stage in 5 minutes.
2. Explain architecture boundaries in 5 minutes.
3. Walk through the first paying client path in 10 minutes:
   - pricing
   - checkout
   - webhook
   - reconciliation
   - routing
   - workflow dispatch
   - writeback
   - report visibility
   - operator recovery
4. Explain what is in scope for the first 2 weeks in 10 minutes.
5. Confirm access and environment setup expectations in 10 minutes.
6. End with the first concrete milestone and update cadence in 5 minutes.

## Founder Notes

Harshay does not need a huge handbook on day one.

He does need:

- one clear mission
- one narrow first milestone
- one secure way to access systems
- one place to find the launch docs
- one communication rhythm

Anything beyond that should support speed and clarity, not create noise.
