-- Design asset library: a searchable, licensed library of self-hosted design
-- files (spec docs/superpowers/specs/2026-11-07-creative-intelligence-catalogue-design.md,
-- sections 6.1 and 6.3).
--
-- WHAT THIS ADDS
--
--   design_asset_licences   one row per accepted licence, with honest yes/no
--                           fields. No row, no asset: Canva, Freepik, unknown
--                           and scraped sources have no row, so they cannot be
--                           recorded at all.
--   design_assets           one row per self-hosted file, with provenance,
--                           licence evidence, rights flags and review state.
--   design_mockup_surfaces  the placeable surfaces of a mockup_scene asset.
--   search_design_assets()  approved-only search, SECURITY INVOKER, ranked then
--                           ordered by id so paging is stable under the
--                           1000-row cap.
--   storage buckets         design-assets-intake (private, staff only, type and
--                           size limited) and design-assets (public URLs, no listing,
--                           staff write). Approval copies the file across, so a draft
--                           is never reachable by URL.
--
-- RULES THE DATABASE ENFORCES
--
--   approved   needs licence_evidence_path and retrieved_at;
--              never with contains_brands;
--              people without a release on file only under a licence whose
--              permits_people_without_release is true, and then only with the
--              'no-endorsement' tag;
--              an SVG only once sanitised_at is set.
--   retired    needs a retired_reason.
--   sha256     unique: one row per file.
--   licences   cannot stop permitting people without a release while approved
--              assets rely on it.
--   review     reviewed_by / reviewed_at move only on a change into approved
--              or retired.
--   anon       never reads created_by or reviewed_by (column-level grants).
--
-- Fonts are not library assets (they are self-hosted in the repo), so neither
-- the mime check nor the buckets accept them.
--
-- permits_people_without_release is the one column this migration adds beyond
-- the spec's licence list. The spec says the people rule depends on whether a
-- licence's restrictions permit it; restrictions is prose, so the yes/no lives
-- in its own column. It is true only for pexels and pixabay, the two sources
-- whose expected terms (spec 6.3) allow people with a no-endorsement condition.
--
-- terms_snapshot_path stays NULL on every seeded licence until intake captures
-- the source's terms; the seeded yes/no values are what the spec expects to
-- find, not the evidence.
--
-- Re-runnable: tables and indexes are IF NOT EXISTS, policies and triggers are
-- dropped first, seeds are ON CONFLICT DO NOTHING, and buckets are ON CONFLICT
-- DO UPDATE so a pre-existing bucket takes these settings.

