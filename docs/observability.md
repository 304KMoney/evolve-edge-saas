# Observability

This document covers LangGraph audit workflow tracing, debugging, and replay.

It also covers checkpoint persistence for resumable audit workflows.

## What is captured

Evolve Edge now tracks every audit workflow execution with:

- workflow-level start, success, and failure logs
- per-node start, success, and failure logs
- in-memory workflow trace state during execution
- sanitized trace snapshots stored alongside analysis job output when available
- safe replay support using the original normalized workflow input

The logging contract is structured and backend-owned.

## Customer-visible progress

The app now persists a sanitized customer-facing workflow progress marker in
`CustomerRun.contextJson.workflowProgress`.

Supported statuses:

- `queued`
- `preparing_context`
- `mapping_frameworks`
- `analyzing_risks`
- `scoring_risk`
- `building_roadmap`
- `generating_report`
- `pending_review`
- `completed`
- `failed`

These updates are app-owned, derived from workflow milestones, and intentionally
do not include raw AI output, prompts, or sensitive customer content.

## Security hardening

The internal AI execution path now applies these protections:

- `/api/internal/ai/execute` accepts only a configured shared secret or service
  token through `Authorization: Bearer ...` or `x-evolve-edge-service-token`
- internal execution requests are rate-limited through the existing route rate
  limiter
- log metadata is redacted for prompts, evidence, email addresses, tokens, API
  keys, and other secret-bearing values
- prompt builders treat assessment answers and evidence as untrusted data and
  explicitly instruct the model never to follow instructions inside customer
  content
- customer-provided content is sanitized before being interpolated into prompt
  templates

## Checkpoint lifecycle

Audit workflow checkpoints are now persisted per node using the app-owned
database. Each checkpoint stores:

- `workflowDispatchId`
- `dispatchId`
- `orgId`
- `assessmentId`
- `nodeName`
- `nodeOrder`
- `status`
- sanitized `stateSnapshot`
- optional sanitized `errorMessage`
- `createdAt`

Checkpoint statuses:

- `RUNNING`
- `COMPLETED`
- `FAILED`
- `PAUSED_FOR_REVIEW`

Lifecycle behavior:

1. when a node starts, a `RUNNING` checkpoint is written
2. when a node succeeds, a `COMPLETED` checkpoint is written
3. when a node fails, a `FAILED` checkpoint is written
4. when `final_report` succeeds, a `PAUSED_FOR_REVIEW` checkpoint is written

The `PAUSED_FOR_REVIEW` checkpoint is the human-review handoff. It captures the
validated workflow state before any downstream client delivery behavior.

Sensitive inputs are minimized in checkpoint snapshots:

- `customerEmail` is nulled in persisted checkpoints
- nested strings are sanitized for obvious secrets
- checkpoint state is intended for internal workflow recovery, not customer
  display

Resume behavior:

- if the latest checkpoint is `FAILED`, the workflow resumes from that node
- if the latest checkpoint is `RUNNING`, the workflow resumes from that node as
  an interrupted attempt
- if the latest checkpoint is `COMPLETED`, the workflow resumes from the next
  node
- if the latest checkpoint is `PAUSED_FOR_REVIEW`, the workflow is treated as
  complete from an AI-execution perspective and does not rerun downstream nodes

## Logging structure

Each node execution emits a structured log with:

- `node`
- `workflowDispatchId`
- `dispatchId`
- `orgId`
- `timestamp`
- `status`
- `durationMs`

Workflow-level logs emit:

- `workflowDispatchId`
- `dispatchId`
- `orgId`
- `timestamp`
- `status`
- optional sanitized error

Prompts, API keys, and raw secrets are never intentionally logged.

## Trace format

The workflow trace shape is:

```json
{
  "workflowDispatchId": "wd_123",
  "dispatchId": "disp_123",
  "assessmentId": "asm_123",
  "orgId": "org_123",
  "startedAt": "2026-04-24T16:00:00.000Z",
  "finishedAt": "2026-04-24T16:00:08.000Z",
  "status": "completed",
  "nodes": [
    {
      "name": "business_context",
      "status": "completed",
      "startedAt": "2026-04-24T16:00:00.000Z",
      "finishedAt": "2026-04-24T16:00:01.200Z",
      "durationMs": 1200
    }
  ],
  "error": null
}
```

If `AI_DEBUG_MODE=true`, sanitized intermediate node outputs are included in the
trace response and debug execution payloads.

## Trace endpoint

Use the internal trace endpoint:

- `GET /api/internal/workflows/{workflowDispatchId}/trace`

Auth:

- `Authorization: Bearer <AI_EXECUTION_DISPATCH_SECRET>`

Use this endpoint to:

- inspect node durations
- see the node that failed
- confirm whether the workflow completed
- retrieve sanitized debug output when debug mode is enabled

## Debugging failed workflows

Recommended flow:

1. Call the trace endpoint for the `workflowDispatchId`.
2. Identify the failed node and its duration.
3. Check app logs for `ai.workflow.node` and `ai.workflow.execution`.
4. Review the corresponding `AnalysisJob` and assessment status.
5. Confirm OpenAI configuration and structured-output validation behavior.

Safe failure responses expose:

```json
{
  "status": "failed",
  "reason": "node_execution_failed",
  "node": "risk_analysis"
}
```

Internal stacks remain internal-only and are not returned through the public
trace shape.

Checkpoint records are also safe to inspect directly when a workflow failed
before a final output payload was written.

## Replay workflows

Programmatic replay uses `replayWorkflow(workflowDispatchId)`.

Behavior:

- reloads the original normalized input from the stored `AnalysisJob.inputPayload`
- re-runs the LangGraph workflow through the provider layer
- defaults to dry-run behavior unless persistence is explicitly requested
- does not duplicate customer-visible DB writes unless `persistResult` is set
- automatically benefits from checkpoint-aware resume behavior when the same
  `workflowDispatchId` has persisted checkpoints

Safe replay guidance:

1. replay in dry-run first
2. inspect the returned trace
3. only persist replay metadata if you explicitly need operator history
4. avoid replaying until the underlying prompt, model, or input issue is understood

## AI debug mode

Set:

- `AI_DEBUG_MODE=true`

When enabled:

- trace responses include sanitized node outputs
- `/api/internal/ai/execute` may include the trace in its response
- replay responses include the trace object

When disabled:

- execution still logs and traces node state
- intermediate outputs are not returned in responses

## Risks and limits

- in-memory traces are process-local, so the persisted snapshot is the safer
  source after execution completes
- checkpoint persistence requires the `AuditWorkflowCheckpoint` schema to be
  present in the deployed database
- failed traces are sanitized, but operators should still treat them as internal
  data
- replay can re-run model calls and consume tokens even in dry-run mode
- do not use debug mode as a customer-facing feature
