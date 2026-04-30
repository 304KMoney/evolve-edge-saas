# Evolve Edge — Engineer Handoff Package

**Prepared:** April 27, 2026
**Branch:** `codex-launch-hardening-handoff`
**Prepared by:** AI Operating Partner (Genspark Claw)
**Audience:** Incoming full-stack engineer

---

## 1. What Is Evolve Edge?

Evolve Edge is a Next.js SaaS control plane for AI security, compliance, audit
delivery, and customer operations. It is a founder-led product targeting
executive buyers who need AI governance, risk assessment, and audit delivery in
one trusted surface.

The product is approaching first-customer launch. The codebase is architecturally
mature, TypeScript-clean, and fully wired for production integrations. One hard
blocker (Stripe live key) stands between the current state and the first paying
customer.

---

## 2. Architecture & Source-of-Truth Boundaries

These boundaries are non-negotiable. Every engineer decision must preserve them.

| System | Role | What It Must Never Own |
|--------|------|------------------------|
| **Next.js (apps/web)** | Product logic, customer-visible state, lifecycle truth | — |
| **Neon/Postgres** | Canonical persistence (via Prisma) | — |
| **Stripe** | Billing authority, payment-event source only | Entitlements, plan routing, product state |
| **n8n** | Orchestration and async execution only | Pricing, routing decisions, audit status |
| **LangGraph** | AI workflow sequencing only | Business logic, lifecycle state |
| **OpenAI** | Model execution only | Any persistence or routing |
| **HubSpot** | CRM projection only | Customer lifecycle truth |
| **Dify** | Deprecated — rollback path only | Do not route new state through Dify |
| **Hostinger** | Brochure/top-of-funnel only | No product state |
| **Apollo** | Enrichment-only via n8n/operator tooling | App lifecycle, product state |

### Commercial Model

- Plans: `starter`, `scale`, `enterprise`
- Workflow codes: `audit_starter`, `audit_scale`, `audit_enterprise`, `briefing_only`, `intake_review`
- Stripe Price/Product IDs map through explicit backend mappings in `lib/revenue-catalog.ts` and `lib/commercial-catalog.ts`
- Never infer internal plans from raw Stripe product or price names downstream

### Production AI Execution Path

```
n8n → POST /api/internal/ai/execute
    → Next.js queues AnalysisJob
    → scheduled worker runs LangGraph
    → OpenAI
    → validated structured output
    → Neon-backed persistence
```

### Report Lifecycle

```
generated → pending_review → approved/rejected → delivered
```

After delivery: app queues customer email, 3-day and 7-day follow-ups,
refreshes expansion opportunities, projects delivery status to HubSpot.

---

## 3. Repo Structure (Key Paths)

```
evolve-edge-saas/
├── apps/web/                      ← Next.js app (App Router)
│   ├── app/                       ← Route handlers & pages
│   │   ├── admin/                 ← Operator control plane
│   │   ├── api/                   ← All API routes
│   │   │   ├── stripe/webhook/    ← HIGH RISK — do not modify lightly
│   │   │   ├── internal/          ← Internal/cron/job routes
│   │   │   └── fulfillment/       ← Health & dispatch-health
│   │   └── dashboard/             ← Customer-facing app
│   ├── lib/                       ← Core business logic
│   │   ├── billing.ts             ← HIGH RISK
│   │   ├── commercial-routing.ts  ← HIGH RISK
│   │   ├── workflow-routing.ts    ← HIGH RISK
│   │   ├── workflow-dispatch.ts   ← HIGH RISK
│   │   ├── ai-execution.ts        ← HIGH RISK
│   │   ├── customer-accounts.ts   ← Manual sales control plane
│   │   ├── hubspot.ts             ← CRM projection only
│   │   ├── n8n.ts                 ← n8n dispatch wiring
│   │   └── integration-status.ts  ← Wiring snapshot
│   ├── src/server/ai/
│   │   ├── providers/openai-langgraph.ts  ← HIGH RISK
│   │   └── workflows/audit/graph.ts       ← HIGH RISK
│   ├── scripts/                   ← Preflight, integration-status, env-status
│   ├── test/                      ← Vitest tests
│   ├── instrumentation.ts         ← Sentry (properly gated, env-driven)
│   ├── sentry.server.config.ts    ← Sentry server (sendDefaultPii: false)
│   ├── sentry.edge.config.ts      ← Sentry edge
│   └── next.config.ts             ← Next.js config (Sentry optional, env-gated)
├── packages/db/
│   └── prisma/
│       ├── schema.prisma          ← HIGH RISK — canonical data model
│       └── migrations/            ← Never edit manually
├── docs/                          ← All runbooks and architecture docs
│   ├── launch-environment-readiness.md  ← READ FIRST
│   ├── manual-sales-control-plane.md
│   └── team/                      ← Engineer access docs
└── scripts/                       ← Repo-root scripts (env validation etc.)
```

