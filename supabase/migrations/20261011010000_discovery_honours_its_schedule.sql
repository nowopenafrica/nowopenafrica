-- Make autonomous discovery actually run on the schedule it advertises.
--
-- ── WHAT WAS MEASURED ────────────────────────────────────────────────────
--
-- REPORTED 2026-09-24: "the autonomous automatic data discovery into review
-- queue doesn't seem to be working anymore, not seeing anything after a full
-- day in the review queue, only when I search manually."
--
-- It is not broken. It is finished, and it has no way to say so.
--
--   business_discovery_campaigns                     1 row
--     name                 Nigeria — Wikidata sweep
--     schedule_cron        0 */6 * * *      (four times a day)
--     max_records          200
--     records_discovered   202              ← over budget
--     daily_limit          100
--
--   business_discovery_runs                          2 rows, EVER
--     2026-09-23 00:22   succeeded    47 discovered
--     2026-09-24 22:46   succeeded   115 discovered
--
-- Two runs, 46 hours apart, on a six-hourly schedule. And the cron tick has
-- returned {"ok":true,"drained":0} every fifteen minutes since.
--
-- ── THE THREE CAUSES ─────────────────────────────────────────────────────
--
-- 1. THE SCHEDULE WAS DECORATIVE. claim_due_discovery_campaign refused any
--    campaign that had finished a run "within 12 hours" — a hardcoded constant
--    that no campaign could override. `schedule_cron` was stored, displayed,
--    and never consulted by anything. A campaign asking to run every six hours
--    could run twice a day at best.
--
-- 2. THE BUDGET CHECK STARTED A RUN IT HAD JUST CANCELLED. On reaching
--    max_records the function set status='completed' and then fell through to
--    INSERT a run anyway — a run that could only ever discover nothing,
--    because buildPlan offers it max(0, 200-202) = 0 records. The campaign was
--    reported as succeeding while doing nothing.
--
--    Worse, and this is the reported symptom: once status is 'completed' the
--    campaign no longer matches `c.status = 'active'`, so it is never claimed
--    again. The engine goes permanently silent and every subsequent tick says
--    ok:true. Nothing anywhere states that discovery has stopped.
--
-- 3. THE DAILY BUDGET USED A UTC DAY. date_trunc('day', now()) rolls over at
--    01:00 in Lagos, where this directory's operators and businesses are. The
--    house rule is that every "today" is a LOCAL day; this was the last place
--    in the automation path still counting in UTC.
--
-- ── WHAT THIS DOES NOT DO ────────────────────────────────────────────────
--
-- It does not raise anybody's budget, invent a campaign or widen a scope.
-- max_records is a deliberate ceiling and reaching it is a correct outcome;
-- the bug is that reaching it looked identical to running normally. After this
-- migration a spent campaign is 'completed' with a recorded reason, and the
-- admin screens can say so.

-- ── Interval implied by a cron expression ────────────────────────────────
--
-- Deliberately narrow. It recognises the shapes campaigns actually use and
-- returns NULL for anything else, so the caller falls back to a stated default
-- rather than to a guess. A half-understood cron string that silently becomes
-- "every minute" would be far worse than one that becomes "every six hours".
create or replace function public.discovery_cron_interval(p_cron text)
returns interval
language plpgsql
immutable
as $$
declare
  f text[];
  n int;
begin
  if p_cron is null or btrim(p_cron) = '' then return null; end if;
  f := regexp_split_to_array(btrim(p_cron), '\s+');
  if array_length(f, 1) <> 5 then return null; end if;

  -- */N * * * *  — every N minutes
  if f[1] ~ '^\*/\d+$' and f[2] = '*' and f[3] = '*' and f[5] = '*' then
    n := split_part(f[1], '/', 2)::int;
    return case when n between 1 and 59 then make_interval(mins => n) end;
  end if;

  -- M */N * * *  — every N hours
  if f[1] ~ '^\d+$' and f[2] ~ '^\*/\d+$' and f[3] = '*' and f[5] = '*' then
    n := split_part(f[2], '/', 2)::int;
    return case when n between 1 and 23 then make_interval(hours => n) end;
  end if;

  -- M H * * *  — once a day at a fixed hour
  if f[1] ~ '^\d+$' and f[2] ~ '^\d+$' and f[3] = '*' and f[5] = '*' then
    return interval '24 hours';
  end if;

  -- M H */N * *  — every N days
  if f[1] ~ '^\d+$' and f[2] ~ '^\d+$' and f[3] ~ '^\*/\d+$' and f[5] = '*' then
    n := split_part(f[3], '/', 2)::int;
    return case when n between 1 and 30 then make_interval(days => n) end;
  end if;

  return null;
end $$;

comment on function public.discovery_cron_interval(text) is
  'Minimum gap between runs implied by a campaign schedule_cron. NULL when the expression is not one of the recognised shapes, so the caller uses its own stated default rather than guessing.';

