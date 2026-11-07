/*
  # Look for listings stuck in "Other", every half hour

  MEASURED 2026-10-10: 151 listable businesses sit in "Other" or with no
  category, every one unclaimed, 140 of them carrying a description that says
  what they do. "Other" is not a neutral absence — it is a classification,
  almost always wrong, and it keeps a business out of the category pages its
  customers browse.

  ── IT PROPOSES, IT DOES NOT OVERWRITE ────────────────────────────────────

  `recategorise-businesses` writes to `business_change_proposals`, not to
  `businesses.category`.

  That was not the first design. A dry run over the real rows killed the
  original: of the two changes it would have applied, one was "Fintech
  Association Of Nigeria" -> Fintech & Payments, which a human had already
  reviewed and REVERTED earlier the same day — it is an industry association,
  not a fintech company. A sweep that re-applies a reverted decision every
  thirty minutes does not improve the directory, it argues with the reviewer,
  and it wins by attrition.

  The function therefore skips any business that already has a category
  proposal in ANY state. A rejection is a decision; this respects it.

  ── WHY HALF-HOURLY IS CHEAP ──────────────────────────────────────────────

  The backlog is 151 rows and the matcher is string comparison — no model call
  and no external API. After the first pass there is almost nothing to do, and
  each run is a single indexed read plus, usually, zero writes.

  Minute 13 and 43: the quarter hours already carry four jobs
  (nowopen-discovery, nowopen-enrichment-sweep, nowopen-workforce,
  nowopen-onboarding-welcome) and minutes 3/23/43 carry the Instagram gallery
  refresh. 13/43 keeps this off all of them.
*/

create or replace function public.tick_recategorise()
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
   * Fail closed and quietly. A scheduled call without its secret would 403
   * every half hour and fill the log with noise; the function refuses too.
   */
  if v_key is null then
    raise notice 'tick_recategorise: automation_secret not configured.';
    return null;
  end if;

  select net.http_post(
    url     := 'https://wvayqqfqqocwjripugnb.supabase.co/functions/v1/recategorise-businesses',
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

revoke all on function public.tick_recategorise() from public, anon, authenticated;

comment on function public.tick_recategorise is
  'Asks recategorise-businesses to propose categories for unclaimed listings stuck in "Other". Proposes only; a reviewer decides, and a business with an existing category proposal is skipped so a rejection is not overridden.';

select cron.unschedule('nowopen-recategorise')
where exists (select 1 from cron.job where jobname = 'nowopen-recategorise');
select cron.schedule('nowopen-recategorise', '13,43 * * * *',
  $cron$select public.tick_recategorise();$cron$);
