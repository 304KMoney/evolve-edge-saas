# Evolve Edge Requirements Document

## What This Document Is

This is a plain-English summary of what had to be built to create Evolve Edge.

It is not written as a deep engineering spec. It is meant to help a human reader understand:

- what Evolve Edge is
- what the product is supposed to do
- what systems it depends on
- what rules the platform has to follow
- what had to be built to make the MVP real
- what still has to be true before launch

## What Evolve Edge Is

Evolve Edge is a software platform for AI security, compliance, audit delivery, and ongoing customer operations.

The big idea behind the product is simple:

- the Evolve Edge app is the brain of the system
- the app decides what is happening
- the app stores the truth
- outside tools help with billing, orchestration, AI processing, and CRM, but they do not own the product

In plain terms, Evolve Edge is not supposed to be a loose collection of Stripe, n8n, Dify, and HubSpot. It is supposed to be one product with one source of truth.

## The Main Customer Journey

The intended customer flow is:

1. A lead is captured.
2. A workspace is created.
3. The customer signs in and completes onboarding.
4. The customer selects frameworks and fills out an assessment.
5. The customer submits the assessment.
6. Analysis is queued and processed.
7. A report is created and prepared for delivery.
8. Ongoing monitoring and remediation continue after the first report.

This is the end-to-end story the MVP is meant to support.

## The Most Important Product Rule

The most important rule in the whole system is this:

Evolve Edge must own its own state.

That means the app must be the place where the product decides:

- what plan a customer is on
- what they are allowed to do
- what workflow they should follow
- what state their audit is in
- what state their report is in
- what the customer sees in the dashboard

Other systems can help, but they cannot become the product.

## What Each External System Is Allowed To Do

### Neon / Postgres

Neon is the main database.

It stores the important records for the product, including:

- users
- organizations
- sessions
- assessments
- reports
- billing records
- routing decisions
- workflow events
- delivery state
- audit logs

This is the system of record for the platform.

### Stripe

Stripe is for billing only.

Stripe is allowed to own:

- payments
- subscriptions
- invoices
- billing events

Stripe is not allowed to own:

- product access decisions by itself
- workflow routing
- report status
- customer-facing product state

The app must receive Stripe events, verify them, and then update local state.

### n8n

n8n is for orchestration only.

n8n is allowed to:

- receive app-owned events
- run workflow steps
- branch by workflow tier
- call back into the app with status updates
- send report and PDF writeback information back into the app

n8n is not allowed to become:

- the pricing engine
- the workflow policy owner
- the product state owner

### Dify

Dify is for AI execution only.

Dify is allowed to:

- process analysis jobs
- return structured outputs

Dify is not allowed to:

- persist final product state
- decide product logic
- write directly into the product without backend validation

The backend must validate and normalize Dify output before using it.

### HubSpot

HubSpot is for CRM visibility only.

HubSpot is allowed to:

- receive selected customer and lifecycle updates
- reflect sales and CRM status

HubSpot is not allowed to:

- decide access
- decide entitlements
- decide workflow state
- become the source of truth for product records

### Hostinger

Hostinger is only for brochure-site and top-of-funnel presentation.

It is not supposed to own:

- checkout logic
- dashboard logic
- onboarding logic
- assessment logic
- pricing rules

## Commercial Requirements

The product has to support three main commercial tiers:

- Starter
- Scale
- Enterprise

Those plans must be handled in a consistent, backend-owned way.

This means:

- Stripe prices must map into internal plan codes
- the app must know what plan the customer is on
- plan-based limits and features must be enforced by the backend
- the UI should show the result of those decisions, not invent them

The product also needs to support workflow choices tied to plan level, such as:

- audit starter
- audit scale
- audit enterprise
- briefing only
- intake review

## What Had To Be Built

## 1. Authentication And Tenant Access

The platform needed:

- password-based sign-in
- session handling
- organization membership
- tenant-scoped access
- onboarding gating
- admin-only access controls

This matters because Evolve Edge is a multi-tenant product. The app has to know who the user is, what workspace they belong to, and what they are allowed to see or change.

## 2. Onboarding

The platform needed an onboarding flow so a new company could enter the product and become a real workspace.

That onboarding flow needed to capture:

- company name
- industry
- company size
- country
- AI usage summary

The onboarding flow also needed to guide the user into the next step, which is framework selection and assessment setup.

## 3. Framework Selection

The product needed a way for customers to choose which frameworks apply to them.

This matters because the rest of the assessment and reporting flow depends on the scope of the customer’s compliance program.

Framework selection is part of turning a generic workspace into a real operating context.

## 4. Assessment Creation

The app needed the ability to create assessments itself.

This is important because assessment creation should not depend on n8n.

The product needed to:

- create a first assessment
- reopen an unfinished assessment if one already exists
- keep intake work inside app-owned records

This allows the dashboard buttons to open real work instead of dead-end screens or placeholder routes.

## 5. Assessment Intake

The product needed a structured intake flow so customers could fill in the information needed for analysis.

That intake flow needed:

- sections
- notes and responses
- saved progress
- progress tracking
- draft state

The app also needed to treat saved notes as meaningful progress, so the user does not feel blocked after clearly entering information.

## 6. Assessment Submission

The product needed a real submit action.

Submitting an assessment now has to do more than change a button state. It has to:

- verify enough intake has been completed
- mark the assessment as submitted
- queue analysis
- create or reuse a report target
- publish an app-owned event for downstream processing
- send the correct workflow handoff to n8n
- return the user to a clean dashboard state

