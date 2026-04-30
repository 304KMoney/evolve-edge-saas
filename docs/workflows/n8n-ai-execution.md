# n8n AI Execution

This document defines the supported n8n-to-app execution contract for Evolve
Edge AI analysis.

## Summary

Old path:

- `n8n -> Dify node or Dify HTTP API -> Dify response parsing -> app callbacks`

New path:

- `n8n -> POST /api/internal/ai/execute -> Next.js queues AnalysisJob -> background worker runs LangGraph audit workflow -> OpenAI -> validated structured output -> backend-owned persistence/status update`

Rules:

- do not call OpenAI directly from n8n
- do not put prompt logic in n8n
- do not let n8n own framework mapping, scoring, or report generation
- do not let n8n decide commercial plan routing or workflow depth
- do not parse and persist AI report content in n8n
- n8n triggers execution and observes app-owned status only

## Current repo assumptions found during inspection

Documented legacy Dify-facing assumptions still appeared in:

- [stripe-n8n-dify-hubspot-integration.md](/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/docs/stripe-n8n-dify-hubspot-integration.md)
- [n8n-node-contract-sheet.md](/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/docs/n8n-node-contract-sheet.md)
- [openai-langgraph-ai-execution.md](/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/docs/migrations/openai-langgraph-ai-execution.md)
- [.env.example](/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/.env.example)
- deployment docs that still list Dify rollback variables

No checked-in n8n workflow JSON export with a literal Dify node was found in the
repo. The remaining Dify-facing path is documented behavior and rollback env,
not an active checked-in n8n workflow definition.

Legacy assumptions to remove or bypass in n8n:

- Dify API credentials in workflow docs
- Dify HTTP calls
- Dify workflow id configuration
- response parsing for `answer`
- response parsing for `text`
- response parsing for `data.outputs`
- response parsing for `workflow_run_id`
- any branch that treats Dify status fields as canonical
- any branch that writes AI report content back from n8n into app state

## Required n8n environment variables

Set these in n8n:

- `EVOLVE_EDGE_APP_URL`
- `EVOLVE_EDGE_INTERNAL_API_SECRET`

Deprecated and no longer required for the supported path:

- `DIFY_API_KEY`
- `DIFY_BASE_URL`
- `DIFY_WORKFLOW_ID`
- `DIFY_USER`
- `DIFY_RESPONSE_MODE`

## Recommended workflow shape

Keep your existing trigger logic if already present:

- Stripe event intake if used
- HubSpot contact or deal lookup if used
- assessment submission trigger if used
- callback dispatch validation
- status or notification updates

Replace only the AI execution step.

Recommended node order:

1. trigger node or inbound webhook
2. `Set` or `Code`: `normalize_ai_dispatch_payload`
3. `IF`: `missing_required_dispatch_fields`
4. `HTTP Request`: `Call Evolve Edge AI Execution`
5. optional status or notification branches

## Compatibility mapping node

Before calling the app endpoint, normalize older field names into the current
contract.

Recommended normalized object:

```json
{
  "orgId": "={{$json.orgId || $json.app_org_id || $json.organizationId || ''}}",
  "assessmentId": "={{$json.assessmentId || $json.assessment?.assessmentId || ''}}",
  "workflowDispatchId": "={{$json.workflowDispatchId || $json.workflow_dispatch_id || $json.request_id || ''}}",
  "dispatchId": "={{$json.dispatchId || $json.dispatch_id || $json.request_id || ''}}",
  "customerEmail": "={{$json.customerEmail || $json.email || $json.customer_email || ''}}",
  "companyName": "={{$json.companyName || $json.customer_name || $json.company_name || ''}}",
  "industry": "={{$json.industry || ''}}",
  "companySize": "={{$json.companySize || $json.company_size || ''}}",
  "selectedFrameworks": "={{$json.selectedFrameworks || $json.frameworks || []}}",
  "assessmentAnswers": "={{$json.assessmentAnswers || $json.answers || $json.event?.payload?.sections || []}}",
  "evidenceSummary": "={{$json.evidenceSummary || $json.additional_notes || ''}}",
  "planTier": "={{$json.planTier || $json.tier || $json.purchased_tier || 'scale'}}"
}
```

Compatibility notes:

- `customer_name` should map to `companyName` only if that field is really the company label in your existing workflow
- if `customer_name` is actually a person, map `company_name` to `companyName` instead
- `email` maps to `customerEmail`
- `tier` maps to `planTier`
- `answers` maps to `assessmentAnswers`
- `frameworks` maps to `selectedFrameworks`
- `workflow_dispatch_id` maps to `workflowDispatchId`
- `dispatch_id` maps to `dispatchId`

## Required dispatch validation

Before the HTTP Request node, validate:

