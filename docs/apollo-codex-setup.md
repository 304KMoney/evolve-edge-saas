# Apollo + Codex Setup

Use this when you want Codex to help with Apollo-driven prospecting or
enrichment without making Apollo the source of truth for app-owned customer
state.

## Boundary

- Evolve Edge remains the canonical owner of leads, customer lifecycle state,
  routing, entitlements, and delivery status.
- Apollo stays enrichment-only.
- n8n stays orchestration-only.
- Codex can query Apollo through a local MCP server for operator workflows, but
  Apollo results must still be validated before any app-owned field is stored.

## What This Repo Includes

This repo now includes a project-scoped Codex MCP server:

- project config: [.codex/config.toml](/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/.codex/config.toml)
- local server: [.codex/apollo-mcp-server.mjs](/Users/kielg/Documents/EvolveEdge/evolve-edge-saas/.codex/apollo-mcp-server.mjs)

The MCP server reuses:

- `APOLLO_API_KEY`
- `APOLLO_API_BASE_URL`

## Supported Codex Tools

- `apollo_search_people`
  - Uses Apollo People API Search.
  - Good for prospecting likely decision-makers around a target company or ICP.
  - Does not return revealed emails or phone numbers.
  - Requires a master API key.
- `apollo_search_organizations`
  - Good for account-list building and ICP discovery.
  - Can consume Apollo credits.
- `apollo_enrich_person`
  - Good for researching a known person after you already have basic identity
    data.
  - Can consume Apollo credits.
- `apollo_enrich_organization`
  - Good for enriching a known company by domain.
  - Can consume Apollo credits.

## Local Setup

1. Set `APOLLO_API_KEY` in your local environment.
2. Optionally set `APOLLO_API_BASE_URL`.
   - Default: `https://api.apollo.io/api/v1`
3. Open the repo as a trusted project in Codex so project-scoped
   `.codex/config.toml` is loaded.
4. In Codex, use `/mcp` to confirm the `apollo` server is active.

If Codex cannot start the server from the relative path in
`.codex/config.toml`, replace the script path with an absolute local path for
your workstation.

## Recommended Usage

- Use `apollo_search_organizations` to find target accounts by geography,
  headcount, or technology footprint.
- Use `apollo_search_people` to find decision-makers around those accounts.
- Use enrichment tools only when you already have a promising candidate and want
  a narrower operator view.
- Keep Apollo output in Slack, operator notes, or CRM follow-up lanes unless the
  backend explicitly validates and stores a field.

## Credit And Safety Notes

- Apollo search and enrichment behavior can differ by endpoint.
- `apollo_search_people` is the safest first tool for prospect discovery because
  Apollo documents it as non-credit-consuming, but it still requires a master
  API key.
- `apollo_search_organizations`, `apollo_enrich_person`, and
  `apollo_enrich_organization` can consume credits.
- Do not let Apollo determine:
  - lead conversion state
  - requested plan or entitlements
  - workflow routing
  - provisioning
  - customer-visible status

## Relationship To n8n

This Codex MCP path is complementary to the existing n8n lead pipeline:

- n8n remains the recommended path for downstream `lead.captured` and
  `lead.converted` automation
- Codex MCP is for operator-driven prospecting and enrichment work
- neither path changes the rule that the app and Neon own the canonical record
