# Authority and Trust Layer

## What existed before

Before this phase, Evolve Edge had:

- a homepage
- a pricing page
- strong product and delivery infrastructure
- no dedicated trust center foundation
- no reusable framework coverage pages
- no methodology page structure
- no security posture page scaffold
- no case study or thought-leadership content architecture beyond general marketing copy

The product could be credible in code, but the website did not yet expose that credibility in a structured way for regulated buyers.

## What was implemented

This phase adds a file-backed authority layer built from typed content structures and reusable marketing components.

New content structures:

- `TRUST_CENTER_CONTENT`
- `FRAMEWORK_COVERAGE_ENTRIES`
- `METHODOLOGY_STAGES`
- `SECURITY_POSTURE_MODULES`
- `CASE_STUDY_SCAFFOLDS`
- `RESOURCE_SCAFFOLDS`
- `AUTHORITY_FAQ`

New reusable UI infrastructure:

- shared authority page shell
- reusable section wrapper
- reusable authority card grid
- reusable authority list card
- reusable authority FAQ renderer

New pages:

- `/trust`
- `/frameworks`
- `/frameworks/[slug]`
- `/methodology`
- `/security`
- `/resources`

Homepage and pricing updates:

- homepage trust-navigation links
- homepage authority section linking to the new trust layer
- pricing-page header link to the trust center

Analytics updates:

- trust center page views
- framework index/detail page views
- methodology page views
- security page views
- resources page views

## Why it matters

Regulated buyers do not only evaluate product features. They evaluate:

- process rigor
- reporting discipline
- framework understanding
- security posture clarity
- whether the vendor feels structured enough for premium engagement

This authority layer gives Evolve Edge a credible, updateable surface for that evaluation without hardcoding exaggerated assurance claims.

## Architecture decisions

- The first version is file-backed, typed, and reviewable rather than introducing a CMS prematurely.
- Reusable components keep trust, framework, methodology, security, and resource pages visually and structurally consistent.
- Content models are designed so a founder or marketer can edit them directly today and map them to a CMS or admin editor later.
- No database schema was added because this phase is content infrastructure, not operational product state.
- Analytics reuse the app-owned product analytics layer so vendor neutrality is preserved.

## Content update workflow

Humans should update these files:

- `apps/web/lib/authority-content.ts`
- `apps/web/lib/authority.ts`

Common edits:

- add a framework page:
  - add one object to `FRAMEWORK_COVERAGE_ENTRIES`
- change trust center modules:
  - edit `TRUST_CENTER_CONTENT`
- update methodology messaging:
  - edit `METHODOLOGY_STAGES`
- add a case study placeholder:
  - add one object to `CASE_STUDY_SCAFFOLDS`
- add a resource or guide scaffold:
  - add one object to `RESOURCE_SCAFFOLDS`

## Admin/editability considerations

There is no in-product content editor yet.

This is intentional for the first version:

- updates stay explicit in git
- copy changes remain reviewable
- claims can be checked before publishing
- future CMS or admin editing can reuse the same shapes

If a future phase adds content editing, these content structures should become the source schema for that editor.

## File map

- `apps/web/lib/authority-content.ts`
- `apps/web/lib/authority.ts`
- `apps/web/components/authority-sections.tsx`
- `apps/web/app/trust/page.tsx`
- `apps/web/app/frameworks/page.tsx`
- `apps/web/app/frameworks/[slug]/page.tsx`
- `apps/web/app/methodology/page.tsx`
- `apps/web/app/security/page.tsx`
- `apps/web/app/resources/page.tsx`
- `apps/web/app/page.tsx`
- `apps/web/app/pricing/page.tsx`
- `apps/web/lib/product-analytics.ts`

## Environment variables required

No new environment variables were added for this phase.

## Migrations required

None.

## Test checklist

1. Open `/` and confirm the new trust-navigation buttons render.
2. Open `/trust` and confirm trust artifacts, methodology links, and FAQ sections render cleanly.
3. Open `/frameworks` and confirm all framework cards render.
4. Open one framework detail page such as `/frameworks/soc-2` and confirm:
   - coverage areas render
   - executive questions render
   - report outputs render
5. Open `/methodology` and confirm the four-stage structure renders.
6. Open `/security` and confirm posture modules and trust artifact cards render.
7. Open `/resources` and confirm resource scaffolds and case study placeholders render.
8. Open `/pricing` and confirm the trust-center link appears in the header.
9. Confirm no page makes certification or legal claims the app cannot support.

## Manual setup steps

1. No external setup is required.
2. Edit `apps/web/lib/authority-content.ts` when adding or revising authority content.
3. If you later connect a CMS, map its content model to the existing typed structures first.

## Future expansion notes

- add downloadable trust artifacts
- add legal and privacy pages
- add customer proof with approved testimonials and case studies
- add richer framework combinations beyond one-page summaries
- add a CMS or internal admin editor
- add gated resource capture if marketing wants demand-gen workflows later