- `orgId`
- `assessmentId`
- `workflowDispatchId`
- `dispatchId`
- `customerEmail`

Recommended `IF` failure branch outcome:

```json
{
  "accepted": false,
  "status": "failed",
  "reason": "missing_required_dispatch_fields"
}
```

Rules:

- do not call `/api/internal/ai/execute` when required fields are missing
- route the failure branch into your existing operator alert or workflow-failed path if present
- do not fabricate missing identifiers in n8n

## HTTP Request node

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

Body JSON:

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

## Expected response

Current production behavior in the app:

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

If the same `workflowDispatchId` is submitted again, the app returns the
existing job status instead of creating a duplicate job. That status may be:

```json
{
  "accepted": true,
  "provider": "openai_langgraph",
  "workflowDispatchId": "wd_123",
  "dispatchId": "disp_123",
  "status": "running",
  "nextCallbackExpected": true
}
```

Parse only these app-owned fields:

- `accepted`
- `provider`
- `workflowDispatchId`
- `dispatchId`
- `status`
- `nextCallbackExpected`

Commercial routing note:

- the app persists a `RoutingSnapshot` before dispatch
- that snapshot now carries immutable commercial policy such as report depth,
  findings cap, roadmap detail, and executive/monitoring eligibility
- n8n may forward the dispatch identifiers, but it must not modify plan or
  capability routing

## Remove Dify response parsing

Delete or bypass any logic expecting:

- `answer`
- `text`
- `data.outputs`
- `workflow_run_id`
- Dify-specific status fields

Do not replace those with any direct model-output parsing in n8n.

## Callback and status behavior

The app now owns:

- workflow execution
- structured output validation
- persistence
- assessment status changes
- report-ready state changes

n8n should only:

- trigger execution
- receive `accepted`, `completed`, or `failed` status
- optionally branch into HubSpot, email, Slack, or operator notifications

n8n should not:

- parse AI findings into product state
- save report content into the app database
- recompute scores
- choose frameworks
- build prompts

If your current workflow already has status callback or failure callback nodes
for operational visibility, keep them only if they are still needed for
downstream notifications. They are no longer the primary persistence path for AI
content.

## Test payload

Use this payload in Postman or n8n during rollout:

```json
{
  "orgId": "org_123",
  "assessmentId": "asm_123",
  "workflowDispatchId": "wd_123",
  "dispatchId": "disp_123",
  "customerEmail": "buyer@example.com",
  "companyName": "Example Health",
  "industry": "healthtech",
  "companySize": "11-50",
  "selectedFrameworks": ["SOC 2", "HIPAA"],
  "assessmentAnswers": [
    {
      "question": "Do you have formal security policies?",
      "answer": "No"
    },
    {
      "question": "Do you use third-party AI tooling?",
      "answer": "Yes"
    }
  ],
  "evidenceSummary": "Policies are incomplete and vendor review is informal.",
  "planTier": "scale"
}
```

## Troubleshooting

### `401` or `403` from `/api/internal/ai/execute`

- confirm `EVOLVE_EDGE_INTERNAL_API_SECRET` matches app env `AI_EXECUTION_DISPATCH_SECRET`
- confirm the header is `Authorization: Bearer ...`

### `400` or validation failure

- confirm `selectedFrameworks` is an array
- confirm `assessmentAnswers` is an array
- confirm `planTier` is one of `starter`, `scale`, or `enterprise`
- confirm required dispatch fields are present before the HTTP Request node

### Request accepted but workflow fails

- check Evolve Edge app logs and `AnalysisJob`
- confirm `OPENAI_API_KEY`, `OPENAI_MODEL`, and `AI_EXECUTION_PROVIDER=openai_langgraph`
- confirm the assessment belongs to the supplied `orgId`

### Missing report or status in the app

- confirm the endpoint response included `accepted: true`
- confirm the app created or reused an `AnalysisJob` with status `QUEUED`, then `RUNNING`, then `SUCCEEDED`
- confirm the app updated the assessment to `ANALYSIS_RUNNING` then `REPORT_DRAFT_READY`
- confirm no legacy n8n node attempted to overwrite app-owned state

### HubSpot branch still needed

- keep HubSpot lookup or notification branches if they are downstream observers only
- do not make HubSpot the owner of audit execution status

## n8n test checklist

1. Valid payload triggers AI execution.
2. Missing `dispatchId` fails safely before the HTTP Request node.
3. Missing `workflowDispatchId` fails safely before the HTTP Request node.
4. Invalid secret returns `401` or `403`.
5. Endpoint returns `provider: openai_langgraph`.
6. No Dify node is executed.
7. Report and status appear in the Evolve Edge app.
8. HubSpot sync still works if enabled.
