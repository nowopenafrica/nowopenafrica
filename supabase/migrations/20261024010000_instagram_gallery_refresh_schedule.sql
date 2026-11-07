/*
  # Asking Instagram, on a schedule, what a business has posted since

  MEASURED 2026-10-09: 1,073 of the 1,095 rows in `business_gallery` are
  Instagram permalinks, across 93 businesses. Every one of them was written
  once, when a candidate was reviewed and published, and never again. A
  business that posted this morning has a listing showing whatever it posted
  the week it was added.

  ── WHY A POLL, AND NOT A SUBSCRIPTION ────────────────────────────────────

  Meta publishes fifteen Instagram webhook fields -- comments, live_comments,
  mentions, story_insights and the messaging family -- and NOT ONE of them
  fires when an account publishes a post or a reel. Verified against
  developers.facebook.com/docs/instagram-platform/webhooks on 2026-10-09.

  There is therefore nothing to subscribe to at the Instagram end. Asking on
  a schedule through the official API is the only sanctioned way to find out,
  and `refresh-instagram-gallery` is deliberately small per run: 261
  businesses hold a handle, and asking about all of them every quarter hour
  would be a thousand calls an hour against an app-level quota. The function
  takes the least-recently-asked fifteen and stops dead on a rate limit.

  The REALTIME half is separate and already live: `business_gallery` is in
  the `supabase_realtime` publication, so a row landing there is pushed to
  every open listing page. A visitor sees the post appear without refreshing
  -- within the polling interval, not the instant it was posted. The page
  copy says exactly that, and nothing claims otherwise.

  ── TWENTY MINUTES, OFFSET ────────────────────────────────────────────────

  Not a quarter-hourly schedule: three other jobs already run on minute 0,15,30,45
  (nowopen-discovery, nowopen-enrichment-sweep, nowopen-workforce,
  nowopen-onboarding-welcome). Minute 3 of every twentieth minute keeps this
  off their toes.
*/

create or replace function public.tick_instagram_gallery()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_key text; v_anon text; v_id bigint;
begin
  select value into v_key  from public.private_config where key = 'automation_secret';
  select value into v_anon from public.private_config where key = 'anon_key';
  /*
   * Fail closed and quietly: a scheduled call without its secret would 403
   * every twenty minutes and fill the log with noise. The function itself
   * also refuses without the secret -- this is the second of the two.
   */
  if v_key is null then
    raise notice 'tick_instagram_gallery: automation_secret not configured.';
    return null;
  end if;

  select net.http_post(
    url     := 'https://wvayqqfqqocwjripugnb.supabase.co/functions/v1/refresh-instagram-gallery',
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_anon, ''),
      'x-automation-key', v_key
    )
  ) into v_id;
  return v_id;
end;
$$;

revoke all on function public.tick_instagram_gallery() from public, anon, authenticated;

comment on function public.tick_instagram_gallery is
  'Asks refresh-instagram-gallery to check the least-recently-asked Instagram accounts for new posts. Meta has no publication webhook, so polling is the only sanctioned route; the function fails closed without AUTOMATION_SECRET.';

select cron.unschedule('nowopen-instagram-gallery')
where exists (select 1 from cron.job where jobname = 'nowopen-instagram-gallery');
select cron.schedule('nowopen-instagram-gallery', '3,23,43 * * * *',
  $cron$select public.tick_instagram_gallery();$cron$);

/*
 * Realtime on the gallery.
 *
 * Already applied by hand on 2026-10-09; repeated here so a rebuild from
 * migrations produces the same database. The guard is required because
 * ALTER PUBLICATION ... ADD TABLE has no IF NOT EXISTS and would abort the
 * whole script on a re-run -- which is how a database ends up half-migrated.
 *
 * Safe to publish: business_gallery carries a public read policy limited to
 * published, due, non-rejected rows, and Realtime applies RLS, so a
 * subscriber is sent only what the listing page would already show them.
 */
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'business_gallery'
  ) then
    alter publication supabase_realtime add table public.business_gallery;
  end if;
end $$;
