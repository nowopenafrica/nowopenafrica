-- Widen discovery beyond Nigeria, using the one source that is authorised.
--
-- ── FIRST, A LATENT BUG IN THE EXISTING CAMPAIGN ─────────────────────────
--
-- It stored `countries = ['NG']`. COUNTRY_QIDS is keyed by FULL NAMES, so
-- nothing matched and buildPlan's fallback quietly made it Nigeria — which
-- happened to be correct. The same row written for Ghana as ['GH'] would have
-- swept NIGERIA and staged Nigerian businesses under a Ghanaian campaign,
-- reporting success the whole way.
--
-- The worker now refuses a campaign whose country it cannot resolve, and these
-- rows use full names. Fixing the Nigerian row too, so it is right on purpose
-- rather than by luck.
update public.business_discovery_campaigns
   set countries = array['Nigeria'], updated_at = now()
 where countries = array['NG'];

-- ── New markets ──────────────────────────────────────────────────────────
--
-- Same source (wikidata — the only ACTIVE external source in radar_sources),
-- same review-only threshold, same daily ceiling. Only the geography differs,
-- and every place name below is a key in PLACE_QIDS whose Wikidata id is
-- verified by `npm run check:place-qids` (84/84 passing as of today).
--
-- Staggered schedules rather than all on `0 */6 * * *`: the worker claims at
-- most two campaigns per tick, so eleven campaigns coming due at the same
-- instant would queue behind each other and the last would wait hours. These
-- spread the load across the hour.
--
-- auto_publish_threshold 100 on every row: the highest confidence ever scored
-- across 3,710 candidates is 86, so nothing can auto-publish. Everything lands
-- in the review queue for a person, which is the point.

insert into public.business_discovery_campaigns
  (name, status, countries, cities, source_keys,
   max_records, daily_limit, schedule_cron, review_threshold, auto_publish_threshold, filters)
values
  ('Ghana — Wikidata sweep',       'active', array['Ghana'],        array['Accra'],                     array['wikidata'], null, 100, '5 */6 * * *',  50, 100, '{}'::jsonb),
  ('Kenya — Wikidata sweep',       'active', array['Kenya'],        array['Nairobi'],                   array['wikidata'], null, 100, '15 */6 * * *', 50, 100, '{}'::jsonb),
  ('South Africa — Wikidata sweep','active', array['South Africa'], array['Johannesburg','Cape Town'],  array['wikidata'], null, 100, '25 */6 * * *', 50, 100, '{}'::jsonb),
  ('Uganda — Wikidata sweep',      'active', array['Uganda'],       array['Kampala'],                   array['wikidata'], null, 100, '35 */6 * * *', 50, 100, '{}'::jsonb),
  ('Tanzania — Wikidata sweep',    'active', array['Tanzania'],     array['Dar es Salaam'],             array['wikidata'], null, 100, '45 */6 * * *', 50, 100, '{}'::jsonb),
  ('Ethiopia — Wikidata sweep',    'active', array['Ethiopia'],     array['Addis Ababa'],               array['wikidata'], null, 100, '55 */6 * * *', 50, 100, '{}'::jsonb),
  ('Rwanda — Wikidata sweep',      'active', array['Rwanda'],       array['Kigali'],                    array['wikidata'], null, 100, '10 */8 * * *', 50, 100, '{}'::jsonb),
  ('Senegal — Wikidata sweep',     'active', array['Senegal'],      array['Dakar'],                     array['wikidata'], null, 100, '20 */8 * * *', 50, 100, '{}'::jsonb),
  ('Egypt — Wikidata sweep',       'active', array['Egypt'],        array['Cairo'],                     array['wikidata'], null, 100, '30 */8 * * *', 50, 100, '{}'::jsonb),
  ('Morocco — Wikidata sweep',     'active', array['Morocco'],      array['Casablanca'],                array['wikidata'], null, 100, '40 */8 * * *', 50, 100, '{}'::jsonb)
on conflict do nothing;

do $v$
declare n int; v_bad int;
begin
  select count(*) into n from public.business_discovery_campaigns where status='active';
  assert n >= 11, format('expected at least 11 active campaigns, found %s', n);

  -- Every campaign's country must be a full name the engine resolves, or the
  -- worker will refuse it and the campaign is decorative.
  select count(*) into v_bad from public.business_discovery_campaigns c
   where c.status='active'
     and exists (select 1 from unnest(c.countries) k where length(k) <= 3);
  assert v_bad = 0, format('%s campaigns still store a country CODE rather than a name', v_bad);

  -- Nothing may auto-publish.
  select count(*) into v_bad from public.business_discovery_campaigns
   where status='active' and auto_publish_threshold < 100;
  assert v_bad = 0, format('%s campaigns could publish without review', v_bad);

  -- Every schedule must be one discovery_cron_interval understands, or the
  -- claim falls back to 6 hours and the stagger is meaningless.
  select count(*) into v_bad from public.business_discovery_campaigns
   where status='active' and public.discovery_cron_interval(schedule_cron) is null;
  assert v_bad = 0, format('%s campaigns have a schedule the engine cannot read', v_bad);

  raise notice 'campaigns: % active, all resolvable, all review-only', n;
end $v$;
