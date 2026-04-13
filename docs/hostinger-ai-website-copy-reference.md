# Hostinger AI Website Copy Reference

Use this document as the direct source material for generating Evolve Edge website copy in Hostinger AI.

This file is intentionally more prescriptive than the broader commercial reference. It is designed to reduce copy drift and keep public messaging aligned with the canonical backend-owned commercial model.

## Purpose

Use this reference when generating or updating:

- homepage copy
- pricing page copy
- trust and security page copy
- contact sales page copy
- CTA labels and destinations
- FAQs
- short feature descriptions
- footer and contact sections

Do not invent plan names, pricing, workflow names, or ownership language outside what is defined here.

## Canonical public commercial model

### Plan codes

- `starter`
- `scale`
- `enterprise`

### Display names

- `Starter`
- `Scale`
- `Enterprise`

### Public pricing

- `Starter`: `$2,500 one-time`
- `Scale`: `$7,500 one-time`
- `Enterprise`: `Custom`

### CTA rules

- `Starter` -> Stripe hosted checkout
- `Scale` -> Stripe hosted checkout
- `Enterprise` -> Contact sales

### Workflow references

These are internal workflow names that may be referenced in technical or trust copy, but should not be overused in public marketing copy:

- `audit_starter`
- `audit_scale`
- `audit_enterprise`
- `briefing_only`
- `intake_review`

## Product positioning

### Approved short description

Evolve Edge helps regulated and high-trust teams assess AI risk, collect evidence, generate executive-ready reports, and maintain operational visibility without pushing critical logic into disconnected tools.

### Approved longer description

Evolve Edge is a multi-tenant AI governance and compliance platform for regulated and high-trust organizations. It combines structured intake, evidence collection, framework mapping, executive-ready reporting, and controlled workflow orchestration so teams can move from AI risk uncertainty to a documented operating process.

### Primary audiences

- law firms
- fintech companies
- regulated businesses
- high-trust teams facing AI governance, vendor review, and compliance pressure

### Core value themes

- faster AI governance readiness
- structured audit and evidence workflows
- executive-ready reporting
- backend-owned commercial and workflow control
- traceable operations for high-trust teams

## Architecture messaging rules

Use these concepts consistently:

- Evolve Edge app owns business logic and product state
- Stripe handles billing and checkout
- n8n handles orchestration only
- Dify handles AI processing only
- HubSpot handles CRM visibility only

### Safe wording

- backend-owned routing
- Stripe-hosted checkout
- app-owned workflow control
- structured AI processing
- audit-friendly workflow history
- multi-tenant access controls
- CRM visibility in HubSpot

### Wording to avoid

- n8n decides plan logic
- HubSpot controls access
- Dify owns workflow state
- fully autonomous compliance platform
- guaranteed compliance
- certified by default
- one-click enterprise rollout

## Naming rules

Always use:

- `Starter`
- `Scale`
- `Enterprise`

Never use:

- `Growth`
- `Professional`
- `Advanced`
- `Pro`
- monthly pricing toggle language
- annual pricing toggle language

If legacy names appear in existing drafts, replace them with the canonical names above.

## Design and tone guidance for Hostinger AI

Use a premium, modern, enterprise-ready tone.

Prioritize:

- clarity over hype
- trust over trendiness
- concrete outcomes over vague AI language
- concise sections with strong headlines

Avoid:

- flashy consumer startup language
- exaggerated automation claims
- jargon-heavy system diagrams on the homepage
- crowded pricing comparisons
- self-serve enterprise checkout messaging

## Approved CTA labels

Use only these primary CTA labels unless a page clearly needs a softer variation:

- `Start with Starter`
- `Start with Scale`
- `Contact sales`
- `Book a walkthrough`

Use only these softer secondary CTA labels where needed:

- `See how it works`
- `Talk to the team`
- `View pricing`

## Homepage reference

### Homepage goal

Help a first-time buyer understand what Evolve Edge does, who it is for, what they walk away with, and which next action to take.

### Recommended section order

1. Hero
2. From uncertainty to actionable risk clarity
3. What you walk away with
4. How the workflow works
5. Who this is for
6. Pricing preview
7. Final CTA

### Hero copy

#### Approved headline

Know your AI risk posture in days — not months

#### Approved supporting copy

