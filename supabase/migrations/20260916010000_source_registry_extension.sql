/*
  # Source registry extension: ops metadata, coverage, health

  The registry today records the four rights and the licence. This migration
  adds the operational metadata the enrichment network needs to RUN a source
  (endpoint, keys, limits, cost) and to TELL whether it is working (health) —
  WITHOUT touching the rights gate. `radar_sources_active_requires_rights`
  still owns whether a source may run; these columns describe the channels it
  runs over.

  WHAT IS ADDED
    - source_type: the kind of channel (open data dump, commercial API, …).
    - coverage: what geography/products the source is known to cover.
    - access surgery: api_endpoint, documentation_url, credential_reference,
      auth_type, rate limit hints, estimated cost, retention window.
    - attribution metadata: required? and the exact text to carry.
    - health telemetry: health_status (healthy/degraded/unhealthy/unknown/
      disabled), last_successful_sync, last_error, last_reviewed_at — written
      by finish_discovery_run from each campaign run's per-source result.

  BACKFILL IS UPDATE-ONLY: existing rows keep their rights and active switch;
  only the new metadata columns are set. Operator toggles survive re-runs.

  Two new REGISTRY-ONLY rows are seeded (official_website, opencorporates) as
  inactive + rights 'unknown': they document the channels the network intends
  to add (Phase B website adapter, Phase C corporate records) without granting
  them anything. businesslist_ng is the precedent for a real, blocked row.

  Re-runnable throughout.
*/

ALTER TABLE public.radar_sources
  ADD COLUMN IF NOT EXISTS source_type              text,
  ADD COLUMN IF NOT EXISTS coverage                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS access_method            text,
  ADD COLUMN IF NOT EXISTS api_endpoint             text,
  ADD COLUMN IF NOT EXISTS documentation_url        text,
  ADD COLUMN IF NOT EXISTS credential_reference     text,
  ADD COLUMN IF NOT EXISTS auth_type                text,
  ADD COLUMN IF NOT EXISTS rate_limit_per_minute    integer,
  ADD COLUMN IF NOT EXISTS rate_limit_per_day       integer,
  ADD COLUMN IF NOT EXISTS refresh_limit            text,
  ADD COLUMN IF NOT EXISTS estimated_cost_per_record numeric(10,4),
  ADD COLUMN IF NOT EXISTS data_retention_days      integer,
  ADD COLUMN IF NOT EXISTS attribution_required     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attribution_text         text,
  ADD COLUMN IF NOT EXISTS health_status            text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_successful_sync     timestamptz,
  ADD COLUMN IF NOT EXISTS last_error               text,
  ADD COLUMN IF NOT EXISTS last_reviewed_at         timestamptz;

ALTER TABLE public.radar_sources DROP CONSTRAINT IF EXISTS radar_sources_health_status_check;
ALTER TABLE public.radar_sources ADD CONSTRAINT radar_sources_health_status_check CHECK (
  health_status IN ('healthy', 'degraded', 'unhealthy', 'unknown', 'disabled')
);

ALTER TABLE public.radar_sources DROP CONSTRAINT IF EXISTS radar_sources_source_type_check;
ALTER TABLE public.radar_sources ADD CONSTRAINT radar_sources_source_type_check CHECK (
  source_type IS NULL OR source_type IN (
    'open_data', 'commercial_api', 'business_directory', 'owner_submitted',
    'internal_import', 'official_website', 'government_register'
  )
);

ALTER TABLE public.radar_sources DROP CONSTRAINT IF EXISTS radar_sources_access_method_check;
ALTER TABLE public.radar_sources ADD CONSTRAINT radar_sources_access_method_check CHECK (
  access_method IS NULL OR access_method IN ('api', 'web', 'csv_upload', 'form', 'email', 'manual')
);

/*
  Backfill the metadata for the seven live registry keys. Each statement sets
  ONLY the new columns; rights, active and the sign-off trail are untouched.
*/

