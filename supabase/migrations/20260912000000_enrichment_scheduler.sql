/*
  # The scheduler that makes enrichment autonomous

  20260911030000 built the queue and the executor; nothing ever filled the
  queue, so the executor always saw an empty table. This is the missing spine:

    - queue_due_enrichment_businesses() figures out which listable businesses
      are due and inserts one (business, job_type) row per cadence.
    - tick_enrichment() posts to the executor once per tick, with the queue
      refilled first (the operator configures the endpoint URL, including
      ?limit=N&refill=1, exactly like the workforce endpoint).
    - a pg_cron job schedules that tick, mirroring the workforce.
    - enrichment_cron_status() shows what the scheduler is doing.

  ELIGIBILITY — all four must hold:

    - the business row is listable and not removed;
    - the owner has not switched sync off (business_sync_preferences.sync_enabled
      defaults TRUE; a business with no prefs row counts as opted-in);
    - no active (queued/running) job already exists; the partial unique index
      would refuse the duplicate anyway, but the scan-side check keeps the
      insert honest about how many it actually queued;
    - the job TYPE is not already satisfied within its freshness window.

  CADENCE — freshness windows decide when a type is due:

    - hours_resolution (priority 40, 45-day window): never had hours, or
      hours_last_verified older than 30 days — verify/re-verify opening hours
      on the topping-up cadence;
    - enrichment (priority 50, 7-day window): everything else, a rolling
      refresh pass.

  The tick is deliberately dumb, like tick_workforce: all judgement lives in
  the queue function, so a cadence change never means touching cron.

  SAFETY: this migration only queues work. The executor still cannot write a
  business directly — changes flatten through 20260911040000's proposals.

  Re-runnable throughout.
*/

-- Succeeded-run scan for the freshness windows above.
CREATE INDEX IF NOT EXISTS business_enrichment_jobs_done
  ON public.business_enrichment_jobs (business_id, job_type, finished_at DESC)
  WHERE status = 'succeeded';

/*
  Refill: pick every eligible business and enqueue the job type it is due.

  Returns the number of rows actually inserted (0 is a valid, "nothing due"
  answer). Service-role only.
*/
CREATE OR REPLACE FUNCTION public.queue_due_enrichment_businesses(p_max integer DEFAULT 20)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inserted integer;
BEGIN
  WITH due AS (
    SELECT
      b.id                                                  AS business_id,
      CASE
        WHEN b.opening_hours IS NULL AND b.hours IS NULL THEN 'hours_resolution'
        WHEN b.hours_last_verified IS NULL OR b.hours_last_verified < now() - interval '30 days' THEN 'hours_resolution'
        ELSE 'enrichment'
      END                                                   AS job_type,
      CASE
        WHEN b.opening_hours IS NULL AND b.hours IS NULL THEN 'hours never set'
        WHEN b.hours_last_verified IS NULL OR b.hours_last_verified < now() - interval '30 days' THEN 'hours last verified over 30 days ago'
        ELSE 'rolling refresh pass'
      END                                                   AS reason,
      (CASE WHEN b.opening_hours IS NULL AND b.hours IS NULL THEN 40 ELSE 50 END) AS priority
    FROM public.businesses b
    LEFT JOIN public.business_sync_preferences p ON p.business_id = b.id
    WHERE b.is_listable
      AND coalesce(b.removal_status, 'none') <> 'removed'
      AND coalesce(p.sync_enabled, true)
      AND NOT EXISTS (
        SELECT 1 FROM public.business_enrichment_jobs a
         WHERE a.business_id = b.id AND a.status IN ('queued','running'))
      AND (
        (CASE
          WHEN b.opening_hours IS NULL AND b.hours IS NULL THEN 'hours_resolution'
          WHEN b.hours_last_verified IS NULL OR b.hours_last_verified < now() - interval '30 days' THEN 'hours_resolution'
          ELSE 'enrichment'
         END = 'hours_resolution'
          AND NOT EXISTS (
            SELECT 1 FROM public.business_enrichment_jobs j
             WHERE j.business_id = b.id AND j.job_type = 'hours_resolution'
               AND j.status = 'succeeded'
               AND j.finished_at > now() - interval '45 days'))
        OR
        (CASE
          WHEN b.opening_hours IS NULL AND b.hours IS NULL THEN 'hours_resolution'
          WHEN b.hours_last_verified IS NULL OR b.hours_last_verified < now() - interval '30 days' THEN 'hours_resolution'
          ELSE 'enrichment'
         END = 'enrichment'
          AND NOT EXISTS (
            SELECT 1 FROM public.business_enrichment_jobs j
             WHERE j.business_id = b.id AND j.job_type = 'enrichment'
               AND j.status = 'succeeded'
               AND j.finished_at > now() - interval '7 days'))
      )
    ORDER BY (b.opening_hours IS NULL AND b.hours IS NULL) DESC, b.updated_at
    LIMIT p_max
  )
  INSERT INTO public.business_enrichment_jobs
    (business_id, job_type, status, priority, payload, queue_reason, run_at)
  SELECT
    d.business_id,
    d.job_type,
    'queued',
    d.priority,
    CASE WHEN d.job_type = 'hours_resolution'
         THEN '{"sources": ["openstreetmap"]}'::jsonb
         ELSE '{"ai_resolver": true}'::jsonb END,
    d.reason,
    now()
  FROM due d
  ON CONFLICT (business_id, job_type) WHERE status IN ('queued','running') DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_due_enrichment_businesses(integer) FROM public, anon, authenticated;

