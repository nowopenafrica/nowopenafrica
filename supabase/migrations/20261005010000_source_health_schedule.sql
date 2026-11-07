-- Check the discovery sources on a schedule, and expire promotions on time.
--
-- MEASURED 2026-09-23: before the first health run, all 18 rows in
-- radar_sources carried health_status = 'unknown'. A source that stops
-- answering is otherwise discovered when somebody notices the review queue has
-- stopped filling — which, with a 15-minute worker and a quiet queue, could be
-- weeks.
--
-- Daily rather than hourly: these are free services run by volunteers, and the
-- question "does this still work" does not change minute to minute. Six probes
-- a day is courteous and still catches a break the same day it happens.

create or replace function public.tick_source_health()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_key text; v_anon text; v_id bigint;
begin
  select value into v_key  from public.private_config where key = 'automation_secret';
  select value into v_anon from public.private_config where key = 'anon_key';
  -- Fail closed and quietly: a scheduled call without its secret would 403
  -- every day and fill the log with noise.
  if v_key is null then
    raise notice 'tick_source_health: automation_secret not configured.';
    return null;
  end if;

  select net.http_post(
    url     := 'https://wvayqqfqqocwjripugnb.supabase.co/functions/v1/radar-source-health',
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_anon, ''),
      'x-automation-key', v_key
    ),
    timeout_milliseconds := 120000
  ) into v_id;
  return v_id;
end $$;

revoke all on function public.tick_source_health() from public, anon, authenticated;

select cron.unschedule('nowopen-source-health')
where exists (select 1 from cron.job where jobname = 'nowopen-source-health');
select cron.schedule('nowopen-source-health', '23 5 * * *',
  $cron$select public.tick_source_health();$cron$);

-- A promotion that outlives what was paid for is a free placement. Hourly, at
-- a minute nothing else runs on.
select cron.unschedule('nowopen-expire-promotions')
where exists (select 1 from cron.job where jobname = 'nowopen-expire-promotions');
select cron.schedule('nowopen-expire-promotions', '11 * * * *',
  $cron$select public.expire_due_promotions();$cron$);