Identify compliance gaps, quantify risk, and deliver executive-ready reports your leadership can act on immediately.

#### Approved primary CTA

- Label: `Get your risk assessment`
- Target: app-owned intake flow

#### Approved secondary CTA

- Label: `View sample report`
- Target: on-page sample report / deliverables section or a dedicated sample report page if one exists

### From uncertainty to actionable risk clarity

#### Section headline

From uncertainty to actionable risk clarity

#### Cards

- `AI Risk Assessment`
  - See where your current AI posture is exposed, what is driving the risk, and what needs attention first.
- `Compliance Mapping`
  - Connect your current state to the frameworks, policies, and obligations leadership needs to answer for.
- `Executive Reporting`
  - Turn technical findings into concise reporting that supports decisions, budget asks, and stakeholder alignment.

### What you walk away with

#### Section headline

What you walk away with

#### Intro copy

Every engagement should make it obvious what leadership is looking at now and what happens next.

#### Deliverables list

- Risk score + breakdown
- Top 5 critical findings
- 30–90 day remediation roadmap
- Executive briefing

### Workflow explanation section

#### Headline

A fast path from intake to leadership-ready clarity.

#### Body

Use simple, business-readable language. Avoid internal systems language on the homepage.

#### Simple three-step explanation

1. Capture the operating reality.
2. Assess against what matters.
3. Leave with a clear action plan.

### Who this is for

#### Headline

Built for teams that need confidence before exposure grows.

#### Audience cards

- `Regulated operators`
  - Create a credible view of AI risk without slowing the business down.
- `Lean compliance teams`
  - Replace scattered evidence and unclear priorities with a focused plan.
- `Leadership under scrutiny`
  - Give boards and executives a sharper picture of exposure, ownership, and next steps.

### Pricing preview copy

#### Headline

Choose the audit path that matches your operating depth.

#### Intro

Keep the pricing section short, premium, and outcome-oriented. Do not crowd it with feature grids.

### Final homepage CTA

#### Headline

Get a sharper view of AI risk before it becomes an expensive surprise.

#### Body

Start with a focused assessment, align your stakeholders, and leave with a roadmap your team can execute.

#### CTA labels

- Primary: `Get your risk assessment`
- Secondary: `Speak with an advisor`

## Pricing page reference

### Pricing page goal

Make the public offer easy to understand and easy to act on.

### Pricing page intro

Evolve Edge offers two direct checkout paths and one sales-led enterprise path. Each offer is designed to keep workflow decisions controlled in the application while matching the level of reporting and operational depth your team needs.

### Starter card

- Name: `Starter`
- Price: `$2,500 one-time`
- CTA: `Start with Starter`
- CTA target: Stripe hosted checkout
- Summary: Entry path for teams that need a structured AI risk review and concise executive-ready outputs.

#### Starter bullets

- Lightweight audit workflow
- Structured intake review
- Concise executive-ready output
- Controlled backend routing
- Good fit for smaller or first-time engagements

### Scale card

- Name: `Scale`
- Price: `$7,500 one-time`
- CTA: `Start with Scale`
- CTA target: Stripe hosted checkout
- Summary: Primary operating offer for teams that need deeper reporting, broader workflow depth, and stronger operational follow-through.

#### Scale bullets

- Full audit workflow depth
- Deeper reporting and roadmap continuity
- Broader evidence and framework coverage
- Monitoring-ready operating path
- Best fit for teams formalizing an ongoing AI governance process

### Enterprise card

- Name: `Enterprise`
- Price: `Custom`
- CTA: `Contact sales`
- CTA target: contact sales
- Summary: Sales-led rollout for larger programs, regulated environments, and custom delivery coordination.

#### Enterprise bullets

- Enterprise coordination and rollout support
- Custom workflow and reporting depth
- Internal stakeholder alignment support
- Contracted implementation planning
- Custom commercial structure

### Pricing notes

Use a short note such as:

Enterprise is handled through a sales-led process. Starter and Scale use Stripe-hosted checkout. If your team needs a custom rollout, contact us directly.

## Trust and security page reference

### Page goal

Create buyer confidence without making unsupported certification claims.

### Headline

Built for auditability, controlled workflows, and high-trust operating environments.

### Intro copy

Evolve Edge is designed so core product logic stays in the application boundary while specialized systems support billing, orchestration, AI execution, and CRM visibility. That separation reduces hidden workflow logic and makes operational behavior easier to inspect and support.

