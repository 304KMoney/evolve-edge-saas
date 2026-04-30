/**
 * Evolve Edge — Engineer Handoff Document Generator
 * Produces: docs/team/engineer-handoff-2026-04-27.md
 *           docs/team/engineer-handoff-2026-04-27.html  (print-to-PDF friendly)
 *
 * Run: node scripts/generate-engineer-handoff.mjs
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "docs", "team");

mkdirSync(OUT_DIR, { recursive: true });

// ─── Document content ───────────────────────────────────────────────────────

const DATE = "April 27, 2026";
const BRANCH = "codex-launch-hardening-handoff";

const md = `# Evolve Edge — Engineer Handoff Package

**Prepared:** ${DATE}
**Branch:** \`${BRANCH}\`
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

- Plans: \`starter\`, \`scale\`, \`enterprise\`
- Workflow codes: \`audit_starter\`, \`audit_scale\`, \`audit_enterprise\`, \`briefing_only\`, \`intake_review\`
- Stripe Price/Product IDs map through explicit backend mappings in \`lib/revenue-catalog.ts\` and \`lib/commercial-catalog.ts\`
- Never infer internal plans from raw Stripe product or price names downstream

### Production AI Execution Path

\`\`\`
n8n → POST /api/internal/ai/execute
    → Next.js queues AnalysisJob
    → scheduled worker runs LangGraph
    → OpenAI
    → validated structured output
    → Neon-backed persistence
\`\`\`

### Report Lifecycle

\`\`\`
generated → pending_review → approved/rejected → delivered
\`\`\`

After delivery: app queues customer email, 3-day and 7-day follow-ups,
refreshes expansion opportunities, projects delivery status to HubSpot.

---

## 3. Repo Structure (Key Paths)

\`\`\`
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
\`\`\`

---

## 4. High-Risk Files — Read Before Touching

Before modifying any of these, read the surrounding code and run
\`tsc --noEmit\` plus focused tests:

| File | Why High Risk |
|------|---------------|
| \`apps/web/app/api/stripe/webhook/route.ts\` | Stripe event handling — idempotency, livemode check, billing truth |
| \`apps/web/lib/billing.ts\` | Subscription lifecycle, Stripe plan resolution (1300+ lines) |
| \`apps/web/lib/commercial-routing.ts\` | Plan entitlement resolution — never infer from raw Stripe names |
| \`apps/web/lib/workflow-routing.ts\` | Workflow code routing per plan |
| \`apps/web/lib/workflow-dispatch.ts\` | n8n dispatch logic and stale recovery |
| \`apps/web/lib/ai-execution.ts\` | AI job queueing and concurrency limits |
| \`apps/web/src/server/ai/providers/openai-langgraph.ts\` | LangGraph/OpenAI execution |
| \`apps/web/src/server/ai/workflows/audit/graph.ts\` | Audit workflow graph |
| \`apps/web/lib/dify.ts\` | Deprecated — do not re-enable routing |
| \`apps/web/lib/hubspot.ts\` | CRM projection — never make authoritative |
| \`packages/db/prisma/schema.prisma\` | Canonical schema — migrations must be explicit |

---

## 5. Local Development Setup

### Prerequisites

- Node.js 22+
- pnpm 10.8.1 (\`npm install -g pnpm@10.8.1\`)
- Git
- Access to the secret vault (see Section 8)

### Steps

\`\`\`bash
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
\`\`\`

### Key Development Commands

| Command | What It Does |
|---------|-------------|
| \`pnpm dev\` | Start all packages in dev mode |
| \`pnpm typecheck\` | Run TypeScript across the monorepo |
| \`pnpm lint\` | ESLint across all packages |
| \`pnpm test\` | Run Vitest test suite |
| \`pnpm integration:status\` | Check wiring snapshot (presence only) |
| \`pnpm preflight:first-customer:env\` | Check required env coverage |
| \`pnpm preflight:first-customer\` | Run launch safety checks |
| \`pnpm db:generate\` | Regenerate Prisma client after schema changes |
| \`pnpm db:migrate:deploy\` | Deploy migrations (staging/prod only) |

### Direct TypeScript Check (avoids Turbo electron issue)

\`\`\`powershell
cd apps/web
.\\node_modules\\.bin\\tsc.cmd --noEmit
\`\`\`

---

## 6. Current Branch State

**Branch:** \`codex-launch-hardening-handoff\`
**Status as of ${DATE}:** 2 commits ahead of origin (push is pending — see Section 9)

### Recent commit history

| SHA | Description |
|-----|-------------|
| \`0ab6f77\` | Hardening: Sentry cleanup, Apollo docs, Harshay handoff, launch readiness updates |
| \`8279585\` | Clarify first-customer launch readiness and sales plan |
| \`c22e00b\` | Fix typed redirect in start action |
| \`627f6cb\` | Harden report export state and add pricing access flow |
| \`28bb0e2\` | Harden preview routing, evidence uploads, and handoff docs |

### What today's session did

1. **Verified** full preflight chain: \`integration:status\` ✅, \`preflight:first-customer:env\` ✅, \`tsc --noEmit\` ✅
2. **Removed** root-level Sentry wizard contamination — 5 auto-generated JS files and a
   \`pages/\` directory that were created at the wrong monorepo level. They contained
   hardcoded DSNs, \`sendDefaultPii: true\`, and a public error-trigger page. The proper
   Sentry config in \`apps/web/\` is intact and production-safe.
3. **Committed** all legitimate uncommitted work: Apollo docs, Harshay handoff,
   doc updates, \`.codex/\` Apollo MCP config, lockfile.
4. **Identified** one hard launch blocker (Stripe live keys — see Section 7).
5. **Identified** a git history issue (see Section 9) that is blocking the push.

---

## 7. Launch Blockers (Ordered by Priority)

### 🔴 BLOCKER 1 — Stripe Test Keys in Production (Hard No-Go)

**Error:** \`stripe.test_mode_configured_for_production\`

The Vercel production environment has \`STRIPE_SECRET_KEY=sk_test_...\`.
The preflight check fails hard on this because charging a real customer with test
keys silently fails — no real money moves, no subscription is created.

**Fix (operator step — requires Stripe dashboard access):**

1. Go to [Stripe Dashboard](https://dashboard.stripe.com) → toggle to **Live mode**
2. Developers → API keys → copy \`sk_live_...\` secret key
3. In [Vercel](https://vercel.com) → your project → Settings → Environment Variables:
   - \`STRIPE_SECRET_KEY\` → live secret key (\`sk_live_...\`)
   - \`STRIPE_WEBHOOK_SECRET\` → signing secret from your **live** Stripe webhook endpoint
   - Verify these are all **live mode** IDs (from the Live tab in Stripe):
     - \`STRIPE_PRICE_STARTER_ANNUAL\`
     - \`STRIPE_PRICE_SCALE_ANNUAL\`
     - \`STRIPE_PRICE_ENTERPRISE_ANNUAL\`
     - \`STRIPE_PRODUCT_STARTER\`
     - \`STRIPE_PRODUCT_SCALE\`
     - \`STRIPE_PRODUCT_ENTERPRISE\`
4. Redeploy the Vercel project
5. Run \`pnpm preflight:first-customer\` — it should pass clean

**Verification:** After redeploy, run one Stripe test flow:
- Submit a real checkout (or use Stripe CLI: \`stripe trigger checkout.session.completed\`)
- Confirm \`BillingEvent\`, \`RoutingSnapshot\`, and \`WorkflowDispatch\` rows are created in Neon
- Confirm webhook signature validation passes (400 on bad signature)

---

### 🟡 NEEDED — Git History Cleanup (Secrets in a Prior Commit)

**Issue:** Commit \`8279585\` accidentally included \`.tmp-preview-env-*\` files
(Vercel env pulls) that contain a HubSpot API key and Stripe test secret key.
GitHub Push Protection is blocking the push until this is resolved.

**Fix options:**

**Option A — Rewrite history (recommended, cleanest):**
\`\`\`bash
# Interactively rebase from the commit before the bad one
git rebase -i c22e00b

# In the editor: change "pick 8279585" → "edit 8279585"
# Git will pause at that commit. Then:
git rm --cached .tmp-preview-env-current .tmp-preview-env-pull \\
  .tmp-preview-env-pull-after .tmp-preview-env-pull-after-final \\
  .tmp-preview-env-pull-now .npm-cache/
git commit --amend --no-edit
git rebase --continue
git push --force-with-lease origin codex-launch-hardening-handoff
\`\`\`

**Option B — GitHub bypass (not recommended):**
GitHub provides bypass URLs in the push error. Using them publishes the secrets
to GitHub's servers. Only use this if the secrets have already been rotated.

**After any option — ROTATE these credentials immediately:**
- HubSpot API key (found in \`.tmp-preview-env-current\`)
- Stripe test secret key (same files — already test-mode, but still rotate it)

**Why rotation matters even for test keys:**
Test Stripe keys can still be used to read customer data, generate test charges,
and inspect webhook endpoints. Rotate them in Stripe Dashboard → Developers → API
keys → Roll key.

---

### 🟡 RECOMMENDED — Set OPENAI_REASONING_MODEL

Currently unset. The integration status reports:
\`"OPENAI_REASONING_MODEL is not configured; strong-model fallback will be used."\`

Set in Vercel env: \`OPENAI_REASONING_MODEL=o1\` (or \`o3-mini\` per your preference).
This enables the reasoning-tier model for appropriate workflow nodes.

---

### 🟡 RECOMMENDED — Set Optional Sales Contact Env Vars

Two optional env vars are unset that customer-facing pages may reference:
- \`NEXT_PUBLIC_CONTACT_SALES_URL\`
- \`NEXT_PUBLIC_SALES_CONTACT_EMAIL\`

Set in Vercel → redeploy (these are \`NEXT_PUBLIC_\` so they require a new build).

---

## 8. Live Verification Checklist (Post Stripe Fix)

Once Stripe is on live keys and the preflight passes, complete these in order:

### Stripe Webhook Flow
- [ ] Submit one checkout → confirm \`BillingEvent\` created in Neon
- [ ] Confirm \`RoutingSnapshot\` is written with correct plan code
- [ ] Confirm \`WorkflowDispatch\` row is created and dispatched to n8n
- [ ] Send a request with an invalid webhook signature → confirm 400 response
- [ ] Send a duplicate event → confirm it does not overwrite a terminal \`BillingEvent\`

### n8n Callback Flow
- [ ] Status callback accepted → correct \`WorkflowDispatch\` row updated
- [ ] Report-ready callback accepted
- [ ] Report-writeback can reconcile customer-run report-generated/delivered
- [ ] No \`WorkflowDispatch\` rows stuck permanently in \`DISPATCHING\`

### Signed Report Export
- [ ] Delivered report export succeeds with valid signed link
- [ ] Undelivered report export fails closed (auth required)

### Paid-Only Delivery Flow
- [ ] Org with \`ACTIVE\` or \`GRACE_PERIOD\` subscription can deliver report
- [ ] Unpaid / past-due org cannot mark report delivered
- [ ] Paid org delivery queues customer email successfully

### Queued Email Dispatch
- [ ] \`GET /api/internal/jobs/run?job=dispatch-email-notifications\` with \`CRON_SECRET\` succeeds
- [ ] Delivered report creates one immediate email + 3-day + 7-day queued follow-ups

### Operator Console
- [ ] \`/admin\` loads with correct data
- [ ] \`/admin/queues\` shows queue items
- [ ] \`/admin/accounts/[organizationId]\` shows org billing and fulfillment state
- [ ] \`/api/fulfillment/health\` returns reconciliation output
- [ ] \`/api/fulfillment/dispatch-health\` shows dispatch destinations and outcomes

---

## 9. Git Push — Status and Next Step

The push to GitHub is currently **blocked** because of the secret-in-history issue
described in Section 7.

**Status:** 2 local commits need to reach \`origin/codex-launch-hardening-handoff\`

**Next step:** An engineer or the founder needs to:
1. Complete Option A from Section 7 (rebase to remove the bad files)
2. Run \`git push --force-with-lease origin codex-launch-hardening-handoff\`
3. Rotate the HubSpot API key and Stripe test secret key

Once the push lands, verify the branch is clean on GitHub and no secrets appear
in the diff.

---

## 10. Access & Onboarding

### Recommended Access Order (for Harshay or any incoming engineer)

1. GitHub repo write access (invite to \`304KMoney/evolve-edge-saas\`)
2. Vercel project developer access (invite to \`harshay.imag3@gmail.com\`)
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
- \`.env.example\` and key names
- Secret values through the vault (not email/chat)
- Runbooks, setup docs, workflow diagrams
- Preview/test-mode credentials

🚫 Never share:
- \`.env\`, \`.env.local\`, Vercel env pulls, database URLs over email/chat
- Your personal owner/admin login
- Production database write credentials without explicit need
- Unrestricted Stripe live-mode admin access on day one

### Minimum Secrets for Local Dev

Provision scoped dev/preview values for these from the vault:
- \`DATABASE_URL\` (preview Neon branch)
- \`AUTH_SECRET\`, \`AUTH_ACCESS_EMAIL\`, \`AUTH_ACCESS_PASSWORD\`
- \`STRIPE_SECRET_KEY\` and \`STRIPE_WEBHOOK_SECRET\` (test mode only)
- Canonical Stripe price/product IDs (test mode)
- \`N8N_WORKFLOW_DESTINATIONS\` (with non-production webhook URLs)
- \`N8N_CALLBACK_SECRET\`, \`N8N_WRITEBACK_SECRET\`
- \`OUTBOUND_DISPATCH_SECRET\`
- \`AI_EXECUTION_DISPATCH_SECRET\`
- \`OPENAI_API_KEY\` (scoped project key)
- \`REPORT_DOWNLOAD_SIGNING_SECRET\`
- \`RESEND_API_KEY\` (sandbox if email testing needed)

### Verification Checklist for New Engineer

- [ ] GitHub clone succeeds
- [ ] \`pnpm install\` succeeds
- [ ] \`.env.local\` populated from vault (not copied from founder machine)
- [ ] \`pnpm db:generate\` succeeds
- [ ] \`pnpm ci:env:validate\` passes (or reports only known optional missing keys)
- [ ] Local app boots at \`localhost:3000\`
- [ ] Test user login works
- [ ] Vercel Preview deployments and logs visible
- [ ] \`pnpm integration:status\` passes for dev env
- [ ] \`pnpm preflight:first-customer:env\` passes for dev env

---

## 11. Key Docs Index

| Doc | Location | Purpose |
|-----|----------|---------|
| Launch readiness runbook | \`docs/launch-environment-readiness.md\` | No-go conditions, env checklist, verification order |
| Manual sales control plane | \`docs/manual-sales-control-plane.md\` | CustomerAccount model, lifecycle stages, operator workflow |
| n8n lead pipeline | \`docs/n8n-lead-pipeline-workflow-package.md\` | n8n workflow setup for lead/lifecycle events |
| Harshay access handoff | \`docs/team/harshay-access-handoff-2026-04-27.md\` | Access matrix, security reminder, onboarding order |
| Apollo Codex setup | \`docs/apollo-codex-setup.md\` | Apollo MCP server config for operator enrichment |
| Workflow reference | \`docs/workflows/n8n-ai-execution.md\` | n8n AI execution flow |
| AI evaluation | \`docs/ai-evaluation.md\` | AI eval setup |
| Deployment/CI-CD | \`docs/deployment-cicd.md\` | Deploy flow |
| Data retention | \`docs/data-retention.md\` | Retention policies |
| Executive delivery | \`docs/executive-delivery-layer.md\` | Report delivery layer |
| DB schema summary | \`packages/db/src/schema-summary.md\` | Quick model reference |

---

## 12. Security Reminders

- **sendDefaultPii is false** in all Sentry configs — auth headers, cookies, and
  API keys are explicitly scrubbed before events leave the app
- **Signed report links** are required in production (\`REPORT_DOWNLOAD_REQUIRE_AUTH=true\`)
- **Stripe webhook** fails closed on invalid signatures (400)
- **Stripe livemode check** is enforced — a test-mode event in production fails closed
- **All internal routes** (\`/api/internal/\`) require authentication secrets
- **Public intake routes** fail closed unless \`PUBLIC_INTAKE_SHARED_SECRET\` is set
- **n8n callback/writeback** routes have separate authentication secrets
- **Tenant scoping** is explicit throughout — never query across org boundaries

---

## 13. Summary — What's Done vs. What Remains

### ✅ Done (code and architecture)

- TypeScript clean (\`tsc --noEmit\` passes)
- All 4 required integrations wired (Neon, Stripe, n8n, OpenAI/LangGraph)
- All 24 required env vars set in Vercel production
- Manual sales control plane implemented (\`CustomerAccount\`, lifecycle stages, admin surfaces)
- Report lifecycle gated (generated → pending_review → approved/rejected → delivered)
- Sentry properly integrated (env-gated, \`sendDefaultPii: false\`, PII header scrubbing)
- Signed report export enforced
- Email dispatch + follow-up queuing wired
- Operator admin console (\`/admin\`, \`/admin/queues\`, \`/admin/accounts\`, \`/admin/customers\`)
- Harshay access handoff doc prepared
- n8n lead pipeline workflow package documented
- Apollo Codex MCP server configured

### 🔴 Must complete before first customer

1. **Rotate exposed secrets** (HubSpot API key, Stripe test key from \`.tmp-preview-env-*\`)
2. **Clean git history** (rebase to remove the files, force-push branch)
3. **Set Stripe live keys** in Vercel production and redeploy

### 🟡 Should complete before or shortly after first customer

4. Set \`OPENAI_REASONING_MODEL\` in Vercel
5. Set \`NEXT_PUBLIC_CONTACT_SALES_URL\` and \`NEXT_PUBLIC_SALES_CONTACT_EMAIL\`
6. Complete live verification checklist (Section 8)
7. Verify operator access to \`/admin\` in production
8. Send one controlled audit request end-to-end and confirm the full flow

---

*This document was generated on ${DATE} from the current repo state on branch \`${BRANCH}\`.*
*Verify against live docs before acting. The codebase is the source of truth.*
`;

// Write markdown
const mdPath = join(OUT_DIR, "engineer-handoff-2026-04-27.md");
writeFileSync(mdPath, md, "utf8");
console.log(`✅ Markdown written: ${mdPath}`);

// ─── HTML version (print-to-PDF friendly) ───────────────────────────────────

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Evolve Edge — Engineer Handoff Package (${DATE})</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 13px;
    line-height: 1.6;
    color: #1a1a1a;
    max-width: 900px;
    margin: 0 auto;
    padding: 40px 48px;
  }
  @media print {
    body { padding: 20px; font-size: 11px; }
    h1 { font-size: 22px; }
    h2 { font-size: 16px; }
    h3 { font-size: 13px; }
    .page-break { page-break-before: always; }
    table { page-break-inside: avoid; }
  }
  h1 { font-size: 26px; font-weight: 700; color: #0f0f0f; margin-bottom: 6px; border-bottom: 3px solid #0f0f0f; padding-bottom: 10px; }
  h2 { font-size: 18px; font-weight: 700; color: #1a1a1a; margin: 36px 0 12px; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
  h3 { font-size: 14px; font-weight: 600; color: #333; margin: 20px 0 8px; }
  .meta { color: #555; margin-bottom: 24px; font-size: 12px; line-height: 1.8; }
  .meta strong { color: #111; }
  p { margin: 8px 0; }
  ul, ol { margin: 8px 0 8px 24px; }
  li { margin: 3px 0; }
  code {
    font-family: "SF Mono", "Cascadia Code", Consolas, monospace;
    font-size: 12px;
    background: #f4f4f4;
    border: 1px solid #e0e0e0;
    border-radius: 3px;
    padding: 1px 5px;
  }
  pre {
    background: #f6f6f6;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 14px 16px;
    overflow-x: auto;
    margin: 10px 0;
    font-family: "SF Mono", "Cascadia Code", Consolas, monospace;
    font-size: 11.5px;
    line-height: 1.5;
  }
  pre code { background: none; border: none; padding: 0; font-size: inherit; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
  th { background: #1a1a1a; color: #fff; text-align: left; padding: 8px 10px; font-weight: 600; }
  td { padding: 7px 10px; border-bottom: 1px solid #e8e8e8; vertical-align: top; }
  tr:nth-child(even) td { background: #fafafa; }
  .blocker-red { background: #fff5f5; border-left: 4px solid #e53e3e; padding: 14px 16px; margin: 14px 0; border-radius: 0 4px 4px 0; }
  .blocker-yellow { background: #fffdf0; border-left: 4px solid #d69e2e; padding: 14px 16px; margin: 14px 0; border-radius: 0 4px 4px 0; }
  .blocker-green { background: #f0fff4; border-left: 4px solid #38a169; padding: 14px 16px; margin: 14px 0; border-radius: 0 4px 4px 0; }
  .tag-red { display: inline-block; background: #e53e3e; color: #fff; font-weight: 700; font-size: 10px; padding: 2px 7px; border-radius: 3px; margin-right: 6px; letter-spacing: 0.5px; }
  .tag-yellow { display: inline-block; background: #d69e2e; color: #fff; font-weight: 700; font-size: 10px; padding: 2px 7px; border-radius: 3px; margin-right: 6px; letter-spacing: 0.5px; }
  .tag-green { display: inline-block; background: #38a169; color: #fff; font-weight: 700; font-size: 10px; padding: 2px 7px; border-radius: 3px; margin-right: 6px; letter-spacing: 0.5px; }
  .checkbox { font-size: 14px; margin-right: 4px; }
  hr { border: none; border-top: 1px solid #e0e0e0; margin: 28px 0; }
  .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #ddd; color: #888; font-size: 11px; font-style: italic; }
  a { color: #2563eb; }
</style>
</head>
<body>

<h1>Evolve Edge — Engineer Handoff Package</h1>
<div class="meta">
  <strong>Prepared:</strong> ${DATE}<br>
  <strong>Branch:</strong> <code>${BRANCH}</code><br>
  <strong>Prepared by:</strong> AI Operating Partner (Genspark Claw)<br>
  <strong>Audience:</strong> Incoming full-stack engineer
</div>

<h2>1. What Is Evolve Edge?</h2>
<p>Evolve Edge is a Next.js SaaS control plane for AI security, compliance, audit delivery, and customer operations. It targets executive buyers who need AI governance, risk assessment, and audit delivery in one trusted surface.</p>
<p>The product is approaching first-customer launch. The codebase is architecturally mature, TypeScript-clean, and fully wired for production integrations. <strong>One hard blocker</strong> (Stripe live key) stands between the current state and the first paying customer.</p>

<h2>2. Architecture &amp; Source-of-Truth Boundaries</h2>
<p><strong>These boundaries are non-negotiable.</strong> Every engineer decision must preserve them.</p>
<table>
<tr><th>System</th><th>Role</th><th>Must Never Own</th></tr>
<tr><td><strong>Next.js (apps/web)</strong></td><td>Product logic, customer-visible state, lifecycle truth</td><td>—</td></tr>
<tr><td><strong>Neon/Postgres</strong></td><td>Canonical persistence (via Prisma)</td><td>—</td></tr>
<tr><td><strong>Stripe</strong></td><td>Billing authority, payment-event source only</td><td>Entitlements, plan routing, product state</td></tr>
<tr><td><strong>n8n</strong></td><td>Orchestration and async execution only</td><td>Pricing, routing decisions, audit status</td></tr>
<tr><td><strong>LangGraph</strong></td><td>AI workflow sequencing only</td><td>Business logic, lifecycle state</td></tr>
<tr><td><strong>OpenAI</strong></td><td>Model execution only</td><td>Any persistence or routing</td></tr>
<tr><td><strong>HubSpot</strong></td><td>CRM projection only</td><td>Customer lifecycle truth</td></tr>
<tr><td><strong>Dify</strong></td><td>Deprecated — rollback path only</td><td>Do not route new state through Dify</td></tr>
<tr><td><strong>Apollo</strong></td><td>Enrichment-only via n8n/operator tooling</td><td>App lifecycle, product state</td></tr>
</table>

<h3>Production AI Execution Path</h3>
<pre><code>n8n → POST /api/internal/ai/execute
    → Next.js queues AnalysisJob
    → scheduled worker runs LangGraph → OpenAI
    → validated structured output → Neon-backed persistence</code></pre>

<h3>Report Lifecycle</h3>
<pre><code>generated → pending_review → approved/rejected → delivered</code></pre>
<p>After delivery: customer email + 3-day and 7-day follow-ups queued, expansion opportunities refreshed, HubSpot updated.</p>

<h2>3. High-Risk Files — Read Before Touching</h2>
<table>
<tr><th>File</th><th>Why High Risk</th></tr>
<tr><td><code>apps/web/app/api/stripe/webhook/route.ts</code></td><td>Stripe event handling — idempotency, livemode check, billing truth</td></tr>
<tr><td><code>apps/web/lib/billing.ts</code></td><td>Subscription lifecycle, Stripe plan resolution (1300+ lines)</td></tr>
<tr><td><code>apps/web/lib/commercial-routing.ts</code></td><td>Plan entitlement resolution — never infer from raw Stripe names</td></tr>
<tr><td><code>apps/web/lib/workflow-routing.ts</code></td><td>Workflow code routing per plan</td></tr>
<tr><td><code>apps/web/lib/workflow-dispatch.ts</code></td><td>n8n dispatch logic and stale recovery</td></tr>
<tr><td><code>apps/web/lib/ai-execution.ts</code></td><td>AI job queueing and concurrency limits</td></tr>
<tr><td><code>apps/web/src/server/ai/providers/openai-langgraph.ts</code></td><td>LangGraph/OpenAI execution</td></tr>
<tr><td><code>apps/web/src/server/ai/workflows/audit/graph.ts</code></td><td>Audit workflow graph</td></tr>
<tr><td><code>apps/web/lib/dify.ts</code></td><td>Deprecated — do not re-enable routing</td></tr>
<tr><td><code>apps/web/lib/hubspot.ts</code></td><td>CRM projection — never make authoritative</td></tr>
<tr><td><code>packages/db/prisma/schema.prisma</code></td><td>Canonical schema — migrations must be explicit</td></tr>
</table>

<h2>4. Local Development Setup</h2>
<pre><code># 1. Clone
git clone https://github.com/304KMoney/evolve-edge-saas.git
cd evolve-edge-saas

# 2. Install (requires pnpm 10.8.1)
npm install -g pnpm@10.8.1
pnpm install

# 3. Populate env from vault — do NOT copy founder's .env
cp .env.example .env.local

# 4. Generate Prisma client
pnpm db:generate

# 5. Validate env coverage
pnpm ci:env:validate

# 6. Start
pnpm dev</code></pre>

<h3>Key Commands</h3>
<table>
<tr><th>Command</th><th>What It Does</th></tr>
<tr><td><code>pnpm integration:status</code></td><td>Check integration wiring snapshot</td></tr>
<tr><td><code>pnpm preflight:first-customer:env</code></td><td>Check required env coverage</td></tr>
<tr><td><code>pnpm preflight:first-customer</code></td><td>Run all launch safety checks</td></tr>
<tr><td><code>pnpm typecheck</code></td><td>TypeScript across monorepo (or use tsc directly below)</td></tr>
<tr><td><code>pnpm lint</code></td><td>ESLint</td></tr>
<tr><td><code>pnpm test</code></td><td>Vitest test suite</td></tr>
<tr><td><code>pnpm db:generate</code></td><td>Regenerate Prisma client after schema changes</td></tr>
<tr><td><code>pnpm db:migrate:deploy</code></td><td>Deploy migrations (staging/prod only)</td></tr>
</table>
<p><strong>Direct TypeScript check</strong> (avoids Turbo electron issue in some terminals):</p>
<pre><code>cd apps/web
.\\node_modules\\.bin\\tsc.cmd --noEmit</code></pre>

<div class="page-break"></div>

<h2>5. Launch Blockers</h2>

<div class="blocker-red">
<p><span class="tag-red">HARD BLOCKER</span> <strong>Stripe Test Keys in Production</strong></p>
<p><strong>Error:</strong> <code>stripe.test_mode_configured_for_production</code></p>
<p>Vercel production has <code>STRIPE_SECRET_KEY=sk_test_...</code>. A real customer checkout will silently fail — no money moves, no subscription created.</p>
<h3>Fix (requires Stripe + Vercel dashboard access):</h3>
<ol>
  <li>Stripe Dashboard → toggle to <strong>Live mode</strong> → Developers → API keys → copy <code>sk_live_...</code></li>
  <li>Vercel → project → Settings → Environment Variables:
    <ul>
      <li><code>STRIPE_SECRET_KEY</code> → <code>sk_live_...</code></li>
      <li><code>STRIPE_WEBHOOK_SECRET</code> → signing secret from live webhook endpoint</li>
      <li>Verify all price/product IDs are live mode: <code>STRIPE_PRICE_STARTER_ANNUAL</code>, <code>STRIPE_PRICE_SCALE_ANNUAL</code>, <code>STRIPE_PRICE_ENTERPRISE_ANNUAL</code>, <code>STRIPE_PRODUCT_STARTER</code>, <code>STRIPE_PRODUCT_SCALE</code>, <code>STRIPE_PRODUCT_ENTERPRISE</code></li>
    </ul>
  </li>
  <li>Redeploy</li>
  <li>Run <code>pnpm preflight:first-customer</code> — should pass clean</li>
</ol>
</div>

<div class="blocker-red">
<p><span class="tag-red">MUST DO</span> <strong>Rotate Exposed Secrets + Clean Git History</strong></p>
<p>Commit <code>8279585</code> accidentally included <code>.tmp-preview-env-*</code> files (Vercel env pulls) containing a HubSpot API key and Stripe test secret key. GitHub Push Protection blocked the push.</p>
<h3>Fix:</h3>
<pre><code># Option A — rewrite history (recommended)
git rebase -i c22e00b
# Change "pick 8279585" → "edit 8279585" in the editor, save

git rm --cached .tmp-preview-env-current .tmp-preview-env-pull \\
  .tmp-preview-env-pull-after .tmp-preview-env-pull-after-final \\
  .tmp-preview-env-pull-now
# Also remove .npm-cache/ if present in that commit's diff
git commit --amend --no-edit
git rebase --continue
git push --force-with-lease origin codex-launch-hardening-handoff</code></pre>
<p><strong>After the rebase — rotate these credentials immediately:</strong></p>
<ul>
  <li>HubSpot API key → HubSpot → Settings → Integrations → Private Apps → rotate</li>
  <li>Stripe test secret key → Stripe Dashboard → Developers → API keys → Roll key</li>
</ul>
<p><em>Note: test Stripe keys can still be used to read customer data and inspect webhooks. Rotate them regardless.</em></p>
</div>

<div class="blocker-yellow">
<p><span class="tag-yellow">RECOMMENDED</span> <strong>Set OPENAI_REASONING_MODEL</strong></p>
<p>Currently unset — falling back to strong model tier. Set in Vercel: <code>OPENAI_REASONING_MODEL=o1</code> (or <code>o3-mini</code>).</p>
</div>

<div class="blocker-yellow">
<p><span class="tag-yellow">RECOMMENDED</span> <strong>Set Optional Sales Contact Env Vars</strong></p>
<p><code>NEXT_PUBLIC_CONTACT_SALES_URL</code> and <code>NEXT_PUBLIC_SALES_CONTACT_EMAIL</code> are unset. These are <code>NEXT_PUBLIC_</code> values — require redeploy after setting.</p>
</div>

<h2>6. Live Verification Checklist</h2>
<p>After Stripe is on live keys and preflight passes:</p>

<h3>Stripe Webhook Flow</h3>
<ul>
<li>☐ Submit one checkout → confirm <code>BillingEvent</code> created in Neon</li>
<li>☐ Confirm <code>RoutingSnapshot</code> written with correct plan code</li>
<li>☐ Confirm <code>WorkflowDispatch</code> row created and dispatched to n8n</li>
<li>☐ Invalid webhook signature → 400 response</li>
<li>☐ Duplicate event → does not overwrite a terminal <code>BillingEvent</code></li>
</ul>

<h3>n8n Callback Flow</h3>
<ul>
<li>☐ Status callback accepted, <code>WorkflowDispatch</code> row updated</li>
<li>☐ Report-ready callback accepted</li>
<li>☐ Report-writeback reconciles delivered milestones</li>
<li>☐ No rows stuck permanently in <code>DISPATCHING</code></li>
</ul>

<h3>Signed Report Export</h3>
<ul>
<li>☐ Delivered report export succeeds</li>
<li>☐ Undelivered report fails closed</li>
</ul>

<h3>Paid-Only Delivery</h3>
<ul>
<li>☐ <code>ACTIVE</code> / <code>GRACE_PERIOD</code> org can deliver report</li>
<li>☐ Unpaid org cannot mark report delivered</li>
<li>☐ Paid org delivery queues customer email</li>
</ul>

<h3>Email Dispatch</h3>
<ul>
<li>☐ <code>GET /api/internal/jobs/run?job=dispatch-email-notifications</code> with <code>CRON_SECRET</code> succeeds</li>
<li>☐ Delivered report creates immediate email + 3-day + 7-day follow-ups</li>
</ul>

<h3>Operator Console</h3>
<ul>
<li>☐ <code>/admin</code> loads correctly</li>
<li>☐ <code>/admin/queues</code> shows queue items</li>
<li>☐ <code>/admin/accounts/[organizationId]</code> shows org state</li>
<li>☐ <code>/api/fulfillment/health</code> returns reconciliation output</li>
<li>☐ <code>/api/fulfillment/dispatch-health</code> shows destinations and outcomes</li>
</ul>

<h2>7. Access Onboarding (for Harshay or any new engineer)</h2>
<table>
<tr><th>System</th><th>Initial Access</th><th>How</th></tr>
<tr><td>GitHub</td><td>Repo write access</td><td>Invite to <code>304KMoney/evolve-edge-saas</code></td></tr>
<tr><td>Vercel</td><td>Project developer</td><td>Invite to <code>harshay.imag3@gmail.com</code></td></tr>
<tr><td>Secret vault</td><td>Scoped dev/preview collection</td><td>Password manager invite</td></tr>
<tr><td>Neon</td><td>Preview DB read access first</td><td>Neon project invite</td></tr>
<tr><td>Evolve Edge app</td><td>Dedicated test account only</td><td>Create test user — not founder creds</td></tr>
<tr><td>Stripe</td><td>Test-mode developer</td><td>Stripe team invite</td></tr>
<tr><td>n8n</td><td>Workflow viewer/developer</td><td>n8n user invite</td></tr>
<tr><td>Sentry</td><td>Member with issue visibility</td><td>Sentry org/project invite</td></tr>
<tr><td>HubSpot</td><td>Scoped read/edit</td><td>HubSpot user invite</td></tr>
<tr><td>Dify</td><td>Viewer (deprecated context only)</td><td>Dify workspace invite</td></tr>
</table>

<h2>8. Summary — Done vs. Remaining</h2>

<div class="blocker-green">
<p><span class="tag-green">DONE</span> <strong>Code and Architecture</strong></p>
<ul>
<li>TypeScript clean — <code>tsc --noEmit</code> passes with zero errors</li>
<li>All 4 required integrations wired (Neon, Stripe, n8n, OpenAI/LangGraph)</li>
<li>All 24 required env vars set in Vercel production</li>
<li>Manual sales control plane (<code>CustomerAccount</code>, lifecycle stages, admin surfaces)</li>
<li>Report lifecycle gated (generated → pending_review → approved/rejected → delivered)</li>
<li>Sentry properly integrated (env-gated, <code>sendDefaultPii: false</code>, PII header scrubbing)</li>
<li>Root-level Sentry wizard artifacts removed (hardcoded DSN, <code>sendDefaultPii: true</code>, public error-trigger route)</li>
<li>Signed report export enforced</li>
<li>Email dispatch + follow-up queuing wired</li>
<li>Operator admin console (/admin, /admin/queues, /admin/accounts, /admin/customers)</li>
<li>Harshay access handoff doc prepared</li>
<li>n8n lead pipeline workflow package documented</li>
</ul>
</div>

<div class="blocker-red">
<p><span class="tag-red">BEFORE FIRST CUSTOMER</span></p>
<ol>
<li>Rotate exposed secrets (HubSpot API key, Stripe test key from <code>.tmp-preview-env-*</code>)</li>
<li>Clean git history (rebase to remove those files, force-push branch)</li>
<li>Set Stripe live keys in Vercel production and redeploy</li>
</ol>
</div>

<div class="blocker-yellow">
<p><span class="tag-yellow">SHORTLY AFTER LAUNCH</span></p>
<ol>
<li>Set <code>OPENAI_REASONING_MODEL</code> in Vercel</li>
<li>Set <code>NEXT_PUBLIC_CONTACT_SALES_URL</code> and <code>NEXT_PUBLIC_SALES_CONTACT_EMAIL</code></li>
<li>Complete live verification checklist (Section 6)</li>
<li>Confirm operator access to <code>/admin</code> in production</li>
<li>Send one controlled end-to-end audit request and confirm the full flow</li>
</ol>
</div>

<h2>9. Key Docs Index</h2>
<table>
<tr><th>Doc</th><th>Path</th></tr>
<tr><td>Launch readiness runbook</td><td><code>docs/launch-environment-readiness.md</code></td></tr>
<tr><td>Manual sales control plane</td><td><code>docs/manual-sales-control-plane.md</code></td></tr>
<tr><td>n8n lead pipeline</td><td><code>docs/n8n-lead-pipeline-workflow-package.md</code></td></tr>
<tr><td>Harshay access handoff</td><td><code>docs/team/harshay-access-handoff-2026-04-27.md</code></td></tr>
<tr><td>Apollo Codex setup</td><td><code>docs/apollo-codex-setup.md</code></td></tr>
<tr><td>Workflow reference</td><td><code>docs/workflows/n8n-ai-execution.md</code></td></tr>
<tr><td>DB schema summary</td><td><code>packages/db/src/schema-summary.md</code></td></tr>
<tr><td>AI evaluation</td><td><code>docs/ai-evaluation.md</code></td></tr>
<tr><td>Deployment/CI-CD</td><td><code>docs/deployment-cicd.md</code></td></tr>
<tr><td>Data retention</td><td><code>docs/data-retention.md</code></td></tr>
</table>

<div class="footer">
  Generated ${DATE} from branch <code>${BRANCH}</code> &mdash; verify against live docs. The codebase is the source of truth.
</div>

</body>
</html>`;

const htmlPath = join(OUT_DIR, "engineer-handoff-2026-04-27.html");
writeFileSync(htmlPath, html, "utf8");
console.log(`✅ HTML written:     ${htmlPath}`);
console.log("");
console.log("To generate PDF: open the HTML file in a browser and File → Print → Save as PDF");
console.log("Or use: start docs\\team\\engineer-handoff-2026-04-27.html");
