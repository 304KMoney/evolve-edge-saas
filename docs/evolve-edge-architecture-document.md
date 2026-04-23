# Evolve Edge Architecture Document

## What This Document Is

This is a human-readable architecture document for Evolve Edge.

It explains how the platform is structured, why it is structured this way, what each major system is responsible for, and how data moves through the product.

This is not meant to read like a low-level engineering reference. It is meant to help someone understand the architecture clearly and quickly.

## The Big Idea

Evolve Edge is designed as an app-owned control plane for AI security, compliance, audit delivery, and customer operations.

That phrase matters.

It means the Evolve Edge application is supposed to be the place where the product makes decisions, stores truth, and presents state to the customer.

The architecture is intentionally built around one core belief:

the product should not be a thin UI sitting on top of third-party tools.

Instead:

- the app owns the workflow
- the app owns the state
- the app owns the customer experience
- outside systems help with specific jobs, but they do not become the product

## Architecture In One Sentence

The Evolve Edge app is the central operating system, while Neon stores the truth, Stripe handles billing, n8n handles orchestration, Dify handles AI execution, and HubSpot reflects CRM visibility.

## The Core Architecture Rule

The single most important architecture rule is this:

The Evolve Edge app owns product state and business logic.

Everything else follows from that.

This means:

- customer-visible status must live in the app
- workflow decisions must be made by the app
- audit and report state must be stored by the app
- product access must be decided by the app

This also means the system must avoid letting outside tools quietly become the real control plane.

## The Main Systems

## 1. The Evolve Edge App

The application is the center of the system.

It is built as a Next.js app and contains:

- customer-facing product screens
- internal admin and operator screens
- service-layer business logic
- workflow decision-making
- product state transitions
- integration boundaries

In practical terms, the app is responsible for:

- sign-in and session handling
- organization and workspace access
- onboarding
- framework selection
- assessment intake
- assessment submission
- workflow routing
- report creation and tracking
- dashboard status
- customer-facing report views
- operator visibility

If a customer asks, “What is happening with my audit?” the answer should come from the app.

## 2. Neon / Postgres

Neon is the database and the system of record.

It stores the durable records that make the platform real.

That includes things like:

- users
- sessions
- organizations
- memberships
- leads
- customer accounts
- assessments
- assessment sections
- analysis jobs
- reports
- report packages
- billing events
- routing snapshots
- workflow dispatches
- delivery-state records
- audit logs
- monitoring records

Neon is important because it gives the product memory and continuity.

Without it, Evolve Edge would just be a set of screens and integrations. With it, Evolve Edge becomes a platform with a durable operating history.

## 3. Stripe

Stripe handles billing and payment events.

Stripe is responsible for:

- checkout
- subscriptions
- invoices
- payment events
- billing lifecycle facts

But Stripe is not allowed to become the product state owner.

That means:

- Stripe can say a payment happened
- Stripe cannot decide the customer’s product workflow by itself
- Stripe cannot be the only place where access and workflow state are understood

The app receives Stripe events, verifies them, stores them, and updates internal product records accordingly.

This keeps billing truth and product truth connected, but still separate.

## 4. n8n

n8n is the orchestration layer.

It is used when work has to happen across steps, systems, or callbacks.

n8n is good at:

- receiving a handoff from the app
- running a tiered workflow
- moving work through steps
- sending status callbacks
- writing results back into the app

But n8n is not supposed to decide:

- pricing
- entitlements
- product access
- workflow policy
- final customer-visible state

The app tells n8n what kind of workflow should run.
n8n does not decide the business rules on its own.

## 5. Dify

Dify is the AI execution layer.

Its job is to process analysis tasks.

For example, once an assessment has been submitted, the app may queue an analysis job and send structured data to Dify.

Dify can return analysis output, but that output is not trusted automatically.

The backend has to:

- validate it
- normalize it
- store it in app-owned records

That is a deliberate architectural choice. It prevents the AI layer from becoming an uncontrolled source of product state.

## 6. HubSpot

HubSpot is used for CRM visibility.

It is there so the sales and customer side of the business can see what is going on.

HubSpot is allowed to know things like:

- lifecycle stage
- lead and customer progression
- selected product signals
- report delivery milestones

But HubSpot is not supposed to decide:

- access
- product state
- audit truth
- billing truth
- report truth

The app projects information into HubSpot. HubSpot does not control the app.

## 7. Hostinger

Hostinger is the brochure and top-of-funnel presentation layer.

It exists to support marketing presence, not product logic.

That means it should not own:

- sign-in logic
- onboarding logic
- pricing rules
- dashboard logic
- assessment logic
- checkout logic

## How The System Is Organized

At a high level, the repo is organized into three main areas:

- `apps/web`
- `packages/db`
- `docs`

### `apps/web`

This is the application itself.

It contains:

- product routes
- UI components
- admin surfaces
- service modules
- workflow logic
- integration boundaries

### `packages/db`

This contains the Prisma schema, migrations, seed logic, and typed database client.

This is where the structure of the platform’s persistent data lives.

### `docs`

This contains:

- architecture notes
- phase plans
- operator runbooks
- launch checklists
- integration references

## The Main Product Domains

The architecture is easier to understand when broken into its main product domains.

## Identity And Tenant Access

This part of the system handles:

- authentication
- sessions
- organization membership
- tenant boundaries
- onboarding gating
- internal admin checks

This is what ensures each customer sees only their own workspace and data.

It also protects the difference between customer-facing and internal-only operations.

## Billing And Commercial Logic

This part of the system handles:

- Stripe synchronization
- plan mapping
- entitlements
- usage metering
- upgrade logic
- billing reconciliation
- paid-request routing

This is important because the product needs to know not just whether a customer paid, but what that payment means inside the product.

## Customer Lifecycle

This part of the system handles:

- lead capture
- lifecycle progression
- workspace provisioning
- customer-account visibility
- CRM-safe handoff

This gives Evolve Edge a real customer control plane instead of a disconnected sales-to-product handoff.

## Assessment And Reporting

This is one of the core parts of the product.

It handles:

- assessment creation
- intake sections
- saved progress
- analysis queueing
- findings
- recommendations
- report records
- executive delivery packages

This is where the product turns customer information into actual audit and reporting outcomes.

## Monitoring And Programs

This part of the system handles the longer-term customer relationship.

It includes:

- recurring monitoring posture
- remediation continuity
- ongoing risk tracking
- multi-engagement history
- long-lived customer program records

This is what helps Evolve Edge move from one-time assessment work into continuous value.

## Events, Dispatch, And Reliability

This part of the system handles the “glue” that makes distributed workflows safe.

It includes:

- domain events
- outbound deliveries
- retries
- replay tooling
- scheduled jobs
- failure normalization

This is especially important because Evolve Edge depends on multiple systems. The architecture has to be safe even when external calls fail or repeat.

## Internal Admin And Operations

This part of the system supports the people running the platform.

It includes:

- admin views
- KPI visibility
- customer inspection
- queue-like operator workflows
- replay tools
- readiness views
- support-safe summaries

This is part of what makes the MVP operationally real.

## How Data Moves Through The System

The simplest way to understand the architecture is to follow the main data flow.

## Step 1. Lead And Customer Entry

A lead enters the system.

That information is stored in the app, and the platform can create or update the customer control plane from there.

If CRM needs visibility, that visibility is projected downstream.

The CRM does not become the source of truth.

## Step 2. Workspace And Access

The user signs in through app-owned authentication.

The app checks:

- who the user is
- what organization they belong to
- whether onboarding is complete
- what role they have

From there, the app can decide what the user is allowed to access.

## Step 3. Billing And Plan State

Stripe sends billing events.

The app:

- verifies them
- stores them
- maps them to internal plan meaning
- updates local subscription and entitlement state

This allows the product to reflect billing truth without letting Stripe become the workflow engine.

## Step 4. Onboarding And Framework Selection

The user completes onboarding and chooses frameworks.

This gives the product context:

- who the company is
- what type of business it is
- what AI usage it has
- what framework scope matters

This turns a blank workspace into a real compliance context.

## Step 5. Assessment Intake

