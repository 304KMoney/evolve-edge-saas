# Customer Lifecycle Automations

This document defines the first practical lifecycle automations dispatched from Evolve Edge into n8n.

## Principles

- Evolve Edge remains the system of record for customer, billing, assessment, report, and notification state.
- n8n is orchestration only.
- HubSpot remains CRM visibility, not product truth.
- Customer-facing transactional email remains app-owned.

## Standard n8n payload envelope

Every n8n workflow receives:

```json
{
  "source": "evolve-edge",
  "provider": "n8n",
  "version": "2026-04-10",
  "destination": {
    "workflow": "reportReady"
  },
  "delivery": {
    "id": "cm_delivery",
    "attemptCount": 1,
    "occurredAt": "2026-04-10T12:00:00.000Z"
  },
  "event": {
    "id": "cm_event",
    "type": "report.generated",
    "aggregateType": "report",
    "aggregateId": "cm_report",
    "orgId": "cm_org",
    "userId": "cm_user",
    "payload": {}
  }
}
```

Headers:

- `x-evolve-edge-provider: n8n`
- `x-evolve-edge-timestamp`
- `x-evolve-edge-signature`

## Workflow map

### `customerOnboarding`

Triggered by:

- `org.created`
- `onboarding.completed`

Expected use:

- welcome sequence orchestration
- internal onboarding checklist creation
- follow-up reminders after onboarding completion

Important payload fields:

- `organizationId`
- `name`
- `slug`
- `industry`
- `country`
- `frameworkCodes`
- `firstAssessmentName`

### `onboardingVisibility`

Triggered by:

- `onboarding.started`

Expected use:

- internal ops/task creation
- create a support or customer success follow-up task
- alert internal Slack/ops channel if desired

Important payload fields:

- `organizationId`
- `organizationName`
- `userId`
- `source`

### `customerSuccess`

Triggered by:

- `assessment.created` only when `isFirstAssessment=true`

Expected use:

- notify customer success that the customer reached first-product-value motion
- create adoption follow-up tasks

Important payload fields:

- `assessmentId`
- `organizationId`
- `userId`
- `name`
- `isFirstAssessment`

### `reportReady`

Triggered by:

- `report.generated`

Expected use:

- internal success notification
- delivery preparation orchestration
- downstream ops workflow after the app-owned report-ready email is queued

Important payload fields:

- `reportId`
- `assessmentId`
- `organizationId`
- `versionLabel`
- `status`

Notes:

- the app already queues the customer-facing report-ready email
- HubSpot CRM sync also updates on `report.generated`

### `billingRecovery`

Triggered by:

- `payment.failed`

Expected use:

- internal alerting
- billing recovery playbook
- escalation tasks for customer success or finance

Important payload fields:

- `organizationId`
- `subscriptionId`
- `stripeSubscriptionId`
- `stripeCustomerId`
- `invoiceId`
- `status`
- `failureMessage`

Notes:

- the app already queues the customer-facing payment failed notice

### `expansionSignal`

Triggered by:

- `usage.threshold.crossed`

Expected use:

- expansion / renewal signals
- CSM outreach when seat or assessment usage crosses 80% or 100%

Important payload fields:

- `organizationId`
- `metric`
- `thresholdPercent`
- `used`
- `limit`
- `usagePercent`

## Safe testing strategy

Recommended lower-risk testing setup:

1. point each `N8N_WORKFLOW_DESTINATIONS` URL to a separate dev/test n8n webhook
2. create or replay domain events through normal product actions
3. run the dispatcher manually or through the internal dispatch route
4. verify envelope shape, headers, retry behavior, and workflow routing
5. only then switch production env vars to live n8n workflow URLs

Useful internal route:

- `/api/internal/domain-events/dispatch`

## Source-of-truth reminder

Do not move these behaviors into n8n:

- subscription truth
- entitlement decisions
- onboarding completion truth
- assessment/report persistence
- transactional email truth

n8n should react to domain events, not decide whether domain state exists.
