# Phase 31: Lead Capture to CRM Revenue Pipeline

## What existed

Before this phase, Evolve Edge already had:

- pricing and homepage CTA paths
- sign-in and onboarding entry paths
- a contact-sales page
- durable domain events
- outbound webhook dispatch to n8n and HubSpot
- an internal provisioning API for CRM-to-workspace handoff

What was missing:

- no first-class lead record in the app database
- no normalized lead payload contract
- no UTM persistence across the website and onboarding flow
- no structured contact/demo request submission flow
- HubSpot sync understood customers, not pre-customer leads

## Lead sources now captured

- homepage demo CTA
- pricing page plan selection into self-serve signup
- pricing page secondary demo/contact CTA
- contact-sales request form
- demo request form submissions
- sign-in entry for net-new self-serve signup users
- onboarding completion as the conversion point into a real workspace

Current non-captured source:

- gated content

Reason:

- there is no gated content flow in the current repo

## Standardized lead architecture

### Source of truth

Lead capture is now app-owned.

The app database stores lead records in:

- `LeadSubmission`

### Shared server logic

Lead processing is centralized in:

- `apps/web/lib/lead-pipeline.ts`

That service handles:

- field normalization
- attribution attachment
- dedupe window logic
- lead record persistence
- `lead.captured` domain events
- `lead.converted` domain events
- audit logging

### Attribution support

UTM and click-id capture is handled by:

- `apps/web/components/attribution-capture.tsx`

This writes a first-party cookie named:

- `evolve_edge_attribution`

Captured fields:

- `landingPath`
- `lastPath`
- `referrer`
- `utmSource`
- `utmMedium`
- `utmCampaign`
- `utmTerm`
- `utmContent`
- `gclid`
- `fbclid`
- `msclkid`
- `capturedAt`

## Payload schema

### App lead record fields

`LeadSubmission` fields:

- `email`
- `normalizedEmail`
- `firstName`
- `lastName`
- `companyName`
- `jobTitle`
- `phone`
- `teamSize`
- `source`
- `intent`
- `stage`
- `sourcePath`
- `requestedPlanCode`
- `pricingContext`
- `hubspotContactId`
- `attribution`
- `payload`
- `dedupeKey`
- `submittedAt`
- `processedAt`
- `lastError`
- `organizationId`
- `userId`

### Domain events emitted

- `lead.captured`
- `lead.converted`

### Event payload shape

Recommended normalized payload shape:

```json
{
  "leadId": "lead_xxx",
  "normalizedEmail": "buyer@company.com",
  "source": "contact_sales",
  "intent": "demo-request",
  "requestedPlanCode": "growth-annual",
  "companyName": "Example Co",
  "attribution": {
    "landingPath": "/pricing",
    "utmSource": "google",
    "utmMedium": "cpc",
    "utmCampaign": "q2-enterprise"
  }
}
```

## Dedupe strategy

Deduping is time-window-based, not globally unique forever.

Dedupe key basis:

- `source`
- normalized email
- intent
- requested plan code

Window:

- `LEAD_DEDUPE_WINDOW_DAYS`
- default: `14`

Behavior:

- if a matching lead exists inside the window, the record is updated
- otherwise a new lead record is created

This keeps:

- repeated clicks from spamming CRM
- legitimate later re-engagement possible

## Fields sent to HubSpot or automation

### HubSpot contact properties

The HubSpot sync now supports both customer events and lead events.

For lead events it sends:

- `email`
- `firstname`
- `lastname`
- `jobtitle`
- `phone`
- `company`
- `hs_lead_status`
- `evolve_edge_user_id`
- `evolve_edge_last_event_type`
- `evolve_edge_last_event_at`
- `evolve_edge_lifecycle_stage`
- `evolve_edge_lead_source`
- `evolve_edge_lead_intent`
- `evolve_edge_requested_plan_code`
- `evolve_edge_source_path`
- `evolve_edge_company_name`
- `evolve_edge_team_size`
- `evolve_edge_utm_source`
- `evolve_edge_utm_medium`
- `evolve_edge_utm_campaign`

### n8n lead events

Recommended workflow:

