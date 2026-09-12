/*
  # Business Intelligence — daily auto-apply sweep

  The owner-authorised applier (`auto_apply_due_proposals(uuid)`) is called by
  the executor edge function at the end of each live enrichment run, so a
  proposal a business *can* auto-apply already lands on the run that wrote it.
  This migration adds the belt around that braces: a no-arg, cron-facing sweep
  that walks every business with pending proposals and an enabled sync
  preference, so proposals lingering after a failed or skipped run are still
  applied within a day even if no new run happens.

  SAFETY is untouched: `auto_apply_due_proposals` re-checks every gate itself —
  the owner's per-field `auto_apply_*` flags, `approval_threshold`,
  `confirm_24_hours`, the evidence rule, and `sync_enabled`. Neither the
  wrapper nor the cron schedule holds any authority of its own; a proposal is
  only ever applied through the one write core, under the owner's stored
  preference. Nothing applies to a business with no prefs row.

  The cron joins `business_change_proposals` to `business_sync_preferences`
  purely to pick WHICH businesses to visit — the applier then decides whether
  anything is applied. '0 6 * * *' means 06:00 server time (UTC, so ~07:00
  Africa/Lagos); the exact hour is advisory, since the executor also runs the
  applier per job on every live tick.

  Re-runnable throughout (the cron is unscheduled before being re-scheduled).

  NOTE: the first draft of this in the runbook scheduled a bare
  `auto_apply_due_proposals()` — that has no such no-arg overload and would
  fail every night. This is the overload shape the schedule actually wants.
*/

-- The cron-facing sweep. No authority, just iteration.
CREATE OR REPLACE FUNCTION public.auto_apply_all_due_proposals()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_business uuid;
  v_applied integer;
  v_total integer := 0;
BEGIN
  FOR v_business IN
    SELECT DISTINCT p.business_id
      FROM public.business_change_proposals p
      JOIN public.business_sync_preferences s ON s.business_id = p.business_id
     WHERE p.status = 'pending'
       AND s.sync_enabled
     ORDER BY p.business_id
  LOOP
    v_applied := public.auto_apply_due_proposals(v_business);
    v_total := v_total + v_applied;
  END LOOP;

  RETURN v_total;
END;
$$;
REVOKE ALL ON FUNCTION public.auto_apply_all_due_proposals() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_apply_all_due_proposals() TO service_role;

-- Daily at 06:00 server time (re-runnable).
DO $$
BEGIN
  PERFORM cron.unschedule('auto-apply-proposals');
EXCEPTION WHEN OTHERS THEN
  NULL; -- not scheduled yet
END $$;

SELECT cron.schedule('auto-apply-proposals', '0 6 * * *', $$SELECT public.auto_apply_all_due_proposals();$$);