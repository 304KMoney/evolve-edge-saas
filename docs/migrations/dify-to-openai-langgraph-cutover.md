# Dify To OpenAI + LangGraph Cutover

This runbook is the production cutover checklist for replacing the legacy
Dify-facing AI execution path with the app-owned OpenAI + LangGraph path.

Target production flow:

- `n8n -> POST /api/internal/ai/execute -> Next.js queues AnalysisJob -> scheduled worker runs LangGraph -> OpenAI -> validated structured output -> backend-owned persistence/status update`

Architectural rules for cutover:

- Next.js remains the owner of product logic and customer-visible state.
- Neon/Postgres remains the system of record.
- n8n triggers and observes execution only.
- OpenAI performs model execution only.
- LangGraph sequences deterministic workflow nodes only.
- Dify is deprecated and retained only as a temporary rollback path.

## Current Repo State Confirmed During Inspection

Checked sources:

- [README.md](/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/README.md)
- [.env.example](/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/.env.example)
- [vercel-env-fill-sheet.md](/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/docs/vercel-env-fill-sheet.md)
- [n8n-ai-execution.md](/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/docs/workflows/n8n-ai-execution.md)
- [openai-langgraph-ai-execution.md](/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/docs/migrations/openai-langgraph-ai-execution.md)
- [stripe-n8n-dify-hubspot-integration.md](/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/docs/stripe-n8n-dify-hubspot-integration.md)
- [n8n-node-contract-sheet.md](/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/docs/n8n-node-contract-sheet.md)
- [.github/workflows/ci.yml](/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/.github/workflows/ci.yml)

Important findings:

- The supported app path already targets `AI_EXECUTION_PROVIDER=openai_langgraph`.
- `.env.example` keeps Dify env vars only for rollback.
- The n8n contract doc already expects `POST /api/internal/ai/execute`.
- CI already runs typecheck, unit tests, mocked AI regression tests, and mocked AI evals.
- No checked-in `vercel.json` or `apps/web/vercel.json` deployment config file was found. Deployment setup is currently documented through env worksheets and platform configuration, not repo-local Vercel JSON.

## Pre-Deployment Checklist

Complete these before touching production traffic:

1. Confirm the app code deployed to Preview already uses the OpenAI + LangGraph provider path.
2. Confirm `POST /api/internal/ai/execute` returns the stable queued response shape.
3. Confirm the scheduled analysis worker is active in the target environment.
4. Confirm Neon schema and Prisma client are current for:
   - `AnalysisJob`
   - report review statuses
   - workflow checkpoints if enabled
5. Confirm no active n8n workflow still calls Dify directly.
6. Confirm no n8n branch still parses Dify fields like:
   - `answer`
   - `text`
   - `data.outputs`
   - `workflow_run_id`
7. Confirm HubSpot sync remains observer-only and does not own audit state.
8. Confirm rollback Dify credentials still exist somewhere secure in case rollback is needed.
9. Confirm Preview smoke tests pass before Production env changes.

## Required Environment Variables

### App Env Required For OpenAI + LangGraph

Set in Vercel Preview first, then Production:

- `AI_EXECUTION_PROVIDER=openai_langgraph`
- `AI_EXECUTION_DISPATCH_SECRET`
- `OPENAI_API_KEY`
- `OPENAI_CHEAP_MODEL`
- `OPENAI_MODEL`
- `OPENAI_STRONG_MODEL`
- `OPENAI_REASONING_MODEL` optional
- `AI_EXECUTION_TIMEOUT_MS`
- `AI_EXECUTION_MAX_INPUT_CHARS`
- `AI_EXECUTION_STARTER_MAX_INPUT_CHARS`
- `AI_EXECUTION_SCALE_MAX_INPUT_CHARS`
- `AI_EXECUTION_ENTERPRISE_MAX_INPUT_CHARS`

Optional but recommended:

- `AI_EXECUTION_SERVICE_TOKEN`
- `OPENAI_CHEAP_MODEL_INPUT_COST_PER_1M_TOKENS`
- `OPENAI_CHEAP_MODEL_OUTPUT_COST_PER_1M_TOKENS`
- `OPENAI_STRONG_MODEL_INPUT_COST_PER_1M_TOKENS`
- `OPENAI_STRONG_MODEL_OUTPUT_COST_PER_1M_TOKENS`
- `AI_DEBUG_MODE=false`

