-- Open data sources with African business coverage, registered honestly.
--
-- WHAT THIS DOES AND DOES NOT DO
--
-- It REGISTERS sources. It switches none of them on.
--
-- Every source below carries a real licence obligation — attribution,
-- share-alike, or terms that vary per dataset — and `sourcePermits()` already
-- treats UNKNOWN as a refusal on every right. So registering a source makes it
-- visible, reviewable and correctly gated; it does not make it usable. Turning
-- one on is a decision about what NowOpen owes in return, which is a founder's
-- call, exactly as the OpenStreetMap/ODbL question already is.
--
-- WHY THESE ONES
--
-- MEASURED: the directory is 1,654 Hospital & Clinic and 533 Schools &
-- Training listings, almost none with opening hours, and 2,810 rows came from
-- a single source (Wikidata). The sources chosen below are the ones whose
-- coverage actually matches that shape — health facilities, schools, and
-- geographic detail across Africa — rather than a longer list that looks
-- thorough and adds nothing.
--
-- WHAT IS DELIBERATELY ABSENT
--
-- No social platform. Instagram, Facebook and TikTok have no licence permitting
-- a third party to harvest business data, and their terms prohibit the
-- automated access that would be required. A business's own Instagram can
-- reach NowOpen two ways that ARE legitimate: the owner adds it when they claim
-- the profile, or the official Graph API is used with that business's explicit
-- authorisation. Neither is scraping, and neither belongs in this table as a
-- discovery source.
--
-- No directory aggregator. Their value IS their compiled list, so automated
-- extraction is what their terms exist to prevent. `businesslist_ng` is already
-- registered as `blocked` for exactly this reason after returning HTTP 403.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. OPENSTREETMAP-DERIVED (ODbL — share-alike)
-- ═══════════════════════════════════════════════════════════════════════

/*
 * All three inherit OpenStreetMap's ODbL. Publicly using a derivative database
 * obliges NowOpen to offer that database under ODbL too — the same unanswered
 * question that keeps `openstreetmap` inactive. They are registered separately
 * because they are different endpoints with different rate limits, and one may
 * be approved without the others.
 */

insert into public.radar_sources (
  key, name, kind, active, source_type, access_method, coverage,
  api_endpoint, documentation_url,
  automated_access, bulk_extraction, redistribution, competing_dataset,
  image_reuse_allowed, contact_storage_allowed,
  compliance_status, license_type, licence, attribution_required, attribution_text,
  rate_limit_per_minute, notes
) values (
  'healthsites', 'Healthsites.io', 'open_data', false, 'open_data', 'api', '{"scope": "Global", "note": "strong Africa coverage"}'::jsonb,
  'https://healthsites.io/api/v3/', 'https://github.com/healthsites/healthsites/wiki',
  'permitted', 'permitted', 'unknown', 'unknown',
  'prohibited', 'unknown',
  'license_required', 'share_alike',
  'Open Database License (ODbL) 1.0, inherited from OpenStreetMap',
  true, 'Data © OpenStreetMap contributors, via Healthsites.io (ODbL)',
  30,
  'Health facilities, OSM-derived. The closest match there is to the 1,654 Hospital & Clinic listings already in the directory, and it carries the opening hours those rows lack. Blocked on the same ODbL share-alike decision as openstreetmap.'
),
(
  'overpass', 'OpenStreetMap Overpass API', 'open_data', false, 'open_data', 'api', '{"scope": "Global"}'::jsonb,
  'https://overpass-api.de/api/interpreter', 'https://wiki.openstreetmap.org/wiki/Overpass_API',
  'permitted', 'unknown', 'unknown', 'unknown',
  'prohibited', 'unknown',
  'license_required', 'share_alike',
  'Open Database License (ODbL) 1.0',
  true, 'Data © OpenStreetMap contributors (ODbL)',
  6,
  'Query interface over the same OSM data. bulk_extraction is UNKNOWN rather than permitted: the public instances are volunteer-run and ask that heavy extraction use a planet dump instead, which is a courtesy obligation the licence does not capture.'
),
(
  'nominatim', 'OpenStreetMap Nominatim', 'open_data', false, 'open_data', 'api', '{"scope": "Global"}'::jsonb,
  'https://nominatim.openstreetmap.org/search', 'https://operations.osmfoundation.org/policies/nominatim/',
  'permitted', 'prohibited', 'unknown', 'unknown',
  'prohibited', 'unknown',
  'license_required', 'share_alike',
  'Open Database License (ODbL) 1.0',
  true, 'Geocoding © OpenStreetMap contributors (ODbL)',
  60,
  'Geocoding only, never a source of businesses. bulk_extraction is PROHIBITED by its usage policy — one request per second, no bulk geocoding — and that is a hard rule on the public instance, not a guideline.'
)
on conflict (key) do nothing;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. ATTRIBUTION-ONLY (CC BY — the easiest to say yes to)
-- ═══════════════════════════════════════════════════════════════════════