-- ── Why a campaign is not running ────────────────────────────────────────
--
-- One row per campaign, in the words an operator needs. This exists so the
-- admin screens can state the reason instead of showing an empty queue and
-- leaving somebody to conclude the engine is broken.
create or replace view public.discovery_campaign_status as
select
  c.id,
  c.name,
  c.status,
  c.schedule_cron,
  c.max_records,
  c.daily_limit,
  c.records_discovered,
  c.last_run_at,
  coalesce(public.discovery_cron_interval(c.schedule_cron), interval '6 hours') as run_every,
  (select max(r.finished_at) from public.business_discovery_runs r
    where r.campaign_id = c.id and r.finished_at is not null) as last_finished_at,
  (select max(r.finished_at) from public.business_discovery_runs r
    where r.campaign_id = c.id and r.finished_at is not null)
    + coalesce(public.discovery_cron_interval(c.schedule_cron), interval '6 hours') as next_due_at,
  (select coalesce(sum(r.records_discovered), 0) from public.business_discovery_runs r
    where r.campaign_id = c.id
      and r.finished_at >= date_trunc('day', now() at time zone 'Africa/Lagos')
                             at time zone 'Africa/Lagos') as discovered_today,
  case
    when not exists (select 1 from public.feature_flags f
                      where f.key = 'business_discovery_engine' and f.enabled)
      then 'The business_discovery_engine feature flag is off.'
    when c.status = 'completed'
      then 'Finished: it reached its ' || coalesce(c.max_records::text, 'record') || '-record ceiling. Raise max_records or start another campaign.'
    when c.status <> 'active'
      then 'Not active (status: ' || c.status || ').'
    when c.start_at is not null and c.start_at > now()
      then 'Scheduled to begin later.'
    when c.end_at is not null and c.end_at < now()
      then 'Past its end date.'
    when exists (select 1 from public.business_discovery_runs r
                  where r.campaign_id = c.id and r.status = 'running')
      then 'Running now.'
    when c.daily_limit is not null
      and (select coalesce(sum(r.records_discovered), 0) from public.business_discovery_runs r
            where r.campaign_id = c.id
              and r.finished_at >= date_trunc('day', now() at time zone 'Africa/Lagos')
                                     at time zone 'Africa/Lagos') >= c.daily_limit
      then 'Today''s limit of ' || c.daily_limit || ' is spent. It resumes tomorrow.'
    else 'Waiting for its next slot.'
  end as why
from public.business_discovery_campaigns c;

comment on view public.discovery_campaign_status is
  'Every discovery campaign with the reason it is or is not running, so an idle engine can be told apart from a broken one.';

-- Admins read it; the view carries no data a campaign row does not.
grant select on public.discovery_campaign_status to authenticated;

-- ── The claim ────────────────────────────────────────────────────────────
create or replace function public.claim_due_discovery_campaign()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_campaign uuid;
  v_run uuid;
  v_max int;
  v_discovered int;
  v_daily int;
  v_today int;
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
     -- The gap the CAMPAIGN asked for, not a constant. This used to be a flat
     -- `interval '12 hours'`, so a campaign scheduled to run every six hours
     -- ran at most twice a day and its schedule was decoration.
     --
     -- Six hours is the fallback when the expression is not one this
     -- understands — stated here, so an unrecognised schedule slows discovery
     -- down rather than letting it run unbounded.
     --
     -- (Line comments, not a block: a cron expression contains the characters
     -- that close a C-style comment, which is its own small trap.)
     AND NOT EXISTS (
       SELECT 1 FROM public.business_discovery_runs r
        WHERE r.campaign_id = c.id
          AND r.status IN ('succeeded','partially_succeeded','failed','blocked')
          AND r.finished_at > now() - coalesce(
                public.discovery_cron_interval(c.schedule_cron),
                interval '6 hours'))
   ORDER BY c.created_at
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF v_campaign IS NULL THEN
    RETURN NULL;
  END IF;

  /*
   * Total budget spent: complete the campaign and STOP.
   *
   * This used to run the UPDATE and then insert a run regardless — a run that
   * could only discover nothing, because the worker offers it
   * max(0, max_records - records_discovered) = 0 records, and which then
   * reported "succeeded". Returning NULL here is the difference between a
   * campaign that has finished and a campaign that appears to be working.
   */
  SELECT c.max_records, c.records_discovered, c.daily_limit
    INTO v_max, v_discovered, v_daily
    FROM public.business_discovery_campaigns c WHERE c.id = v_campaign;

  IF v_max IS NOT NULL AND coalesce(v_discovered, 0) >= v_max THEN
    UPDATE public.business_discovery_campaigns
       SET status = 'completed', updated_at = now()
     WHERE id = v_campaign;
    RETURN NULL;
  END IF;

  /*
   * Daily budget, counted over a LAGOS day.
   *
   * date_trunc('day', now()) is a UTC day, which rolls over at 01:00 where
   * this runs and where the businesses are. Every other "today" in this
   * codebase is a local day; this was the last one that was not.
   */
  IF v_daily IS NOT NULL THEN
    SELECT coalesce(sum(r.records_discovered), 0) INTO v_today
      FROM public.business_discovery_runs r
     WHERE r.campaign_id = v_campaign
       AND r.finished_at >= date_trunc('day', now() at time zone 'Africa/Lagos')
                              at time zone 'Africa/Lagos';
    IF v_today >= v_daily THEN
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO public.business_discovery_runs (campaign_id, status, started_at)
  VALUES (v_campaign, 'running', now())
  RETURNING id INTO v_run;

  RETURN v_run;
END $$;

comment on function public.claim_due_discovery_campaign() is
  'Claims the next campaign whose own schedule says it is due, within its daily and total budgets. Returns NULL — never a doomed run — when there is nothing to do.';
