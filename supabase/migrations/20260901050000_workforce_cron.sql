/*
  # The cron that makes the workforce autonomous

  Until this, the agents could run but only when something called them. This is
  the something.

  ## Why in-database rather than an external scheduler

  An external cron is another system to configure, monitor and forget. pg_cron
  lives beside the data the agents read, survives redeploys of the frontend and
  the functions, and fails visibly in cron.job_run_details rather than silently
  in somebody's CI account.

  ## Keeping the secret out of git

  The scheduled command calls tick_workforce(), which reads the automation key
  from private_config — a table with RLS enabled and NO policies, so it is
  unreachable through the API by anon, authenticated or admin. Only SECURITY
  DEFINER functions can see it. The key is inserted separately, never in this
  file, because migrations are committed.

  Re-runnable: unschedules before scheduling.
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

/*
  Server-side configuration nobody can read through PostgREST.

  RLS on with zero policies is deliberate and is the strongest available
  setting: it denies every role that goes through the API, including admins,
  while leaving SECURITY DEFINER functions unaffected.
*/
CREATE TABLE IF NOT EXISTS public.private_config (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.private_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_config FROM anon, authenticated;

/** Store a config value. Service-role only; not granted to any API role. */
CREATE OR REPLACE FUNCTION public.set_private_config(p_key text, p_value text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.private_config (key, value, updated_at)
  VALUES (p_key, p_value, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.set_private_config(text,text) FROM public, anon, authenticated;

/*
  One tick.

  Posts to the workforce scheduler, which decides for itself which agents are
  due. Deliberately dumb: all the judgement about cadence lives in
  workforce_due(), so changing an agent's interval never means touching cron.

  Returns the pg_net request id so a failure can be traced in net._http_response.
*/
CREATE OR REPLACE FUNCTION public.tick_workforce()
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_url text; v_key text; v_anon text; v_id bigint;
BEGIN
  SELECT value INTO v_url  FROM public.private_config WHERE key = 'workforce_endpoint';
  SELECT value INTO v_key  FROM public.private_config WHERE key = 'automation_secret';
  SELECT value INTO v_anon FROM public.private_config WHERE key = 'anon_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'tick_workforce: not configured yet; nothing scheduled to call.';
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
REVOKE ALL ON FUNCTION public.tick_workforce() FROM public, anon, authenticated;

/*
  Every 15 minutes.

  Not because any agent runs that often — the fastest is hourly — but because
  the tick is what makes cadence changes take effect promptly. An agent moved
  from daily to hourly should start behaving hourly within the quarter hour,
  not tomorrow. A tick with nothing due costs one HTTP call that returns
  immediately.
*/
DO $$
BEGIN
  PERFORM cron.unschedule('nowopen-workforce');
EXCEPTION WHEN OTHERS THEN
  NULL; -- not scheduled yet
END $$;

SELECT cron.schedule('nowopen-workforce', '*/15 * * * *', $$SELECT public.tick_workforce();$$);

/** What the scheduler has been doing, for the admin console. */
CREATE OR REPLACE FUNCTION public.workforce_cron_status()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, cron AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  SELECT jsonb_build_object(
    'scheduled',  EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nowopen-workforce'),
    'schedule',   (SELECT schedule FROM cron.job WHERE jobname = 'nowopen-workforce'),
    'active',     (SELECT active   FROM cron.job WHERE jobname = 'nowopen-workforce'),
    'last_run',   (SELECT max(start_time) FROM cron.job_run_details d
                     JOIN cron.job j ON j.jobid = d.jobid WHERE j.jobname = 'nowopen-workforce'),
    'last_status',(SELECT d.status FROM cron.job_run_details d
                     JOIN cron.job j ON j.jobid = d.jobid WHERE j.jobname = 'nowopen-workforce'
                    ORDER BY d.start_time DESC LIMIT 1),
    'configured', EXISTS (SELECT 1 FROM public.private_config WHERE key = 'automation_secret')
  ) INTO r;
  RETURN r;
END;
$$;
GRANT EXECUTE ON FUNCTION public.workforce_cron_status() TO authenticated;