insert into public.radar_sources (
  key, name, kind, active, source_type, access_method, coverage,
  api_endpoint, documentation_url,
  automated_access, bulk_extraction, redistribution, competing_dataset,
  image_reuse_allowed, contact_storage_allowed,
  compliance_status, license_type, licence, attribution_required, attribution_text,
  rate_limit_per_minute, notes
) values (
  'geonames', 'GeoNames', 'open_data', false, 'open_data', 'api', '{"scope": "Global"}'::jsonb,
  'http://api.geonames.org/searchJSON', 'https://www.geonames.org/export/web-services.html',
  'permitted', 'permitted', 'unknown', 'unknown',
  'prohibited', 'prohibited',
  'approved_with_restrictions', 'attribution',
  'Creative Commons Attribution 4.0 (CC BY 4.0)',
  true, 'Place data © GeoNames (CC BY 4.0)',
  60,
  'PLACES, not businesses: settlements, administrative areas, some landmarks. Useful for normalising the location field on rows that have a city and nothing else. Needs a free registered username before any call. contact_storage is prohibited because it holds no business contact details to store.'
),
(
  'grid3', 'GRID3', 'open_data', false, 'open_data', 'web', '{"countries": ["Nigeria", "DR Congo", "Zambia"], "note": "and other GRID3 partner countries"}'::jsonb,
  null, 'https://grid3.org/',
  'unknown', 'unknown', 'unknown', 'unknown',
  'prohibited', 'unknown',
  'review_required', 'unknown',
  'Varies per dataset; several are CC BY 4.0 but it is not uniform',
  true, null,
  null,
  'Settlement, health and education infrastructure for several African countries — the coverage that matches this directory most closely after Healthsites. Registered as review_required BECAUSE the licence is per-dataset: assuming CC BY across the portal would be a guess, and the one dataset that is not would be the one that matters.'
)
on conflict (key) do nothing;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. PER-DATASET TERMS (the honest "nobody has read these yet" tier)
-- ═══════════════════════════════════════════════════════════════════════

/*
 * These are PORTALS, not datasets. Each hosts hundreds of files under
 * different licences, so a single row cannot state the rights and pretending
 * otherwise is the failure this registry exists to prevent. They are recorded
 * so the option is visible and so a reviewer sees immediately that the answer
 * depends on which file is taken.
 */