---

## 4. High-Risk Files — Read Before Touching

Before modifying any of these, read the surrounding code and run
`tsc --noEmit` plus focused tests:

| File | Why High Risk |
|------|---------------|
| `apps/web/app/api/stripe/webhook/route.ts` | Stripe event handling — idempotency, livemode check, billing truth |
| `apps/web/lib/billing.ts` | Subscription lifecycle, Stripe plan resolution (1300+ lines) |
| `apps/web/lib/commercial-routing.ts` | Plan entitlement resolution — never infer from raw Stripe names |
| `apps/web/lib/workflow-routing.ts` | Workflow code routing per plan |
| `apps/web/lib/workflow-dispatch.ts` | n8n dispatch logic and stale recovery |
| `apps/web/lib/ai-execution.ts` | AI job queueing and concurrency limits |
| `apps/web/src/server/ai/providers/openai-langgraph.ts` | LangGraph/OpenAI execution |
| `apps/web/src/server/ai/workflows/audit/graph.ts` | Audit workflow graph |
| `apps/web/lib/dify.ts` | Deprecated — do not re-enable routing |
| `apps/web/lib/hubspot.ts` | CRM projection — never make authoritative |
| `packages/db/prisma/schema.prisma` | Canonical schema — migrations must be explicit |

---

## 5. Local Development Setup

### Prerequisites

- Node.js 22+
- pnpm 10.8.1 (`npm install -g pnpm@10.8.1`)
- Git
- Access to the secret vault (see Section 8)

### Steps

```bash
# 1. Clone
git clone https://github.com/304KMoney/evolve-edge-saas.git
cd evolve-edge-saas

# 2. Install dependencies
pnpm install

# 3. Populate env (from vault — do NOT copy founder's .env)
cp .env.example .env.local
# Fill in development/preview values from the shared vault

# 4. Generate Prisma client
pnpm db:generate

# 5. Validate env coverage
pnpm ci:env:validate

# 6. Start dev server
pnpm dev
```

### Key Development Commands

| Command | What It Does |
|---------|-------------|
| `pnpm dev` | Start all packages in dev mode |
| `pnpm typecheck` | Run TypeScript across the monorepo |
| `pnpm lint` | ESLint across all packages |
| `pnpm test` | Run Vitest test suite |
| `pnpm integration:status` | Check wiring snapshot (presence only) |
| `pnpm preflight:first-customer:env` | Check required env coverage |
| `pnpm preflight:first-customer` | Run launch safety checks |
| `pnpm db:generate` | Regenerate Prisma client after schema changes |
| `pnpm db:migrate:deploy` | Deploy migrations (staging/prod only) |

### Direct TypeScript Check (avoids Turbo electron issue)

```powershell
cd apps/web
.\node_modules\.bin\tsc.cmd --noEmit
```

---

## 6. Current Branch State

**Branch:** `codex-launch-hardening-handoff`
**Status as of April 27, 2026:** 2 commits ahead of origin (push is pending — see Section 9)

### Recent commit history

| SHA | Description |
|-----|-------------|
| `0ab6f77` | Hardening: Sentry cleanup, Apollo docs, Harshay handoff, launch readiness updates |
| `8279585` | Clarify first-customer launch readiness and sales plan |
| `c22e00b` | Fix typed redirect in start action |
| `627f6cb` | Harden report export state and add pricing access flow |
| `28bb0e2` | Harden preview routing, evidence uploads, and handoff docs |

### What today's session did

1. **Verified** full preflight chain: `integration:status` ✅, `preflight:first-customer:env` ✅, `tsc --noEmit` ✅
2. **Removed** root-level Sentry wizard contamination — 5 auto-generated JS files and a
   `pages/` directory that were created at the wrong monorepo level. They contained
   hardcoded DSNs, `sendDefaultPii: true`, and a public error-trigger page. The proper
   Sentry config in `apps/web/` is intact and production-safe.