-- ---------------------------------------------------------------------------
-- 1. Licences
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.design_asset_licences (
  key                            text PRIMARY KEY
                                   CHECK (key ~ '^[a-z0-9][a-z0-9.-]*$'),
  name                           text NOT NULL CHECK (btrim(name) <> ''),
  url                            text,
  terms_snapshot_path            text,
  commercial_use                 boolean NOT NULL,
  modification                   boolean NOT NULL,
  attribution_required           boolean NOT NULL,
  standalone_resale              boolean NOT NULL,
  template_embedding             boolean NOT NULL,
  print_use                      boolean NOT NULL,
  permits_people_without_release boolean NOT NULL DEFAULT false,
  restrictions                   text NOT NULL DEFAULT '',
  reviewed_by                    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at                    timestamptz,
  created_at                     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.design_asset_licences.permits_people_without_release IS
  'True only when the licence lets an image of people with no release on file be used, on condition it carries the no-endorsement tag.';
COMMENT ON COLUMN public.design_asset_licences.terms_snapshot_path IS
  'Captured copy of the source terms. NULL until the first intake from that source captures it.';

INSERT INTO public.design_asset_licences
  (key, name, url, commercial_use, modification, attribution_required,
   standalone_resale, template_embedding, print_use, permits_people_without_release, restrictions)
VALUES
  ('pexels', 'Pexels Licence', 'https://www.pexels.com/license/',
   true, true, true, false, true, true, true,
   'No selling unaltered copies. No implied endorsement by people shown. API use needs the API key and attribution. Self-hosted; raw downloads not offered.'),
  ('pixabay', 'Pixabay Content Licence', 'https://pixabay.com/service/license-summary/',
   true, true, true, false, true, true, true,
   'Expected to be similar to Pexels; verify at capture. Download and self-host, never hotlink.'),
  ('unsplash', 'Unsplash Licence', 'https://unsplash.com/license',
   true, true, true, false, true, true, false,
   'Manual download under the licence only, photographer credit stored. No API use (its guidelines require hotlinking).'),
  ('cc0', 'CC0 1.0 Public Domain Dedication', 'https://creativecommons.org/publicdomain/zero/1.0/',
   true, true, false, false, true, true, false,
   'Accepted per file from Openverse or Wikimedia Commons; the per-file licence is the evidence.'),
  ('public-domain', 'Public domain', 'https://creativecommons.org/publicdomain/mark/1.0/',
   true, true, false, false, true, true, false,
   'Accepted per file from Openverse or Wikimedia Commons; the per-file status is the evidence.'),
  ('cc-by-4.0', 'Creative Commons Attribution 4.0', 'https://creativecommons.org/licenses/by/4.0/',
   true, true, true, false, true, true, false,
   'Accepted per file; attribution required. BY-SA, NC and ND variants are rejected.'),
  ('sil-ofl-1.1', 'SIL Open Font License 1.1', 'https://openfontlicense.org/',
   true, true, true, false, true, true, false,
   'Fonts (Google Fonts). Free commercial use and embedding; Latin Extended files self-hosted.'),
  ('isc', 'ISC Licence', 'https://opensource.org/license/isc-license-txt',
   true, true, true, false, true, true, false,
   'Permissive code licence (Lucide icons). Keep the licence notice.'),
  ('mit', 'MIT Licence', 'https://opensource.org/license/mit',
   true, true, true, false, true, true, false,
   'Permissive code licence (Heroicons, Tabler). Keep the licence notice.'),
  ('apache-2.0', 'Apache Licence 2.0', 'https://www.apache.org/licenses/LICENSE-2.0',
   true, true, true, false, true, true, false,
   'Permissive code licence (Material Symbols). Keep the licence notice.'),
  ('nowopen-original', 'NowOpen original work', NULL,
   true, true, false, false, true, true, false,
   'Made in-house by NowOpen.'),
  ('commissioned', 'Commissioned work for hire', NULL,
   true, true, false, false, true, true, false,
   'A work-for-hire agreement must be on file; its terms govern.')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Assets
-- ---------------------------------------------------------------------------

-- The tsvector source. A wrapper because array_to_string is only STABLE, and a
-- generated column needs an IMMUTABLE expression. For text[] the result does
-- not depend on any setting, so declaring it IMMUTABLE is safe.
CREATE OR REPLACE FUNCTION public.design_asset_search_vector(
  p_title text, p_description text, p_tags text[], p_subjects text[], p_industries text[])
RETURNS tsvector
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT setweight(to_tsvector('simple'::regconfig, coalesce(p_title, '')), 'A')
      || setweight(to_tsvector('simple'::regconfig,
           coalesce(array_to_string(p_tags, ' '), '') || ' ' ||
           coalesce(array_to_string(p_subjects, ' '), '')), 'B')
      || setweight(to_tsvector('simple'::regconfig, coalesce(p_description, '')), 'C')
      || setweight(to_tsvector('simple'::regconfig, coalesce(array_to_string(p_industries, ' '), '')), 'D');
$$;

CREATE TABLE IF NOT EXISTS public.design_assets (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                   text NOT NULL CHECK (kind IN (
                           'photo', 'illustration', 'vector', 'icon', 'pattern', 'texture',
                           'gradient', 'frame', 'mask', 'shape', 'chart', 'map', 'badge',
                           'device_frame', 'overlay', 'mockup_scene')),

  -- Description
  title                  text NOT NULL CHECK (btrim(title) <> ''),
  description            text,
  tags                   text[] NOT NULL DEFAULT '{}',
  subjects               text[] NOT NULL DEFAULT '{}',
  industries             text[] NOT NULL DEFAULT '{}',
  regions                text[] NOT NULL DEFAULT '{}'
                           CHECK (array_to_string(regions, ',') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$'),
  dominant_colours       text[] NOT NULL DEFAULT '{}'
                           CHECK (array_to_string(dominant_colours, ',') ~ '^(#[0-9a-f]{6}(,#[0-9a-f]{6})*)?$'),
  orientation            text CHECK (orientation IN ('landscape', 'portrait', 'square')),

  -- File
  width_px               integer CHECK (width_px > 0),
  height_px              integer CHECK (height_px > 0),
  bytes                  bigint NOT NULL CHECK (bytes > 0),
  -- Fonts are not library assets: they are self-hosted in the repo.
  mime                   text NOT NULL CHECK (mime IN (
                           'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')),
  storage_path           text NOT NULL UNIQUE CHECK (btrim(storage_path) <> ''),
  thumb_path             text,
  sha256                 text NOT NULL UNIQUE CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  -- When the SVG was run through Studio's SVG import stripping. An SVG cannot
  -- be approved until it has been.
  sanitised_at           timestamptz,

  -- Provenance
  source_name            text NOT NULL CHECK (btrim(source_name) <> ''),
  source_url             text,
  source_asset_id        text,
  creator_name           text,
  creator_url            text,
  licence_key            text NOT NULL REFERENCES public.design_asset_licences(key)
                           ON UPDATE CASCADE ON DELETE RESTRICT,
  licence_evidence_path  text,
  retrieved_at           timestamptz,
  attribution_text       text,
  restrictions           text,

  -- Icons
  icon_set               text,
  stroke_style           text,

  -- Rights
  contains_people        boolean NOT NULL DEFAULT false,
  contains_brands        boolean NOT NULL DEFAULT false,
  release_on_file        boolean NOT NULL DEFAULT false,

  -- Review
  status                 text NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft', 'in_review', 'approved', 'retired')),
  retired_reason         text,
  created_by             uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_by            uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at            timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  search                 tsvector GENERATED ALWAYS AS (
                           public.design_asset_search_vector(title, description, tags, subjects, industries)
                         ) STORED,

  CONSTRAINT design_assets_approved_needs_evidence CHECK (
    status <> 'approved'
    OR (nullif(btrim(licence_evidence_path), '') IS NOT NULL AND retrieved_at IS NOT NULL)),
  CONSTRAINT design_assets_brands_never_approved CHECK (
    NOT (status = 'approved' AND contains_brands)),
  CONSTRAINT design_assets_people_no_release_tagged CHECK (
    NOT (status = 'approved' AND contains_people AND NOT release_on_file)
    OR 'no-endorsement' = ANY (tags)),
  CONSTRAINT design_assets_retired_needs_reason CHECK (
    status <> 'retired' OR nullif(btrim(retired_reason), '') IS NOT NULL),
  CONSTRAINT design_assets_svg_sanitised_before_approval CHECK (
    mime <> 'image/svg+xml' OR status <> 'approved' OR sanitised_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS design_assets_search_idx      ON public.design_assets USING gin (search);
CREATE INDEX IF NOT EXISTS design_assets_tags_idx        ON public.design_assets USING gin (tags);
CREATE INDEX IF NOT EXISTS design_assets_industries_idx  ON public.design_assets USING gin (industries);
CREATE INDEX IF NOT EXISTS design_assets_regions_idx     ON public.design_assets USING gin (regions);
CREATE INDEX IF NOT EXISTS design_assets_colours_idx     ON public.design_assets USING gin (dominant_colours);
CREATE INDEX IF NOT EXISTS design_assets_status_kind_idx ON public.design_assets (status, kind, id);
CREATE INDEX IF NOT EXISTS design_assets_licence_idx     ON public.design_assets (licence_key);

-- Normalises, stamps, and enforces the one rule a CHECK cannot (it reads the
-- licence row). SECURITY INVOKER: only staff reach this trigger through RLS,
-- and licences are readable by everyone.
CREATE OR REPLACE FUNCTION public.design_assets_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_permits boolean;
BEGIN
  NEW.dominant_colours := ARRAY(SELECT lower(c) FROM unnest(NEW.dominant_colours) AS c);
  NEW.regions          := ARRAY(SELECT upper(r) FROM unnest(NEW.regions) AS r);
  NEW.updated_at       := now();

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := coalesce(auth.uid(), NEW.created_by);
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  END IF;

  -- Review stamps move only when the status changes into approved or retired.
  -- Any other write keeps them as they were, so they cannot be set by hand.
  IF NEW.status IN ('approved', 'retired')
     AND (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status) THEN
    NEW.reviewed_by := coalesce(auth.uid(), NEW.reviewed_by);
    NEW.reviewed_at := now();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.reviewed_by := OLD.reviewed_by;
    NEW.reviewed_at := OLD.reviewed_at;
  ELSE
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
  END IF;

  IF NEW.status = 'approved' AND NEW.contains_people AND NOT NEW.release_on_file THEN
    SELECT l.permits_people_without_release INTO v_permits
      FROM public.design_asset_licences l WHERE l.key = NEW.licence_key;
    IF NOT coalesce(v_permits, false) THEN
      RAISE EXCEPTION 'design asset %: people without a release cannot be approved under licence %',
        NEW.id, NEW.licence_key
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS design_assets_guard ON public.design_assets;
CREATE TRIGGER design_assets_guard
  BEFORE INSERT OR UPDATE ON public.design_assets
  FOR EACH ROW EXECUTE FUNCTION public.design_assets_guard();

-- A licence cannot stop permitting people without a release while approved
-- assets rely on it: those rows would break the rule silently. Retire them
-- (or record their releases) first. SECURITY INVOKER: only staff update
-- licences, and staff read every asset.
CREATE OR REPLACE FUNCTION public.design_asset_licences_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_n bigint;
BEGIN
  IF OLD.permits_people_without_release AND NOT NEW.permits_people_without_release THEN
    SELECT count(*) INTO v_n
      FROM public.design_assets a
     WHERE a.licence_key = OLD.key
       AND a.status = 'approved' AND a.contains_people AND NOT a.release_on_file;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'licence %: % approved asset(s) show people without a release under it; retire them or record releases first',
        OLD.key, v_n
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS design_asset_licences_guard ON public.design_asset_licences;
CREATE TRIGGER design_asset_licences_guard
  BEFORE UPDATE ON public.design_asset_licences
  FOR EACH ROW EXECUTE FUNCTION public.design_asset_licences_guard();

-- ---------------------------------------------------------------------------
-- 3. Mockup surfaces
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.design_mockup_surfaces (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id     uuid NOT NULL REFERENCES public.design_assets(id) ON DELETE CASCADE,
  -- Four corners, normalised to the scene (0 = left/top, 1 = right/bottom),
  -- clockwise from top-left.
  tl_x real NOT NULL CHECK (tl_x BETWEEN 0 AND 1), tl_y real NOT NULL CHECK (tl_y BETWEEN 0 AND 1),
  tr_x real NOT NULL CHECK (tr_x BETWEEN 0 AND 1), tr_y real NOT NULL CHECK (tr_y BETWEEN 0 AND 1),
  br_x real NOT NULL CHECK (br_x BETWEEN 0 AND 1), br_y real NOT NULL CHECK (br_y BETWEEN 0 AND 1),
  bl_x real NOT NULL CHECK (bl_x BETWEEN 0 AND 1), bl_y real NOT NULL CHECK (bl_y BETWEEN 0 AND 1),
  ratio        real NOT NULL CHECK (ratio > 0),
  format_keys  text[] NOT NULL DEFAULT '{}',
  label        text NOT NULL CHECK (btrim(label) <> ''),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS design_mockup_surfaces_asset_idx ON public.design_mockup_surfaces (asset_id);
CREATE INDEX IF NOT EXISTS design_mockup_surfaces_formats_idx ON public.design_mockup_surfaces USING gin (format_keys);

CREATE OR REPLACE FUNCTION public.design_mockup_surfaces_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.design_assets a
                  WHERE a.id = NEW.asset_id AND a.kind = 'mockup_scene') THEN
    RAISE EXCEPTION 'design mockup surface: asset % is not a mockup_scene', NEW.asset_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS design_mockup_surfaces_guard ON public.design_mockup_surfaces;
CREATE TRIGGER design_mockup_surfaces_guard
  BEFORE INSERT OR UPDATE ON public.design_mockup_surfaces
  FOR EACH ROW EXECUTE FUNCTION public.design_mockup_surfaces_guard();

-- ---------------------------------------------------------------------------
-- 4. Row level security
-- ---------------------------------------------------------------------------

ALTER TABLE public.design_asset_licences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_mockup_surfaces ENABLE ROW LEVEL SECURITY;

-- TRUNCATE is not subject to RLS, and Supabase's default privileges grant it.
-- anon only ever reads, and never the staff ids (created_by, reviewed_by):
-- its SELECT is column-level, so an anon query must name its columns
-- (select=* is refused). search_design_assets returns a TABLE of public
-- columns and reads only granted ones, so it works for anon.
REVOKE ALL ON public.design_asset_licences, public.design_assets, public.design_mockup_surfaces FROM anon;
GRANT SELECT (key, name, url, terms_snapshot_path, commercial_use, modification,
              attribution_required, standalone_resale, template_embedding, print_use,
              permits_people_without_release, restrictions, reviewed_at, created_at)
  ON public.design_asset_licences TO anon;
GRANT SELECT (id, kind, title, description, tags, subjects, industries, regions,
              dominant_colours, orientation, width_px, height_px, bytes, mime,
              storage_path, thumb_path, sha256, sanitised_at, source_name, source_url,
              source_asset_id, creator_name, creator_url, licence_key,
              licence_evidence_path, retrieved_at, attribution_text, restrictions,
              icon_set, stroke_style, contains_people, contains_brands, release_on_file,
              status, retired_reason, reviewed_at, created_at, updated_at, search)
  ON public.design_assets TO anon;
GRANT SELECT ON public.design_mockup_surfaces TO anon;
REVOKE TRUNCATE ON public.design_asset_licences, public.design_assets, public.design_mockup_surfaces FROM authenticated;

-- Licences are the published policy: anyone reads, staff edit.
DROP POLICY IF EXISTS "Anyone reads design asset licences" ON public.design_asset_licences;
CREATE POLICY "Anyone reads design asset licences" ON public.design_asset_licences
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Staff manage design asset licences" ON public.design_asset_licences;
CREATE POLICY "Staff manage design asset licences" ON public.design_asset_licences
  FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

-- Assets: anyone reads approved rows; staff read and write everything.
DROP POLICY IF EXISTS "Anyone reads approved design assets" ON public.design_assets;
CREATE POLICY "Anyone reads approved design assets" ON public.design_assets
  FOR SELECT TO anon, authenticated USING (status = 'approved');

DROP POLICY IF EXISTS "Staff manage design assets" ON public.design_assets;
CREATE POLICY "Staff manage design assets" ON public.design_assets
  FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

-- Surfaces: readable when their scene is (the subquery runs under the
-- caller's RLS on design_assets); staff write.
DROP POLICY IF EXISTS "Anyone reads surfaces of approved mockups" ON public.design_mockup_surfaces;
CREATE POLICY "Anyone reads surfaces of approved mockups" ON public.design_mockup_surfaces
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.design_assets a
                  WHERE a.id = asset_id AND a.status = 'approved'));

DROP POLICY IF EXISTS "Staff manage mockup surfaces" ON public.design_mockup_surfaces;
CREATE POLICY "Staff manage mockup surfaces" ON public.design_mockup_surfaces
  FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ---------------------------------------------------------------------------
-- 5. Search
-- ---------------------------------------------------------------------------

-- Approved rows only, whoever calls (staff included: drafts are reviewed in the
-- admin tab, not found through search). Ranked by text match, then id, so a
-- page boundary never moves between calls. p_limit is clamped to 1..100.
CREATE OR REPLACE FUNCTION public.search_design_assets(
  q             text DEFAULT NULL,
  p_kind        text DEFAULT NULL,
  p_colour      text DEFAULT NULL,
  p_orientation text DEFAULT NULL,
  p_industry    text DEFAULT NULL,
  p_region      text DEFAULT NULL,
  p_limit       integer DEFAULT 24,
  p_offset      integer DEFAULT 0)
RETURNS TABLE (
  id               uuid,
  kind             text,
  title            text,
  description      text,
  tags             text[],
  dominant_colours text[],
  orientation      text,
  width_px         integer,
  height_px        integer,
  mime             text,
  storage_path     text,
  thumb_path       text,
  licence_key      text,
  creator_name     text,
  attribution_text text,
  icon_set         text,
  stroke_style     text,
  rank             real)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH params AS (
    SELECT CASE WHEN nullif(btrim(q), '') IS NULL THEN NULL
                ELSE websearch_to_tsquery('simple'::regconfig, q) END AS tsq
  )
  SELECT a.id, a.kind, a.title, a.description, a.tags, a.dominant_colours, a.orientation,
         a.width_px, a.height_px, a.mime, a.storage_path, a.thumb_path, a.licence_key,
         a.creator_name, a.attribution_text, a.icon_set, a.stroke_style,
         CASE WHEN p.tsq IS NULL THEN 0::real ELSE ts_rank_cd(a.search, p.tsq) END AS rank
    FROM public.design_assets a, params p
   WHERE a.status = 'approved'
     AND (p.tsq IS NULL OR a.search @@ p.tsq)
     AND (p_kind IS NULL OR a.kind = p_kind)
     AND (p_colour IS NULL OR a.dominant_colours @> ARRAY[lower(p_colour)])
     AND (p_orientation IS NULL OR a.orientation = p_orientation)
     AND (p_industry IS NULL OR a.industries @> ARRAY[p_industry])
     AND (p_region IS NULL OR a.regions @> ARRAY[upper(p_region)])
   ORDER BY rank DESC, a.id
   LIMIT least(greatest(coalesce(p_limit, 24), 1), 100)
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.search_design_assets(text, text, text, text, text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_design_assets(text, text, text, text, text, text, integer, integer)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Storage
-- ---------------------------------------------------------------------------

-- 25 MB = 26214400 bytes. The API refuses any other type or a larger file.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('design-assets-intake', 'design-assets-intake', false, 26214400,
   ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']),
  ('design-assets', 'design-assets', true, 26214400,
   ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Intake: staff only, for every operation. No anon or non-staff policy exists,
-- so a guessed path reads nothing and a signed URL cannot be minted.
-- Writes also check the file extension, so the type rule holds in SQL too.
DROP POLICY IF EXISTS "design_assets_intake_staff_read" ON storage.objects;
CREATE POLICY "design_assets_intake_staff_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'design-assets-intake' AND public.is_staff());

DROP POLICY IF EXISTS "design_assets_intake_staff_insert" ON storage.objects;
CREATE POLICY "design_assets_intake_staff_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'design-assets-intake' AND public.is_staff()
              AND lower(storage.extension(name)) IN ('png', 'jpg', 'jpeg', 'webp', 'svg'));

DROP POLICY IF EXISTS "design_assets_intake_staff_update" ON storage.objects;
CREATE POLICY "design_assets_intake_staff_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'design-assets-intake' AND public.is_staff())
  WITH CHECK (bucket_id = 'design-assets-intake' AND public.is_staff()
              AND lower(storage.extension(name)) IN ('png', 'jpg', 'jpeg', 'webp', 'svg'));

DROP POLICY IF EXISTS "design_assets_intake_staff_delete" ON storage.objects;
CREATE POLICY "design_assets_intake_staff_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'design-assets-intake' AND public.is_staff());

-- Public library: a public bucket serves its files by URL with no SELECT
-- policy, so none is granted to anon: the library cannot be listed, only
-- fetched by a path the manifest names. Staff read (the Storage API needs it
-- to update or delete) and write.
DROP POLICY IF EXISTS "design_assets_public_read" ON storage.objects;

DROP POLICY IF EXISTS "design_assets_staff_read" ON storage.objects;
CREATE POLICY "design_assets_staff_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'design-assets' AND public.is_staff());

DROP POLICY IF EXISTS "design_assets_staff_insert" ON storage.objects;
CREATE POLICY "design_assets_staff_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'design-assets' AND public.is_staff()
              AND lower(storage.extension(name)) IN ('png', 'jpg', 'jpeg', 'webp', 'svg'));

DROP POLICY IF EXISTS "design_assets_staff_update" ON storage.objects;
CREATE POLICY "design_assets_staff_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'design-assets' AND public.is_staff())
  WITH CHECK (bucket_id = 'design-assets' AND public.is_staff()
              AND lower(storage.extension(name)) IN ('png', 'jpg', 'jpeg', 'webp', 'svg'));

DROP POLICY IF EXISTS "design_assets_staff_delete" ON storage.objects;
CREATE POLICY "design_assets_staff_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'design-assets' AND public.is_staff());

-- Restrictive backstops. Storage policies are permissive, so one broad policy
-- added later (an unscoped "authenticated may upload") would open these
-- buckets. A restrictive policy is ANDed with every permissive one: whatever
-- is added later, only staff touch intake, and only staff write the library.
-- Other buckets are unaffected (the bucket_id test passes them through), and
-- the sub-select makes is_staff() run once per statement, not once per row.
DROP POLICY IF EXISTS "design_assets_intake_only_staff" ON storage.objects;
CREATE POLICY "design_assets_intake_only_staff" ON storage.objects
  AS RESTRICTIVE FOR SELECT TO public
  USING (bucket_id <> 'design-assets-intake' OR (SELECT public.is_staff()));

DROP POLICY IF EXISTS "design_assets_insert_only_staff" ON storage.objects;
CREATE POLICY "design_assets_insert_only_staff" ON storage.objects
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (bucket_id NOT IN ('design-assets-intake', 'design-assets') OR (SELECT public.is_staff()));

DROP POLICY IF EXISTS "design_assets_update_only_staff" ON storage.objects;
CREATE POLICY "design_assets_update_only_staff" ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO public
  USING (bucket_id NOT IN ('design-assets-intake', 'design-assets') OR (SELECT public.is_staff()))
  WITH CHECK (bucket_id NOT IN ('design-assets-intake', 'design-assets') OR (SELECT public.is_staff()));

DROP POLICY IF EXISTS "design_assets_delete_only_staff" ON storage.objects;
CREATE POLICY "design_assets_delete_only_staff" ON storage.objects
  AS RESTRICTIVE FOR DELETE TO public
  USING (bucket_id NOT IN ('design-assets-intake', 'design-assets') OR (SELECT public.is_staff()));
