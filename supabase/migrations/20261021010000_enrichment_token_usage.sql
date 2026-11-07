/*
  # Record what an enrichment job actually cost

  MEASURED 2026-10-09: 8,060 enrichment jobs had run — 7,425 of them
  successfully — and nothing anywhere recorded what any of them cost. There is
  a `run_cost_budget` column, so the intent existed; there was simply no
  figure to compare it against.

  Every provider returns a usage block on every call and `_shared/llm.ts`
  discarded it. It now returns one, and these columns are where it lands.

  ── TOKENS, NOT MONEY ─────────────────────────────────────────────────────

  No price is stored. A rate card belongs with whoever pays the bill and
  changes without notice; multiplying tokens by a hardcoded figure here would
  produce a number that looks authoritative and quietly goes wrong the next
  time a provider changes its pricing — or the next time the router picks a
  different model, which it does by design.

  `provider` and `model` are recorded beside the counts precisely so the cost
  can be worked out later against whatever the rates actually were.

  ── NULL MEANS UNMEASURED, NOT FREE ───────────────────────────────────────

  All columns are nullable with no default. A job that ran before this
  migration, or one whose provider reported no usage, must read as unknown —
  the one thing worse than having no cost figure is having a wrong one that
  averages thousands of unmeasured jobs in as zero.
*/

alter table public.business_enrichment_jobs
  add column if not exists llm_provider     text,
  add column if not exists llm_model        text,
  add column if not exists llm_input_tokens integer,
  add column if not exists llm_output_tokens integer,
  /* More than one whenever a job round-trips through a tool. */
  add column if not exists llm_calls        integer;

comment on column public.business_enrichment_jobs.llm_input_tokens is
  'Prompt tokens as the provider reported them. NULL means unmeasured — never treat it as zero when averaging.';
comment on column public.business_enrichment_jobs.llm_output_tokens is
  'Completion tokens as the provider reported them. NULL means unmeasured.';

/*
 * Partial index: the questions worth asking are all about jobs that actually
 * reported usage ("what did last month cost", "which model is dearest"), and
 * the unmeasured majority would otherwise dominate the index for no gain.
 */
create index if not exists business_enrichment_jobs_usage_idx
  on public.business_enrichment_jobs (finished_at desc, llm_model)
  where llm_input_tokens is not null;

/**
 * What enrichment has cost, in tokens, by model.
 *
 * A view rather than a dashboard query so the definition of "measured" lives
 * in one place: `measured_jobs` counts only rows that reported usage, and
 * `unmeasured_jobs` is shown beside it so nobody reads an average without
 * knowing how much of the period it actually covers.
 */
create or replace view public.enrichment_token_usage as
select
  date_trunc('day', coalesce(finished_at, created_at)) as day,
  coalesce(llm_provider, '(unmeasured)') as provider,
  coalesce(llm_model, '(unmeasured)')    as model,
  count(*) filter (where llm_input_tokens is not null) as measured_jobs,
  count(*) filter (where llm_input_tokens is null)     as unmeasured_jobs,
  sum(llm_input_tokens)  as input_tokens,
  sum(llm_output_tokens) as output_tokens,
  sum(llm_calls)         as llm_calls
from public.business_enrichment_jobs
group by 1, 2, 3;

comment on view public.enrichment_token_usage is
  'Enrichment token spend per day and model. `unmeasured_jobs` is reported beside the totals so an average is never read as covering jobs that recorded nothing.';
