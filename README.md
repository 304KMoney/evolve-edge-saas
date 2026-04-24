# Evolve Edge SaaS

Evolve Edge is a Next.js control plane for AI security, compliance, audit delivery, and customer operations.

Current production AI execution path:

- `n8n -> POST /api/internal/ai/execute -> Next.js queues AnalysisJob -> scheduled worker runs LangGraph -> OpenAI -> validated structured output -> Neon-backed persistence`

Source-of-truth boundaries:

- Next.js owns product logic and customer-visible state
- Neon/Postgres is the system of record
- n8n triggers and observes workflow execution only
- LangGraph sequences AI workflow nodes only
- OpenAI performs model execution only
- Dify is deprecated and retained only as a temporary rollback reference

Key env vars for AI execution:

- `AI_EXECUTION_PROVIDER=openai_langgraph`
- `AI_EXECUTION_DISPATCH_SECRET`
- `OPENAI_API_KEY`
- `OPENAI_CHEAP_MODEL`
- `OPENAI_MODEL`
- `OPENAI_REASONING_MODEL`
- `OPENAI_STRONG_MODEL`
- `AI_EXECUTION_TIMEOUT_MS`
- `AI_EXECUTION_MAX_INPUT_CHARS`
- `AI_EXECUTION_STARTER_MAX_INPUT_CHARS`
- `AI_EXECUTION_SCALE_MAX_INPUT_CHARS`
- `AI_EXECUTION_ENTERPRISE_MAX_INPUT_CHARS`
- `AI_EXECUTION_MAX_CONCURRENCY`
- `AI_EXECUTION_MAX_CONCURRENT_PER_ORG`
- `AI_EXECUTION_ORG_RATE_LIMIT_WINDOW_MS`
- `AI_EXECUTION_ORG_RATE_LIMIT_MAX_REQUESTS`
- `AI_EXECUTION_WORKFLOW_RATE_LIMIT_WINDOW_MS`
- `AI_EXECUTION_WORKFLOW_RATE_LIMIT_MAX_REQUESTS`
- `AI_EVAL_LIVE=false` by default for mocked AI evals in CI and local regression runs
- `HUBSPOT_REPORT_DELIVERED_DEAL_STAGE_ID` optionally maps delivered reports to a HubSpot deal stage when `crmDealId` is present

Model routing:

- `business_context`, `framework_mapper`, and `risk_scoring` use the cheaper model tier
- `risk_analysis`, `remediation_roadmap`, and `final_report` use the stronger model tier
- plan-aware input caps are enforced before any model call so oversized workflows fail safely

Report rendering path:

- dashboard and export routes render from validated LangGraph output through an app-owned report view model
- raw model payloads are not rendered directly
- export remains on the existing HTML attachment route: `/api/reports/:id/export`
- AI-generated reports now enter an internal review gate before client delivery: `generated -> pending_review -> approved/rejected -> delivered`
- once a report is delivered, the app queues the customer delivery email, schedules 3-day and 7-day follow-ups, refreshes expansion opportunities, and projects delivery status to HubSpot

Commercial routing path:

- Stripe remains billing authority only
- the app resolves plan entitlements and persists a `RoutingSnapshot`
- Starter routes to concise report depth with capped findings
- Scale routes to enhanced report depth with deeper roadmap detail
- Enterprise routes to custom/full report depth with full executive capability flags
- n8n and AI consume routing hints but do not own or override commercial decisions

Required n8n env vars for the supported execution path:

- `EVOLVE_EDGE_APP_URL`
- `EVOLVE_EDGE_INTERNAL_API_SECRET`

Workflow reference:

- [docs/workflows/n8n-ai-execution.md](/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/docs/workflows/n8n-ai-execution.md)
- [docs/ai-evaluation.md](/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/docs/ai-evaluation.md)
- [docs/load-testing.md](/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/docs/load-testing.md)
- [docs/deployment-cicd.md](/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/docs/deployment-cicd.md)
- [docs/data-retention.md](/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/docs/data-retention.md)
- [docs/executive-delivery-layer.md](/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/docs/executive-delivery-layer.md)

Local commands:

```bash
pnpm install
pnpm ci:env:validate
pnpm typecheck
pnpm lint
pnpm --filter @evolve-edge/web test
pnpm test:ai
pnpm ai:eval
pnpm --filter @evolve-edge/web load:test:ai
pnpm dev
```
