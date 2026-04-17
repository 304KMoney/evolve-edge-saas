# Evolve Edge Production Readiness Audit

_Date:_ 2026-04-17  
_Auditor role:_ Senior Security Engineer / SaaS Production Auditor  
_Scope:_ End-to-end demo-critical backend and integration paths (Stripe, public intake, n8n callbacks, Dify execution, report delivery, email/webhooks, runtime config parity, and health/observability).

---

## 1) Overall Safety Status

**PARTIAL**

The platform has strong foundations (typed payload validation, signature verification on critical webhooks, retry logic, and environment parity checks), but it still contains demo-breaking weaknesses that can surface under normal production pressure.

---

## 2) Executive Summary (Stakeholder-Ready)

Evolve Edge is close to being demo-capable, but it is not yet in a "safe to trust live" state.

What is working well:
- Stripe and Resend webhook signature verification exists.
- n8n writeback callbacks are authenticated and rate-limited.
- Workflow dispatch and Dify execution include retry/error handling.
- Environment parity tooling improves deployment discipline.

What still puts a live demo at risk:
- Public intake endpoints are currently callable without an explicit inbound auth guard, so anyone can inject workload.
- Resend webhook deduplication is process-memory only, which is not reliable in multi-instance/serverless runtime.
- The web app currently fails TypeScript compile checks (including missing Sentry module/type errors and an intake route type error), reducing release confidence immediately before demo.

Bottom line: the architecture is promising, but critical hardening and release hygiene items must be closed before a high-stakes live walkthrough.

---

## 3) Top 5 Critical Risks (Could Break a Live Demo)

1. **Unauthenticated public intake attack surface**  
   Public intake routes accept validated payloads but do not enforce an inbound shared secret/signature check at the route boundary. This allows spoofed requests, queue pollution, and potentially fake customer workflow creation during demo traffic spikes or probing.

2. **Non-durable Resend webhook dedupe**  
   Resend dedupe uses in-memory `Map` state. In serverless/horizontal scaling, retries can hit different instances and bypass dedupe, causing duplicate failure events/alerts and inconsistent status transitions.

3. **Current build/type instability**  
   TypeScript checks fail right now (route typing error plus unresolved `@sentry/nextjs` type/module references). This is a direct pre-demo release risk.

4. **Operational ambiguity due to dual Stripe webhook handlers**  
   Two active Stripe webhook endpoints increase operator error probability (wrong endpoint wired in dashboard, split event visibility, inconsistent debugging path).

5. **PII leakage risk in structured logs**  
   Some flow logs still include customer email fields in response/metadata contexts. This can create compliance/reputation issues if logs are exposed to a wide operator audience.

---

## 4) Security Gaps

### Secrets handling
- Strengths:
  - Required runtime/env enforcement exists and supports aliases.
  - Signature secrets are pulled from env and not hardcoded.
- Gaps:
  - Env parity checks detect presence, not secret quality/rotation age/scope.
  - Optional aliases can hide drift if operators rely on legacy key names without cleanup.

### Webhook protection
- Strengths:
  - Stripe signature verification includes timestamp tolerance checks.
  - Resend Svix signature verification and route-level rate limiting are present.
  - Internal n8n callback routes enforce bearer auth.
- Gaps:
  - Public automation intake routes are still missing equivalent inbound auth/signature enforcement.
  - Resend dedupe is not persistence-backed (replay/duplicate handling is incomplete for distributed runtime).

### Auth issues
- Internal workflow callbacks are protected.
- Public intake routes appear intentionally public but lack controlled allowlist/token model for production hardening, which is a security and abuse vector.

### Data exposure risks
- Good use of email masking exists in many logs.
- However, email is still emitted in some success metadata/response payloads and email failure metadata, increasing PII propagation surface.

---

## 5) Reliability Gaps

### Failure handling (Stripe, n8n, Dify)
- Stripe: strict payload parsing and guarded processing are in place for checkout completion.
- n8n: dispatch retries/escalation exist and callback handling is explicit.
- Dify: bounded timeout/retry behavior and failure recording are present.
- Gap: too many integration surfaces can still fail “late” at runtime without a single hard preflight gate.

### Retry logic
- Workflow dispatch retry model is present with backoff and max attempts.
- Dify retry path exists.
- Gap: retry + dedupe semantics are inconsistent across components (especially webhooks).

### Timeout risks
- Dispatch timeout is configurable with bounds.
- Gap: external dependencies (n8n, Dify, email provider) are not comprehensively health-checked by the health endpoint.

### Idempotency issues
- Multiple idempotency keys are used in delivery/routing flow.
- Gap: webhook idempotency is not uniformly durable (Resend route currently instance-local dedupe).

