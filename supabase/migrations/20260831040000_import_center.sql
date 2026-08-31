/*
  # Import Center — batches, rows, reference data, rollback

  One ingestion layer. Bulk import does not get its own pipeline: an imported
  business goes through the same normalisation, duplicate detection, confidence
  scoring and publish gate as anything Radar discovers, and lands in the same
  radar_candidates queue. Two ingestion paths would mean two sets of rules, and
  the second one is always the one that lets something through.

  ## Why batches exist

  So an import can be undone. A spreadsheet with a shifted column can create
  ten thousand wrong businesses in a minute, and "delete the ones from that
  file" is only answerable if the file was recorded as a thing. Every row keeps
  its batch, its original line number and its raw values, so a rollback is
  exact and an error report can point at line 4,812 of the file the admin
  actually uploaded.

  ## The rule that does not bend

  Bulk import never assigns ownership. Rows land unclaimed and unverified with
  owner_user_id NULL, whatever the file says — enforced below by the publish
  path, which does not read those columns at all.

  Re-runnable throughout.
*/

-- --------------------------------------------------------- reference tables
/*
  Master categories and locations.

  Validation checks against these. Per the import contract, an unrecognised
  value sends the row to REVIEW rather than rejecting it — a real business in a
  town NowOpen has not listed yet is a gap in the reference data, not a bad
  record, and rejecting it would quietly discard exactly the businesses worth
  having.
*/
CREATE TABLE IF NOT EXISTS public.ref_categories (
  slug     text PRIMARY KEY,
  category text NOT NULL,
  active   boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.ref_locations (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country text NOT NULL,
  state   text NOT NULL,
  city    text NOT NULL,
  area    text,
  active  boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ref_locations_unique
  ON public.ref_locations (country, state, city, coalesce(area, ''));
CREATE INDEX IF NOT EXISTS idx_ref_locations_city ON public.ref_locations (lower(city));

ALTER TABLE public.ref_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ref_locations  ENABLE ROW LEVEL SECURITY;

-- Reference data is public: the search box and the import validator both need it.
DROP POLICY IF EXISTS "Reference categories are public" ON public.ref_categories;
CREATE POLICY "Reference categories are public" ON public.ref_categories FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage ref categories" ON public.ref_categories;
CREATE POLICY "Admins manage ref categories" ON public.ref_categories
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Reference locations are public" ON public.ref_locations;
CREATE POLICY "Reference locations are public" ON public.ref_locations FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage ref locations" ON public.ref_locations;
CREATE POLICY "Admins manage ref locations" ON public.ref_locations
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.ref_categories (slug, category) VALUES
  ('restaurant','Restaurant & Food'), ('fashion','Fashion & Tailoring'),
  ('beauty','Beauty & Wellness'), ('automotive','Auto Services'),
  ('laundry','Laundry & Cleaning'), ('real_estate','Real Estate'),
  ('professional_services','Professional Services'), ('technology','Technology'),
  ('retail','Retail & Shopping'), ('construction','Construction & Engineering'),
  ('health','Health & Pharmacy'), ('logistics','Logistics & Transport'),
  ('education','Education & Training'), ('events','Events & Entertainment'),
  ('agriculture','Agriculture & Food Supply'), ('printing','Printing & Signage'),
  ('hospitality','Hospitality & Travel'), ('home_interior','Home & Interior'),
  ('security','Security Services'), ('manufacturing','Manufacturing & Industrial')
ON CONFLICT (slug) DO UPDATE SET category = EXCLUDED.category;

INSERT INTO public.ref_locations (country, state, city, area) VALUES
  ('Nigeria','Lagos','Lagos','Ikeja'), ('Nigeria','Lagos','Lagos','Lekki'),
  ('Nigeria','Lagos','Lagos','Yaba'), ('Nigeria','FCT','Abuja','Wuse'),
  ('Nigeria','FCT','Abuja','Garki'), ('Nigeria','Rivers','Port Harcourt','GRA'),
  ('Nigeria','Oyo','Ibadan','Bodija'), ('Nigeria','Edo','Benin City','GRA'),
  ('Nigeria','Kano','Kano','Nassarawa'), ('Nigeria','Enugu','Enugu','New Haven')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------------ batches
CREATE TABLE IF NOT EXISTS public.import_batches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  /* Human-facing reference, so an admin and a log line can name the same run. */
  reference    text UNIQUE,
  dataset      text NOT NULL,
  filename     text,
  uploaded_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  /* The mapping actually used, kept so a re-run or an audit can reproduce it. */
  column_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_name    text,
  source_type    text,
  source_url     text,
  source_license text,

  status       text NOT NULL DEFAULT 'draft',
  total_rows   integer NOT NULL DEFAULT 0,
  valid_rows   integer NOT NULL DEFAULT 0,
  review_rows  integer NOT NULL DEFAULT 0,
  invalid_rows integer NOT NULL DEFAULT 0,
  duplicate_rows integer NOT NULL DEFAULT 0,
  created_rows integer NOT NULL DEFAULT 0,

  approved_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at  timestamptz,
  rolled_back_at timestamptz,
  rolled_back_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.import_batches DROP CONSTRAINT IF EXISTS import_batches_dataset_check;
ALTER TABLE public.import_batches ADD CONSTRAINT import_batches_dataset_check
  CHECK (dataset IN ('businesses','placements','media'));

ALTER TABLE public.import_batches DROP CONSTRAINT IF EXISTS import_batches_status_check;
ALTER TABLE public.import_batches ADD CONSTRAINT import_batches_status_check
  CHECK (status IN ('draft','previewed','approved','importing','completed','failed','rolled_back'));

-- --------------------------------------------------------------------- rows
/*
  One row per line of the uploaded file, raw values kept.

  The raw payload is what makes an error report useful ("line 4,812: phone
  0801 is 4 digits short") and what makes a re-run possible after the mapping
  is corrected, without asking the admin to upload again.
*/
CREATE TABLE IF NOT EXISTS public.import_rows (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id   uuid NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  line_no    integer NOT NULL,
  raw        jsonb NOT NULL,
  mapped     jsonb,
  status     text NOT NULL DEFAULT 'pending',
  issues     jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence integer,
  candidate_id uuid REFERENCES public.radar_candidates(id) ON DELETE SET NULL,
  created_business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  duplicate_of uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.import_rows DROP CONSTRAINT IF EXISTS import_rows_status_check;
ALTER TABLE public.import_rows ADD CONSTRAINT import_rows_status_check
  CHECK (status IN ('pending','valid','review','invalid','duplicate','imported','skipped','rolled_back'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_import_rows_batch_line ON public.import_rows (batch_id, line_no);
CREATE INDEX IF NOT EXISTS idx_import_rows_status ON public.import_rows (batch_id, status);

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_rows    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage import batches" ON public.import_batches;
CREATE POLICY "Admins manage import batches" ON public.import_batches
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins manage import rows" ON public.import_rows;
CREATE POLICY "Admins manage import rows" ON public.import_rows
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

/* NOA-2026-0831-0042 — dated and sequential, so batches sort and read well. */
CREATE SEQUENCE IF NOT EXISTS public.import_batch_seq START 1;

CREATE OR REPLACE FUNCTION public.next_import_reference()
RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT 'NOA-' || to_char(now(), 'YYYY-MMDD') || '-' || lpad(nextval('public.import_batch_seq')::text, 4, '0');
$$;
GRANT EXECUTE ON FUNCTION public.next_import_reference() TO authenticated;

-- ------------------------------------------------------------------ publish
/*
  Turn approved rows of a batch into candidates.

  Rows go to radar_candidates, not straight to businesses — the same queue
  Radar fills, so bulk import inherits duplicate detection and the publish gate
  instead of side-stepping them. An admin then publishes from one review queue,
  whatever the record's origin.

  Note the columns this does NOT read: owner_user_id, claim_status,
  verification_status. A spreadsheet cannot grant ownership or a badge, and the
  safest way to guarantee that is not to look at those columns at all.
*/
CREATE OR REPLACE FUNCTION public.import_batch_to_candidates(p_batch uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; n integer := 0;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;

  SELECT * INTO b FROM public.import_batches WHERE id = p_batch;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such batch'; END IF;
  IF b.dataset <> 'businesses' THEN
    RAISE EXCEPTION 'Only the businesses dataset publishes to candidates so far';
  END IF;
  IF b.status = 'rolled_back' THEN RAISE EXCEPTION 'That batch was rolled back'; END IF;

  -- The source gate, once more, at the moment of ingestion.
  IF NOT EXISTS (SELECT 1 FROM public.radar_sources WHERE key = 'admin_import' AND active) THEN
    RAISE EXCEPTION 'The admin_import source is not authorised';
  END IF;

  WITH ins AS (
    INSERT INTO public.radar_candidates (
      source_key, source_record_id, source_url, name, category, city, address,
      phone, whatsapp, email, website, description,
      name_key, city_key, phone_e164, domain, confidence, status, submitted_by
    )
    SELECT
      'admin_import',
      b.reference || ':' || r.line_no,
      b.source_url,
      r.mapped->>'name', r.mapped->>'category', r.mapped->>'city', r.mapped->>'address',
      r.mapped->>'phone', r.mapped->>'whatsapp', r.mapped->>'email', r.mapped->>'website',
      r.mapped->>'description',
      r.mapped->>'nameKey', r.mapped->>'cityKey', r.mapped->>'phone', r.mapped->>'domain',
      coalesce(r.confidence, 0),
      'review',
      b.uploaded_by
    FROM public.import_rows r
    WHERE r.batch_id = p_batch
      AND r.status IN ('valid','review')
      AND r.mapped ? 'name'
    ON CONFLICT (source_key, source_record_id) WHERE source_record_id IS NOT NULL
      DO NOTHING
    RETURNING id, source_record_id
  )
  UPDATE public.import_rows r
     SET status = 'imported', candidate_id = ins.id
    FROM ins
   WHERE r.batch_id = p_batch
     AND ins.source_record_id = b.reference || ':' || r.line_no;

  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE public.import_batches
     SET status = 'completed', created_rows = n, approved_by = auth.uid(), approved_at = now()
   WHERE id = p_batch;

  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.import_batch_to_candidates(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.import_batch_to_candidates(uuid) TO authenticated;

/*
  Undo a batch.

  Removes the candidates this batch created and any businesses published from
  them — but ONLY those still untouched. A business somebody has since claimed,
  or that an owner has edited, is no longer the import's to delete: by then it
  is their page. Those are reported as kept rather than silently skipped.
*/
CREATE OR REPLACE FUNCTION public.rollback_import_batch(p_batch uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_removed integer := 0; v_kept integer := 0;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.import_batches WHERE id = p_batch) THEN
    RAISE EXCEPTION 'No such batch';
  END IF;

  -- Businesses that have since been claimed or edited by an owner stay.
  SELECT count(*) INTO v_kept
    FROM public.import_rows r
    JOIN public.businesses bus ON bus.id = r.created_business_id
   WHERE r.batch_id = p_batch AND (bus.user_id IS NOT NULL OR bus.claim_status <> 'unclaimed');

  WITH doomed AS (
    SELECT r.created_business_id AS bid
      FROM public.import_rows r
      JOIN public.businesses bus ON bus.id = r.created_business_id
     WHERE r.batch_id = p_batch
       AND bus.user_id IS NULL
       AND bus.claim_status = 'unclaimed'
  )
  DELETE FROM public.businesses WHERE id IN (SELECT bid FROM doomed);
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  DELETE FROM public.radar_candidates
   WHERE id IN (SELECT candidate_id FROM public.import_rows WHERE batch_id = p_batch AND candidate_id IS NOT NULL)
     AND status <> 'published';

  UPDATE public.import_rows SET status = 'rolled_back' WHERE batch_id = p_batch;
  UPDATE public.import_batches
     SET status = 'rolled_back', rolled_back_at = now(), rolled_back_by = auth.uid()
   WHERE id = p_batch;

  RETURN jsonb_build_object('businesses_removed', v_removed, 'kept_because_claimed', v_kept);
END;
$$;
REVOKE ALL ON FUNCTION public.rollback_import_batch(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.rollback_import_batch(uuid) TO authenticated;
