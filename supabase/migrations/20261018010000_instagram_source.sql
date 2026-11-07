-- Instagram, registered for what it can actually do.
--
-- ── THE CAPABILITY, CHECKED AGAINST META'S DOCUMENTATION ─────────────────
--
-- The brief this implements asks for discovery by location and category:
-- "Country: Nigeria / State: Lagos / Category: Fashion" returning 500
-- businesses. Verified 2026-10-06 against
-- developers.facebook.com/docs/instagram-platform/.../business_discovery:
--
--   business_discovery is LOOKUP BY USERNAME ONLY.
--
-- There is no authorised Instagram endpoint that searches by location,
-- category or keyword. The hashtag edge exists but returns MEDIA published in
-- the last 24 hours, not business profiles. The only way to produce
-- "fashion businesses in Lagos" from Instagram is scraping or unofficial
-- endpoints — which the brief's own §2 prohibits, and which this platform
-- will not do.
--
-- So Instagram is registered as what it is: an ENRICHMENT source that can
-- describe a business whose handle we already hold, not a source that can
-- find businesses we do not know about.
--
-- That is still worth having. Measured today: 157 businesses and 176
-- candidates already carry an Instagram handle, harvested from their own
-- websites. For those, business_discovery returns biography, website,
-- followers_count and media_count — real, permitted, useful.
--
-- ── WHY IT IS INACTIVE ───────────────────────────────────────────────────
--
-- No credentials exist: META_APP_ID and META_APP_SECRET are unset (social-auth
-- already expects them for Instagram login and they have never been
-- configured). business_discovery additionally requires an Instagram Business
-- or Creator account connected to a Facebook Page, the instagram_basic,
-- instagram_manage_insights and pages_read_engagement permissions, and App
-- Review.
--
-- Until all of that exists the adapter refuses and says so. It does not
-- simulate a result.

insert into public.radar_sources (
  key, name, kind, source_type, access_method, auth_type,
  licence, documentation_url, api_endpoint,
  compliance_status, active,
  automated_access, bulk_extraction, redistribution, competing_dataset,
  image_reuse_allowed, contact_storage_allowed,
  attribution_required, attribution_text,
  authorised_by, notes,
  rate_limit_per_day
) values (
  'instagram_graph',
  'Instagram Graph API (Business Discovery)',
  -- `kind` is free text; `source_type` is CHECK-constrained to
  -- open_data | commercial_api | business_directory | owner_submitted |
  -- internal_import | official_website | government_register. An official API
  -- behind an app credential is commercial_api.
  'official_api',
  'commercial_api',
  'api',
  'oauth',
  'Meta Platform Terms and Instagram Platform Policy. Data is accessible only '
    || 'through the authorised Graph API with an approved app; redistribution of '
    || 'Platform Data is restricted and bulk extraction is not permitted.',
  'https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery',
  'https://graph.facebook.com/v21.0',
  -- Not "approved": an app review has not been done and no credentials exist.
  'api_required',
  false,
  -- Automated access IS permitted through the official API, within its limits.
  'permitted',
  -- Bulk extraction is NOT. This is the line that makes it an enrichment
  -- source rather than a discovery one, and it is Meta's line, not ours.
  'prohibited',
  'prohibited',
  'prohibited',
  -- Profile imagery is Platform Data; it is not ours to copy onto a listing.
  'prohibited',
  -- A business's public contact details, where the business itself published
  -- them on its own professional profile.
  'permitted',
  false,
  null,
  'NOT YET AUTHORISED (2026-10-06) — registered so the capability and its '
    || 'limits are on record. Activation requires META_APP_ID/META_APP_SECRET, '
    || 'an IG Business account linked to a Page, App Review for instagram_basic '
    || '+ instagram_manage_insights + pages_read_engagement, and a decision by '
    || 'the founder that the Platform Terms are acceptable.',
  'LOOKUP ONLY. business_discovery takes a username and returns that account''s '
    || 'public profile. It CANNOT search by location, category or keyword — '
    || 'checked against Meta''s documentation on 2026-10-06. Treat this as a way '
    || 'to enrich a business whose handle we already have (157 businesses and '
    || '176 candidates carry one), never as a way to find new ones. Anything '
    || 'that appears to search Instagram is scraping, which this platform does '
    || 'not do.',
  -- Graph API rate limits are per-app and dynamic; a conservative daily
  -- ceiling until real headroom is observed.
  200
)
on conflict (key) do update set
  notes = excluded.notes,
  licence = excluded.licence,
  documentation_url = excluded.documentation_url,
  bulk_extraction = excluded.bulk_extraction,
  compliance_status = excluded.compliance_status;

do $v$
declare r record;
begin
  select * into r from public.radar_sources where key = 'instagram_graph';
  assert r.key is not null, 'instagram_graph was not registered';
  assert r.active = false, 'instagram_graph must not be active — no credentials, no app review';
  assert r.bulk_extraction = 'prohibited',
    'bulk extraction must stay prohibited: it is what separates enrichment from scraping';
  raise notice 'instagram_graph registered as an inactive, lookup-only enrichment source';
end $v$;
