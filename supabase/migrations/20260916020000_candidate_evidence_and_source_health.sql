/*
  # Candidate evidence rows and per-source run health

  Two of the enrichment network's guarantees land here:

  1. EVERY staged candidate carries its per-field evidence.
     `stage_discovery_candidate` already receives candidates that (via the
     liberal engine) carry an `evidence` map. This migration adds the
     `radar_candidate_evidence` table and makes the stage RPC write those rows
     on every insert/refresh — delete then insert, so a re-discovery of the
     same source record replaces stale provenance instead of accumulating it.

  2. A RUN CLOSES WITH SAYING HOW EACH SOURCE DID.
     `finish_discovery_run` gains `p_source_health` (one entry per source the
     run actually asked). succeeded → healthy, partial → degraded, blocked →
     unhealthy, and the error text is kept. Only ACTIVE sources are touched,
     and a disabled source's health is never resurrected by a run that didn't
     run it.

  RLS mirrors radar_candidates: staff read and manage. Service-role writes go
  through the two SECURITY DEFINER RPCs, exactly as before.

  Re-runnable throughout; signatures are CREATE OR REPLACE'd, so the leading
  REVOKEs below target the NEW argument lists.
*/

CREATE TABLE IF NOT EXISTS public.radar_candidate_evidence (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  candidate_id    uuid NOT NULL REFERENCES public.radar_candidates(id) ON DELETE CASCADE,
  evidence_field  text NOT NULL,
  field_value     text NOT NULL,
  source_key      text REFERENCES public.radar_sources(key) ON DELETE SET NULL,
  method          text NOT NULL,
  source_url      text,
  confidence      integer NOT NULL DEFAULT 80 CHECK (confidence BETWEEN 0 AND 100),
  owner_confirmed boolean NOT NULL DEFAULT false,
  can_auto_update boolean NOT NULL DEFAULT true,
  collected_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, evidence_field)
);

CREATE INDEX IF NOT EXISTS radar_candidate_evidence_candidate_idx
  ON public.radar_candidate_evidence (candidate_id);

-- The same extraction vocabulary the record-publish evidence uses.
ALTER TABLE public.radar_candidate_evidence DROP CONSTRAINT IF EXISTS radar_candidate_evidence_method_check;
ALTER TABLE public.radar_candidate_evidence ADD CONSTRAINT radar_candidate_evidence_method_check CHECK (
  method IN ('structured_data', 'dom_extraction', 'regex', 'api', 'ai_extracted', 'ai_inferred',
             'csv_import', 'owner_submitted', 'public_suggested', 'admin_entered')
);

ALTER TABLE public.radar_candidate_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read candidate evidence" ON public.radar_candidate_evidence;
CREATE POLICY "Staff read candidate evidence" ON public.radar_candidate_evidence
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Staff manage candidate evidence" ON public.radar_candidate_evidence;
CREATE POLICY "Staff manage candidate evidence" ON public.radar_candidate_evidence
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Replace the 1-arg stage from 20260915010000: CREATE OR REPLACE spans only one
-- signature, so the old 1-arg must go before the new 2-arg arrives or both
-- exist and every call becomes ambiguous.
DROP FUNCTION IF EXISTS public.stage_discovery_candidate(jsonb);

