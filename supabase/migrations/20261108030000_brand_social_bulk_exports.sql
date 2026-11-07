-- Brand social: hand approved posts to Zoho through its Bulk Scheduler file.
--
-- Zoho Flow's Zoho Social connection fails for this account (channel lookup
-- answers INVALID_OAUTHSCOPE; checked 2026-10-29), so the automatic route is
-- parked. Zoho Social's Bulk Scheduler (upload a file, review, schedule) is
-- its own supported way in. The admin screen builds the file; this records
-- what was handed over, honestly, in two steps:
--
--   1. downloaded  an admin downloaded a file; which posts and channels it held
--   2. uploaded    the admin says the team uploaded it to Zoho. Only then are
--                  the posts marked as handed to Zoho.
--
-- Step 2 goes through one SECURITY DEFINER function. The column guards on
-- brand_social_content/variants stop people from marking anything sent; this
-- function is the single exception, it re-checks is_admin(), only touches
-- posts that are still approved, and the audit triggers record every change.

CREATE TABLE IF NOT EXISTS public.brand_social_exports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name     text NOT NULL,
  -- [{content_id, variant_id, channel, code}] for every row in the file.
  rows          jsonb NOT NULL CHECK (jsonb_typeof(rows) = 'array'),
  row_count     int NOT NULL CHECK (row_count >= 0),
  downloaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  downloaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at   timestamptz
);

ALTER TABLE public.brand_social_exports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read brand_social_exports" ON public.brand_social_exports;
CREATE POLICY "Admins read brand_social_exports" ON public.brand_social_exports
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Admins record brand_social_exports" ON public.brand_social_exports;
CREATE POLICY "Admins record brand_social_exports" ON public.brand_social_exports
  FOR INSERT TO authenticated WITH CHECK (public.is_admin() AND uploaded_at IS NULL AND uploaded_by IS NULL);
-- No UPDATE or DELETE policy: marking uploaded happens only in the function below.

-- The guards let a trusted, transaction-local flag through. Only functions in
-- this file set it; PostgREST does not expose set_config, so a client cannot.
CREATE OR REPLACE FUNCTION public.guard_brand_social_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF auth.uid() IS NULL OR current_setting('brand_social.trusted', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft','in_review') THEN NEW.status := 'draft'; END IF;
    NEW.approved_by := NULL; NEW.approved_at := NULL;
    NEW.created_by := auth.uid();
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('sending','sent','failed') THEN
      RAISE EXCEPTION 'Only the dispatcher can mark a post %', NEW.status;
    END IF;
    IF OLD.status IN ('sending','sent') THEN
      RAISE EXCEPTION 'This post has already gone to Zoho and cannot be changed here';
    END IF;
    IF NEW.status = 'approved' THEN
      NEW.approved_by := auth.uid();
      NEW.approved_at := now();
    ELSE
      NEW.approved_by := NULL; NEW.approved_at := NULL;
    END IF;
  ELSE
    NEW.approved_by := OLD.approved_by;
    NEW.approved_at := OLD.approved_at;
  END IF;

  IF OLD.status = 'approved' AND NEW.status = 'approved'
     AND (NEW.caption IS DISTINCT FROM OLD.caption OR NEW.media_url IS DISTINCT FROM OLD.media_url
          OR NEW.destination_url IS DISTINCT FROM OLD.destination_url OR NEW.planned_at IS DISTINCT FROM OLD.planned_at) THEN
    NEW.status := 'in_review'; NEW.approved_by := NULL; NEW.approved_at := NULL;
  END IF;

  NEW.created_by := OLD.created_by;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_brand_social_variant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE parent_status text;
BEGIN
  NEW.updated_at := now();
  IF auth.uid() IS NULL OR current_setting('brand_social.trusted', true) = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT status INTO parent_status FROM public.brand_social_content WHERE id = NEW.content_id;
  IF parent_status IN ('sending','sent') THEN
    RAISE EXCEPTION 'This post has already gone to Zoho and cannot be changed here';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.dispatch_status := 'pending'; NEW.attempts := 0; NEW.last_error := NULL;
    NEW.sent_at := NULL; NEW.zoho_reference := NULL; NEW.zoho_confirmed_at := NULL;
    IF parent_status = 'approved' THEN
      UPDATE public.brand_social_content SET status = 'in_review' WHERE id = NEW.content_id;
    END IF;
    RETURN NEW;
  END IF;

  NEW.dispatch_status   := OLD.dispatch_status;
  NEW.dispatch_key      := OLD.dispatch_key;
  NEW.attempts          := OLD.attempts;
  NEW.last_error        := OLD.last_error;
  NEW.sent_at           := OLD.sent_at;
  NEW.zoho_reference    := OLD.zoho_reference;
  NEW.zoho_confirmed_at := OLD.zoho_confirmed_at;

  IF parent_status = 'approved' AND NEW.caption IS DISTINCT FROM OLD.caption THEN
    UPDATE public.brand_social_content SET status = 'in_review' WHERE id = NEW.content_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Mark a downloaded file as uploaded to Zoho. Returns how many channel rows
-- were marked. A post that was edited or un-approved since the download is
-- left alone: what goes to Zoho must be what was approved.
CREATE OR REPLACE FUNCTION public.brand_social_mark_uploaded(p_export_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ex public.brand_social_exports;
  marked int := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  SELECT * INTO ex FROM public.brand_social_exports WHERE id = p_export_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such export'; END IF;
  IF ex.uploaded_at IS NOT NULL THEN RAISE EXCEPTION 'Already marked as uploaded'; END IF;

  PERFORM set_config('brand_social.trusted', 'on', true);

  WITH r AS (
    SELECT (e->>'variant_id')::uuid AS variant_id, (e->>'content_id')::uuid AS content_id
    FROM jsonb_array_elements(ex.rows) e
  ), ok AS (
    UPDATE public.brand_social_variants v
       SET dispatch_status = 'sent',
           sent_at = now(),
           last_error = NULL,
           zoho_reference = 'Zoho bulk file ' || ex.file_name
      FROM r, public.brand_social_content c
     WHERE v.id = r.variant_id AND c.id = r.content_id AND v.content_id = c.id
       AND c.status = 'approved' AND v.dispatch_status <> 'sent'
    RETURNING v.content_id
  )
  SELECT count(*) INTO marked FROM ok;

  -- A post is handed over once every one of its channels is.
  UPDATE public.brand_social_content c
     SET status = 'sent'
   WHERE c.status = 'approved'
     AND c.id IN (SELECT (e->>'content_id')::uuid FROM jsonb_array_elements(ex.rows) e)
     AND NOT EXISTS (SELECT 1 FROM public.brand_social_variants v WHERE v.content_id = c.id AND v.dispatch_status <> 'sent');

  UPDATE public.brand_social_exports SET uploaded_at = now(), uploaded_by = auth.uid() WHERE id = p_export_id;

  PERFORM set_config('brand_social.trusted', 'off', true);
  RETURN marked;
END;
$$;

REVOKE ALL ON FUNCTION public.brand_social_mark_uploaded(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brand_social_mark_uploaded(uuid) TO authenticated;
