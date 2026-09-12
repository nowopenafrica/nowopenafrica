-- The first authorised discovery source.
--
-- AutoAcquire has had a source registry, a rights gate, an SSRF guard, a
-- quality score and an adapter contract since 2026-09-08, and `ADAPTERS` was
-- empty: `radar_sources` held three inbound rows plus businesslist_ng, which
-- is `active: false, automated_access: prohibited, licence: None,
-- authorised_by: None`. §0/§6/§29 forbid inventing a source, so discovery
-- could not run at all.
--
-- WIKIDATA NEEDS NO AGREEMENT, AND THAT IS THE WHOLE REASON IT IS FIRST
--
-- Verified on 2026-09-08 against
-- https://www.wikidata.org/wiki/Wikidata:Licensing, which states that data in
-- the main namespaces "is made available under the Creative Commons CC0
-- License (Public domain)". CC0 is a waiver, not a permission slip with
-- conditions: it grants exactly the four rights this registry asks about —
-- automated access, bulk extraction, redistribution, and use in a dataset
-- that competes with the source. There is nothing to negotiate and nobody to
-- negotiate with, which is why this row can be filled in honestly by reading
-- a licence rather than by signing something.
--
-- WHAT WAS MEASURED BEFORE AUTHORISING IT
--
--   18,667  Wikidata items in Nigeria matching the imported business types
--    2,347  with a telephone number
--      980  with a website
--
-- against a live directory of 453 listings, 67 of which carry a phone. The
-- source is worth the plumbing.
--
-- WHAT `authorised_by` MEANS HERE
--
-- The registry demands a named party for every source, and `sourcePermits`
-- refuses anything with a blank one — the difference between "we believe this
-- is allowed" and "somebody decided it is". The founder decided it in the
-- session dated below, having been shown the licence and the numbers. The
-- decision is recorded rather than implied.
--
-- OPENSTREETMAP IS DELIBERATELY NOT ENABLED
--
-- OSM has far better coverage of small African businesses, and its ODbL
-- licence is SHARE-ALIKE: publicly using a derivative database obliges you to
-- offer that database under ODbL too. For a directory whose data is the asset,
-- that is a decision about the company, not about an import job. The row below
-- records it as inactive with the question written down, so it is a decision
-- waiting to be made rather than an option nobody noticed.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. THE SOURCE
-- ═══════════════════════════════════════════════════════════════════════

insert into public.radar_sources (
  key, name, kind, active,
  automated_access, bulk_extraction, redistribution, competing_dataset,
  licence, authorised_by, authorised_at, notes
) values (
  'wikidata',
  'Wikidata',
  'licensed_directory',
  true,
  'permitted', 'permitted', 'permitted', 'permitted',
  'CC0 1.0 Universal (public domain dedication) — https://creativecommons.org/publicdomain/zero/1.0/',
  'Founder, NowOpen Africa (2026-09-08) — CC0 requires no agreement; licence verified at wikidata.org/wiki/Wikidata:Licensing',
  now(),
  'Queried through the Wikidata Query Service (SPARQL) with a descriptive User-Agent, as Wikimedia asks. '
  'IMAGES ARE NOT TAKEN: P18 points at Wikimedia Commons, whose files are licensed individually (CC BY-SA and others), '
  'not CC0 — the data being public domain says nothing about the photograph. '
  'Candidates land in the review queue; nothing publishes without a person.'
)
on conflict (key) do update set
  name = excluded.name,
  active = excluded.active,
  automated_access = excluded.automated_access,
  bulk_extraction = excluded.bulk_extraction,
  redistribution = excluded.redistribution,
  competing_dataset = excluded.competing_dataset,
  licence = excluded.licence,
  authorised_by = excluded.authorised_by,
  authorised_at = excluded.authorised_at,
  notes = excluded.notes;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. THE ONE THAT IS NOT AUTHORISED, AND WHY
-- ═══════════════════════════════════════════════════════════════════════

insert into public.radar_sources (
  key, name, kind, active,
  automated_access, bulk_extraction, redistribution, competing_dataset,
  licence, authorised_by, notes
) values (
  'openstreetmap',
  'OpenStreetMap (Overpass)',
  'licensed_directory',
  false,
  -- The OSM Foundation permits automated reading within its API usage policy;
  -- what is unresolved is the obligation that comes with redistributing it.
  'permitted', 'permitted', 'unknown', 'unknown',
  'ODbL 1.0 — share-alike: publicly using a Derivative Database obliges you to offer it under ODbL',
  null,
  'NOT ENABLED, and the reason is commercial rather than technical. OSM covers small African businesses far better '
  'than Wikidata does. But ingesting its POIs into `businesses` and serving them very likely creates a Derivative '
  'Database, and ODbL would then require NowOpen to offer that database under ODbL as well — the directory data is '
  'the company asset, so this is a founder decision, not an import setting. Leave inactive until somebody decides, '
  'with legal advice, whether NowOpen is willing to share-alike its listings.'
)
on conflict (key) do update set
  notes = excluded.notes,
  licence = excluded.licence;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. EVIDENCE FROM AN API IS `api`, NOT A GUESS
-- ═══════════════════════════════════════════════════════════════════════

/*
 * `evidence_method_for_source` mapped every unknown source to `admin_entered`
 * — deliberately the weakest known method, so a new adapter could not inherit
 * trust nobody granted it. Wikidata now has a mapping of its own: an authorised
 * endpoint returning a value as a field is exactly what `api` describes, and it
 * scores 80 rather than 60.
 */
create or replace function public.evidence_method_for_source(p_source_key text)
returns text
language sql
immutable
set search_path to 'public'
as $fn$
  select case p_source_key
    when 'admin_import' then 'csv_import'
    when 'business_submission' then 'owner_submitted'
    when 'public_suggestion' then 'public_suggested'
    when 'wikidata' then 'api'
    else 'admin_entered'
  end;
$fn$;