Rollback-only Dify envs to preserve during the cutover window:

- `DIFY_EXECUTION_ENABLED`
- `DIFY_API_BASE_URL`
- `DIFY_API_KEY`
- `DIFY_WORKFLOW_ID`
- `DIFY_WORKFLOW_VERSION`
- `DIFY_TIMEOUT_MS`
- `DIFY_DISPATCH_SECRET`

### n8n Env Required

Set in n8n:

- `EVOLVE_EDGE_APP_URL`
- `EVOLVE_EDGE_INTERNAL_API_SECRET`

Rule:

- `EVOLVE_EDGE_INTERNAL_API_SECRET` must exactly match app env
  `AI_EXECUTION_DISPATCH_SECRET` unless you intentionally route through the
  service-token header path.

## Vercel Setup

There is no checked-in `vercel.json` in this repo, so use platform env setup.

### Preview

1. Add all OpenAI/LangGraph env vars in Vercel Preview.
2. Keep `AI_EXECUTION_PROVIDER=openai_langgraph`.
3. Keep Dify vars present only if you want same-deploy rollback coverage.
4. Deploy Preview.
5. Run the Preview smoke test checklist below.
6. Confirm:
   - internal execute endpoint accepts requests
   - queued jobs move to running/completed
   - validated report data appears in the dashboard

### Production

1. Copy the validated Preview env values into Production.
2. Use the correct production `NEXT_PUBLIC_APP_URL`.
3. Use production OpenAI credentials.
4. Set production `AI_EXECUTION_DISPATCH_SECRET`.
5. Redeploy Production.
6. Only after deploy succeeds, switch the n8n production AI execution node to the app endpoint if it is not already switched.

## n8n Setup

Replace the old Dify execution step with one HTTP Request node.

Node name:

- `Call Evolve Edge AI Execution`

Method:

- `POST`

URL:

```text
{{$env.EVOLVE_EDGE_APP_URL}}/api/internal/ai/execute
```

Headers:

```text
Authorization: Bearer {{$env.EVOLVE_EDGE_INTERNAL_API_SECRET}}
Content-Type: application/json
```

Body:

```json
{
  "orgId": "={{$json.orgId}}",
  "assessmentId": "={{$json.assessmentId}}",
  "workflowDispatchId": "={{$json.workflowDispatchId}}",
  "dispatchId": "={{$json.dispatchId}}",
  "customerEmail": "={{$json.customerEmail}}",
  "companyName": "={{$json.companyName}}",
  "industry": "={{$json.industry}}",
  "companySize": "={{$json.companySize}}",
  "selectedFrameworks": "={{$json.selectedFrameworks}}",
  "assessmentAnswers": "={{$json.assessmentAnswers}}",
  "evidenceSummary": "={{$json.evidenceSummary}}",
  "planTier": "={{$json.planTier}}"
}
```

Before the HTTP node:

1. Normalize legacy field names if needed.
2. Validate required fields:
   - `orgId`
   - `assessmentId`
   - `workflowDispatchId`
   - `dispatchId`
   - `customerEmail`
3. Route missing-field payloads to a failure branch instead of calling the app.

What to remove or bypass:

- any Dify node
- any HTTP call to Dify
- any Dify API key usage in the workflow
- any response parsing for `answer`
- any response parsing for `text`
- any response parsing for `data.outputs`
- any response parsing for `workflow_run_id`
- any logic that writes AI report content from n8n back into app state

## Expected App Response

Primary expected response during production cutover:

```json
{
  "accepted": true,
  "provider": "openai_langgraph",
  "workflowDispatchId": "wd_123",
  "dispatchId": "disp_123",
  "status": "queued",
  "nextCallbackExpected": true
}
```

Repeated requests with the same `workflowDispatchId` should return the existing
job state instead of creating a duplicate job.

## Smoke Test Checklist

Run in Preview first, then repeat in Production.

### App/API

1. Confirm deploy completes successfully.
2. Confirm `GET` dashboard routes load.
3. Confirm `POST /api/internal/ai/execute` returns `accepted: true`.
4. Confirm response provider is `openai_langgraph`.
5. Confirm response status is `queued` for a fresh dispatch.

