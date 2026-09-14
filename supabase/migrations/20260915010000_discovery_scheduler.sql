/*
  # The scheduler that makes discovery campaigns run

  Phase 1 (20260914010000) added the campaign row and the run ledger and said
  plainly that no ingestor existed: a campaign was a plan, not work done. This
  file is the spine that turns an active campaign into `radar_candidates`.

  ASYMMETRIC WITH ENRICHMENT, ON PURPOSE

  Enrichment queues ROWS first (business_enrichment_jobs) and the executor
  drains them. Discovery is different: the "thing to do" is a CAMPAIGN (a
  scoped push over a source), and its work is one run with many candidates.
  So the queue here is thin — one `running` run row per campaign at a time —
  and the judgement lives in the claim function rather than in a refill:

    - only `active` campaigns inside their start/end window are claimable;
    - the engine flag must be on (`business_discovery_engine`), belt and
      braces on top of the executor's own check;
    - a campaign already `running` is never claimed twice (the run table's
      own CHECK says only one running run per campaign exists by the
      `FOR UPDATE SKIP LOCKED` claim, and the executor never starts a second);
    - a campaign whose `daily_limit` today is spent waits for tomorrow;
    - a campaign whose `max_records` is reached is marked `completed` rather
      than idling forever;
    - a campaign that recently succeeded is left alone (12h cooldown) so a
      tick with nothing due costs one HTTP call that returns immediately —
      exactly the workforce/enrichment rule: all cadence lives in the queue
      function, never in cron.

  WHAT THE EXECUTOR MAY WRITE

  `radar_candidates` rows (status `review`) carrying campaign_id, and its own
  run row through `finish_discovery_run`. Nothing else. It cannot publish — a
  candidate reaches the directory only through `radar_publish_candidate` after
  a person (or the engine's own gate) approves it in the review queue, and the
  threshold checks on `business_discovery_campaigns` already mirror
  `radar_config`. The run numbers `records_published` may therefore be 0 for a
  long time; that is the ledger being honest, not a bug.

  SAFETY: the automation secret stays out of git (private_config, RLS on with
  no policies) and `tick_discovery()` posts to an endpoint the operator
  configures after the edge function is deployed. Until then the tick notices
  "not configured yet" and nothing is scheduled to call it.

  Re-runnable throughout.
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

/*
  Claim the next campaign that is due, atomically.

  Mirrors claim_next_enrichment_job's single-lock pattern: the campaign row is
  locked FOR UPDATE SKIP LOCKED so two ticks can never claim the same
  campaign, then the run row is created in the same transaction. Service-role
  only — the executor runs with the service key, and API roles are revoked.

  An executor that dies mid-run leaves its run row `running`; the campaign then
  waits for an operator (discovery_cron_status() surfaces running_runs), never
  for a silent re-claim that could double-fetch the same push. Every tick in
  this codebase shares that behaviour.
*/
CREATE OR REPLACE FUNCTION public.claim_due_discovery_campaign()
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_campaign uuid; v_run uuid;
BEGIN
  SELECT c.id INTO v_campaign
    FROM public.business_discovery_campaigns c
   WHERE c.status = 'active'
     AND (c.start_at IS NULL OR c.start_at <= now())
     AND (c.end_at   IS NULL OR c.end_at   >= now())
     AND EXISTS (
       SELECT 1 FROM public.feature_flags f
        WHERE f.key = 'business_discovery_engine' AND f.enabled)
     AND NOT EXISTS (
       SELECT 1 FROM public.business_discovery_runs r
        WHERE r.campaign_id = c.id AND r.status = 'running')
     AND NOT EXISTS (
       SELECT 1 FROM public.business_discovery_runs r
        WHERE r.campaign_id = c.id
          AND r.status IN ('succeeded','partially_succeeded','failed','blocked')
          AND r.finished_at > now() - interval '12 hours')
   ORDER BY c.created_at
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF v_campaign IS NULL THEN
    RETURN NULL;
  END IF;

  -- Daily budget spent? Leave the campaign for tomorrow.
  IF EXISTS (
    SELECT 1 FROM public.business_discovery_campaigns c
     WHERE c.id = v_campaign
       AND c.daily_limit IS NOT NULL
       AND (SELECT coalesce(sum(r.records_discovered), 0)
              FROM public.business_discovery_runs r
             WHERE r.campaign_id = c.id
               AND r.finished_at >= date_trunc('day', now()))
             >= c.daily_limit)
  THEN
    RETURN NULL;
  END IF;

  -- Total budget reached: the campaign's work is done. Say so rather than
  -- idling at 'active' while every tick decides there is nothing to do.
  UPDATE public.business_discovery_campaigns
     SET status = 'completed', updated_at = now()
   WHERE id = v_campaign
     AND max_records IS NOT NULL
     AND records_discovered >= max_records;

  INSERT INTO public.business_discovery_runs (campaign_id, status, started_at)
  VALUES (v_campaign, 'running', now())
  RETURNING id INTO v_run;

  RETURN v_run;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_due_discovery_campaign() FROM public, anon, authenticated;