3. **Committed** all legitimate uncommitted work: Apollo docs, Harshay handoff,
   doc updates, `.codex/` Apollo MCP config, lockfile.
4. **Identified** one hard launch blocker (Stripe live keys — see Section 7).
5. **Identified** a git history issue (see Section 9) that is blocking the push.

---

## 7. Launch Blockers (Ordered by Priority)

### 🔴 BLOCKER 1 — Stripe Test Keys in Production (Hard No-Go)

**Error:** `stripe.test_mode_configured_for_production`

The Vercel production environment has `STRIPE_SECRET_KEY=sk_test_...`.
The preflight check fails hard on this because charging a real customer with test
keys silently fails — no real money moves, no subscription is created.

**Fix (operator step — requires Stripe dashboard access):**

1. Go to [Stripe Dashboard](https://dashboard.stripe.com) → toggle to **Live mode**
2. Developers → API keys → copy `sk_live_...` secret key
3. In [Vercel](https://vercel.com) → your project → Settings → Environment Variables:
   - `STRIPE_SECRET_KEY` → live secret key (`sk_live_...`)
   - `STRIPE_WEBHOOK_SECRET` → signing secret from your **live** Stripe webhook endpoint
   - Verify these are all **live mode** IDs (from the Live tab in Stripe):
     - `STRIPE_PRICE_STARTER_ANNUAL`
     - `STRIPE_PRICE_SCALE_ANNUAL`
     - `STRIPE_PRICE_ENTERPRISE_ANNUAL`
     - `STRIPE_PRODUCT_STARTER`
     - `STRIPE_PRODUCT_SCALE`
     - `STRIPE_PRODUCT_ENTERPRISE`
4. Redeploy the Vercel project
5. Run `pnpm preflight:first-customer` — it should pass clean

**Verification:** After redeploy, run one Stripe test flow:
- Submit a real checkout (or use Stripe CLI: `stripe trigger checkout.session.completed`)
- Confirm `BillingEvent`, `RoutingSnapshot`, and `WorkflowDispatch` rows are created in Neon
- Confirm webhook signature validation passes (400 on bad signature)

---

### 🟡 NEEDED — Git History Cleanup (Secrets in a Prior Commit)

**Issue:** Commit `8279585` accidentally included `.tmp-preview-env-*` files
(Vercel env pulls) that contain a HubSpot API key and Stripe test secret key.
GitHub Push Protection is blocking the push until this is resolved.

**Fix options:**

**Option A — Rewrite history (recommended, cleanest):**
```bash
# Interactively rebase from the commit before the bad one
git rebase -i c22e00b

# In the editor: change "pick 8279585" → "edit 8279585"
# Git will pause at that commit. Then:
git rm --cached .tmp-preview-env-current .tmp-preview-env-pull \
  .tmp-preview-env-pull-after .tmp-preview-env-pull-after-final \
  .tmp-preview-env-pull-now .npm-cache/
git commit --amend --no-edit
git rebase --continue
git push --force-with-lease origin codex-launch-hardening-handoff
```

**Option B — GitHub bypass (not recommended):**
GitHub provides bypass URLs in the push error. Using them publishes the secrets
to GitHub's servers. Only use this if the secrets have already been rotated.

**After any option — ROTATE these credentials immediately:**
- HubSpot API key (found in `.tmp-preview-env-current`)
- Stripe test secret key (same files — already test-mode, but still rotate it)

**Why rotation matters even for test keys:**
Test Stripe keys can still be used to read customer data, generate test charges,
and inspect webhook endpoints. Rotate them in Stripe Dashboard → Developers → API
keys → Roll key.

---

### 🟡 RECOMMENDED — Set OPENAI_REASONING_MODEL

Currently unset. The integration status reports:
`"OPENAI_REASONING_MODEL is not configured; strong-model fallback will be used."`

Set in Vercel env: `OPENAI_REASONING_MODEL=o1` (or `o3-mini` per your preference).
This enables the reasoning-tier model for appropriate workflow nodes.

---

### 🟡 RECOMMENDED — Set Optional Sales Contact Env Vars

Two optional env vars are unset that customer-facing pages may reference:
- `NEXT_PUBLIC_CONTACT_SALES_URL`
- `NEXT_PUBLIC_SALES_CONTACT_EMAIL`

Set in Vercel → redeploy (these are `NEXT_PUBLIC_` so they require a new build).

---

## 8. Live Verification Checklist (Post Stripe Fix)

Once Stripe is on live keys and the preflight passes, complete these in order:

### Stripe Webhook Flow
- [ ] Submit one checkout → confirm `BillingEvent` created in Neon
- [ ] Confirm `RoutingSnapshot` is written with correct plan code
- [ ] Confirm `WorkflowDispatch` row is created and dispatched to n8n
- [ ] Send a request with an invalid webhook signature → confirm 400 response
- [ ] Send a duplicate event → confirm it does not overwrite a terminal `BillingEvent`

### n8n Callback Flow
- [ ] Status callback accepted → correct `WorkflowDispatch` row updated
- [ ] Report-ready callback accepted
- [ ] Report-writeback can reconcile customer-run report-generated/delivered
- [ ] No `WorkflowDispatch` rows stuck permanently in `DISPATCHING`

### Signed Report Export
- [ ] Delivered report export succeeds with valid signed link
- [ ] Undelivered report export fails closed (auth required)

### Paid-Only Delivery Flow
- [ ] Org with `ACTIVE` or `GRACE_PERIOD` subscription can deliver report
- [ ] Unpaid / past-due org cannot mark report delivered
- [ ] Paid org delivery queues customer email successfully

### Queued Email Dispatch
- [ ] `GET /api/internal/jobs/run?job=dispatch-email-notifications` with `CRON_SECRET` succeeds
- [ ] Delivered report creates one immediate email + 3-day + 7-day queued follow-ups

### Operator Console
- [ ] `/admin` loads with correct data
- [ ] `/admin/queues` shows queue items
- [ ] `/admin/accounts/[organizationId]` shows org billing and fulfillment state
- [ ] `/api/fulfillment/health` returns reconciliation output
- [ ] `/api/fulfillment/dispatch-health` shows dispatch destinations and outcomes

---

## 9. Git Push — Status and Next Step

The push to GitHub is currently **blocked** because of the secret-in-history issue
described in Section 7.

**Status:** 2 local commits need to reach `origin/codex-launch-hardening-handoff`

**Next step:** An engineer or the founder needs to:
1. Complete Option A from Section 7 (rebase to remove the bad files)
2. Run `git push --force-with-lease origin codex-launch-hardening-handoff`
3. Rotate the HubSpot API key and Stripe test secret key

Once the push lands, verify the branch is clean on GitHub and no secrets appear
in the diff.

---

## 10. Access & Onboarding

### Recommended Access Order (for Harshay or any incoming engineer)

1. GitHub repo write access (invite to `304KMoney/evolve-edge-saas`)
2. Vercel project developer access (invite to `harshay.imag3@gmail.com`)
3. Secret vault access — scoped collection for dev/preview credentials
4. Neon preview database visibility (read first, write only if migration work is in scope)
5. Evolve Edge test user account (not founder credentials — create a dedicated account)
6. Stripe test-mode developer access
7. n8n workflow viewer/developer access
8. Sentry project member access
9. HubSpot scoped read/edit access
10. Dify viewer access (deprecated rollback context only)

### What to Share

✅ Safe to share:
- Platform invitations from each vendor dashboard
- `.env.example` and key names
- Secret values through the vault (not email/chat)
- Runbooks, setup docs, workflow diagrams
- Preview/test-mode credentials

🚫 Never share:
- `.env`, `.env.local`, Vercel env pulls, database URLs over email/chat
- Your personal owner/admin login
- Production database write credentials without explicit need
- Unrestricted Stripe live-mode admin access on day one

### Minimum Secrets for Local Dev

Provision scoped dev/preview values for these from the vault:
- `DATABASE_URL` (preview Neon branch)
- `AUTH_SECRET`, `AUTH_ACCESS_EMAIL`, `AUTH_ACCESS_PASSWORD`
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (test mode only)
- Canonical Stripe price/product IDs (test mode)
- `N8N_WORKFLOW_DESTINATIONS` (with non-production webhook URLs)
- `N8N_CALLBACK_SECRET`, `N8N_WRITEBACK_SECRET`
- `OUTBOUND_DISPATCH_SECRET`
- `AI_EXECUTION_DISPATCH_SECRET`
- `OPENAI_API_KEY` (scoped project key)
- `REPORT_DOWNLOAD_SIGNING_SECRET`
- `RESEND_API_KEY` (sandbox if email testing needed)

### Verification Checklist for New Engineer

- [ ] GitHub clone succeeds
- [ ] `pnpm install` succeeds
- [ ] `.env.local` populated from vault (not copied from founder machine)
- [ ] `pnpm db:generate` succeeds
- [ ] `pnpm ci:env:validate` passes (or reports only known optional missing keys)
- [ ] Local app boots at `localhost:3000`
- [ ] Test user login works
- [ ] Vercel Preview deployments and logs visible
- [ ] `pnpm integration:status` passes for dev env
- [ ] `pnpm preflight:first-customer:env` passes for dev env

---

## 11. Key Docs Index

| Doc | Location | Purpose |
|-----|----------|---------|
| Launch readiness runbook | `docs/launch-environment-readiness.md` | No-go conditions, env checklist, verification order |
| Manual sales control plane | `docs/manual-sales-control-plane.md` | CustomerAccount model, lifecycle stages, operator workflow |
| n8n lead pipeline | `docs/n8n-lead-pipeline-workflow-package.md` | n8n workflow setup for lead/lifecycle events |
| Harshay access handoff | `docs/team/harshay-access-handoff-2026-04-27.md` | Access matrix, security reminder, onboarding order |
| Apollo Codex setup | `docs/apollo-codex-setup.md` | Apollo MCP server config for operator enrichment |
| Workflow reference | `docs/workflows/n8n-ai-execution.md` | n8n AI execution flow |
| AI evaluation | `docs/ai-evaluation.md` | AI eval setup |
| Deployment/CI-CD | `docs/deployment-cicd.md` | Deploy flow |
| Data retention | `docs/data-retention.md` | Retention policies |
| Executive delivery | `docs/executive-delivery-layer.md` | Report delivery layer |
| DB schema summary | `packages/db/src/schema-summary.md` | Quick model reference |

---

## 12. Security Reminders

- **sendDefaultPii is false** in all Sentry configs — auth headers, cookies, and
  API keys are explicitly scrubbed before events leave the app
- **Signed report links** are required in production (`REPORT_DOWNLOAD_REQUIRE_AUTH=true`)
- **Stripe webhook** fails closed on invalid signatures (400)
- **Stripe livemode check** is enforced — a test-mode event in production fails closed
- **All internal routes** (`/api/internal/`) require authentication secrets
- **Public intake routes** fail closed unless `PUBLIC_INTAKE_SHARED_SECRET` is set
- **n8n callback/writeback** routes have separate authentication secrets
- **Tenant scoping** is explicit throughout — never query across org boundaries

---

## 13. Summary — What's Done vs. What Remains

### ✅ Done (code and architecture)

- TypeScript clean (`tsc --noEmit` passes)
- All 4 required integrations wired (Neon, Stripe, n8n, OpenAI/LangGraph)
- All 24 required env vars set in Vercel production
- Manual sales control plane implemented (`CustomerAccount`, lifecycle stages, admin surfaces)
- Report lifecycle gated (generated → pending_review → approved/rejected → delivered)
- Sentry properly integrated (env-gated, `sendDefaultPii: false`, PII header scrubbing)
- Signed report export enforced
- Email dispatch + follow-up queuing wired
- Operator admin console (`/admin`, `/admin/queues`, `/admin/accounts`, `/admin/customers`)
- Harshay access handoff doc prepared
- n8n lead pipeline workflow package documented
- Apollo Codex MCP server configured

### 🔴 Must complete before first customer

1. **Rotate exposed secrets** (HubSpot API key, Stripe test key from `.tmp-preview-env-*`)
2. **Clean git history** (rebase to remove the files, force-push branch)
3. **Set Stripe live keys** in Vercel production and redeploy

### 🟡 Should complete before or shortly after first customer

4. Set `OPENAI_REASONING_MODEL` in Vercel
5. Set `NEXT_PUBLIC_CONTACT_SALES_URL` and `NEXT_PUBLIC_SALES_CONTACT_EMAIL`
6. Complete live verification checklist (Section 8)
7. Verify operator access to `/admin` in production
8. Send one controlled audit request end-to-end and confirm the full flow

---

*This document was generated on April 27, 2026 from the current repo state on branch `codex-launch-hardening-handoff`.*
*Verify against live docs before acting. The codebase is the source of truth.*