UPDATE public.radar_sources SET
  source_type              = 'open_data',
  coverage                 = '{"countries":["Nigeria","Ghana","Kenya","South Africa","Egypt","Tanzania","Uganda","Ethiopia","Rwanda","Senegal","Morocco","Algeria","Tunisia","Libya","Sudan","South Sudan","DR Congo","Angola","Zambia","Zimbabwe","Mozambique","Malawi","Botswana","Namibia","Cameroon","Niger","Benin","Togo","Côte d''Ivoire","Mali","Burkina Faso","Guinea","Sierra Leone","Liberia","Gambia","Mauritania","Chad","Central African Republic","Gabon","Congo (Brazzaville)","Burundi","Djibouti","Eritrea","Somalia","Madagascar","Mauritius","Seychelles","Comoros","Cape Verde","Guinea-Bissau"]}'::jsonb,
  access_method            = 'api',
  api_endpoint             = 'https://query.wikidata.org/sparql',
  documentation_url        = 'https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service',
  credential_reference     = NULL,
  auth_type                = 'anonymous',
  rate_limit_per_minute    = NULL,
  rate_limit_per_day       = NULL,
  refresh_limit            = 'CC0 — no no-derivative or retention limits. Shared public query service: the worker pages with a 100s budget and no bulk intent.',
  estimated_cost_per_record = 0,
  data_retention_days      = NULL,
  attribution_required     = false,
  attribution_text         = NULL,
  health_status            = 'unknown'
WHERE key = 'wikidata';

UPDATE public.radar_sources SET
  source_type              = 'open_data',
  coverage                 = '{"countries":["Nigeria","Ghana","Kenya","South Africa","Tanzania","Uganda","Rwanda","Ethiopia","Senegal","Côte d''Ivoire","Cameroon","Mozambique","Zambia","Zimbabwe","Egypt","Morocco","Algeria","Tunisia","Libya","Mali","Burkina Faso","Niger","Chad","DR Congo","Guinea","Sierra Leone","Liberia","Gambia","Mauritania","Cape Verde","Djibouti","Eritrea","Somalia","Sudan","South Sudan","Malawi","Madagascar","Mauritius","Botswana","Namibia","Angola","Congo","Gabon"],"strengths":["consumer-facing businesses: restaurants, cafes, banks, pharmacies, hotels, shops"]}'::jsonb,
  access_method            = 'api',
  api_endpoint             = 'https://overpass-api.de/api/interpreter',
  documentation_url        = 'https://wiki.openstreetmap.org/wiki/Overpass_API',
  credential_reference     = NULL,
  auth_type                = 'anonymous',
  rate_limit_per_minute    = 12,
  rate_limit_per_day       = NULL,
  refresh_limit            = 'Overpass community usage policy: roughly one request per 5 seconds, larger queries taking longer. The worker issues one query per city/country scope per run.',
  estimated_cost_per_record = 0,
  data_retention_days      = NULL,
  attribution_required     = true,
  attribution_text         = 'Database: OpenStreetMap | ODbL: https://opendatacommons.org/licenses/odbl/',
  health_status            = 'unknown'
WHERE key = 'openstreetmap';

UPDATE public.radar_sources SET
  source_type              = 'commercial_api',
  coverage                 = '{"countries":["Worldwide (market default: Nigeria)"],"strengths":["places of business with address coverage beyond Wikidata or OSM"],"limits":["Places API returns NO email addresses"]}'::jsonb,
  access_method            = 'api',
  api_endpoint             = 'https://places.googleapis.com/v1/places:searchText',
  documentation_url        = 'https://developers.google.com/maps/documentation/places/web-service/search-text',
  credential_reference     = 'GOOGLE_PLACES_API_KEY',
  auth_type                = 'api_key',
  rate_limit_per_minute    = NULL,
  rate_limit_per_day       = NULL,
  refresh_limit            = 'Budgeted billing per masked field; worker pages Text Search at ≤ 100 candidates per run. Cached Places content is bound by Google''s caching rules (data_retention_days NULL — do not warehouse copies).',
  estimated_cost_per_record = NULL,
  data_retention_days      = NULL,
  attribution_required     = true,
  attribution_text         = 'Powered by Google Maps (Places API)',
  health_status            = 'unknown'
WHERE key = 'google';

UPDATE public.radar_sources SET
  source_type              = 'business_directory',
  coverage                 = '{"countries":["Nigeria"]}'::jsonb,
  access_method            = 'web',
  api_endpoint             = NULL,
  documentation_url        = NULL,
  credential_reference     = NULL,
  auth_type                = NULL,
  rate_limit_per_minute    = NULL,
  rate_limit_per_day       = NULL,
  refresh_limit            = 'Blocked: terms prohibit bots, crawlers, scrapers and bulk extraction. A real adapter exists but the rights gate refuses every operation until a signed agreement.',
  estimated_cost_per_record = NULL,
  data_retention_days      = NULL,
  attribution_required     = false,
  attribution_text         = NULL,
  health_status            = 'disabled'
WHERE key = 'businesslist_ng';

