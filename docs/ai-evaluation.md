# AI Evaluation Harness

Evolve Edge uses a backend-owned AI evaluation harness to regression test the OpenAI + LangGraph audit workflow without pushing live model calls into CI by default.

## How It Works

- Synthetic fixtures live in `apps/web/src/server/ai/evals/fixtures/`
- Golden expectations live in `apps/web/src/server/ai/evals/golden/`
- The runner lives in `apps/web/src/server/ai/evals/run-evals.ts`
- Mock mode executes the real LangGraph audit graph with deterministic mocked node outputs
- Live mode is opt-in and uses the configured OpenAI + LangGraph provider
- All eval outputs are validated through the same Zod-backed workflow contracts used by production execution

## What The Harness Checks

- structured output remains valid against the app-owned workflow schema
- required report sections still exist
- risk scores stay inside expected ranges for each synthetic company profile
- framework mapping remains relevant to the customer industry
- minimum risk categories are still surfaced
- internal implementation details are not exposed
- synthetic identifiers and email addresses are not echoed back into reports
- legal guarantees and unsafe compliance claims are rejected
- final report tone remains executive-grade rather than generic or low-value

## Fixtures Included

- `small-law-firm`
- `early-fintech-startup`
- `small-healthtech-company`

These fixtures use synthetic identifiers, companies, and evidence only. Do not place customer data in eval fixtures or goldens.

## Commands

Mocked evals:

```bash
pnpm ai:eval
pnpm test:ai
```

Live evals:

```bash
pnpm ai:eval:live
```

Or:

```bash
AI_EVAL_LIVE=true pnpm ai:eval
```

Live mode requires:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- optional `OPENAI_REASONING_MODEL`

CI must remain on mocked mode unless there is an explicit decision to enable live model validation in a separate workflow.

## Adding A New Fixture

1. Add a synthetic fixture under `apps/web/src/server/ai/evals/fixtures/`.
2. Add a matching golden expectation under `apps/web/src/server/ai/evals/golden/`.
3. Add deterministic mocked workflow responses in `apps/web/src/server/ai/evals/mock-responses.ts`.
4. Update the fixture and golden indexes.
5. Run `pnpm test:ai` and `pnpm ai:eval`.

## When Failures Mean

- `valid structured output` failed:
  the workflow contract drifted, model output degraded, or a normalizer/schema changed incompatibly
- `framework mapping is relevant` failed:
  prompt, model, or mapping logic regressed and no longer matches expected industry context
- `risk score is within expected range` failed:
  scoring logic, findings severity, or risk-flag interpretation changed
- `required report sections exist` or `final report is executive ready` failed:
  the report got thinner, lost important sections, or dropped below the expected advisory quality bar
- `internal implementation details are not exposed` failed:
  prompts, internal IDs, or workflow details leaked into model-visible output and need immediate review

## When To Update Goldens

Update golden expectations only when the product contract intentionally changes, for example:

- a new framework becomes part of the supported recommendation set
- scoring policy changes intentionally
- required report sections change intentionally
- the report quality bar is raised and the new behavior is clearly better

Do not update goldens just to make a failing run pass. First confirm whether the change is a real improvement or a regression.
