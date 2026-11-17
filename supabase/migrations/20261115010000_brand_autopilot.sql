-- Brand autopilot, step 1: AI-drafted posts for NowOpen Africa's own accounts.
--
-- This adds DRAFTING to the brand social desk and nothing else. A model writes
-- a post from a brief; the row lands in brand_social_content as a draft and
-- then takes the path every hand-written post takes (checks, review, a
-- person's approval, Zoho). No new route to "approved" or "sent" is created:
-- the edge function inserts posts with the admin's own token, so the existing
-- guard trigger forces status = draft and stamps created_by.
--
-- What is new:
--   * Two settings. AI drafting is OFF until the founder turns it on AND sets
--     a monthly token ceiling. No ceiling means no calls, never "unlimited".
--   * brand_social_ai_runs: one row per model call, written only by the edge
--     function. It records the brief, the provider and model that answered,
--     and the tokens the provider reported. Tokens are stored as reported and
--     are NULL when the provider reported nothing; NULL is not zero.
--   * brand_social_content.origin and ai_run_id, so a reviewer can always see
--     that a draft came from a model and which call wrote it.

ALTER TABLE public.brand_social_settings
  ADD COLUMN IF NOT EXISTS ai_generation_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_monthly_token_limit bigint NOT NULL DEFAULT 0
    CHECK (ai_monthly_token_limit BETWEEN 0 AND 50000000);

CREATE TABLE IF NOT EXISTS public.brand_social_ai_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL DEFAULT 'post' CHECK (kind IN ('post')),
  brief         jsonb NOT NULL,
  status        text NOT NULL DEFAULT 'running' CHECK (status IN ('running','done','failed')),
  provider      text,
  model         text,
  input_tokens  bigint CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens bigint CHECK (output_tokens IS NULL OR output_tokens >= 0),
  calls         int CHECK (calls IS NULL OR calls >= 0),
  content_id    uuid REFERENCES public.brand_social_content(id) ON DELETE SET NULL,
  error         text,
  requested_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_brand_social_ai_runs_started ON public.brand_social_ai_runs (started_at DESC);

ALTER TABLE public.brand_social_ai_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read brand_social_ai_runs" ON public.brand_social_ai_runs;
CREATE POLICY "Admins read brand_social_ai_runs" ON public.brand_social_ai_runs
  FOR SELECT TO authenticated USING (public.is_admin());
-- No INSERT, UPDATE or DELETE policy: only the edge function (service role)
-- writes the ledger, so a browser cannot erase or rewrite what was spent.

ALTER TABLE public.brand_social_content
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'person' CHECK (origin IN ('person','ai')),
  ADD COLUMN IF NOT EXISTS ai_run_id uuid REFERENCES public.brand_social_ai_runs(id) ON DELETE SET NULL;

-- Tokens reported since a given instant, for the monthly ceiling. Runs whose
-- provider reported nothing are counted separately so the screen can say so.
CREATE OR REPLACE FUNCTION public.brand_social_ai_usage(p_since timestamptz)
RETURNS TABLE (tokens bigint, runs bigint, unreported_runs bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)), 0)::bigint,
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE status <> 'running' AND provider IS NOT NULL AND input_tokens IS NULL AND output_tokens IS NULL)::bigint
  FROM public.brand_social_ai_runs
  WHERE started_at >= p_since
    AND (auth.role() = 'service_role' OR public.is_admin());
$$;

REVOKE ALL ON FUNCTION public.brand_social_ai_usage(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brand_social_ai_usage(timestamptz) TO authenticated, service_role;