- `leadPipeline`

Recommended events:

- `lead.captured`
- `lead.converted`

## Exact copy-paste field mapping table

### App -> HubSpot contact mapping

| App field | HubSpot property |
|---|---|
| `email` | `email` |
| `firstName` | `firstname` |
| `lastName` | `lastname` |
| `jobTitle` | `jobtitle` |
| `phone` | `phone` |
| `companyName` | `company` |
| `source` | `evolve_edge_lead_source` |
| `intent` | `evolve_edge_lead_intent` |
| `requestedPlanCode` | `evolve_edge_requested_plan_code` |
| `sourcePath` | `evolve_edge_source_path` |
| `companyName` | `evolve_edge_company_name` |
| `teamSize` | `evolve_edge_team_size` |
| `utmSource` | `evolve_edge_utm_source` |
| `utmMedium` | `evolve_edge_utm_medium` |
| `utmCampaign` | `evolve_edge_utm_campaign` |
| event type | `evolve_edge_last_event_type` |
| event timestamp | `evolve_edge_last_event_at` |
| derived lifecycle | `evolve_edge_lifecycle_stage` |

### App -> n8n payload mapping

| Envelope path | Value |
|---|---|
| `event.type` | `lead.captured` or `lead.converted` |
| `event.aggregateType` | `leadSubmission` |
| `event.aggregateId` | lead id |
| `event.orgId` | organization id if known |
| `event.userId` | user id if known |
| `event.payload.leadId` | lead id |
| `event.payload.normalizedEmail` | normalized email |
| `event.payload.source` | lead source |
| `event.payload.intent` | lead intent |
| `event.payload.requestedPlanCode` | requested plan |
| `event.payload.companyName` | company name |
| `event.payload.attribution` | attribution object |

Payload governance note:

- `lead.captured` is allowed to reach n8n for sales and lifecycle automation, but
  the payload should remain narrowly operational
- do not add secrets, raw form dumps, or broader customer-state snapshots to this
  event without a deliberate contract review
- `normalizedEmail` and `attribution` are already the broadest fields in this
  event and should be treated carefully

## Environment variables

Required or recommended for this phase:

- `LEAD_DEDUPE_WINDOW_DAYS`
- `HUBSPOT_ACCESS_TOKEN`
- `HUBSPOT_API_BASE_URL`
- `HUBSPOT_TIMEOUT_MS`
- `N8N_WEBHOOK_SECRET`
- `N8N_WEBHOOK_TIMEOUT_MS`
- `N8N_WORKFLOW_DESTINATIONS`
- `OUTBOUND_DISPATCH_SECRET`
- `PROVISION_ORG_API_TOKEN`

## Manual setup instructions

### HubSpot custom properties

Create these contact properties:

- `evolve_edge_user_id`
- `evolve_edge_last_event_type`
- `evolve_edge_last_event_at`
- `evolve_edge_lifecycle_stage`
- `evolve_edge_lead_source`
- `evolve_edge_lead_intent`
- `evolve_edge_requested_plan_code`
- `evolve_edge_source_path`
- `evolve_edge_company_name`
- `evolve_edge_team_size`
- `evolve_edge_utm_source`
- `evolve_edge_utm_medium`
- `evolve_edge_utm_campaign`
- `evolve_edge_latest_lead_captured_at`

### Click-by-click HubSpot setup

1. Open HubSpot.
2. Go to `Settings`.
3. Open `Properties`.
4. Choose `Contact properties`.
5. Click `Create property`.
6. Use group `Contact information` or a dedicated custom group such as `Evolve Edge`.
7. Create each property from the list above as a single-line text field.
8. Save each property.
9. Create or update any workflow/list logic that keys off:
   - `evolve_edge_lead_source`
   - `evolve_edge_lead_intent`
   - `evolve_edge_requested_plan_code`
   - `evolve_edge_lifecycle_stage`

### Click-by-click n8n setup

1. Open n8n.
2. Create a new workflow named `leadPipeline`.
3. Add a `Webhook` trigger node.
4. Copy the production webhook URL.
5. Add logic nodes for:
   - dedupe or enrichment if needed
   - Slack/email notifications
   - HubSpot deal creation if your ops model needs it
   - internal provisioning API calls when the lead becomes sales-qualified
