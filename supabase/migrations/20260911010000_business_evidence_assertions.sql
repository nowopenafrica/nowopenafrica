/*
  # Business Intelligence — evidence assertions metadata

  Extends the field-level provenance table (20260908140000) with the three
  things the enrichment engine needs to prove — not assume — what it wrote:

    generated_by_ai  the row was produced by a model (never by a source or a
                     person). This is what lets the public UI and the admin
                     review queue treat ai-produced evidence differently, the
                     same way `extraction_method = 'ai_inferred'` already is.
    ai_model         which model produced it. Recorded at the moment of
                     generation only — it is unrecoverable afterwards.
    superseded_at    when a newer, better observation replaced this one. Rows
                     stay (they are a history of what sources said) but the
                     engine stops confusing "latest recorded" with "best".

  Purely additive: one ALTER, three nullable columns, no backfill. A null
  generated_by_ai means "not produced by an AI", not "AI and secret".

  Re-runnable.
*/

ALTER TABLE public.business_evidence
  ADD COLUMN IF NOT EXISTS generated_by_ai boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_model text,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

COMMENT ON COLUMN public.business_evidence.generated_by_ai IS
  'True when a model produced this evidence row rather than a source or a person. Never set retroactively — it only means anything while recorded at write time.';
COMMENT ON COLUMN public.business_evidence.ai_model IS
  'The model identifier used to generate this evidence row (formatting follows _shared/llm.ts). NULL for non-AI rows.';
COMMENT ON COLUMN public.business_evidence.superseded_at IS
  'When this observation was replaced by a better one. The row is kept for the audit trail but is no longer "current evidence".';