Without this, the product would look like it collects data but does not move the workflow forward.

## 7. Workflow Routing

The product needed backend routing logic that decides what should happen based on:

- the customer’s plan
- their entitlement state
- usage limits
- the type of workflow being run

There are two important kinds of routing in the system:

- billing-related routing
- in-app workflow routing

Those are separate and must stay separate.

One handles paid/billing-triggered flows.

The other handles in-app product actions like assessment submission and report generation.

## 8. Analysis Jobs

The product needed app-owned analysis job records.

These records are important because they let the app track:

- when analysis was queued
- which worker/provider is being used
- what was sent out
- what came back
- whether the job failed, succeeded, or needs retry

This prevents the AI layer from becoming an invisible black box.

## 9. Reporting

The product needed app-owned report records.

That includes:

- report creation
- report status
- executive summary
- risk posture
- findings
- recommendations
- roadmap
- PDF metadata
- download and delivery state

The app must know which report belongs to which assessment and which organization.

It must also know whether that report is:

- pending
- processing
- ready
- delivered
- failed

## 10. PDF And Report Writeback

The product needed a way for downstream workflow execution to return the finished result back into the app.

That means the system needed:

- a report target created by the app
- writeback routes in the app
- callback authentication
- a way for n8n to return report progress and PDF output

This is what makes the report workflow feel real instead of simulated.

## 11. Billing And Subscription Sync

The product needed Stripe billing support that is safe and replayable.

That includes:

- checkout session creation
- customer portal session creation
- webhook verification
- idempotent billing-event claiming
- local subscription sync
- billing event logs
- replay tooling

This matters because the product cannot safely depend on billing without having a durable local picture of what Stripe has done.

## 12. Customer Lifecycle Tracking

The product needed to track the customer beyond a single audit.

That includes:

- lead capture
- customer account creation
- lifecycle stage tracking
- onboarding state
- customer timeline visibility

This helps Evolve Edge act like a real control plane, not just a single audit form.

## 13. Monitoring And Long-Term Program Tracking

The product needed ongoing monitoring and engagement history so the relationship does not end with one report.

That includes:

- recurring monitoring posture
- remediation continuity
- engagement history
- long-lived customer program records

This is part of the commercial value of the platform.

## 14. Customer Surface

The customer-facing product needed screens for:

- homepage
- pricing
- trust and methodology pages
- sign-in
- onboarding
- dashboard
- assessments
- reports
- roadmap
- evidence
- frameworks
- monitoring
- programs
- billing

These are the main surfaces that make the product feel complete during a demo and in real use.

## 15. Admin And Operator Surface

The internal side of the product needed:

- admin visibility
- KPI views
- customer and organization inspection
- replay tools
- troubleshooting tools
- operational readiness views

This is important because a real MVP also needs operator control, not just a customer UI.

## Reliability Requirements

Because Evolve Edge depends on multiple systems, it needed reliability features.

That includes:

- durable domain events
- retryable outbound deliveries
- replay tooling
- audit logs
- idempotency
- correlation ids
- failure handling

This is what makes the system safer to operate and easier to debug.

## Security Requirements

The platform needed to protect:

- tenant boundaries
- admin-only information
- callback routes
- report downloads
- workflow writeback routes

It also needed to validate external payloads before trusting them.

That includes Stripe, n8n, and Dify responses.

## Environment And Deployment Requirements

To run properly, the product needs:

- a working Neon database
- the correct environment variables
- Prisma schema alignment
- the correct Stripe configuration
- the correct n8n workflow destinations
- callback and writeback secrets
- Dify configuration
- report access configuration

If those are not set correctly, the system may look like it works on the surface while important workflows silently fail.

## Demo Requirements

Because Evolve Edge is often shown in live demos, the platform also needed demo-friendly behavior.

That includes:

- safe demo sign-in
- demo reset capability
- seeded or resettable demo data
- the option to suppress live side effects
- the option to allow live external side effects when needed

One especially important demo requirement is this:

If the team wants n8n and the PDF workflow to actually fire during a demo, the environment must allow external side effects.

That means:

`DEMO_EXTERNAL_SIDE_EFFECTS=true`

Without that setting, the product may look normal but the external workflow will be intentionally blocked.

## Launch Requirements

Before launch, the team must verify:

- the correct deployment is live
- the environment variables are complete
- the database is reachable
- the schema is current
- Stripe webhooks are working
- n8n workflow URLs are active
- callback and writeback secrets match
- a full smoke test succeeds
- support and rollback runbooks are ready

The product should not launch if these items are still unverified.

## What This Means In Practice

The work done to build Evolve Edge was not just about creating screens.

It required building:

- a real product data model
- real workflow ownership
- real billing sync
- real tenant access
- real assessment and reporting flows
- real orchestration handoff
- real writeback paths
- real operator visibility
- real launch checks

In short:

Evolve Edge had to be built as a real operating system for audit and compliance delivery, not as a collection of disconnected tools.

## Final Summary

Evolve Edge is meant to function as an app-owned compliance and audit delivery platform.

To make that true, the system had to support:

- customer onboarding
- framework selection
- assessment intake
- assessment submission
- workflow routing
- AI analysis
- report generation
- PDF delivery
- billing sync
- operator visibility
- monitoring
- reliability
- security
- launch readiness

The main requirement behind all of it is simple:

the Evolve Edge app must stay in control of the product.
