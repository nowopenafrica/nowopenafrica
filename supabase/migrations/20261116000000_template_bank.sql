/*
  # Template Bank

  Templates were code: adding one meant editing designTemplates.ts and
  deploying. This is the table the Create 2.0 audit asked for, so a reviewed
  layout can be added, versioned and withdrawn from admin.

  ## What a row is

  `definition` is a native DesignTemplate, the same data shape the built-in
  catalogue uses, so an imported template is editable, restylable and resizable
  exactly like a built-in one. `meta` is everything else from the package.

  ## The quality gate lives here, not in the client

  A template is published only while it is approved AND a reviewer has recorded
  a score of 80 or more. That is a CHECK constraint, so no screen, script or
  future code path can publish an unreviewed layout by forgetting to ask.

  A score that arrives inside a package is the author's claim about their own
  work. It is kept in `meta` and shown as provisional; it is never copied into
  `review_score`. Only review_template() writes that column.

  ## Import is one transaction

  import_template_collection() inserts the collection and every template, or
  nothing. A package that fails halfway leaves no rows behind.

  Re-runnable.
*/

CREATE TABLE IF NOT EXISTS public.design_template_collections (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  version        text NOT NULL,
  /* SHA-256 of the uploaded ZIP, so the same file cannot be imported twice. */
  checksum       text NOT NULL UNIQUE,
  template_count integer NOT NULL DEFAULT 0,
  imported_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_at    timestamptz NOT NULL DEFAULT now(),
  published_at   timestamptz
);

CREATE TABLE IF NOT EXISTS public.design_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES public.design_template_collections(id) ON DELETE CASCADE,
  template_id   text NOT NULL,
  key           text NOT NULL CHECK (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  version       integer NOT NULL CHECK (version >= 1),
  division      text NOT NULL,
  category      text NOT NULL,
  definition    jsonb NOT NULL,
  meta          jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_status text NOT NULL DEFAULT 'pending'
                CHECK (review_status IN ('pending', 'approved', 'rejected')),
  review_score  integer CHECK (review_score BETWEEN 0 AND 100),
  review_scores jsonb,
  review_note   text,
  reviewed_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at   timestamptz,
  published     boolean NOT NULL DEFAULT false,
  published_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (key, version),
  CONSTRAINT design_templates_publish_gate CHECK (
    NOT published OR (review_status = 'approved' AND review_score IS NOT NULL AND review_score >= 80)
  )
);

/* One live version per key: the product resolves a template by key alone. */
CREATE UNIQUE INDEX IF NOT EXISTS design_templates_one_live_version
  ON public.design_templates (key) WHERE published;

CREATE INDEX IF NOT EXISTS design_templates_collection_idx
  ON public.design_templates (collection_id);

ALTER TABLE public.design_template_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage template collections" ON public.design_template_collections;
CREATE POLICY "Admins manage template collections" ON public.design_template_collections
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

/*
  Published templates are public: the Create gallery is public and renders
  them before anybody signs in. Unpublished rows are admin-only.
*/
DROP POLICY IF EXISTS "Published templates are public" ON public.design_templates;
CREATE POLICY "Published templates are public" ON public.design_templates
  FOR SELECT USING (published);

DROP POLICY IF EXISTS "Admins manage templates" ON public.design_templates;
CREATE POLICY "Admins manage templates" ON public.design_templates
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

/*
  Import a validated package. The client validates first and sends only what
  passed; this re-checks what the database can check and writes all or nothing.
*/
CREATE OR REPLACE FUNCTION public.import_template_collection(
  p_name text, p_version text, p_checksum text, p_templates jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_collection uuid;
  v_item jsonb;
  v_count integer := 0;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF jsonb_typeof(p_templates) <> 'array' OR jsonb_array_length(p_templates) = 0 THEN
    RAISE EXCEPTION 'The package holds no templates';
  END IF;
  IF EXISTS (SELECT 1 FROM public.design_template_collections WHERE checksum = p_checksum) THEN
    RAISE EXCEPTION 'This exact package has already been imported';
  END IF;

  INSERT INTO public.design_template_collections (name, version, checksum, imported_by)
  VALUES (p_name, p_version, p_checksum, auth.uid())
  RETURNING id INTO v_collection;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_templates) LOOP
    IF v_item->'definition'->>'key' IS DISTINCT FROM v_item->>'key' THEN
      RAISE EXCEPTION 'Template % does not match its own definition', v_item->>'key';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.design_templates
       WHERE key = v_item->>'key' AND version >= (v_item->>'version')::integer
    ) THEN
      RAISE EXCEPTION 'Template % version % is not newer than the one in the bank',
        v_item->>'key', v_item->>'version';
    END IF;

    INSERT INTO public.design_templates
      (collection_id, template_id, key, version, division, category, definition, meta)
    VALUES (
      v_collection, v_item->>'id', v_item->>'key', (v_item->>'version')::integer,
      v_item->>'division', v_item->>'category',
      v_item->'definition', v_item - 'definition'
    );
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.design_template_collections SET template_count = v_count WHERE id = v_collection;
  RETURN v_collection;
END;
$$;
GRANT EXECUTE ON FUNCTION public.import_template_collection(text, text, text, jsonb) TO authenticated;

/*
  Record a review. Rejecting, or scoring below the gate, withdraws the template
  in the same statement so the CHECK constraint is never the thing that fails.
*/
CREATE OR REPLACE FUNCTION public.review_template(
  p_id uuid, p_status text, p_score integer, p_scores jsonb, p_note text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF p_status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Unknown review status: %', p_status;
  END IF;
  IF p_status = 'approved' AND (p_score IS NULL OR p_score < 80) THEN
    RAISE EXCEPTION 'A template needs a recorded score of 80 or more to be approved';
  END IF;

  UPDATE public.design_templates
     SET review_status = p_status,
         review_score = p_score,
         review_scores = p_scores,
         review_note = p_note,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         published = published AND p_status = 'approved',
         published_at = CASE WHEN published AND p_status = 'approved' THEN published_at END
   WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such template'; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.review_template(uuid, text, integer, jsonb, text) TO authenticated;

/*
  Publish every approved template in a collection, retiring the older live
  version of each key in the same transaction. Returns how many went live.
*/
CREATE OR REPLACE FUNCTION public.publish_template_collection(p_collection uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;

  UPDATE public.design_templates old
     SET published = false, published_at = NULL
    FROM public.design_templates fresh
   WHERE fresh.collection_id = p_collection
     AND fresh.review_status = 'approved' AND fresh.review_score >= 80
     AND old.key = fresh.key AND old.id <> fresh.id AND old.published;

  UPDATE public.design_templates
     SET published = true, published_at = now()
   WHERE collection_id = p_collection
     AND review_status = 'approved' AND review_score >= 80
     AND NOT published;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    UPDATE public.design_template_collections SET published_at = now() WHERE id = p_collection;
  END IF;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.publish_template_collection(uuid) TO authenticated;

/* Withdraw one template from the live library. It keeps its review. */
CREATE OR REPLACE FUNCTION public.unpublish_template(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  UPDATE public.design_templates SET published = false, published_at = NULL WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such template'; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.unpublish_template(uuid) TO authenticated;
