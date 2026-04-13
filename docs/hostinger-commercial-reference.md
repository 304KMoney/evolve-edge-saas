# Hostinger Commercial Reference

Use this document as the compact source for Hostinger website pricing and CTA content.

For full page copy, section ordering, approved headlines, CTA usage, FAQ text, and Hostinger AI generation guidance, use:

- [hostinger-ai-website-copy-reference.md](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\docs\hostinger-ai-website-copy-reference.md)

## Homepage quick reference

- Hero headline: `Know your AI risk posture in days — not months`
- Hero supporting copy: `Identify compliance gaps, quantify risk, and deliver executive-ready reports your leadership can act on immediately.`
- Primary CTA: `Get your risk assessment`
- Secondary CTA: `View sample report`
- Deliverables section title: `What you walk away with`
- Deliverables:
  - `Risk score + breakdown`
  - `Top 5 critical findings`
  - `30–90 day remediation roadmap`
  - `Executive briefing`

## Public pricing cards

### Starter

- Display name: `Starter`
- Public price: `$2,500 one-time`
- CTA label: `Start with Starter`
- CTA target: Stripe hosted checkout
- Workflow summary: `audit_starter`
- Positioning: lighter-weight audit path with backend-owned routing and executive-ready delivery

### Scale

- Display name: `Scale`
- Public price: `$7,500 one-time`
- CTA label: `Start with Scale`
- CTA target: Stripe hosted checkout
- Workflow summary: `audit_scale`
- Positioning: primary operating offer with deeper reporting, monitoring support, and premium workflow depth

### Enterprise

- Display name: `Enterprise`
- Public price: `Custom`
- CTA label: `Contact sales`
- CTA target: Contact sales / HubSpot form
- Workflow summary: `audit_enterprise`
- Positioning: sales-led rollout for larger regulated programs with custom coordination

## CTA rules

- `Starter` -> Stripe hosted checkout
- `Scale` -> Stripe hosted checkout
- `Enterprise` -> Contact sales

Do not:

- expose legacy `growth` plan names
- show monthly vs annual toggles
- present HubSpot as the system that owns product access
- imply n8n or Dify owns routing logic

## Messaging rules

Use:

- backend-owned commercial routing
- Stripe-hosted checkout
- CRM visibility in HubSpot
- structured AI processing
- normalized workflow execution

Avoid:

- “Growth”
- “Professional”
- “Advanced”
- “n8n decides plan logic”
- “HubSpot controls access”

## Trust wording

Recommended:

- multi-tenant access controls
- audit-friendly workflow history
- backend-owned commercial logic
- Stripe-backed billing
- normalized workflow routing

## Contact sales destination

Use the configured contact sales URL from:

- `NEXT_PUBLIC_CONTACT_SALES_URL`

## Hostinger presentation boundary

Hostinger is presentation only.

Hostinger must not:

- decide plan logic
- own billing behavior
- infer workflow routing from Stripe data
- present legacy internal plan names

Hostinger should only present the canonical public commercial model owned by the backend.

## Operator export route

For operator reference, use the protected internal route:

- `GET /api/internal/commercial/site-reference`

Authenticate with:

- `COMMERCIAL_REFERENCE_SECRET`

## Source of truth

When pricing or CTA content changes, update:

- [commercial-catalog.ts](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\apps\web\lib\commercial-catalog.ts)
- [canonical-commercial-consistency.md](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\docs\canonical-commercial-consistency.md)
- [hostinger-ai-website-copy-reference.md](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\docs\hostinger-ai-website-copy-reference.md)
- [hostinger-site-sync-guide.md](C:\Users\kielg\OneDrive\Desktop\Evolve%20Edge\docs\hostinger-site-sync-guide.md)
