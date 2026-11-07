-- Ask Wikidata for the pictures we are missing, on a schedule.
--
-- MEASURED 2026-09-23: 2,624 unclaimed businesses are linked to a Wikidata
-- entity and still have no photograph of their own. Roughly one in twelve of
-- those entities carries a P18 image on Wikimedia Commons, so working the
-- backlog is worth a few hundred real photographs — of the actual businesses,
-- not of somewhere that resembles them.
--
-- Twice an hour at 80 a time clears it in about a day. Wikimedia is run by a
-- charity; the function already pauses between chunks and identifies itself,
-- and there is no deadline here that justifies going faster.

create or replace function public.tick_wikidata_enrichment()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_key text; v_anon text; v_id bigint; v_left int;
begin
  select value into v_key  from public.private_config where key = 'automation_secret';
  select value into v_anon from public.private_config where key = 'anon_key';
  if v_key is null then
    raise notice 'tick_wikidata_enrichment: automation_secret not configured.';
    return null;
  end if;

  -- Stop calling once the backlog is gone, rather than firing at an empty
  -- queue for ever.
  select count(*) into v_left
    from public.businesses b
    join public.radar_candidates c on c.published_business_id = b.id
   where c.source_key = 'wikidata'
     and b.claim_status <> 'claimed'
     and b.wikidata_checked_at is null;
  if v_left = 0 then return null; end if;

  select net.http_post(
    url     := 'https://wvayqqfqqocwjripugnb.supabase.co/functions/v1/enrich-from-wikidata',
    body    := jsonb_build_object('limit', 80),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_anon, ''),
      'x-automation-key', v_key
    ),
    timeout_milliseconds := 120000
  ) into v_id;
  return v_id;
end $$;

revoke all on function public.tick_wikidata_enrichment() from public, anon, authenticated;

select cron.unschedule('nowopen-wikidata-enrichment')
where exists (select 1 from cron.job where jobname = 'nowopen-wikidata-enrichment');
select cron.schedule('nowopen-wikidata-enrichment', '19,49 * * * *',
  $cron$select public.tick_wikidata_enrichment();$cron$);