---

## 6) System Weak Points in Current Architecture

1. **Silent failure points in cross-system handoff**  
   The system relies on multiple asynchronous boundaries (Stripe → app → n8n → Dify → callback → email). Failure in intermediate systems can degrade user-facing state before operators see it unless alerting is perfectly configured.

2. **High coupling through env/config correctness**  
   Critical paths are sensitive to env presence and endpoint wiring. While parity checks help, misconfiguration can still pass local checks and fail in real traffic conditions.

3. **Operational complexity from parallel ingress routes**  
   Multiple ingress routes for similar event classes (especially Stripe) increase runbook and observability complexity.

4. **Partial observability maturity**  
   Sentry integration was added, but the current compile-time issues suggest monitoring instrumentation is not fully deployment-validated in this branch state.

---

## 7) Demo Readiness Assessment

### Can the full flow run reliably?
**Conditionally yes**, but not reliably enough for a no-surprises executive demo without immediate hardening.

### What would break in front of Stuart?
Most likely failure modes:
1. Intake noise/spoofing creates unexpected or duplicate workflow behavior.
2. Duplicate Resend webhook events produce repeated failure alerts or contradictory delivery states.
3. Build/release instability blocks deployment or introduces last-minute rollback stress.
4. Operator confusion on Stripe webhook route selection causes missing or delayed event processing.

---

## 8) REQUIRED FIXES BEFORE DEMO (CRITICAL)

1. **Protect public intake routes with inbound auth/signature verification** (shared secret/HMAC or trusted gateway allowlist).  
2. **Replace in-memory Resend dedupe with durable idempotency storage** (DB-backed webhook receipt table keyed by provider message/event id).  
3. **Restore clean TypeScript build for the web app** and validate Sentry dependency/type wiring.  
4. **Declare one authoritative Stripe webhook endpoint for demo** and align Stripe dashboard + runbook to that single path.  
5. **Tighten PII logging policy** (mask/hash emails in operational metadata where not strictly required).

---

## 9) Recommended Fixes After Demo

1. Add synthetic integration probes (Stripe test event, n8n callback loopback, Dify health smoke) to operational readiness checks.
2. Add replay tooling for webhook events with audit-safe, idempotent reprocessing controls.
3. Introduce secret hygiene controls (rotation cadence checks, key age metadata, and startup warning thresholds).
4. Consolidate ingress route design and retire deprecated compatibility paths once cutover is complete.
5. Expand automated reliability testing for partial outages and callback delays.

---

## 10) Suggested Monitoring + Alerting Setup

### Minimum production dashboard panels
- Webhook ingestion rate/success/failure by provider (Stripe, Resend).
- Workflow dispatch queue depth, retry count, and failure exhaustion count.
- Dify request latency, timeout count, and failure rate.
- Callback SLA (time from `audit.requested` to `report_ready`).
- Email notification send/deliver/fail ratios.
- Health endpoint availability + missing required env count.

### Alerts (P1/P2)
- **P1:** Stripe checkout completed but no dispatch queued within SLA.
- **P1:** Dispatch retries exhausted / routing snapshot failed.
- **P1:** Dify timeout/failure rate above threshold for 5+ minutes.
- **P1:** Resend webhook signature failures spike.
- **P2:** Duplicate webhook dedupe hits exceed baseline.
- **P2:** Env parity missing-required detected at runtime.

### Alert routing
- P1 to paging channel (on-call) + incident timeline.
- P2 to operations queue + business hours triage.

### Runbook hard requirements
- Single source of truth for active webhook endpoints.
- Exact replay steps for Stripe/Resend events.
- Clear rollback criteria for demo-day deployment.

---

## Evidence Snapshot (Commands Executed)

- `pnpm --filter @evolve-edge/web exec tsc --noEmit`  
  - **Result:** failed with type errors (`intake-to-app-dispatch` JSON typing and unresolved `@sentry/nextjs` declarations).
- `pnpm audit --json`  
  - **Result:** reported zero known package vulnerabilities at time of execution.

Additionally reviewed demo-critical routes/services, including:
- `apps/web/app/api/webhooks/stripe/route.ts`
- `apps/web/app/api/webhooks/resend/route.ts`
- `apps/web/app/api/automation/intake-to-n8n/route.ts`
- `apps/web/app/api/automation/intake-to-app-dispatch/route.ts`
- `apps/web/app/api/internal/workflows/status/route.ts`
- `apps/web/app/api/internal/workflows/report-ready/route.ts`
- `apps/web/lib/workflow-dispatch.ts`
- `apps/web/lib/security-webhooks.ts`
- `apps/web/lib/env-validation.ts`
- `apps/web/lib/runtime-config.ts`

