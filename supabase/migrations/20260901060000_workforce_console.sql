/*
  # Running the workforce from the console, without shipping the secret

  The admin console needs a "Run now". It cannot hold the automation key —
  anything the browser knows is public — so the button calls this instead: an
  admin-gated function that asks the database to make the call, using a secret
  only the database can read.

  The same path the cron uses, triggered by a person. There is no second way in.
*/

/*
  tick_workforce gains a force flag.

  Cron calls it plain, so cadence is respected. The console calls it with force,
  which runs every enabled agent regardless of when it last ran — useful after
  changing a threshold, and the only thing it bypasses is the clock.
*/
CREATE OR REPLACE FUNCTION public.tick_workforce(p_force boolean DEFAULT false)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_url text; v_key text; v_anon text; v_id bigint;
BEGIN
  SELECT value INTO v_url  FROM public.private_config WHERE key = 'workforce_endpoint';
  SELECT value INTO v_key  FROM public.private_config WHERE key = 'automation_secret';
  SELECT value INTO v_anon FROM public.private_config WHERE key = 'anon_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE EXCEPTION 'The workforce endpoint or automation secret has not been configured.';
  END IF;

  IF p_force THEN v_url := v_url || '?force=1'; END IF;

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
REVOKE ALL ON FUNCTION public.tick_workforce(boolean) FROM public, anon, authenticated;

/** The console's Run now. Admin only; the secret never leaves the database. */
CREATE OR REPLACE FUNCTION public.admin_run_workforce()
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  RETURN public.tick_workforce(true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_run_workforce() TO authenticated;

/*
  The latest run per agent, joined to its schedule.

  One query for the console, so the panel cannot show an agent's findings beside
  another agent's timestamp. DISTINCT ON is the cheapest correct way to take the
  newest row per key.
*/
CREATE OR REPLACE FUNCTION public.workforce_latest()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'agent_key'), '[]'::jsonb) INTO r
  FROM (
    SELECT jsonb_build_object(
             'agent_key',    s.agent_key,
             'enabled',      s.enabled,
             'interval_min', s.interval_min,
             'last_run_at',  s.last_run_at,
             'last_status',  s.last_status,
             'failures',     s.consecutive_failures,
             'summary',      run.summary,
             'findings',     coalesce(run.findings, '[]'::jsonb),
             'facts',        coalesce(run.facts, '[]'::jsonb),
             'reason',       run.reason
           ) AS x
      FROM public.workforce_schedule s
      LEFT JOIN LATERAL (
        SELECT w.summary, w.findings, w.facts, w.reason
          FROM public.workforce_runs w
         WHERE w.agent_key = s.agent_key
         ORDER BY w.created_at DESC
         LIMIT 1
      ) run ON true
  ) t;

  RETURN r;
END;
$$;
GRANT EXECUTE ON FUNCTION public.workforce_latest() TO authenticated;