### Workflow Execution

1. Submit a valid assessment payload.
2. Trigger workflow execution through n8n.
3. Observe app-owned status progression:
   - `queued`
   - `running`
   - `pending_review` or `completed` depending on current review gate behavior
4. Confirm `AnalysisJob` moves through:
   - `QUEUED`
   - `RUNNING`
   - `SUCCEEDED` or safe `FAILED`
5. Confirm report rendering uses validated report data and loads in the dashboard.

### n8n

1. Confirm the HTTP Request node calls the app endpoint, not Dify.
2. Confirm no Dify credentials are required for the active path.
3. Confirm no Dify node executes.
4. Confirm missing required fields fail before the HTTP Request node.

### Integration Safety

1. Confirm HubSpot still syncs if enabled.
2. Confirm Stripe-driven commercial routing still works.
3. Confirm no raw AI output is written directly by n8n.
4. Confirm no sensitive prompt text appears in logs.

## First Live Customer Test Checklist

Run this with one carefully chosen low-risk live customer or internal pilot.

1. Confirm the customer has the correct plan entitlement in the app.
2. Submit the customer assessment normally through the app.
3. Confirm the app dispatches workflow execution to n8n.
4. Confirm n8n calls `POST /api/internal/ai/execute`.
5. Confirm the app returns `accepted: true`.
6. Confirm dashboard status shows queued/running progress.
7. Confirm the workflow reaches report generation and review state.
8. Confirm the report renders in the dashboard.
9. Confirm no Dify node or Dify API call was used.
10. Confirm HubSpot observer sync still works if enabled for that customer.
11. Confirm internal reviewer can approve or reject the report.
12. Confirm delivery remains gated until approval.

## Required Test Passes Before Production Cutover

These are the minimum operational checks to run or verify from recent CI:

1. Submit assessment.
2. Trigger workflow.
3. Observe queued, running, and completed or pending-review status.
4. Verify report generated.
5. Verify HubSpot still syncs.
6. Verify no Dify node executes.

Recommended supporting checks:

1. `pnpm typecheck`
2. `pnpm test`
3. `pnpm test:ai`
4. `pnpm ai:eval`

CI note:

- [ci.yml](/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/.github/workflows/ci.yml)
  already runs typecheck, lint, unit tests, mocked AI regression tests, and
  mocked AI evals.

## Rollback Plan

Use rollback only if the app-owned OpenAI/LangGraph path fails in production and
cannot be fixed quickly within the incident window.

### Fast Rollback

1. Set `AI_EXECUTION_PROVIDER=dify`.
2. Confirm these envs are present:
   - `DIFY_API_BASE_URL`
   - `DIFY_API_KEY`
   - `DIFY_WORKFLOW_ID`
   - `DIFY_WORKFLOW_VERSION`
   - `DIFY_TIMEOUT_MS`
   - `DIFY_DISPATCH_SECRET`
3. Redeploy the app.
4. Keep n8n pointed at the app endpoint if the app still supports provider selection internally.
5. Re-run the smoke test using one internal dispatch.

### Full n8n Rollback If Needed

Use only if the app endpoint path itself is impaired:

1. Re-enable the legacy Dify execution step in n8n.
2. Restore Dify response parsing only if the legacy path truly requires it.
3. Disable or bypass the new app-owned HTTP execution node.
4. Notify operators that customer-visible state must still be verified in the app after rollback.

## Deployment Risks

Primary risks during cutover:

- n8n still calling a hidden Dify node while operators believe the app endpoint is active
- env mismatch between `AI_EXECUTION_DISPATCH_SECRET` and `EVOLVE_EDGE_INTERNAL_API_SECRET`
- scheduled worker not running, leaving jobs stuck in `QUEUED`
- OpenAI creds or model names missing in Production while Preview works
- legacy Dify response parsing or callback branches overwriting app-owned expectations
- HubSpot observer branches assuming an old execution contract
- rollback drift if Dify credentials were deleted too early

## Operator Notes

- Prefer Preview validation before any Production env switch.
- Keep the n8n change as small as possible: replace the AI execution step, not the entire workflow.
- Preserve app-owned status, persistence, report rendering, and review gating.
- Close the rollback window only after multiple successful live executions.
