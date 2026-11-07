-- Scheduled discovery has never run. It had nothing to call.
--
-- ── WHAT WAS MEASURED, 2026-10-06 ────────────────────────────────────────
--
--   cron nowopen-discovery              active, every 15 min, "succeeded"
--   business_discovery_runs             2 rows, EVER (2026-09-23, 2026-09-24)
--   radar_candidates pending/review     0
--   private_config.discovery_endpoint   NO SUCH ROW
--
-- tick_discovery() reads `discovery_endpoint` from private_config and, finding
-- nothing, raises a NOTICE and returns NULL:
--
--     IF v_url IS NULL OR v_key IS NULL THEN
--       RAISE NOTICE 'tick_discovery: not configured yet; nothing scheduled
--                     to call.';
--       RETURN NULL;
--
-- A notice is not an error, so pg_cron recorded "succeeded" every fifteen
-- minutes for weeks while nothing whatsoever happened. The two runs on record
-- came from an operator pressing Search in the admin panel — which is exactly
-- the symptom reported: "only when I search manually".
--
-- Every other endpoint was configured (enrichment, onboarding, workforce).
-- This one was simply never added, and nothing noticed because the failure
-- path was a polite message to a log nobody reads.
--
-- ── claim_due_discovery_campaign WAS NEVER THE PROBLEM ───────────────────
--
-- Worth recording, because it absorbed the effort last time: the claim
-- function is correct. Called directly in a rolled-back transaction just now
-- it returned a run id immediately — the campaign was due the whole time and
-- nothing was asking.

insert into public.private_config (key, value)
values (
  'discovery_endpoint',
  -- limit=2: the worker caps at 5, and a single run sweeps a campaign's whole
  -- scope (the 2026-09-24 run returned 115 records). Two is enough to drain a
  -- second campaign when one exists without making a quarter-hourly job into a
  -- long-running batch.
  'https://wvayqqfqqocwjripugnb.supabase.co/functions/v1/discovery-worker?limit=2'
)
on conflict (key) do update set value = excluded.value;

-- ── And let the answer come back ─────────────────────────────────────────
--
-- Same lesson as the enrichment pipeline earlier today: a 55-second timeout is
-- shorter than a real run, pg_net discards the response, and
-- net._http_response — the only place anybody diagnoses this from — stays
-- empty while the work happens. A discovery run pages a third-party API across
-- 22 cities; 55s is optimistic.

create or replace function public.tick_discovery()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
DECLARE v_url text; v_key text; v_anon text; v_id bigint;
BEGIN
  SELECT value INTO v_url  FROM public.private_config WHERE key = 'discovery_endpoint';
  SELECT value INTO v_key  FROM public.private_config WHERE key = 'automation_secret';
  SELECT value INTO v_anon FROM public.private_config WHERE key = 'anon_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    /*
     * Still a notice rather than an exception — a scheduled job that throws
     * fills cron.job_run_details with failures and achieves nothing. But the
     * reason this went unnoticed for weeks is that a notice is invisible, so
     * discovery_campaign_status now surfaces it (below) where an operator
     * actually looks.
     */
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
    -- Was 55000, which a real sweep outlasts.
    timeout_milliseconds := 120000
  ) INTO v_id;

  RETURN v_id;
END $$;

-- ── Make "not configured" visible where somebody looks ───────────────────
--
-- The status view already explains why a campaign is idle. It could not
-- explain THIS, because the campaign was not idle — it was due, and unasked.

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
    /*
     * Checked FIRST, because it makes every other answer misleading. A
     * campaign can be perfectly due and never run, and the old view would say
     * "Waiting for its next slot" — which is what it said for twelve days
     * while nothing was calling the worker at all.
     */
    when not exists (select 1 from public.private_config p where p.key = 'discovery_endpoint')
      then 'Nothing is scheduled to run it: private_config.discovery_endpoint is not set.'
    when not exists (select 1 from public.private_config p where p.key = 'automation_secret')
      then 'Nothing is scheduled to run it: private_config.automation_secret is not set.'
    when not exists (select 1 from cron.job j where j.jobname = 'nowopen-discovery' and j.active)
      then 'The nowopen-discovery schedule is missing or switched off.'
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
    /*
     * A campaign that has NEVER run is not automatically overdue.
     *
     * The first version of this coalesced a missing last-run to '-infinity',
     * and ten campaigns created minutes earlier all reported "Overdue" on the
     * admin screen straight away. The baseline for one that has never run is
     * when it was CREATED; before that it simply has not had its turn.
     */
    when (select max(r.finished_at) from public.business_discovery_runs r
           where r.campaign_id = c.id) is null and c.created_at > now() - interval '24 hours'
      then 'New — waiting for its first run.'
    when coalesce((select max(r.finished_at) from public.business_discovery_runs r
                    where r.campaign_id = c.id), c.created_at)
         < now() - greatest(coalesce(public.discovery_cron_interval(c.schedule_cron), interval '6 hours') * 4,
                            interval '24 hours')
      then 'Overdue — it has been due for more than a day and has not run. Check net._http_response for the worker''s reply.'
    else 'Waiting for its next slot.'
  end as why
from public.business_discovery_campaigns c;

grant select on public.discovery_campaign_status to authenticated;

comment on view public.discovery_campaign_status is
  'Every discovery campaign with the reason it is or is not running. Checks the PLUMBING first (endpoint, secret, schedule, flag): a campaign can be perfectly due and still never run, which is what happened for twelve days.';
