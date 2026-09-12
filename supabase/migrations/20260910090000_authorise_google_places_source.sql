-- The second authorised discovery source: Google Maps, through the Places
-- (New) Text Search API.
--
-- WHY THIS IS DIFFERENT FROM WIKIDATA, AND WHY IT IS STILL AUTHORISED
--
-- Wikidata needed no agreement: CC0 is a waiver that grants every right the
-- registry asks about. Google Maps content is the opposite — it is used
-- under a licence, with conditions. The ones that matter here are:
--
--   • access goes through the OFFICIAL Places API with an API key
--     (X-Goog-Api-Key), never by scraping maps.google.com — the endpoint is
--     built that way, so this row authorises the channel that exists;
--   • redistribution is allowed WITH ATTRIBUTION, so every candidate carries
--     its googleMapsUri as the source URL and the reviewer sees where it came
--     from;
--   • BULK EXTRACTION is prohibited: no copying Google's database wholesale,
--     and any cached Places data is bound by Google's caching rules. The
--     endpoint pages at most 100 candidates per run, and nothing it returns
--     is stored outside a short-lived review-queue proposal.
--
-- THE KEY IS THE OPERATIONAL SWITCH
--
-- `active: true` records the position (the founder authorises the channel).
-- GUIDING ACCESS is the API key: api/acquire/google.ts returns 503 until
-- GOOGLE_PLACES_API_KEY exists in the server environment. The radar_sources
-- row says "this MAY run"; the key decides whether it CAN today.

insert into public.radar_sources (
  key, name, kind, active,
  automated_access, bulk_extraction, redistribution, competing_dataset,
  licence, authorised_by, authorised_at, notes
) values (
  'google',
  'Google Maps (Places API)',
  'licensed_directory',
  true,
  'permitted', 'prohibited', 'permitted', 'unknown',
  'Google Maps Platform terms — Maps content used under licence, attribution required; see https://about.google/brand-resource-center/products-and-services/geography-guidelines/',
  'Founder, NowOpen Africa (2026-09-10) — official Places (New) Text Search API, keyed by GOOGLE_PLACES_API_KEY; governed by, not scraped from, maps.google.com',
  now(),
  'One keyed request channel (Text Search, max 100 candidates per run), paged through the official API. Field-masked to the fields we actually store, which is also the cheaper billing. '
  'NO EMAILS: the Places API does not return email addresses, so email is always null for this source. '
  'Candidates land in the review queue; nothing publishes without a person. '
  'Bulk extraction recorded as PROHIBITED because Google Places content may not be copied wholesale, and cached content is subject to Google''s caching rules.'
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

-- Evidence from the Places API is `api`, like Wikidata: an authorised endpoint
-- returning a value as a field is exactly what `api` describes, and it scores
-- the same 80 rather than falling back to `admin_entered`.
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
    when 'google' then 'api'
    else 'admin_entered'
  end;
$fn$;