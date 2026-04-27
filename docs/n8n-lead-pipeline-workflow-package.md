# n8n Lead Pipeline Workflow Package

Use this when the `leadPipeline` workflow does not exist yet in n8n.

## Objective

Handle app-owned lead lifecycle events downstream for sales automation while
preserving Evolve Edge as the source of truth.

This workflow is intentionally for:

- `lead.captured`
- `lead.converted`
- optional `customer_account.stage_changed`

This workflow is **not** the canonical HubSpot sync path. The app already
projects contacts and companies to HubSpot through
[apps/web/lib/hubspot.ts](C:/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/apps/web/lib/hubspot.ts).

Use this workflow for:

- Slack or email notifications
- Apollo enrichment
- optional HubSpot deal creation if your sales process needs it
- internal operator task creation

Do not use this workflow to replace app-owned lead, lifecycle, routing, or
customer state.

## Workflow name

`Evolve Edge - Lead Pipeline`

## Trigger configuration

### Environment wiring

`N8N_WORKFLOW_DESTINATIONS` should include:

```json
[
  {
    "name": "leadPipeline",
    "url": "https://evolveedgeai.app.n8n.cloud/webhook/evolve-edge/app-dispatch-intake",
    "secret": "replace-with-shared-secret",
    "events": ["lead.captured", "lead.converted", "customer_account.stage_changed"]
  }
]
```

### Incoming payload shape

This workflow receives the generic n8n event envelope from the app, not the
special `audit.requested` payload.

Primary fields to use:

- `{{$json.event.type}}`
- `{{$json.event.aggregateType}}`
- `{{$json.event.aggregateId}}`
- `{{$json.event.payload.normalizedEmail}}`
- `{{$json.event.payload.companyName}}`
- `{{$json.event.payload.intent}}`
- `{{$json.event.payload.requestedPlanCode}}`
- `{{$json.event.payload.attribution}}`

## Nodes (exact sequence)

1. `Webhook`
   - Method: `POST`
   - Path: use your existing `app-dispatch-intake` webhook path
   - Respond: using a dedicated response node or immediately after validation

2. `Code` or `Set`: `normalize_dispatch_payload`
   - Build a narrow normalized object:

```json
{
  "eventType": "{{$json.event.type}}",
  "aggregateId": "{{$json.event.aggregateId}}",
  "organizationId": "{{$json.event.orgId || ''}}",
  "userId": "{{$json.event.userId || ''}}",
  "leadId": "{{$json.event.payload.leadId || $json.event.aggregateId}}",
  "customerAccountId": "{{$json.event.payload.customerAccountId || ''}}",
  "email": "{{$json.event.payload.normalizedEmail || $json.event.payload.email || $json.event.payload.primaryContactEmail || ''}}",
  "firstName": "{{$json.event.payload.firstName || ''}}",
  "lastName": "{{$json.event.payload.lastName || ''}}",
  "companyName": "{{$json.event.payload.companyName || ''}}",
  "jobTitle": "{{$json.event.payload.jobTitle || ''}}",
  "phone": "{{$json.event.payload.phone || ''}}",
  "teamSize": "{{$json.event.payload.teamSize || ''}}",
  "intent": "{{$json.event.payload.intent || ''}}",
  "source": "{{$json.event.payload.source || ''}}",
  "sourcePath": "{{$json.event.payload.sourcePath || ''}}",
  "requestedPlanCode": "{{$json.event.payload.requestedPlanCode || ''}}",
  "stage": "{{$json.event.payload.stage || ''}}",
  "stageLabel": "{{$json.event.payload.stageLabel || ''}}",
  "nextActionLabel": "{{$json.event.payload.nextActionLabel || ''}}",
  "utmSource": "{{$json.event.payload.attribution?.utmSource || ''}}",
  "utmMedium": "{{$json.event.payload.attribution?.utmMedium || ''}}",
  "utmCampaign": "{{$json.event.payload.attribution?.utmCampaign || ''}}",
  "correlationId": "{{$json.correlationId || ''}}",
  "requestId": "{{$json.request_id || $json.dispatchId || ''}}",
  "receivedAt": "{{$now}}"
}
```

3. `IF`: `supported_sales_event`
   - Continue only when:
     - `lead.captured`
     - `lead.converted`
     - `customer_account.stage_changed`

4. `Respond to Webhook`: `dispatch_accepted`
   - Return `200`
   - Minimal body:

```json
{
  "ok": true,
  "accepted": true,
  "workflow": "leadPipeline"
}
```

5. `Switch` or chained `IF` nodes: `route_by_event_type`

### Branch A: `lead.captured`

6. `IF`: `apollo_enabled`
   - Continue if `{{$env.APOLLO_API_KEY}}` exists

7. `HTTP Request`: `apollo_people_search`
    - Method: `POST`
    - URL: `{{$env.APOLLO_API_BASE_URL || 'https://api.apollo.io/api/v1'}}/mixed_people/api_search`
    - Headers:
      - `Accept: application/json`
      - `Authorization: Bearer {{$env.APOLLO_API_KEY}}`
    - Query parameters:

```json
{
  "q_keywords": "{{$json.companyName || $json.email}}",
  "person_titles": ["founder", "ceo", "coo", "ciso", "cto", "security"],
  "person_seniorities": ["founder", "c_suite", "vp", "head"],
  "include_similar_titles": true,
  "page": 1,
  "per_page": 5
}
```

   - If you already have a company domain from an upstream operator list, CRM
     lookup, or manual input, prefer `q_organization_domains_list[]` over
     `q_keywords` for a tighter match.
   - Apollo's People API Search requires a master API key.
   - This search endpoint is optimized for prospecting and does not return email
     addresses or phone numbers.

8. `Set`: `normalize_apollo_results`
   - Keep only operational fields:
     - top person names
     - titles
     - LinkedIn URLs
     - company match summary
   - Do not persist raw Apollo dumps back into app state.

9. `Slack` or `HTTP Request`: `notify_sales_lead_captured`
   - Send founder or sales alert with:
     - event type
     - email
     - company
     - requested plan
     - intent
     - UTM source/campaign
     - Apollo enrichment summary if present

10. Optional `HubSpot` node or `HTTP Request`: `create_or_update_deal`
   - Use only if your ops model needs a HubSpot deal.
   - Recommended only for sales execution, not product truth.
   - Associate to existing contact/company already synced by the app.

11. Optional operator task sink
   - ClickUp / Asana / Linear / Notion / email / Slack follow-up queue
   - Title example:
     - `New Evolve Edge lead: {{$json.companyName || $json.email}}`

### Branch B: `lead.converted`

12. `Slack` or `HTTP Request`: `notify_sales_lead_converted`
   - Include:
     - lead id
     - organization id
     - user id
     - requested plan code

13. Optional `HubSpot` deal stage update
   - Advance deal or lifecycle marker if your sales workflow uses deals.
   - Do not change app-owned provisioning or lifecycle truth from here.

### Branch C: `customer_account.stage_changed`

14. `IF`: `sales_relevant_stage`
   - Continue for sales-relevant stages like:
     - `LEAD`
     - `QUALIFIED`
     - `PROPOSAL_SENT`
     - `WON`
     - `BRIEFING_SCHEDULED`
   - Use the enum-like `stage` field for matching, not `stageLabel`.
   - `stageLabel` is human-readable text such as `Briefing Scheduled`, so a
     regex written for `BRIEFING_SCHEDULED` will not match it reliably.

### JSON-safe n8n condition for `sales_relevant_stage`

If you are pasting node JSON or configuring the `IF` node in JSON mode, use:

```json
{
  "conditions": {
    "string": [
      {
        "value1": "={{ $json.stage || '' }}",
        "operation": "regex",
        "value2": "^(LEAD|QUALIFIED|PROPOSAL_SENT|WON|BRIEFING_SCHEDULED)$"
      }
    ]
  }
}
```

This avoids two common workflow issues:

- matching against `stageLabel` instead of the stable `stage` code
- partial regex matches caused by unanchored patterns

15. `Slack` or task notification
   - Include:
     - customer account id
     - primary contact email
     - stage label
     - next action label

## HubSpot guidance

If you do not see a HubSpot workflow in n8n, that is expected for the canonical
CRM projection path.

HubSpot sync already happens from the app for:

- `lead.captured`
- `lead.converted`
- `org.created`
- `onboarding.completed`
- `assessment.created`
- `report.generated`
- `customer_account.stage_changed`
- `subscription.created`
- `subscription.updated`

That means:

- missing HubSpot data should first be debugged in app outbound delivery records
- n8n HubSpot nodes are optional for sales execution extras such as deal creation
- do not move contact/company sync ownership out of the app

## Apollo guidance

Apollo is optional and should stay enrichment-only.

Current Apollo API notes:

- use `POST /mixed_people/api_search` for people search
- send `Authorization: Bearer <APOLLO_API_KEY>`
- expect people search to return prospect search results, not revealed emails or
  phone numbers
- if you later add enrichment, treat revealed contact data as operator context
  only until the app validates and stores any field it chooses to keep

Safe Apollo outputs:

- similar accounts
- likely decision-maker contacts
- enrichment notes for follow-up
- segmentation hints for Slack or operator tasks

Unsafe Apollo outputs:

- app lifecycle stage decisions
- entitlement or plan decisions
- provisioning triggers without app-owned validation

## Validation checklist

1. Confirm `N8N_WORKFLOW_DESTINATIONS` includes `leadPipeline`.
2. Publish the workflow in n8n.
3. Submit a lead through `/contact-sales`.
4. Confirm n8n receives `lead.captured`.
5. Confirm Slack or operator notification fires.
6. If Apollo is enabled, confirm enrichment executes successfully.
7. Confirm HubSpot contact/company records still come from the app sync path.
8. Convert a lead and confirm `lead.converted` reaches the workflow.
9. Confirm no n8n step attempts to overwrite app-owned product truth.

## Operator note

If you want one webhook URL to serve multiple workflow names, your existing n8n
workflow can branch on `{{$json.destination.workflow}}` or `{{$json.event.type}}`.
If you prefer clearer separation, create a dedicated `leadPipeline` webhook URL
and update `N8N_WORKFLOW_DESTINATIONS` accordingly.