UPDATE public.radar_sources SET
  source_type              = 'owner_submitted',
  coverage                 = '{"countries":["Africa (NowOpen registration forms)"]}'::jsonb,
  access_method            = 'form',
  api_endpoint             = NULL,
  documentation_url        = NULL,
  credential_reference     = NULL,
  auth_type                = NULL,
  rate_limit_per_minute    = NULL,
  rate_limit_per_day       = NULL,
  refresh_limit            = 'First-party data: businesses typed this into a NowOpen form. No warehouse limits.',
  estimated_cost_per_record = NULL,
  data_retention_days      = NULL,
  attribution_required     = false,
  attribution_text         = NULL,
  health_status            = 'unknown'
WHERE key = 'business_submission';

UPDATE public.radar_sources SET
  source_type              = 'owner_submitted',
  coverage                 = '{"countries":["Africa (NowOpen public suggestion form)"]}'::jsonb,
  access_method            = 'form',
  api_endpoint             = NULL,
  documentation_url        = NULL,
  credential_reference     = NULL,
  auth_type                = NULL,
  rate_limit_per_minute    = NULL,
  rate_limit_per_day       = NULL,
  refresh_limit            = 'First-party data: a person suggested this business at NowOpen. No warehouse limits.',
  estimated_cost_per_record = NULL,
  data_retention_days      = NULL,
  attribution_required     = false,
  attribution_text         = NULL,
  health_status            = 'unknown'
WHERE key = 'public_suggestion';

UPDATE public.radar_sources SET
  source_type              = 'internal_import',
  coverage                 = '{"countries":["Africa"]}'::jsonb,
  access_method            = 'csv_upload',
  api_endpoint             = NULL,
  documentation_url        = NULL,
  credential_reference     = NULL,
  auth_type                = NULL,
  rate_limit_per_minute    = NULL,
  rate_limit_per_day       = NULL,
  refresh_limit            = 'Employee keyed/imported records. No source-side limits.',
  estimated_cost_per_record = NULL,
  data_retention_days      = NULL,
  attribution_required     = false,
  attribution_text         = NULL,
  health_status            = 'unknown'
WHERE key = 'admin_import';

/*
  Registry-only rows for planned channels. Rights are 'unknown' and active is
  false, so the gate grants nothing — the rows just make the intent visible
  (businesslist_ng is the precedent for a real-but-blocked source).
*/
INSERT INTO public.radar_sources (
  key, name, kind, active,
  automated_access, bulk_extraction, competing_dataset, redistribution,
  licence, authorised_by, authorised_at, notes,
  source_type, access_method, coverage, attribution_required, health_status
) VALUES (
  'official_website',
  'Official Websites',
  'official_website',
  false,
  'unknown', 'unknown', 'unknown', 'unknown',
  NULL, NULL, NULL,
  'Planned enrichment network channel (Phase B): a per-domain website adapter that reads a business''s own site (robots-respecting, single-domain, no bulk directory sweep). Registered now so the registry documents the intent; rights remain unknown until a policy review assigns them.',
  'official_website', 'web',
  '{"channels":["the business''s own domain"]}'::jsonb,
  false,
  'disabled'
) ON CONFLICT (key) DO NOTHING;

INSERT INTO public.radar_sources (
  key, name, kind, active,
  automated_access, bulk_extraction, competing_dataset, redistribution,
  licence, authorised_by, authorised_at, notes,
  source_type, access_method, coverage, attribution_required, health_status
) VALUES (
  'opencorporates',
  'OpenCorporates',
  'business_directory',
  false,
  'unknown', 'unknown', 'unknown', 'unknown',
  NULL, NULL, NULL,
  'Planned enrichment network channel (Phase C): corporate records (registered address, officers). Pulling the public web UI would breach their terms; the API has its own licence and key, so this row stays OFF until a reviewed agreement and a key exist.',
  'business_directory', 'api',
  '{"countries":["OpenCorporates coverage (global corporate register aggregates)"]}'::jsonb,
  false,
  'disabled'
) ON CONFLICT (key) DO NOTHING;

-- OSM evidence is structured Overpass fields, exactly like the browser adapter
-- folds them; it scores the same 75 as any other structured_data, not as an
-- admin-entered guess. official_website (Phase B) will fold the same way.
CREATE OR REPLACE FUNCTION public.evidence_method_for_source(p_source_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = 'public'
AS $fn$
  SELECT case p_source_key
    when 'admin_import' then 'csv_import'
    when 'business_submission' then 'owner_submitted'
    when 'public_suggestion' then 'public_suggested'
    when 'wikidata' then 'api'
    when 'google' then 'api'
    when 'openstreetmap' then 'structured_data'
    when 'official_website' then 'structured_data'
    else 'admin_entered'
  end;
$fn$;