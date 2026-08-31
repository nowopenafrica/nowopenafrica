/*
  # NowOpen Radar — discovery candidates and source governance

  Radar discovers businesses; it never decides who owns one. Everything below
  keeps those two apart: candidates land in their own table, are reviewed or
  auto-published into `businesses` as UNCLAIMED shells, and ownership continues
  to move only through business_claims and its admin-approved trigger.

  ## Source governance is a hard gate, not a note

  radar_sources records, per source, whether automated access, bulk extraction,
  use in a competing dataset and redistribution are each permitted — and who at
  NowOpen established that. A CHECK constraint refuses to mark a source active
  unless all four are 'permitted' and a licence and an authoriser are recorded.
  Unknown is treated exactly like prohibited, because the realistic failure is
  not somebody overriding a "no" — it is somebody switching on a source nobody
  read the terms of.

  BusinessList is seeded as prohibited on purpose. Recording the answer stops
  the question being re-asked in six months and quietly answered differently.

  Re-runnable throughout.
*/

-- ------------------------------------------------------------------ sources
CREATE TABLE IF NOT EXISTS public.radar_sources (
  key   text PRIMARY KEY,
  name  text NOT NULL,
  kind  text NOT NULL,
  active boolean NOT NULL DEFAULT false,

  automated_access   text NOT NULL DEFAULT 'unknown',
  bulk_extraction    text NOT NULL DEFAULT 'unknown',
  competing_dataset  text NOT NULL DEFAULT 'unknown',
  redistribution     text NOT NULL DEFAULT 'unknown',

  licence        text,
  authorised_by  text,
  authorised_at  timestamptz,
  notes          text,

  last_run_at     timestamptz,
  records_seen    integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.radar_sources DROP CONSTRAINT IF EXISTS radar_sources_permissions_check;
ALTER TABLE public.radar_sources ADD CONSTRAINT radar_sources_permissions_check CHECK (
  automated_access  IN ('permitted','prohibited','unknown') AND
  bulk_extraction   IN ('permitted','prohibited','unknown') AND
  competing_dataset IN ('permitted','prohibited','unknown') AND
  redistribution    IN ('permitted','prohibited','unknown')
);

/*
  The gate itself, in the schema.

  A source cannot be stored as active unless every right is established and a
  named person signed it off. Putting this in a CHECK rather than in the
  application means it holds for the SQL editor, a migration, a background job
  and a future service too.
*/
ALTER TABLE public.radar_sources DROP CONSTRAINT IF EXISTS radar_sources_active_requires_rights;
ALTER TABLE public.radar_sources ADD CONSTRAINT radar_sources_active_requires_rights CHECK (
  active = false OR (
    automated_access = 'permitted' AND
    bulk_extraction = 'permitted' AND
    competing_dataset = 'permitted' AND
    redistribution = 'permitted' AND
    licence IS NOT NULL AND btrim(licence) <> '' AND
    authorised_by IS NOT NULL AND btrim(authorised_by) <> ''
  )
);

ALTER TABLE public.radar_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read radar sources" ON public.radar_sources;
CREATE POLICY "Staff read radar sources" ON public.radar_sources
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Staff manage radar sources" ON public.radar_sources;
CREATE POLICY "Staff manage radar sources" ON public.radar_sources
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.radar_sources (key, name, kind, active, automated_access, bulk_extraction,
                                  competing_dataset, redistribution, licence, authorised_by, authorised_at, notes)
VALUES
  ('business_submission', 'Business submissions', 'business_submission', true,
   'permitted','permitted','permitted','permitted',
   'Supplied directly to NowOpen Africa by the business.', 'NowOpen Africa', now(), NULL),
  ('public_suggestion', 'Suggested by a customer', 'business_submission', true,
   'permitted','permitted','permitted','permitted',
   'Suggested to NowOpen Africa by a member of the public; treated as a lead, never published unreviewed.',
   'NowOpen Africa', now(), 'Lowest-trust permitted source. Always reviewed.'),
  ('admin_import', 'Admin CSV import', 'admin_import', true,
   'permitted','permitted','permitted','permitted',
   'Imported by a NowOpen administrator accountable for the provenance of the file.',
   'NowOpen Africa', now(), NULL),
  ('businesslist_ng', 'BusinessList.com.ng', 'licensed_directory', false,
   'prohibited','prohibited','prohibited','prohibited', NULL, NULL, NULL,
   'Their terms prohibit bots, crawlers, scrapers, bulk extraction and use in a competing dataset. '
   || 'Do not enable without a signed agreement. robots.txt permitting crawling is a bot-traffic rule, not a content licence.')
ON CONFLICT (key) DO NOTHING;

-- --------------------------------------------------------------- candidates
/*
  Discovered records, before they are anything.

  Separate from `businesses` deliberately: a candidate is a claim about the
  world that has not been accepted yet, and mixing the two would mean the
  public table contains rows nobody has decided about.
*/
CREATE TABLE IF NOT EXISTS public.radar_candidates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key  text NOT NULL REFERENCES public.radar_sources(key) ON DELETE RESTRICT,
  /* The source's own id, so re-discovery updates rather than duplicates. */
  source_record_id text,
  source_url  text,

  name        text NOT NULL,
  category    text,
  city        text,
  address     text,
  phone       text,
  whatsapp    text,
  email       text,
  website     text,
  latitude    double precision,
  longitude   double precision,
  description text,

  -- Normalised keys, written by the engine, used for duplicate detection.
  name_key    text,
  city_key    text,
  phone_e164  text,
  domain      text,

  confidence  integer NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'pending',
  decision_reason text,
  duplicate_of uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  published_business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,

  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitter_contact text,

  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.radar_candidates DROP CONSTRAINT IF EXISTS radar_candidates_status_check;
ALTER TABLE public.radar_candidates ADD CONSTRAINT radar_candidates_status_check
  CHECK (status IN ('pending','review','held','published','merged','rejected'));

ALTER TABLE public.radar_candidates DROP CONSTRAINT IF EXISTS radar_candidates_confidence_check;
ALTER TABLE public.radar_candidates ADD CONSTRAINT radar_candidates_confidence_check
  CHECK (confidence BETWEEN 0 AND 100);

CREATE UNIQUE INDEX IF NOT EXISTS idx_radar_candidates_source_record
  ON public.radar_candidates (source_key, source_record_id)
  WHERE source_record_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_radar_candidates_queue
  ON public.radar_candidates (status, confidence DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_radar_candidates_name_key ON public.radar_candidates (name_key);
CREATE INDEX IF NOT EXISTS idx_radar_candidates_phone ON public.radar_candidates (phone_e164)
  WHERE phone_e164 IS NOT NULL;

ALTER TABLE public.radar_candidates ENABLE ROW LEVEL SECURITY;

/*
  Anyone may suggest a business — the launch audit's "Suggest a Business", and
  Radar's first genuinely working provider. Requiring an account first loses
  the suggestion; the person who knows about the shop is usually a customer.

  Forced to 'public_suggestion' and 'pending' by the WITH CHECK, so a submitter
  cannot dress a suggestion up as a licensed import or push it straight to
  published.
*/
DROP POLICY IF EXISTS "Anyone can suggest a business" ON public.radar_candidates;
CREATE POLICY "Anyone can suggest a business" ON public.radar_candidates
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    source_key = 'public_suggestion'
    AND status = 'pending'
    AND confidence = 0
    AND published_business_id IS NULL
    AND duplicate_of IS NULL
    AND reviewed_by IS NULL
  );

/* No public SELECT: the queue is unreviewed assertions about real businesses. */
DROP POLICY IF EXISTS "Staff read candidates" ON public.radar_candidates;
CREATE POLICY "Staff read candidates" ON public.radar_candidates
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Staff manage candidates" ON public.radar_candidates;
CREATE POLICY "Staff manage candidates" ON public.radar_candidates
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------ config
CREATE TABLE IF NOT EXISTS public.radar_config (
  id                integer PRIMARY KEY DEFAULT 1,
  autonomy_mode     text NOT NULL DEFAULT 'manual',
  auto_publish_at   integer NOT NULL DEFAULT 90,
  review_at         integer NOT NULL DEFAULT 50,
  updated_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT radar_config_single_row CHECK (id = 1),
  CONSTRAINT radar_config_mode_check CHECK (autonomy_mode IN ('manual','assisted','autonomous')),
  CONSTRAINT radar_config_thresholds CHECK (auto_publish_at BETWEEN 50 AND 100 AND review_at BETWEEN 0 AND auto_publish_at)
);

/* Ships in manual mode. Autonomy is a decision somebody makes, not a default. */
INSERT INTO public.radar_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.radar_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read radar config" ON public.radar_config;
CREATE POLICY "Staff read radar config" ON public.radar_config
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Staff manage radar config" ON public.radar_config;
CREATE POLICY "Staff manage radar config" ON public.radar_config
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ------------------------------------------------------------- publication
/*
  Turn an approved candidate into an UNCLAIMED business shell.

  The only route from Radar into the public directory, and it is admin-only.
  Note what it does not do: it sets no owner, grants no verification, and
  writes claim_status 'unclaimed'. Discovery is automatic; ownership never is.

  Provenance travels with the row, so six months from now the question "where
  did this business come from?" has an answer.
*/
CREATE OR REPLACE FUNCTION public.radar_publish_candidate(p_candidate uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; s record; v_id uuid; v_slug text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;

  SELECT * INTO c FROM public.radar_candidates WHERE id = p_candidate;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such candidate'; END IF;
  IF c.published_business_id IS NOT NULL THEN RETURN c.published_business_id; END IF;
  IF c.status = 'rejected' THEN RAISE EXCEPTION 'That candidate was rejected'; END IF;

  -- The source gate again, at the last possible moment. Rights can be revoked
  -- between discovery and publication.
  SELECT * INTO s FROM public.radar_sources WHERE key = c.source_key;
  IF NOT FOUND OR NOT s.active THEN
    RAISE EXCEPTION 'Source % is not authorised for publication', c.source_key;
  END IF;

  v_slug := regexp_replace(lower(btrim(c.name)), '[^a-z0-9]+', '-', 'g');
  v_slug := btrim(v_slug, '-');
  IF v_slug = '' THEN v_slug := 'business'; END IF;
  -- Slugs are unique; append the candidate id fragment when taken.
  IF EXISTS (SELECT 1 FROM public.businesses WHERE username = v_slug) THEN
    v_slug := v_slug || '-' || substr(replace(p_candidate::text, '-', ''), 1, 6);
  END IF;

  INSERT INTO public.businesses (
    name, category, location, address, description, phone, whatsapp, email, website,
    username, external_id,
    data_status, claim_status, verification_status, lifecycle_status,
    source_name, source_url, source_record_id, source_license, source_imported_at
  ) VALUES (
    c.name, coalesce(c.category, 'Other'), c.city, c.address, c.description,
    c.phone, c.whatsapp, c.email, c.website,
    v_slug, c.source_key || ':' || coalesce(c.source_record_id, p_candidate::text),
    CASE WHEN c.source_key IN ('business_submission','public_suggestion') THEN 'submitted' ELSE 'imported_authorized' END,
    'unclaimed', 'unverified', 'active',
    s.name, c.source_url, c.source_record_id, s.licence, now()
  )
  RETURNING id INTO v_id;

  UPDATE public.radar_candidates
     SET status = 'published', published_business_id = v_id,
         reviewed_by = auth.uid(), reviewed_at = now()
   WHERE id = p_candidate;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.radar_publish_candidate(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.radar_publish_candidate(uuid) TO authenticated;

/* Radar's counters for the admin dashboard. */
CREATE OR REPLACE FUNCTION public.radar_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  SELECT jsonb_build_object(
    'pending',   count(*) FILTER (WHERE status = 'pending'),
    'review',    count(*) FILTER (WHERE status = 'review'),
    'held',      count(*) FILTER (WHERE status = 'held'),
    'published', count(*) FILTER (WHERE status = 'published'),
    'merged',    count(*) FILTER (WHERE status = 'merged'),
    'rejected',  count(*) FILTER (WHERE status = 'rejected'),
    'today',     count(*) FILTER (WHERE created_at >= date_trunc('day', now())),
    'sources_active',  (SELECT count(*) FROM public.radar_sources WHERE active),
    'sources_blocked', (SELECT count(*) FROM public.radar_sources WHERE NOT active),
    'mode',      (SELECT autonomy_mode FROM public.radar_config WHERE id = 1)
  ) INTO r FROM public.radar_candidates;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.radar_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.radar_stats() TO authenticated;