The app creates or reuses an assessment.

The customer fills out intake sections.

Those sections are saved in the app database as structured records.

The app keeps track of progress and draft state.

## Step 6. Assessment Submission

When the customer submits the assessment, the app does several important things:

- verifies that enough intake work has been completed
- calculates the correct workflow routing decision
- marks the assessment as queued
- creates or reuses a report target
- creates or reuses an analysis job
- emits an app-owned business event
- dispatches the workflow handoff to n8n

This is the point where the architecture matters most.

The app is still in control. It is not just sending raw data somewhere and hoping for the best.

## Step 7. Analysis And Orchestration

Once the assessment is submitted:

- Dify can execute analysis work
- n8n can orchestrate longer-running workflow steps
- the app can receive callbacks about status and output

The app remains the place where the final state is stored.

## Step 8. Report Creation And Delivery

The app stores:

- report status
- executive summary
- risk posture
- findings
- recommendations
- roadmap
- PDF metadata

If n8n or another workflow step generates a PDF artifact, that information is written back into the app so the report record remains the truth.

## Why There Are Two Routing Layers

One of the more important architecture choices in Evolve Edge is that there are two routing layers.

That is intentional.

### Commercial Routing

This routing layer is used for billing and paid-request flows.

It decides how checkout or billing-originated work should be interpreted and tracked.

### Workflow Routing

This routing layer is used for in-app product workflows.

It decides how assessment and report actions should be handled based on plan, entitlements, and usage posture.

These are related, but not the same.

Keeping them separate prevents confusion and keeps the architecture safer.

## Why The Architecture Is Built This Way

This architecture exists to solve a real product problem:

many startups accidentally let their integrations become their real product.

That creates hidden problems:

- workflow logic ends up split across tools
- nobody knows where the truth lives
- customer-visible state becomes inconsistent
- debugging becomes painful
- launch risk goes up

Evolve Edge is structured to avoid that.

The architecture is trying to preserve one clear model:

- the app decides
- the database remembers
- integrations assist

## Reliability And Safety Principles

The architecture is also built around safety.

That includes:

- idempotent billing and event processing
- durable domain events
- retryable outbound deliveries
- callback authentication
- report writeback safeguards
- audit logs
- replay tooling
- explicit tenant scoping

These choices matter because the platform is not just generating content. It is handling customer workflow, billing, and delivery.

## Security And Access Principles

There are a few security ideas that show up repeatedly in the architecture.

### Tenant Scope Comes First

Records should be accessed inside the expected organization boundary.

This prevents cross-tenant mistakes and makes the service layer safer.

### Internal Context Stays Internal

Admin-only notes, retries, review flags, and operator controls should stay in internal surfaces.

Customer-facing pages should only show customer-safe information.

### External Payloads Are Not Trusted Automatically

Stripe, n8n, and Dify all send useful data, but the app still has to validate and normalize it before changing product state.

## What Makes The Architecture “Real”

A real product architecture is more than screens and APIs.

Evolve Edge becomes real because it includes:

- durable records
- routing decisions
- replayable events
- operator visibility
- report targets
- writeback paths
- billing synchronization
- monitored delivery state
- long-lived customer history

Those pieces are what turn the MVP into an operating platform instead of a demo shell.

## Launch And Operating Reality

The architecture also assumes the platform has to be operable.

That means launch is not just about deploying a UI.

The system also needs:

- environment readiness
- working database connectivity
- Stripe webhook validation
- active n8n workflow URLs
- callback and writeback secrets
- smoke-tested end-to-end flows
- operator runbooks
- rollback and support readiness

This is part of the architecture because a platform that cannot be operated safely is not finished.

## Final View

The best way to think about Evolve Edge is this:

it is a central product brain with carefully limited helper systems around it.

The app owns:

- business rules
- state
- routing
- customer experience

Neon stores the truth.

Stripe tells the app what happened in billing.

n8n runs orchestrated steps after the app decides what should happen.

Dify performs AI work after the app creates and tracks the job.

HubSpot reflects selected business events for CRM visibility.

That is the architecture.

It is intentionally designed so the product can grow without losing control of its own logic.