insert into public.radar_sources (
  key, name, kind, active, source_type, access_method, coverage,
  api_endpoint, documentation_url,
  automated_access, bulk_extraction, redistribution, competing_dataset,
  image_reuse_allowed, contact_storage_allowed,
  compliance_status, license_type, licence, attribution_required, notes
) values (
  'hdx', 'Humanitarian Data Exchange (UN OCHA)', 'open_data', false, 'open_data', 'api', '{"scope": "Global", "note": "deep Africa coverage"}'::jsonb,
  'https://data.humdata.org/api/3/action/package_search', 'https://data.humdata.org/faqs/licenses',
  'unknown', 'unknown', 'unknown', 'unknown',
  'prohibited', 'unknown',
  'review_required', 'unknown',
  'Per dataset: CC0, CC BY, CC BY-IGO and custom humanitarian terms all appear',
  true,
  'Health facility, school and market datasets for most African countries, many published by national ministries. High value for the hospital and school listings that dominate this directory, but the licence is a property of the FILE, not the portal — so rights must be decided per dataset, recorded per dataset, and never inherited from this row.'
),
(
  'openafrica', 'openAFRICA (Code for Africa)', 'open_data', false, 'open_data', 'api', '{"scope": "Africa"}'::jsonb,
  'https://africaopendata.org/api/3/action/package_search', 'https://africaopendata.org/',
  'unknown', 'unknown', 'unknown', 'unknown',
  'prohibited', 'unknown',
  'review_required', 'unknown',
  'Per dataset; the portal aggregates contributions under differing terms',
  true,
  'The largest volunteer-run open data portal for the continent. Same per-dataset licence problem as HDX, and the same rule: the row cannot grant rights the individual file does not.'
),
(
  'wikipedia', 'Wikipedia / Wikimedia REST', 'open_data', false, 'open_data', 'api', '{"scope": "Global"}'::jsonb,
  'https://en.wikipedia.org/api/rest_v1/', 'https://www.mediawiki.org/wiki/REST_API',
  'permitted', 'unknown', 'unknown', 'unknown',
  'prohibited', 'unknown',
  'license_required', 'share_alike',
  'Text is CC BY-SA 4.0; media files are licensed individually on Commons',
  true,
  'Sister project to the Wikidata source already running, but NOT the same licence: Wikidata is CC0 and imposes nothing, while Wikipedia TEXT is CC BY-SA and share-alike. Copying a description onto a profile carries that obligation with it. Registered so the distinction is on the record rather than assumed from the shared brand.'
)
on conflict (key) do nothing;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. MANUAL EXTRACTION, AS A SOURCE IN ITS OWN RIGHT
-- ═══════════════════════════════════════════════════════════════════════

/*
 * An admin reading one page and importing what it says.
 *
 * It is registered as a SOURCE so that everything taken this way carries
 * provenance like everything else: which URL, when, and who decided. Without a
 * row here, manually-gathered data would be the one path into the directory
 * with no source attached — which is how "where did this come from?" becomes
 * unanswerable a year later.
 *
 * `automated_access` is PROHIBITED on purpose and it is not a contradiction:
 * this source exists precisely because a human is doing the reading. Nothing
 * may crawl on its behalf.
 *
 * AND THEREFORE `active` IS FALSE, which the schema insisted on before this
 * comment did. `radar_sources_active_requires_rights` permits `active = true`
 * only when all four rights are `permitted` — because in this table ACTIVE
 * means "a scheduler may crawl this", and a tool driven by a person clicking
 * Fetch is not that. The row exists so manually-gathered data carries a source
 * like everything else, not to authorise a crawler. The manual tool checks
 * robots.txt and the operator's per-import declaration instead; it never asks
 * this row for permission to run.
 */
insert into public.radar_sources (
  key, name, kind, active, source_type, access_method, coverage,
  automated_access, bulk_extraction, redistribution, competing_dataset,
  image_reuse_allowed, contact_storage_allowed,
  compliance_status, license_type, licence, authorised_by, authorised_at, notes
) values (
  'manual_extraction', 'Manual extraction by an administrator', 'internal', false, 'internal_import', 'manual',
  '{"scope": "Anywhere a person can lawfully read"}'::jsonb,
  'prohibited', 'prohibited', 'permitted', 'permitted',
  'prohibited', 'unknown',
  'approved_with_restrictions', 'unknown',
  'Depends entirely on the page read; the operator records it per import',
  'NowOpen admin', now(),
  'One page, read by a person, imported deliberately. Rights are asserted per import rather than by this row, which is why image reuse stays prohibited: a photograph found on a website is the one thing a reader cannot relicense by deciding to.'
)
on conflict (key) do nothing;