### Approved trust sections

#### Controlled system boundaries

The Evolve Edge application owns business logic and product state. Stripe handles billing, n8n handles orchestration, Dify handles AI processing, and HubSpot supports CRM visibility. External systems do not become hidden owners of plan logic or product behavior.

#### Multi-tenant controls

Workspace-scoped access controls and tenant-aware workflows are designed to keep customer data and operational state isolated.

#### Operational traceability

Important workflow and billing transitions are recorded with durable events, logs, and support-facing visibility so teams can investigate failures and retry safely.

#### Billing correctness

Stripe remains the billing authority, while the app normalizes subscription and routing decisions before execution starts.

### Claims to avoid on trust page

Do not claim:

- SOC 2 certified
- ISO certified
- guaranteed regulatory approval
- zero-risk AI deployment

Unless those are independently true and approved outside this reference.

## Contact sales page reference

### Page goal

Capture enterprise interest without turning the page into a generic lead form.

### Headline

Talk with us about enterprise rollout, custom coordination, or regulated delivery needs.

### Supporting copy

Enterprise engagements are handled through a guided sales process. Use this path if you need custom workflow depth, larger stakeholder coordination, implementation planning, or a commercial structure beyond the standard Starter and Scale offers.

### Contact sales bullets

- Custom rollout planning
- Enterprise stakeholder alignment
- Delivery and implementation coordination
- Commercial packaging for larger environments

## FAQ reference

### FAQ 1

#### Question

What is the difference between Starter and Scale?

#### Answer

Starter is the lighter-weight entry path for teams that need a structured AI risk review and concise outputs. Scale is the primary operating offer for deeper reporting, stronger workflow depth, and broader follow-through.

### FAQ 2

#### Question

Can we buy Enterprise directly online?

#### Answer

No. Enterprise is handled through a sales-led process so the rollout, delivery model, and commercial structure can be aligned to your environment.

### FAQ 3

#### Question

Does Evolve Edge replace our internal review process?

#### Answer

No. Evolve Edge supports a more structured operating process for AI governance, evidence collection, reporting, and follow-up. It does not replace your internal decision-making or legal obligations.

### FAQ 4

#### Question

How do you use AI in the workflow?

#### Answer

AI is used for structured analysis and workflow support inside a controlled application boundary. Product state, workflow routing, and commercial decisions remain owned by the Evolve Edge application.

### FAQ 5

#### Question

Do you support regulated and high-trust teams?

#### Answer

Yes. Evolve Edge is designed for teams that need structured workflows, traceability, and clear operational boundaries rather than ad hoc automation spread across disconnected tools.

## Approved short feature descriptions

Use these when Hostinger AI needs concise supporting text.

### Assessments

Capture AI use case details through a structured intake and review path.

### Evidence

Collect and organize supporting materials for review and downstream reporting.

### Reports

Generate executive-ready outputs with reporting depth matched to the selected workflow path.

### Framework mapping

Map controls and evaluation work into a more structured governance view.

### Monitoring

Support ongoing operational visibility where the selected workflow and entitlement path allows it.

## Forbidden claims and copy checks

Do not publish copy that:

- reintroduces `Growth`
- shows monthly or annual pricing toggles
- implies direct Enterprise checkout
- says HubSpot, n8n, or Dify decide plans
- claims a certification that is not formally held
- promises fully autonomous compliance
- promises legal guarantees

## Hostinger AI generation prompt guidance

When using this reference inside Hostinger AI, give instructions like:

- build a premium B2B SaaS website
- use only the plan names, prices, CTAs, and rules in this document
- keep the tone enterprise-ready and trust-oriented
- do not invent additional plans or pricing options
- do not add monthly or annual billing toggles
- treat Enterprise as contact-sales-only
- keep the homepage concise and high trust

## Maintenance checklist

When the commercial model changes, update these files together:

- [commercial-catalog.ts](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\apps\web\lib\commercial-catalog.ts)
- [canonical-commercial-consistency.md](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\docs\canonical-commercial-consistency.md)
- [hostinger-commercial-reference.md](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\docs\hostinger-commercial-reference.md)
- [hostinger-ai-website-copy-reference.md](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\docs\hostinger-ai-website-copy-reference.md)
