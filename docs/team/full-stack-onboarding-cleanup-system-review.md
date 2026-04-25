# Full-Stack Onboarding Prompt And Access Guide

Use this document to onboard a full-stack engineer for Evolve Edge cleanup and system review.

## Current Update Summary

Evolve Edge has recently moved further toward an app-owned control plane model.
The important current-state updates are:

- the Next.js app and Neon/Postgres are the source of truth for product logic, customer-visible state, routing, and audit lifecycle
- Stripe is billing authority only and now maps into app-owned canonical plans: `starter`, `scale`, `enterprise`
- the backend computes and persists routing decisions and dispatch records before n8n orchestration begins
- n8n is execution and callback orchestration only and must not infer pricing or routing policy
- the active AI path is app-owned OpenAI + LangGraph execution
- Dify is deprecated and retained only as a rollback path
- current cleanup focus is reducing drift between canonical domain rules and older compatibility layers that still exist in billing, routing, env naming, and integration contracts

The first system-review pass should focus on validating that these boundaries are actually enforced in code, configuration, and downstream contracts.

## Paste-Ready Onboarding Prompt

```text
You are onboarding to Evolve Edge as a full-stack engineer to perform a production-safe cleanup and system review.

Start from this operating model and do not break it:
- Next.js owns product logic and customer-visible state.
- Neon/Postgres is the system of record.
- Stripe is billing authority only.
- n8n is orchestration only.
- LangGraph is workflow orchestration only.
- OpenAI is model execution only.
- Dify is deprecated and should only remain as a temporary rollback path where compatibility code still exists.
- HubSpot is CRM projection only.
- Hostinger is brochure and top-of-funnel only.

Your first job is not to redesign the system. Your first job is to confirm where the current implementation still drifts from the intended architecture and then fix the highest-risk production-safe slice first.

Prioritize this review order:
1. Verify canonical commercial ownership and plan mapping:
   - confirm `starter`, `scale`, `enterprise` are the effective backend-owned commercial plans
   - identify any remaining legacy `growth`, monthly/annual, raw Stripe name inference, or duplicated plan logic
2. Review Stripe-to-app workflow initiation:
   - inspect `apps/web/app/api/stripe/webhook/route.ts`
   - inspect `apps/web/lib/billing.ts`
   - inspect `apps/web/lib/commercial-routing.ts`
   - inspect `apps/web/lib/workflow-routing.ts`
   - inspect `apps/web/lib/workflow-dispatch.ts`
   - confirm the app, not n8n, chooses workflow codes and routing hints
3. Review AI execution ownership:
   - inspect `apps/web/lib/ai-execution.ts`
   - inspect `apps/web/src/server/ai/providers/openai-langgraph.ts`
   - inspect `apps/web/src/server/ai/workflows/audit/graph.ts`
   - inspect `apps/web/lib/dify.ts`
   - confirm OpenAI + LangGraph is the active path and that AI outputs are normalized before persistence or customer-visible state changes
4. Review downstream integration boundaries:
   - confirm n8n payloads are normalized and execution-oriented
   - confirm HubSpot remains projection only
   - confirm deprecated Dify code is isolated and not silently owning runtime behavior
5. Review schema and migration safety:
   - inspect `packages/db/prisma/schema.prisma`
   - identify additive-safe cleanup opportunities and any risky production-facing drift

Deliverables for your first pass:
- a short written system review listing the top 5 risks or drift points
- the smallest safe cleanup slice you recommend addressing first
- one implemented fix if the slice is narrow enough to complete safely
- targeted tests for the changed path
- doc updates for anything architectural or operational that changes

Constraints:
- preserve working flows unless there is a clearly safer replacement implemented end to end
- prefer additive refactors over broad rewrites
- fail closed when mappings or required identifiers are missing
- keep tenant scoping explicit
- do not move business logic into Stripe, n8n, HubSpot, Hostinger, LangGraph, or OpenAI

Recommended first cleanup target:
Trace the paid workflow from Stripe webhook -> commercial mapping -> routing snapshot/decision -> workflow dispatch -> n8n callback/writeback -> AI execution handoff, and fix the highest-confidence source-of-truth drift you find in that chain first.
```

## What They Should Address First

The best first cleanup and review slice is:

- verify the paid-flow control path from Stripe webhook through routing and dispatch, because it is the highest-risk place where plan drift, workflow drift, and downstream contract drift can create real customer impact

More specifically, the engineer should first answer:

- are canonical plan codes the actual runtime decision source everywhere that matters
- are routing snapshots and workflow dispatch records durable and auditable
- is any downstream system still inferring plan or workflow behavior from raw Stripe fields or legacy names
- is AI execution fully app-owned with validated outputs before state changes
- do tests cover the launch-critical path strongly enough to trust cleanup work

If they need one narrow first implementation slice, give them this:

- remove or isolate one high-risk legacy compatibility path in billing or routing that can cause plan/workflow drift, then add targeted tests and update the related doc/runbook

## Access To Grant

Grant access in two stages.

### Day-One Required Access

This is the minimum useful access for cleanup and system review:

- GitHub repository access with pull request permissions
- local environment setup materials: `.env.example`, setup commands, seed/migration workflow
- Vercel access for project settings, deployments, runtime logs, and preview environments
- Neon access with ability to inspect schema, run safe queries, and understand migration state
- password manager or secret vault access for non-production shared credentials
- read access to Stripe so they can inspect products, prices, events, and webhook configuration
- read access to n8n so they can inspect workflows, webhooks, payload mappings, and execution logs
- read access to HubSpot only if the current review slice touches CRM projection or report-delivery sync
- access to runbooks and system docs in `docs/`
- communication access for incident escalation and async updates

### Access To Add Once They Start Making Changes

Add this after they understand the system and are actively implementing fixes:

- Vercel permission to manage preview environment variables and redeploy preview builds
- Neon permission to run migration-safe changes in non-production environments
- n8n permission to edit preview or sandbox workflows
- Stripe test-mode write access if they need to validate mapping or webhook behavior safely
- OpenAI key access for preview or sandbox validation if they are testing the active AI path

### Production Access Recommendation

Do not start them with broad production admin.

Recommended production posture for onboarding:

- GitHub: standard contributor access
- Vercel: production logs and deployment visibility first, promote to deploy permission only when needed
- Neon: production read access first, schema change authority only through reviewed migrations
- Stripe: production read-only first
- n8n: production read-only first
- HubSpot: production read-only only if needed for the current slice
- secrets: least privilege, only the environments they actively support

### Access They Probably Do Not Need On Day One

- direct production secret rotation authority
- direct production database write access outside normal app and migration workflows
- billing-admin authority in Stripe
- unrestricted HubSpot admin access
- Hostinger access unless the work specifically touches brochure-site sync or top-of-funnel copy alignment

## Exact Access Checklist To Send Internally

- GitHub repo access to `evolve-edge-saas`
- Vercel project access for preview and production visibility
- Neon project access for schema and query inspection
- Stripe dashboard access:
  - test mode read/write
  - production read-only
- n8n access:
  - preview or sandbox edit access
  - production read-only
- secret manager access for non-production app secrets
- `OPENAI_API_KEY` access for preview or sandbox only if AI validation is part of the assigned slice
- HubSpot read access only if reviewing CRM projection or delivery-state sync
- docs and runbook access
- incident escalation path
- clear statement of who approves production changes

## Suggested First-Week Direction

- Day 1: read the architecture and phase docs, review the high-risk modules, set up local, and write a short drift/risk summary
- Day 2: choose one narrow paid-flow or routing cleanup slice and confirm the implementation sequence
- Day 3-4: implement the change, add targeted tests, and verify locally against the critical path
- Day 5: update docs, record what still needs live validation, and propose the next narrow slice

## Primary Files And Docs To Start With

Code:

- `apps/web/app/api/stripe/webhook/route.ts`
- `apps/web/lib/billing.ts`
- `apps/web/lib/commercial-routing.ts`
- `apps/web/lib/workflow-routing.ts`
- `apps/web/lib/workflow-dispatch.ts`
- `apps/web/lib/ai-execution.ts`
- `apps/web/src/server/ai/providers/openai-langgraph.ts`
- `apps/web/src/server/ai/workflows/audit/graph.ts`
- `apps/web/lib/dify.ts`
- `apps/web/lib/hubspot.ts`
- `packages/db/prisma/schema.prisma`

Docs:

- `docs/phase-61-plan-aware-routing-snapshots.md`
- `docs/phase-62-backend-commercial-routing-layer.md`
- `docs/phase-63-canonical-alignment-audit.md`
- `docs/migrations/openai-langgraph-ai-execution.md`
- `docs/team/engineering-access-checklist.md`
- `docs/team/first-week-milestone-brief.md`

## Owner Notes

Tell the engineer this explicitly:

- cleanup should improve reliability and clarity, not create a surprise architecture rewrite
- production-safe backend cleanup is more valuable than broad surface-level refactoring
- if they find drift, they should isolate and document it before expanding scope
- every meaningful change should include tests, docs, and a note about remaining live validation