6. Add secret verification using:
   - `x-evolve-edge-timestamp`
   - `x-evolve-edge-signature`
7. Add the workflow URL and event list to `N8N_WORKFLOW_DESTINATIONS`.

Copy-paste example:

```json
[
  {
    "name": "leadPipeline",
    "url": "https://n8n.example.com/webhook/lead-pipeline",
    "secret": "replace-with-shared-secret",
    "events": ["lead.captured", "lead.converted"]
  }
]
```

## Fallback and error handling

### Lead submission path

- validation failure redirects back with an error
- deduped submissions update the existing lead record
- lead capture remains app-owned even if CRM is temporarily unavailable

### CRM / automation handoff

- lead events are stored first as durable domain events
- outbound deliveries are retried by existing webhook delivery logic
- failures remain visible in webhook delivery records
- HubSpot outages do not block the user-facing form submission

### Conversion path

- sign-in captures a `signup_entry` lead for net-new users
- onboarding completion captures richer company context
- onboarding then marks the lead as converted

## Exact HubSpot and n8n mapping recommendations

### HubSpot recommendation

Use HubSpot contacts as the lead record first.

Recommended lifecycle interpretation:

- `lead.captured` -> marketing or sales-qualified lead handling
- `lead.converted` -> opportunity or customer-provisioning workflow
- `org.created` onward -> customer lifecycle sync

### n8n recommendation

Use n8n for:

- alerting sales or founder inboxes
- routing by requested plan
- enrichment
- internal provisioning trigger orchestration

Do not use n8n as the primary system of record for the lead itself.

### Apollo recommendation

If Apollo is used, keep it inside the sales-enrichment lane only.

Recommended pattern:

- `lead.captured` enters the app-owned lead pipeline first
- the app stores the canonical lead record and emits the domain event
- `leadPipeline` in n8n optionally calls Apollo for enrichment or prospect research
- n8n can project useful enrichment into HubSpot, Slack, or operator notifications
- Apollo must not become the source of truth for lead capture, lifecycle stage, plan intent, or customer status

Recommended Apollo use cases:

- account and contact enrichment for founder or SDR follow-up
- prospect list building outside the product signup flow
- outbound sequencing inputs for sales operations

Avoid:

- using Apollo as the canonical lead database
- letting Apollo decide conversion state or provisioning
- writing Apollo-derived commercial logic back into product routing without app-owned validation

## Exact files changed

- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/20260411003000_lead_pipeline/migration.sql`
- `apps/web/components/attribution-capture.tsx`
- `apps/web/lib/lead-pipeline.ts`
- `apps/web/app/layout.tsx`
- `apps/web/app/contact-sales/actions.ts`
- `apps/web/app/contact-sales/page.tsx`
- `apps/web/lib/pricing.ts`
- `apps/web/app/sign-in/actions.ts`
- `apps/web/app/onboarding/page.tsx`
- `apps/web/app/onboarding/actions.ts`
- `apps/web/lib/hubspot.ts`
- `apps/web/lib/n8n.ts`
- `apps/web/components/pricing-page.tsx`
- `apps/web/app/page.tsx`
- `.env.example`

## Commands to run

```powershell
pnpm db:generate
pnpm db:migrate
Set-Location apps/web
.\node_modules\.bin\tsc.cmd --noEmit
```

## Test checklist

1. Visit `/pricing?utm_source=test&utm_medium=cpc&utm_campaign=q2`.
2. Click a plan CTA to go through sign-in and onboarding.
3. Complete sign-in as a user with no memberships and confirm a `signup_entry` lead is created.
4. Complete onboarding and confirm the same lead is updated and marked converted.
5. Submit the contact-sales form and confirm a `LeadSubmission` record is created.
6. Submit the same form again inside the dedupe window and confirm the lead is updated rather than duplicated.
7. Confirm `lead.captured` and `lead.converted` domain events are present.
8. Dispatch outbound webhooks and confirm HubSpot/n8n receive the lead events.
