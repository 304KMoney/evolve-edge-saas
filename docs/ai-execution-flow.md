# AI Execution Flow

## Source Of Truth

Evolve Edge treats AI as an execution layer only. Next.js validates requests, Neon/Postgres stores product state, LangGraph coordinates audit steps, and OpenAI performs model calls through the backend provider wrapper.

## Current Flow Map

1. Signup creates a user session.
2. Onboarding captures required audit intake and sets `regulatoryProfile.auditIntake.status = "ready_for_audit"`.
3. Billing/checkout or backend app actions create a `RoutingSnapshot`.
4. Backend workflow dispatch creates a `WorkflowDispatch` tied to that snapshot.
5. AI execution may run only with `snapshot_id`, `workflow_code`, `organization_id`, and complete `intake_data`.
6. The OpenAI/LangGraph worker validates structured model output.
7. The backend normalizes the result and writes `AnalysisJob.outputPayload`, report draft metadata, routing state, and delivery state.

## Backend Entry Point

Use `runAuditExecution` from `apps/web/lib/ai-execution.ts`:

```ts
await runAuditExecution({
  snapshot_id,
  workflow_code,
  organization_id,
  intake_data
});
```

The function fails closed when the routing snapshot is missing, the workflow code does not match, the snapshot status is not executable, the workflow dispatch is missing, or intake is incomplete.

## Normalized Output

Validated workflow output is normalized before persistence:

- `executive_summary`
- `risk_level`
- `compliance_score`
- `top_risks`
- `governance_gaps`
- `priority_actions`
- `roadmap_30_60_90`
- `assumptions`
- `limitations`

Malformed or unsafe model output is not persisted as a final report. The analysis job is marked failed with `status: "failed_review_required"` in `outputPayload`.

## Provider Behavior

Default provider:

- `AI_EXECUTION_PROVIDER=openai_langgraph`

Dify remains deprecated rollback compatibility only:

- Set `AI_EXECUTION_PROVIDER=dify` explicitly to select the deprecated provider.
- The Dify provider throws by default in the OpenAI/LangGraph provider surface and the legacy Dify worker remains isolated in `apps/web/lib/dify.ts`.
- Do not use Dify as the source of truth for final output state.

## Required Env Vars

- `DATABASE_URL`
- `AI_EXECUTION_PROVIDER=openai_langgraph`
- `AI_EXECUTION_DISPATCH_SECRET`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

Optional tuning:

- `OPENAI_CHEAP_MODEL`
- `OPENAI_STRONG_MODEL`
- `OPENAI_REASONING_MODEL`
- `AI_EXECUTION_TIMEOUT_MS`
- `AI_EXECUTION_MAX_INPUT_CHARS`
- `AI_EXECUTION_MAX_CONCURRENCY`
- `AI_EXECUTION_MAX_CONCURRENT_PER_ORG`

## Test Commands

```powershell
cd apps/web
.\node_modules\.bin\tsx.CMD --require .\scripts\shims\server-only.js .\test\audit-execution.test.ts
.\node_modules\.bin\tsx.CMD --require .\scripts\shims\server-only.js .\test\ai-execute-route.test.ts
.\node_modules\.bin\tsx.CMD --require .\scripts\shims\server-only.js .\test\ai-execution-worker.test.ts
```

## Manual QA Checklist

1. Complete signup.
2. Complete onboarding intake.
3. Create a routing snapshot.
4. Create or dispatch a workflow tied to the routing snapshot.
5. Trigger audit execution with `snapshot_id`.
6. Confirm execution rejects missing `snapshot_id`.
7. Confirm execution rejects incomplete intake.
8. Confirm OpenAI/LangGraph is used by default.
9. Confirm normalized output is persisted.
10. Confirm malformed output fails with `failed_review_required`.
11. Confirm dashboard/report state only changes after validation.
12. Confirm no Dify-first path is active by default.

## Follow-Ups

- Add a first-class execution status enum if operators need a durable `failed_review_required` status outside `AnalysisJob.outputPayload` and delivery metadata.
- Add an operator replay UI that requires snapshot, dispatch, and intake readiness before replaying analysis.
