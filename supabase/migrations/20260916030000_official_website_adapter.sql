/*
  # Official websites: the Phase B adapter arrives, and its registry row documents it

  The official-website adapter is now real code in the discovery worker
  (per-domain, robots-respecting, primary evidence). This migration updates
  official_website's registry METADATA to say the channel exists and how it
  behaves — without granting it anything. rights stay 'unknown', active stays
  false, health stays 'disabled'; the schema CHECK radar_sources_active_
  requires_rights means it cannot run until an operator records the four
  rights, so this file cannot switch it on by accident.

  OpenCorporates (Phase C) stays OFF: no agreement, no key. Its row now names
  the credential an operator would need, and evidence_method_for_source knows
  how to label it — both so the intent is explicit, neither changing the gate.

  Re-runnable throughout: every statement is idempotent UPDATE / CREATE OR
  REPLACE.
*/

UPDATE public.radar_sources SET
  source_type              = 'official_website',
  coverage                 = '{"channels":["the business''s own domain"],"strengths":["contact facts directly from the business: phone, email, socials, address, description"],"limits":["no directory sweep; one page per business''s own domain per run"]}'::jsonb,
  access_method            = 'web',
  api_endpoint             = NULL,
  documentation_url        = 'https://www.rfc-editor.org/rfc/rfc9309',
  credential_reference     = NULL,
  auth_type                = NULL,
  rate_limit_per_minute    = NULL,
  rate_limit_per_day       = NULL,
  refresh_limit            = 'Robots.txt is read and honoured (RFC 9309 subset: group match, longest-pattern precedence). One page fetch per business domain with a 12s timeout and 2MiB cap; a run never visits more than 25 domains. The page''s own facts are the point, so extraction favours JSON-LD structured data over anchor text over naked regex.',
  estimated_cost_per_record = NULL,
  data_retention_days      = NULL,
  attribution_required     = false,
  attribution_text         = NULL,
  notes                    = 'Adapter is implemented (2026-09-14) and gated the same way every other source is: radar_sources rights must record permission and active must be true. robots.txt governs traffic politeness only — it is not a licence, so it never stands in for the rights gate.',
  health_status            = 'disabled'
WHERE key = 'official_website';

UPDATE public.radar_sources SET
  coverage                 = '{"countries":["OpenCorporates coverage (global corporate register aggregates)"],"limits":["stays OFF until a reviewed agreement and a key exist"]}'::jsonb,
  api_endpoint             = NULL,
  documentation_url        = 'https://opencorporates.com/opencorporates/public-records-usage',
  credential_reference     = 'OPEN_CORPORATES_API_KEY',
  auth_type                = 'api_key',
  rate_limit_per_minute    = NULL,
  rate_limit_per_day       = NULL,
  refresh_limit            = 'The public web UI is off-limits (their terms bar scraping). The licensed API has its own agreement and key; nothing fetches this source until a named authorised_by records the four rights AND OPEN_CORPORATES_API_KEY exists as a function secret.',
  notes                    = 'Phase C corridor, documented but deliberately dark: no contract exists and no key is set, so the adapter must not run. Revisit when a reviewed agreement exists.',
  health_status            = 'disabled'
WHERE key = 'opencorporates';

-- Phase C's evidence would be API payloads, not a scrape; label them as such.
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
    when 'opencorporates' then 'api'
    when 'openstreetmap' then 'structured_data'
    when 'official_website' then 'structured_data'
    else 'admin_entered'
  end;
$fn$;