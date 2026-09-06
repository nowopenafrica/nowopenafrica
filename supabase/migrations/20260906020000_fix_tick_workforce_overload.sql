/*
  # The AI workforce has been dead for five days. This is why.

  Measured on live before writing this:

    cron.job          nowopen-workforce, every 15 minutes, active
    job_run_details   481 failed, 5 succeeded
    last success      2026-09-01 03:30
    error             function public.tick_workforce() is not unique

  So the schedule never stopped. Every fifteen minutes, ninety-six times a day,
  it fired and failed — and nothing anywhere said so.

  ## The cause

  20260901050000_workforce_cron.sql created `tick_workforce()` and scheduled
  `SELECT public.tick_workforce();`.

  20260901060000_workforce_console.sql then added a force flag with
  `CREATE OR REPLACE FUNCTION public.tick_workforce(p_force boolean DEFAULT false)`.

  In Postgres, CREATE OR REPLACE with a different argument list does not replace
  anything — the argument list is part of a function's identity, so it creates a
  SECOND function. Both can be called with no arguments, one because it takes
  none and one because its only argument has a default, and Postgres refuses to
  guess. `SELECT tick_workforce();` became ambiguous the moment that migration
  ran, which is exactly when the successes stop.

  The migration's own comment says "Cron calls it plain, so cadence is
  respected". That was the intent and it was correct; what it missed is that
  "plain" stopped resolving.

  ## The fix

  Drop the zero-argument version. The one with `p_force boolean DEFAULT false`
  is the current definition — the console's Run now calls it with true, and cron
  calls it with no arguments and gets false, which is the documented behaviour.

  Nothing else needs to change: cron stores its command as text, so the existing
  schedule starts working again on the next tick.
*/

DROP FUNCTION IF EXISTS public.tick_workforce();

-- Re-assert the lock-down on the survivor. The dropped overload carried its own
-- REVOKE, and it would be easy to assume that covered both.
REVOKE ALL ON FUNCTION public.tick_workforce(boolean) FROM public, anon, authenticated;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname = 'tick_workforce';

  IF n <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one tick_workforce, found %. A zero-argument call would be ambiguous again.', n;
  END IF;
  RAISE NOTICE 'tick_workforce is unique again — the schedule resolves on the next tick.';
END $$;

-- Confirm afterwards:
--   SELECT status, count(*) FROM cron.job_run_details WHERE jobid = 1
--     AND start_time > now() - interval '1 hour' GROUP BY status;
--   SELECT max(created_at) FROM public.workforce_runs;
