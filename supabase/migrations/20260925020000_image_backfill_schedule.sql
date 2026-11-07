-- Work through the stock covers, slowly, on a schedule.
--
-- MEASURED 2026-09-16: 3,049 unclaimed businesses show a stock photograph as
-- their cover, and 848 of them publish a website of their own — so 848 of those
-- pictures can be replaced with the business's actual picture rather than only
-- labelled as a placeholder.
--
-- WHY A SCHEDULE AND NOT ONE BIG RUN
--
-- Each business costs one request to its own site, and these are small hosting
-- accounts in Lagos, Accra and Nairobi. Twelve at a time with a pause between
-- them, twice an hour, clears the queue in about three days and is invisible to
-- every host involved. Doing it in an afternoon would mean several hundred
-- requests an hour from one address, which is indistinguishable from something
-- unwelcome — and there is no deadline here that justifies that.
--
-- The function also stamps `image_checked_at` on every attempt including the
-- failures, so a site that publishes no picture leaves the queue rather than
-- being re-read every half hour for ever. The queue therefore drains and stops
-- on its own; it does not need turning off.

create or replace function public.tick_image_backfill()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_key text; v_anon text; v_id bigint; v_left int;
begin
  select value into v_key  from public.private_config where key = 'automation_secret';
  select value into v_anon from public.private_config where key = 'anon_key';

  -- Fail closed, and quietly: an automation endpoint called without its secret
  -- would 403 every half hour and fill the response log with noise.
  if v_key is null then
    raise notice 'tick_image_backfill: automation_secret not configured.';
    return null;
  end if;

  /*
   * Stop calling once there is nothing left. The function would return an
   * empty batch anyway, but a scheduled job that keeps firing at an empty
   * queue is a job nobody will remember to look at again.
   */
  select count(*) into v_left
    from public.businesses
   where claim_status <> 'claimed'
     and image_source in ('stock', 'unknown')
     and coalesce(trim(website), '') <> ''
     and (image_checked_at is null or image_checked_at < now() - interval '30 days');

  if v_left = 0 then return null; end if;

  select net.http_post(
    url     := 'https://wvayqqfqqocwjripugnb.supabase.co/functions/v1/backfill-business-images',
    body    := jsonb_build_object('limit', 12),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_anon, ''),
      -- x-automation-key, matching discovery-worker and enrich-business.
      'x-automation-key', v_key
    ),
    timeout_milliseconds := 55000
  ) into v_id;

  return v_id;
end $$;

revoke all on function public.tick_image_backfill() from public, anon, authenticated;

select cron.unschedule('nowopen-image-backfill')
where exists (select 1 from cron.job where jobname = 'nowopen-image-backfill');

-- Twice an hour, offset from the other jobs so they do not all fire together.
select cron.schedule('nowopen-image-backfill', '7,37 * * * *',
  $cron$select public.tick_image_backfill();$cron$);
