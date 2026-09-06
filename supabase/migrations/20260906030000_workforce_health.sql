/*
  # Make a broken workforce visible

  The overload bug that killed the workforce ran undetected for five days and
  481 failed ticks. The console was not blind to it by accident — it had the
  data and did not use it.

  workforce_cron_status() already returned `last_status`, and the panel rendered
  only `last_run`. So the screen said "last tick 4 minutes ago" the entire time,
  which reads as healthy. Cron WAS ticking. Every tick was failing.

  The lesson is that "when did it last try" and "when did it last work" are
  different questions, and only the second one means anything. This adds the
  second one, plus enough context to act on it:

    last_success          when the schedule last actually worked
    last_failure          when it last did not
    consecutive_failures  how many since the last success
    last_error            the reason, straight from cron.job_run_details
    healthy               a single boolean the UI can colour by

  `healthy` is deliberately computed here rather than in the browser. It is the
  definition of "the workforce is fine", and it belongs in one place next to the
  data rather than as a threshold somebody retypes in a component.

  NOTE ON THE SIGNATURE: this is CREATE OR REPLACE with the SAME argument list,
  so it genuinely replaces. That is precisely what the previous workforce
  migration did not do — it changed the argument list, which creates a second
  function instead. See 20260906020000_fix_tick_workforce_overload.sql.
*/

CREATE OR REPLACE FUNCTION public.workforce_cron_status()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, cron AS $$
DECLARE
  r             jsonb;
  v_jobid       bigint;
  v_last_ok     timestamptz;
  v_last_fail   timestamptz;
  v_fails       int := 0;
  v_error       text;
  v_stale_after interval := interval '90 minutes';
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;

  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'nowopen-workforce';

  IF v_jobid IS NOT NULL THEN
    SELECT max(start_time) INTO v_last_ok
      FROM cron.job_run_details WHERE jobid = v_jobid AND status = 'succeeded';
    SELECT max(start_time) INTO v_last_fail
      FROM cron.job_run_details WHERE jobid = v_jobid AND status = 'failed';

    -- Failures since the last success. With no success on record every failure
    -- counts, which is the honest reading of "it has never worked".
    SELECT count(*) INTO v_fails
      FROM cron.job_run_details
     WHERE jobid = v_jobid AND status = 'failed'
       AND (v_last_ok IS NULL OR start_time > v_last_ok);

    SELECT return_message INTO v_error
      FROM cron.job_run_details
     WHERE jobid = v_jobid AND status = 'failed'
     ORDER BY start_time DESC LIMIT 1;
  END IF;

  SELECT jsonb_build_object(
    'scheduled',  v_jobid IS NOT NULL,
    'schedule',   (SELECT schedule FROM cron.job WHERE jobid = v_jobid),
    'active',     (SELECT active   FROM cron.job WHERE jobid = v_jobid),
    'last_run',   (SELECT max(start_time) FROM cron.job_run_details WHERE jobid = v_jobid),
    'last_status',(SELECT status FROM cron.job_run_details WHERE jobid = v_jobid
                    ORDER BY start_time DESC LIMIT 1),
    'configured', EXISTS (SELECT 1 FROM public.private_config WHERE key = 'automation_secret'),

    'last_success',         v_last_ok,
    'last_failure',         v_last_fail,
    'consecutive_failures', v_fails,
    -- Truncated: this reaches an admin's browser, and a Postgres error can carry
    -- a long statement body with it.
    'last_error',           left(coalesce(v_error, ''), 400),
    -- On a 15-minute cadence, 90 minutes is six missed ticks — long enough not
    -- to cry wolf over one slow run, short enough that nobody loses a day.
    'healthy',    v_jobid IS NOT NULL
                  AND (SELECT active FROM cron.job WHERE jobid = v_jobid)
                  AND v_last_ok IS NOT NULL
                  AND v_last_ok > now() - v_stale_after
  ) INTO r;

  RETURN r;
END;
$$;

GRANT EXECUTE ON FUNCTION public.workforce_cron_status() TO authenticated;

-- Confirm afterwards (as an admin):
--   SELECT public.workforce_cron_status();
