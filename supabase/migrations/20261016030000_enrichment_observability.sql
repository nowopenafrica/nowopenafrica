-- Let an enrichment run be seen.
--
-- ── WHAT WAS MEASURED, 2026-10-06 ────────────────────────────────────────
--
--   cron nowopen-enrichment fired            14:30:00
--   net._http_response row for it            none, five minutes later
--   net.http_request_queue                   empty (pg_net gave up)
--   jobs that actually finished in 20 min    36
--   jobs left running                        0
--
-- So the run WORKED and reported nothing. tick_enrichment posts with
-- `timeout_milliseconds := 55000`, and a batch of ten jobs — each doing an AI
-- extraction and one or more page fetches — regularly takes longer than that.
-- pg_net then discards the response, and `net._http_response` is where every
-- diagnosis of this pipeline starts.
--
-- That is how the pipeline stayed broken for six days while looking healthy:
-- the only visible evidence was the subset of runs that happened to finish
-- inside 55 seconds, and those were the runs that found nothing to do and
-- returned instantly.
--
-- 120s: comfortably past a normal batch, comfortably inside the edge
-- function's own wall clock, so a dropped response now means something is
-- genuinely wrong rather than merely busy.

create or replace function public.tick_enrichment()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
DECLARE v_url text; v_key text; v_anon text; v_id bigint;
BEGIN
  SELECT value INTO v_url  FROM public.private_config WHERE key = 'enrichment_endpoint';
  SELECT value INTO v_key  FROM public.private_config WHERE key = 'automation_secret';
  SELECT value INTO v_anon FROM public.private_config WHERE key = 'anon_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'tick_enrichment: not configured yet; nothing scheduled to call.';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url     := v_url,
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_anon, ''),
      'x-automation-key', v_key
    ),
    -- Was 55000. A ten-job batch routinely exceeds it, and the dropped
    -- response made working runs indistinguishable from dead ones.
    timeout_milliseconds := 120000
  ) INTO v_id;

  RETURN v_id;
END $$;

comment on function public.tick_enrichment() is
  'Posts to the enrichment worker. 120s timeout: a real batch outlasts 55s, and a discarded response is the difference between a pipeline you can diagnose and one you cannot.';