/*
  Close one run and fold its numbers into the campaign.

  Terminal statuses only — a run cannot be finished back into 'running'. The
  worker bumps radar_sources stats here too, derived at the moment the run
  closes, so a source's last_run_at/records_seen always reflect completed work
  rather than a fetch started.

  Service-role only.
*/
CREATE OR REPLACE FUNCTION public.finish_discovery_run(
  p_run uuid,
  p_status text,
  p_records_discovered integer,
  p_records_published integer,
  p_error text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_campaign uuid;
BEGIN
  IF p_status NOT IN ('succeeded','partially_succeeded','failed','blocked','cancelled') THEN
    RAISE EXCEPTION 'finish_discovery_run accepts only terminal statuses';
  END IF;

  UPDATE public.business_discovery_runs
     SET status = p_status,
         records_discovered = greatest(0, coalesce(p_records_discovered, 0)),
         records_published  = greatest(0, coalesce(p_records_published, 0)),
         error = p_error,
         finished_at = now()
   WHERE id = p_run
     AND status = 'running'
   RETURNING campaign_id INTO v_campaign;

  IF v_campaign IS NULL THEN RETURN false; END IF;

  UPDATE public.business_discovery_campaigns
     SET records_discovered = records_discovered + greatest(0, coalesce(p_records_discovered, 0)),
         records_published  = records_published  + greatest(0, coalesce(p_records_published, 0)),
         last_run_at = now(),
         updated_at = now()
   WHERE id = v_campaign;

  -- The source registry's own run stats, written as part of finalising.
  UPDATE public.radar_sources s
     SET last_run_at = now(),
         records_seen = records_seen + greatest(0, coalesce(p_records_discovered, 0))
    FROM public.business_discovery_campaigns c
   WHERE c.id = v_campaign
     AND s.key = ANY (c.source_keys)
     AND s.active;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_discovery_run(uuid, text, integer, integer, text) FROM public, anon, authenticated;

/*
  Stage one discovered candidate into the review queue.

  The ONLY way the worker writes candidates, and it is so for three reasons:

    - the source gate is re-checked at the moment of writing, the same way
      radar_publish_candidate re-checks it at the moment of publication — a
      source deactivated between claim and write stages nothing;
    - status is forced to 'review' on INSERT and NEVER touched on conflict, so
      re-discovery of a candidate that was already published, merged or
      rejected refreshes its DATA without resetting its decision;
    - campaign_id is only back-filled when a candidate has none, so a
      candidate claimed by a second campaign keeps its first home.

  A bare `.from("radar_candidates").upsert()` from the executor would do none
  of these things, and a fresh status = 'review' on a published candidate is
  exactly the silent regression this engine exists to avoid.
*/
CREATE OR REPLACE FUNCTION public.stage_discovery_candidate(p_c jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.radar_sources
                  WHERE key = p_c->>'source_key' AND active) THEN
    RAISE EXCEPTION 'Source "%" is not active in the registry; nothing staged.',
      p_c->>'source_key';
  END IF;

  INSERT INTO public.radar_candidates (
    source_key, source_record_id, source_url, name, category, city, address,
    phone, whatsapp, email, website, description, latitude, longitude,
    name_key, city_key, phone_e164, domain, confidence, status, profile,
    campaign_id
  )
  VALUES (
    p_c->>'source_key', p_c->>'source_record_id', p_c->>'source_url', p_c->>'name',
    nullif(p_c->>'category', ''), nullif(p_c->>'city', ''),
    nullif(p_c->>'address', ''), nullif(p_c->>'phone', ''),
    nullif(p_c->>'whatsapp', ''), nullif(p_c->>'email', ''),
    nullif(p_c->>'website', ''), nullif(p_c->>'description', ''),
    (p_c->>'latitude')::double precision, (p_c->>'longitude')::double precision,
    p_c->>'name_key', p_c->>'city_key', p_c->>'phone_e164', p_c->>'domain',
    greatest(0, least(100, coalesce((p_c->>'confidence')::integer, 0))),
    'review',
    coalesce(p_c->'profile', '{}'::jsonb),
    (p_c->>'campaign_id')::uuid
  )
  ON CONFLICT (source_key, source_record_id) WHERE source_record_id IS NOT NULL
  DO UPDATE SET
    source_url   = EXCLUDED.source_url,
    name         = EXCLUDED.name,
    category     = EXCLUDED.category,
    city         = EXCLUDED.city,
    address      = EXCLUDED.address,
    phone        = EXCLUDED.phone,
    whatsapp     = EXCLUDED.whatsapp,
    email        = EXCLUDED.email,
    website      = EXCLUDED.website,
    description  = EXCLUDED.description,
    latitude     = EXCLUDED.latitude,
    longitude    = EXCLUDED.longitude,
    name_key     = EXCLUDED.name_key,
    city_key     = EXCLUDED.city_key,
    phone_e164   = EXCLUDED.phone_e164,
    domain       = EXCLUDED.domain,
    confidence   = EXCLUDED.confidence,
    profile      = EXCLUDED.profile,
    -- Lifecycle: a discovered row never rewrites the campaign that first
    -- claimed it, and never rewrites a decision the review queue made.
    campaign_id  = coalesce(EXCLUDED.campaign_id, radar_candidates.campaign_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.stage_discovery_candidate(jsonb) FROM public, anon, authenticated;

/*
  One tick.

  Deliberately dumb, like tick_workforce and tick_enrichment: posts to the
  discovery endpoint, which decides for itself which campaigns are due.
  Returns the pg_net request id so a failure can be traced in
  net._http_response.
*/
CREATE OR REPLACE FUNCTION public.tick_discovery()
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_url text; v_key text; v_anon text; v_id bigint;
BEGIN
  SELECT value INTO v_url  FROM public.private_config WHERE key = 'discovery_endpoint';
  SELECT value INTO v_key  FROM public.private_config WHERE key = 'automation_secret';
  SELECT value INTO v_anon FROM public.private_config WHERE key = 'anon_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'tick_discovery: not configured yet; nothing scheduled to call.';
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
    timeout_milliseconds := 55000
  ) INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.tick_discovery() FROM public, anon, authenticated;

/*
  Every 15 minutes, like the workforce and enrichment ticks. Discovery runs
  are heavier (one source fetch per campaign), but the tick itself is cheap and
  frequency changes happen in the claim function, never in cron.
*/
DO $$
BEGIN
  PERFORM cron.unschedule('nowopen-discovery');
EXCEPTION WHEN OTHERS THEN
  NULL; -- not scheduled yet
END $$;

SELECT cron.schedule('nowopen-discovery', '*/15 * * * *', $$SELECT public.tick_discovery();$$);

/** What the discovery scheduler is doing, for the admin console. */
CREATE OR REPLACE FUNCTION public.discovery_cron_status()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, cron AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  SELECT jsonb_build_object(
    'scheduled',     EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nowopen-discovery'),
    'schedule',      (SELECT schedule FROM cron.job WHERE jobname = 'nowopen-discovery'),
    'active',        (SELECT active   FROM cron.job WHERE jobname = 'nowopen-discovery'),
    'last_run',      (SELECT max(start_time) FROM cron.job_run_details d
                        JOIN cron.job j ON j.jobid = d.jobid WHERE j.jobname = 'nowopen-discovery'),
    'last_status',   (SELECT d.status FROM cron.job_run_details d
                        JOIN cron.job j ON j.jobid = d.jobid WHERE j.jobname = 'nowopen-discovery'
                       ORDER BY d.start_time DESC LIMIT 1),
    'configured',    EXISTS (SELECT 1 FROM public.private_config WHERE key = 'discovery_endpoint'),
    'active_campaigns', (SELECT count(*) FROM public.business_discovery_campaigns WHERE status = 'active'),
    'running_runs',     (SELECT count(*) FROM public.business_discovery_runs WHERE status = 'running'),
    'candidates_staged_today', (SELECT count(*) FROM public.radar_candidates
                                 WHERE created_at >= date_trunc('day', now())
                                   AND campaign_id IS NOT NULL)
  ) INTO r;
  RETURN r;
END;
$$;
GRANT EXECUTE ON FUNCTION public.discovery_cron_status() TO authenticated;