# AI Load Testing And Scaling

Evolve Edge keeps AI execution app-owned:

- `n8n` triggers the internal app endpoint
- the Next.js backend accepts and queues analysis work
- `AnalysisJob` is the system-of-record job record
- the app worker runs LangGraph and OpenAI execution

## What Was Added

- org-scoped AI trigger rate limiting
- workflow-dispatch scoped duplicate-trigger rate limiting
- bounded AI worker concurrency
- per-org concurrency caps so one tenant cannot monopolize execution
- a local synthetic load script for 10, 50, and 100 concurrent workflows

## Runtime Controls

- `AI_EXECUTION_MAX_CONCURRENCY`
  Global cap for simultaneous OpenAI/LangGraph executions
- `AI_EXECUTION_MAX_CONCURRENT_PER_ORG`
  Tenant cap for simultaneous OpenAI/LangGraph executions
- `AI_EXECUTION_ORG_RATE_LIMIT_WINDOW_MS`
  Org-scoped acceptance window
- `AI_EXECUTION_ORG_RATE_LIMIT_MAX_REQUESTS`
  Org-scoped trigger cap
- `AI_EXECUTION_WORKFLOW_RATE_LIMIT_WINDOW_MS`
  Workflow-dispatch acceptance window
- `AI_EXECUTION_WORKFLOW_RATE_LIMIT_MAX_REQUESTS`
  Workflow-dispatch duplicate-trigger cap

## Run The Load Harness

From the repo root:

```powershell
corepack pnpm --filter @evolve-edge/web load:test:ai
```

The script simulates n8n-like dispatches, queues jobs, runs bounded worker execution, and prints:

- average API acceptance time
- average and p95 queue latency
- average and p95 workflow execution time
- failure rate
- peak concurrent executions
- duplicate-claim prevention count
- a simple bottleneck ranking:
  - OpenAI latency
  - LangGraph orchestration
  - DB writes
  - API acceptance

## What To Watch

- High queue latency with low execution latency usually means concurrency is too low.
- High execution latency with low DB time usually means OpenAI is the dominant bottleneck.
- Rising DB write time under load means report persistence and state writes need tuning before raising concurrency.
- A growing duplicate-prevention count can indicate noisy retries or overly aggressive n8n replay behavior.

## Recommended Scaling Path

1. Keep `AI_EXECUTION_MAX_CONCURRENCY` conservative at first.
2. Set `AI_EXECUTION_MAX_CONCURRENT_PER_ORG` below the global cap.
3. Increase global concurrency in small steps while watching queue latency, failures, and DB timing.
4. Keep workflow-dispatch rate limits enabled to dampen duplicate n8n replays.
5. If OpenAI remains the dominant bottleneck, optimize model routing before raising concurrency further.
