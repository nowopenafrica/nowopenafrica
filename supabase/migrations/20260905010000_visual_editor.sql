/*
  # Visual Editor storage

  Stores OVERRIDES ONLY. The copy written in each React component is the
  default and always renders; a row here replaces one declared slot. Delete
  every row in this file's tables and the site renders exactly as the code says
  — which is what makes adopting a page a safe, reversible act, and what makes a
  database outage invisible on a marketing page.

  See docs/visual-editor-audit.md for why this is an overlay and not a page
  builder.

  THREE TABLES, because the difference between them is a permission boundary:

    page_content          what the public sees. Readable by everyone.
    page_content_draft    work in progress. Staff only — an unannounced price
                          change or campaign line must not be readable by
                          anyone who can call the REST API before it goes live.
    page_content_versions history. Staff only.

  Splitting draft out is deliberate. Postgres RLS is row-level, so a single
  table with a `draft` column could not be public-readable and staff-readable at
  once without column grants, and column grants cannot tell a staff member from
  any other signed-in user — every one of them is the `authenticated` role.

  NOBODY WRITES page_content DIRECTLY. It has no INSERT or UPDATE policy at all.
  Publishing goes through publish_page(), so every change to the live site
  writes a version row and an audit entry in the same transaction. A publish
  that is not recorded is not possible, rather than merely discouraged.

  WHAT THIS CANNOT REACH: business records, verification, trust claims, Open Now,
  prices, plans, bookings, customer data, canonical URLs, robots directives,
  JSON-LD or sitemap membership. Not by policy — by absence. The editable
  surface is the slot registry in src/lib/visualEditor/registry.ts, and nothing
  else on the platform declares a slot.
*/

-- 1. Published content --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.page_content (
  page          text PRIMARY KEY,
  content       jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at  timestamptz NOT NULL DEFAULT now(),
  published_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.page_content ENABLE ROW LEVEL SECURITY;

-- Readable by everyone, signed in or not: this IS the public site.
DROP POLICY IF EXISTS "page_content_public_read" ON public.page_content;
CREATE POLICY "page_content_public_read"
  ON public.page_content FOR SELECT
  USING (true);

-- No write policy, on purpose. See publish_page().

-- 2. Draft --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.page_content_draft (
  page        text PRIMARY KEY,
  content     jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.page_content_draft ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "page_content_draft_staff" ON public.page_content_draft;
CREATE POLICY "page_content_draft_staff"
  ON public.page_content_draft FOR ALL
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- 3. History ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.page_content_versions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page        text NOT NULL,
  content     jsonb NOT NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_page_versions_page
  ON public.page_content_versions (page, created_at DESC);

ALTER TABLE public.page_content_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "page_content_versions_staff_read" ON public.page_content_versions;
CREATE POLICY "page_content_versions_staff_read"
  ON public.page_content_versions FOR SELECT
  TO authenticated
  USING (public.is_staff());

-- Inserted only by publish_page(). No INSERT policy.

-- 4. Save a draft -------------------------------------------------------------
-- SECURITY DEFINER is not strictly needed here (the draft table has a staff
-- policy), but routing every write through one function keeps the shape of
-- "who may change content" in one readable place.
CREATE OR REPLACE FUNCTION public.save_page_draft(p_page text, p_content jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Staff only';
  END IF;
  IF p_page IS NULL OR btrim(p_page) = '' THEN
    RAISE EXCEPTION 'A page key is required';
  END IF;
  IF jsonb_typeof(p_content) <> 'object' THEN
    RAISE EXCEPTION 'Content must be a JSON object of slot overrides';
  END IF;

  INSERT INTO public.page_content_draft (page, content, updated_at, updated_by)
  VALUES (p_page, p_content, now(), auth.uid())
  ON CONFLICT (page) DO UPDATE
    SET content = EXCLUDED.content,
        updated_at = now(),
        updated_by = auth.uid();
END;
$$;

-- 5. Publish ------------------------------------------------------------------
-- The only way content reaches the public site. Records a version and an audit
-- entry in the same transaction, so the live site and its history cannot drift.
CREATE OR REPLACE FUNCTION public.publish_page(p_page text, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_content jsonb;
  v_actor   uuid := auth.uid();
  v_email   text;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Staff only';
  END IF;

  SELECT content INTO v_content FROM public.page_content_draft WHERE page = p_page;
  IF v_content IS NULL THEN
    RAISE EXCEPTION 'There is no draft for "%" to publish', p_page;
  END IF;

  INSERT INTO public.page_content (page, content, published_at, published_by)
  VALUES (p_page, v_content, now(), v_actor)
  ON CONFLICT (page) DO UPDATE
    SET content = EXCLUDED.content,
        published_at = now(),
        published_by = v_actor;

  INSERT INTO public.page_content_versions (page, content, note, created_by)
  VALUES (p_page, v_content, p_note, v_actor);

  -- Server-side, so a publish made through the API rather than the console is
  -- still recorded. The admin UI's own logging cannot make that guarantee.
  SELECT email INTO v_email FROM auth.users WHERE id = v_actor;
  INSERT INTO public.audit_log (actor_id, actor_email, action, entity_type, entity_id, detail)
  VALUES (v_actor, v_email, 'publish', 'page_content', p_page,
          jsonb_build_object('slots', (SELECT count(*) FROM jsonb_object_keys(v_content)),
                             'note', p_note));

  RETURN jsonb_build_object('page', p_page, 'published_at', now());
END;
$$;

-- 6. Revert -------------------------------------------------------------------
-- Restores an old version INTO THE DRAFT, not straight onto the site. A revert
-- is a proposal like any other edit; it still has to be looked at and published.
CREATE OR REPLACE FUNCTION public.revert_page_draft(p_version_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_page text; v_content jsonb;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Staff only';
  END IF;

  SELECT page, content INTO v_page, v_content
  FROM public.page_content_versions WHERE id = p_version_id;
  IF v_page IS NULL THEN
    RAISE EXCEPTION 'No such version';
  END IF;

  INSERT INTO public.page_content_draft (page, content, updated_at, updated_by)
  VALUES (v_page, v_content, now(), auth.uid())
  ON CONFLICT (page) DO UPDATE
    SET content = EXCLUDED.content, updated_at = now(), updated_by = auth.uid();

  RETURN jsonb_build_object('page', v_page, 'restored_to_draft', true);
END;
$$;

-- 7. Discard the draft --------------------------------------------------------
-- Back to whatever is live. Does not touch the public site.
CREATE OR REPLACE FUNCTION public.discard_page_draft(p_page text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Staff only';
  END IF;

  INSERT INTO public.page_content_draft (page, content, updated_at, updated_by)
  SELECT p_page, COALESCE((SELECT content FROM public.page_content WHERE page = p_page), '{}'::jsonb),
         now(), auth.uid()
  ON CONFLICT (page) DO UPDATE
    SET content = EXCLUDED.content, updated_at = now(), updated_by = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_page_draft(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_page(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revert_page_draft(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.discard_page_draft(text) TO authenticated;

-- After applying, confirm the boundary holds:
--   as anon:  select * from page_content;         -> rows
--             select * from page_content_draft;   -> 0 rows
--             select publish_page('about');       -> ERROR: Staff only
