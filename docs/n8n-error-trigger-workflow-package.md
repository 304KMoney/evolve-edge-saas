# n8n Error Trigger Workflow Package (Production)

Use this when n8n workflow JSON is managed outside this repo.

## Objective
Route **any n8n execution failure** into a normalized operator alert path with dedupe controls and app context.

## Workflow name
`Evolve Edge - n8n Execution Failure Monitor`

## Nodes (exact sequence)
1. **Error Trigger**
   - Trigger: n8n global error trigger.
2. **Set: normalize_error_payload**
   - Build payload fields:
     - `workflow_name`: `{{$json.workflow?.name || 'unknown'}}`
     - `execution_id`: `{{$json.execution?.id || ''}}`
     - `execution_url`: `{{$json.execution?.url || ''}}`
     - `node_name`: `{{$json.node?.name || 'unknown'}}`
     - `error_message`: `{{$json.error?.message || 'unknown error'}}`
     - `timestamp`: `{{$now}}`
     - `environment`: `{{$env.N8N_ENVIRONMENT || 'unknown'}}`
     - `app_org_id`: `{{$json.execution?.data?.resultData?.runData?.app_org_id || ''}}`
     - `customer_email`: `{{$json.execution?.data?.resultData?.runData?.customer_email || ''}}`
3. **Code: derive_dedupe_key**
   - Key format: `n8n-failure:{{$json.workflow_name}}:{{$json.node_name}}:{{$json.error_message.slice(0,120)}}`
4. **Data Store or Redis: dedupe_guard**
   - If dedupe key exists within 15 minutes: stop branch (`no alert`).
   - Else set key TTL 15m and continue.
5. **HTTP Request: app_writeback_failed**
   - Method: `POST`
   - URL: `${APP_BASE_URL}/api/internal/workflows/failed`
   - Headers:
     - `Authorization: Bearer ${N8N_CALLBACK_SECRET}`
     - `Content-Type: application/json`
   - Body:
     ```json
     {
       "dispatchId": "{{$json.execution_id}}",
       "failure_reason": "{{$json.error_message}}",
       "externalExecutionId": "{{$json.execution_id}}",
       "metadata": {
         "workflow_name": "{{$json.workflow_name}}",
         "node_name": "{{$json.node_name}}",
         "execution_url": "{{$json.execution_url}}",
         "environment": "{{$json.environment}}",
         "app_org_id": "{{$json.app_org_id}}",
         "customer_email": "{{$json.customer_email}}"
       }
     }
     ```
6. **Slack or Email alert node (operator channel)**
   - Minimum alert fields:
     - workflow name
     - execution id/link
     - node name
     - timestamp
     - summarized error message
     - environment
     - org/email context when available

## Operator channel recommendation
- Primary: Slack `#ops-alerts` webhook.
- Secondary fallback: email to on-call inbox.

## Anti-spam guidance
- Dedupe key TTL 15 minutes for repeated identical failures.
- Add max burst cap: 20 alerts / 15 minutes per workflow.
- Send one digest alert after burst cap is reached.

## Validation test
1. Intentionally fail a low-risk staging n8n node.
2. Confirm one alert in operator channel.
3. Confirm callback to `/api/internal/workflows/failed` succeeds.
4. Repeat identical failure within 15 minutes and confirm dedupe suppresses duplicates.