/*
  One tick.

  Posts to the enrichment executor, which refills the queue then drains it.
  Deliberately dumb for the same reason tick_workforce is: cadence lives in the
  queue function. Returns the pg_net request id so a failure can be traced in
  net._http_response.
*/
CREATE OR REPLACE FUNCTION public.tick_enrichment()
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
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
    timeout_milliseconds := 55000
  ) INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.tick_enrichment() FROM public, anon, authenticated;

/*
  Every 15 minutes.

  As with the workforce, this is not because enrichment runs that often — it is
  because the tick is what makes cadence changes take effect promptly, and a
  tick with nothing due costs one HTTP call that returns immediately.
*/
DO $$
BEGIN
  PERFORM cron.unschedule('nowopen-enrichment');
EXCEPTION WHEN OTHERS THEN
  NULL; -- not scheduled yet
END $$;

SELECT cron.schedule('nowopen-enrichment', '*/15 * * * *', $$SELECT public.tick_enrichment();$$);

/** What the scheduler has been doing, for the admin console. */
CREATE OR REPLACE FUNCTION public.enrichment_cron_status()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, cron AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  SELECT jsonb_build_object(
    'scheduled',   EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nowopen-enrichment'),
    'schedule',    (SELECT schedule FROM cron.job WHERE jobname = 'nowopen-enrichment'),
    'active',      (SELECT active   FROM cron.job WHERE jobname = 'nowopen-enrichment'),
    'last_run',    (SELECT max(start_time) FROM cron.job_run_details d
                      JOIN cron.job j ON j.jobid = d.jobid WHERE j.jobname = 'nowopen-enrichment'),
    'last_status', (SELECT d.status FROM cron.job_run_details d
                      JOIN cron.job j ON j.jobid = d.jobid WHERE j.jobname = 'nowopen-enrichment'
                     ORDER BY d.start_time DESC LIMIT 1),
    'configured',  EXISTS (SELECT 1 FROM public.private_config WHERE key = 'enrichment_endpoint'),
    'queued',      (SELECT count(*) FROM public.business_enrichment_jobs WHERE status IN ('queued','running')),
    'succeeded',   (SELECT count(*) FROM public.business_enrichment_jobs WHERE status = 'succeeded')
  ) INTO r;
  RETURN r;
END;
$$;
GRANT EXECUTE ON FUNCTION public.enrichment_cron_status() TO authenticated;