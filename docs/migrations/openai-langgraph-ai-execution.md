# OpenAI + LangGraph AI Execution Migration

## Summary

Evolve Edge now supports an app-owned AI execution layer built on:

- OpenAI Responses API for model execution and structured outputs
- LangGraph for deterministic audit/report workflow sequencing
- internal provider selection via `AI_EXECUTION_PROVIDER`
- `POST /api/internal/ai/execute` as the n8n-facing internal trigger

The app and Neon remain the source of truth. n8n remains orchestration only.
Dify is deprecated.

## Active provider path

- default provider: `openai_langgraph`
- deprecated provider flag: `dify`
- provider selection lives in `apps/web/src/server/ai/providers/index.ts`
- provider contracts live in `apps/web/src/server/ai/providers/types.ts`
- active queued analysis dispatch lives in `apps/web/lib/ai-execution.ts`

## New internal execution endpoints

- `POST /api/internal/workflows/audit/execute`
- `POST /api/internal/ai/execute`

Required payload fields:

- `orgId`
- `assessmentId`
- `workflowDispatchId`
- `dispatchId`
- `customerEmail`
- `companyName`
- `industry`
- `companySize`
- `selectedFrameworks`
- `assessmentAnswers`
- `evidenceSummary`
- `planTier`

Stable response shape:

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

## n8n payload change

Before, downstream automation often assumed a Dify execution target.

```json
{
  "analysisProvider": "dify",
  "analysisModel": "dify-workflow",
  "callbacks": {
    "status_url": "https://app.example/api/internal/workflows/status",
    "report_writeback_url": "https://app.example/api/internal/workflows/report-writeback"
  }
}
```

After migration, n8n should target the app-owned execution endpoint and treat the provider as internal app state:

```json
{
  "executionEndpoint": "https://app.example/api/internal/ai/execute",
  "authorization": "Bearer ${EVOLVE_EDGE_INTERNAL_API_SECRET}",
  "dispatchId": "disp_123",
  "workflowDispatchId": "wd_123",
  "orgId": "org_123",
  "assessmentId": "asm_123",
  "customerEmail": "buyer@example.com",
  "companyName": "Example Org",
  "industry": "Healthcare",
  "companySize": "51-200",
  "selectedFrameworks": ["SOC 2", "HIPAA"],
  "assessmentAnswers": [
    {
      "question": "Do you have formal security policies?",
      "answer": "No"
    }
  ],
  "evidenceSummary": "Policies are incomplete and vendor review is informal.",
  "planTier": "scale"
}
```

Rules:

- n8n must not own prompt logic, framework mapping, scoring, or report state
- n8n may trigger the app-owned execution route and then observe app-owned job/status state
- AI output must pass backend validation before the app updates customer-visible state
- dashboard report pages and report exports must render from validated LangGraph output through backend-owned view models
- existing report export remains HTML-only until a dedicated PDF pipeline exists inside the app

## Env changes

New:

- `AI_EXECUTION_PROVIDER`
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

Model routing and cost controls:

- `business_context` -> cheaper model
- `framework_mapper` -> cheaper model
- `risk_scoring` -> cheaper model
- `risk_analysis` -> stronger model
- `remediation_roadmap` -> stronger model
- `final_report` -> stronger model
- input size is capped globally and by plan tier before model execution
- workflow-level estimated token and cost data is logged from the provider layer

Deprecated for rollback only:

- `DIFY_EXECUTION_ENABLED`
- `DIFY_API_BASE_URL`
- `DIFY_API_KEY`
- `DIFY_WORKFLOW_ID`
- `DIFY_WORKFLOW_VERSION`
- `DIFY_TIMEOUT_MS`
- `DIFY_DISPATCH_SECRET`

## Rollout steps

1. Install new dependencies and deploy with `AI_EXECUTION_PROVIDER=openai_langgraph`.
2. Populate OpenAI environment variables in Vercel Preview first.
3. Set `AI_EXECUTION_DISPATCH_SECRET` and mirror it into the n8n HTTP Request header.
4. Run targeted tests for provider selection, contracts, workflow dispatch, and internal execute handling.
5. Update n8n to call the app-owned execute endpoint instead of any Dify node.
6. Validate preview, then promote the same configuration to production.

## Rollback

1. Set `AI_EXECUTION_PROVIDER=dify`.
2. Restore Dify credentials and workflow env vars if they were removed from the environment.
3. Redeploy so runtime config picks up the rollback provider selection.
4. Keep n8n pointed at the app-owned endpoint if possible so the auth boundary stays stable.

## Follow-up items

- add persistent LangGraph checkpointing only if it fits the existing app-owned job model cleanly
- remove deprecated Dify docs and code after the rollback window closes
- align older Dify-named doc references and legacy job labels with provider-neutral language