/*
  Stage one discovered candidate into the review queue, and persist its
  per-field evidence atomically with the write.

  The original single-policy rules are unchanged (re-check the source gate at
  write time; force 'review' on INSERT; never touch a lifecycle decision on
  conflict; a second campaign never re-homes a candidate). The evidence block
  is new: rows are deleted for this candidate then re-inserted from the same
  payload, so a refreshed candidate carries fresh provenance, never stale
  text from an earlier run.
*/
CREATE OR REPLACE FUNCTION public.stage_discovery_candidate(p_c jsonb, p_evidence jsonb DEFAULT '[]'::jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.radar_sources
                  WHERE key = p_c->>'source_key' AND active) THEN
    RAISE EXCEPTION 'Source "%" is not active in the registry; nothing staged.',
      p_c->>'source_key';
  END IF;

  INSERT INTO public.radar_candidates (
    source_key, source_record_id, source_url, name, category, city, address,
    phone, whatsapp, email, website, description, latitude, longitude,
    name_key, city_key, phone_e164, domain, confidence, status, profile,
    campaign_id
  )
  VALUES (
    p_c->>'source_key', p_c->>'source_record_id', p_c->>'source_url', p_c->>'name',
    nullif(p_c->>'category', ''), nullif(p_c->>'city', ''),
    nullif(p_c->>'address', ''), nullif(p_c->>'phone', ''),
    nullif(p_c->>'whatsapp', ''), nullif(p_c->>'email', ''),
    nullif(p_c->>'website', ''), nullif(p_c->>'description', ''),
    (p_c->>'latitude')::double precision, (p_c->>'longitude')::double precision,
    p_c->>'name_key', p_c->>'city_key', p_c->>'phone_e164', p_c->>'domain',
    greatest(0, least(100, coalesce((p_c->>'confidence')::integer, 0))),
    'review',
    coalesce(p_c->'profile', '{}'::jsonb),
    (p_c->>'campaign_id')::uuid
  )
  ON CONFLICT (source_key, source_record_id) WHERE source_record_id IS NOT NULL
  DO UPDATE SET
    source_url   = EXCLUDED.source_url,
    name         = EXCLUDED.name,
    category     = EXCLUDED.category,
    city         = EXCLUDED.city,
    address      = EXCLUDED.address,
    phone        = EXCLUDED.phone,
    whatsapp     = EXCLUDED.whatsapp,
    email        = EXCLUDED.email,
    website      = EXCLUDED.website,
    description  = EXCLUDED.description,
    latitude     = EXCLUDED.latitude,
    longitude    = EXCLUDED.longitude,
    name_key     = EXCLUDED.name_key,
    city_key     = EXCLUDED.city_key,
    phone_e164   = EXCLUDED.phone_e164,
    domain       = EXCLUDED.domain,
    confidence   = EXCLUDED.confidence,
    profile      = EXCLUDED.profile,
    -- Lifecycle: a discovered row never rewrites the campaign that first
    -- claimed it, and never rewrites a decision the review queue made.
    campaign_id  = coalesce(EXCLUDED.campaign_id, radar_candidates.campaign_id)
  RETURNING id INTO v_id;

  -- Provenance: replace whatever was recorded for this candidate. Only the
  -- worker writes these rows today; delete+insert keeps a refreshed candidate
  -- honest instead of accumulating stale field text.
  DELETE FROM public.radar_candidate_evidence WHERE candidate_id = v_id;
  INSERT INTO public.radar_candidate_evidence (
    candidate_id, evidence_field, field_value, source_key,
    method, source_url, confidence, owner_confirmed, can_auto_update
  )
  SELECT
    v_id,
    e->>'evidence_field', e->>'field_value', e->>'source_key',
    e->>'method', nullif(e->>'source_url', ''),
    greatest(0, least(100, coalesce((e->>'confidence')::integer, 0))),
    coalesce((e->>'owner_confirmed')::boolean, false),
    coalesce((e->>'can_auto_update')::boolean, true)
  FROM jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) e
  WHERE coalesce(btrim(e->>'evidence_field'), '') <> ''
    AND coalesce(btrim(e->>'field_value'), '') <> '';

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.stage_discovery_candidate(jsonb, jsonb) FROM public, anon, authenticated;

-- Drop the 5-arg finish from 20260915010000 before the 6-arg lands (same rule
-- as stage above: CREATE OR REPLACE never crosses signatures).
DROP FUNCTION IF EXISTS public.finish_discovery_run(uuid, text, integer, integer, text);

/*
  Close one run and fold its numbers into the campaign — and record, per
  source actually asked, how it did. `p_source_health` is an array of
  { key, status, error }; only 'healthy'/'degraded'/'unhealthy' are accepted
  from the worker, and only ACTIVE sources are updated, so an operator's
  recorded history on a temporarily disabled source is never clobbered.
*/
CREATE OR REPLACE FUNCTION public.finish_discovery_run(
  p_run uuid,
  p_status text,
  p_records_discovered integer,
  p_records_published integer,
  p_error text,
  p_source_health jsonb DEFAULT '[]'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_campaign uuid;
BEGIN
  IF p_status NOT IN ('succeeded','partially_succeeded','failed','blocked','cancelled') THEN
    RAISE EXCEPTION 'finish_discovery_run accepts only terminal statuses';
  END IF;

  UPDATE public.business_discovery_runs
     SET status = p_status,
         records_discovered = greatest(0, coalesce(p_records_discovered, 0)),
         records_published  = greatest(0, coalesce(p_records_published, 0)),
         error = p_error,
         finished_at = now()
   WHERE id = p_run
     AND status = 'running'
   RETURNING campaign_id INTO v_campaign;

  IF v_campaign IS NULL THEN RETURN false; END IF;

  UPDATE public.business_discovery_campaigns
     SET records_discovered = records_discovered + greatest(0, coalesce(p_records_discovered, 0)),
         records_published  = records_published  + greatest(0, coalesce(p_records_published, 0)),
         last_run_at = now(),
         updated_at = now()
   WHERE id = v_campaign;

  -- The source registry's own run stats, written as part of finalising.
  UPDATE public.radar_sources s
     SET last_run_at = now(),
         records_seen = records_seen + greatest(0, coalesce(p_records_discovered, 0))
    FROM public.business_discovery_campaigns c
   WHERE c.id = v_campaign
     AND s.key = ANY (c.source_keys)
     AND s.active;

  -- Health telemetry, one row in p_source_health per source this run asked.
  UPDATE public.radar_sources s
     SET health_status = (h->>'status')::text,
         last_error = CASE WHEN nullif(btrim(h->>'error'), '') IS NULL
                           THEN NULL ELSE h->>'error' END,
         last_successful_sync = CASE
                               WHEN h->>'status' IN ('healthy','degraded') THEN now()
                               ELSE s.last_successful_sync
                             END
    FROM jsonb_array_elements(coalesce(p_source_health, '[]'::jsonb)) h
   WHERE s.key = h->>'key'
     AND s.active
     AND h->>'status' IN ('healthy','degraded','unhealthy');

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_discovery_run(uuid, text, integer, integer, text, jsonb) FROM public, anon, authenticated;