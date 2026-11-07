/*
  # Business Updates: 24-hour stories and announcements

  A business posts a short update (a new product or service, an offer, an
  announcement, an event, recent work) with text, photos or video. It is public
  for exactly 24 hours from the moment it goes live, then leaves every public
  surface and stays in the owner's private archive.

  Spec: docs/superpowers/specs/2026-10-31-business-updates-design.md

  ## Why expiry lives in RLS

  A scheduled job that "takes updates down" is a promise that holds only while
  the job runs. If it stalls, yesterday's offer is still on the page. So the
  public read policy filters on `expires_at > now()` itself, and `expires_at` is
  a GENERATED column (published_at + 24 hours): nobody, owner or client, can
  write it, so nobody can extend an update. The guard trigger also refuses to
  move `published_at` once an update has gone live, which is the other way an
  old update could be re-armed for another day.

  ## Why the media bucket is private

  A public bucket URL works forever. If the photos sat in business-images, a
  copied link would outlive the update by years. `business-updates` is private.
  Viewers get short-lived signed links, and signing runs the select policy
  below, which only matches media whose update is active right now. Members of
  the business can always read their own archive.

  ## Who may do what

  - Public: active, published, unhidden updates of a business they can see.
  - Any active member of the business: read everything, including drafts and
    the archive (is_business_member).
  - Owner, admin, and members with role manager, marketing or content_editor:
    write (has_business_role with update_publisher_roles()).
  - Admins only: moderation_status. A hidden update cannot be deleted by its
    owner, because it is kept for review.

  The lifecycle state (draft, scheduled, active, ended, hidden) is derived from
  the columns, never stored, so it cannot drift. business_update_state() and
  src/lib/businessUpdates.ts deriveUpdateState use the same order.

  Re-runnable: IF NOT EXISTS for tables and indexes, CREATE OR REPLACE for
  functions, DROP ... IF EXISTS before every policy and trigger, and the bucket
  insert is ON CONFLICT.
*/

-- 1. Small helpers ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_publisher_roles()
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ARRAY['manager', 'marketing', 'content_editor']::text[];
$$;

/*
  The business a storage path belongs to: '<business_id>/<update_id>/<file>'.
  Returns null for anything that is not a uuid, so a malformed name is simply
  refused by the policies instead of raising a cast error.
*/
CREATE OR REPLACE FUNCTION public.update_path_business(p_name text)
RETURNS uuid
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN split_part(p_name, '/', 1)::uuid
  END;
$$;

CREATE OR REPLACE FUNCTION public.business_update_state(
  p_published  timestamptz,
  p_expires    timestamptz,
  p_ended      timestamptz,
  p_moderation text,
  p_at         timestamptz
)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_moderation = 'hidden'                   THEN 'hidden'
    WHEN p_published IS NULL                       THEN 'draft'
    WHEN p_published > p_at                        THEN 'scheduled'
    WHEN p_ended IS NOT NULL                       THEN 'ended'
    WHEN p_expires IS NULL OR p_expires <= p_at    THEN 'ended'
    ELSE 'active'
  END;
$$;

/*
  published_at + 24 hours, declared IMMUTABLE so it can define a generated
  column. Postgres marks timestamptz + interval as STABLE because adding DAYS
  depends on the session time zone (a day across a DST change is 23 or 25
  hours). Adding HOURS is absolute time and does not depend on it, so for this
  fixed interval the result is the same in every session.
*/
CREATE OR REPLACE FUNCTION public.business_update_expiry(p_published timestamptz)
RETURNS timestamptz
LANGUAGE sql IMMUTABLE
AS $$
  SELECT p_published + interval '24 hours';
$$;

-- 2. Tables -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.business_updates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  author_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type              text NOT NULL,
  title             text NOT NULL DEFAULT '',
  body              text NOT NULL DEFAULT '',
  offer_id          uuid REFERENCES public.business_offers(id) ON DELETE SET NULL,
  event_starts_at   timestamptz,
  cta_label         text,
  cta_url           text,
  notify_keepers    boolean NOT NULL DEFAULT true,
  published_at      timestamptz,
  expires_at        timestamptz GENERATED ALWAYS AS (public.business_update_expiry(published_at)) STORED,
  ended_at          timestamptz,
  notified_at       timestamptz,
  moderation_status text NOT NULL DEFAULT 'ok',
  moderation_note   text,
  moderated_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  moderated_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.business_updates DROP CONSTRAINT IF EXISTS business_updates_type_check;
ALTER TABLE public.business_updates ADD CONSTRAINT business_updates_type_check
  CHECK (type IN ('new_product', 'new_service', 'offer', 'announcement', 'event', 'recent_work'));

ALTER TABLE public.business_updates DROP CONSTRAINT IF EXISTS business_updates_moderation_check;
ALTER TABLE public.business_updates ADD CONSTRAINT business_updates_moderation_check
  CHECK (moderation_status IN ('ok', 'hidden'));

ALTER TABLE public.business_updates DROP CONSTRAINT IF EXISTS business_updates_lengths_check;
ALTER TABLE public.business_updates ADD CONSTRAINT business_updates_lengths_check
  CHECK (char_length(title) <= 80
     AND char_length(body) <= 500
     AND (cta_label IS NULL OR char_length(cta_label) <= 30)
     AND (moderation_note IS NULL OR char_length(moderation_note) <= 500));

-- https:// or a path on NowOpen. No javascript:, no plain http.
ALTER TABLE public.business_updates DROP CONSTRAINT IF EXISTS business_updates_cta_url_check;
ALTER TABLE public.business_updates ADD CONSTRAINT business_updates_cta_url_check
  CHECK (cta_url IS NULL OR cta_url ~ '^(https://|/)');

COMMENT ON TABLE public.business_updates IS
  'Business Updates: public for exactly 24 hours from published_at, then private archive. Spec docs/superpowers/specs/2026-10-31-business-updates-design.md.';
COMMENT ON COLUMN public.business_updates.expires_at IS
  'Generated: published_at + 24 hours. Public reads filter expires_at > now(); nobody can extend an update.';
COMMENT ON COLUMN public.business_updates.published_at IS
  'Null = draft. In the future = scheduled. Locked once it has passed.';

CREATE INDEX IF NOT EXISTS idx_business_updates_business
  ON public.business_updates (business_id, created_at DESC);
-- Discover and the profile strip ask "what is live now?", newest first.
CREATE INDEX IF NOT EXISTS idx_business_updates_live
  ON public.business_updates (published_at DESC)
  WHERE ended_at IS NULL AND moderation_status = 'ok' AND published_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.business_update_media (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id    uuid NOT NULL REFERENCES public.business_updates(id) ON DELETE CASCADE,
  business_id  uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  position     smallint NOT NULL DEFAULT 0,
  kind         text NOT NULL,
  storage_path text NOT NULL,
  poster_path  text,
  width        integer,
  height       integer,
  duration_ms  integer,
  alt_text     text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.business_update_media DROP CONSTRAINT IF EXISTS business_update_media_kind_check;
ALTER TABLE public.business_update_media ADD CONSTRAINT business_update_media_kind_check
  CHECK (kind IN ('image', 'video'));

ALTER TABLE public.business_update_media DROP CONSTRAINT IF EXISTS business_update_media_limits_check;
ALTER TABLE public.business_update_media ADD CONSTRAINT business_update_media_limits_check
  CHECK ((duration_ms IS NULL OR duration_ms BETWEEN 0 AND 60000)
     AND (alt_text IS NULL OR char_length(alt_text) <= 200)
     AND position BETWEEN 0 AND 9);

COMMENT ON TABLE public.business_update_media IS
  'Photos and videos of a business update, stored in the private business-updates bucket at <business_id>/<update_id>/<file>.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_business_update_media_path
  ON public.business_update_media (storage_path);
CREATE INDEX IF NOT EXISTS idx_business_update_media_update
  ON public.business_update_media (update_id, position);

-- 3. The lifecycle guard ----------------------------------------------------------

/*
  Runs for web callers only (auth.role() anon or authenticated). Server jobs and
  direct SQL pass untouched, which is how the check script sets up past times.

  SECURITY DEFINER because two of its checks read rows the caller may not see
  under RLS: a marketing member cannot read business_offers (owner-only), and
  the media count must include every row.
*/
CREATE OR REPLACE FUNCTION public.guard_business_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_web        boolean := coalesce(auth.role(), '') IN ('anon', 'authenticated');
  v_admin      boolean := public.is_admin();
  v_publishing boolean := false;
  v_was_live   boolean := false;
  v_offer_released boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF v_web AND NOT v_admin AND OLD.moderation_status = 'hidden' THEN
      RAISE EXCEPTION 'This update was hidden by NowOpen and is kept for review.';
    END IF;
    RETURN OLD;
  END IF;

  IF NOT v_web THEN
    IF TG_OP = 'UPDATE' THEN NEW.updated_at := now(); END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.author_id         := auth.uid();
    NEW.notified_at       := NULL;
    NEW.ended_at          := NULL;
    NEW.moderation_status := 'ok';
    NEW.moderation_note   := NULL;
    NEW.moderated_by      := NULL;
    NEW.moderated_at      := NULL;
    v_publishing := NEW.published_at IS NOT NULL;
  ELSE
    -- id and created_at are identity: links already sent to keepers carry the id.
    NEW.id          := OLD.id;
    NEW.created_at  := OLD.created_at;
    NEW.updated_at  := now();
    NEW.author_id   := OLD.author_id;
    NEW.business_id := OLD.business_id;
    NEW.notified_at := OLD.notified_at;
    v_was_live := OLD.published_at IS NOT NULL AND OLD.published_at <= now();

    -- Deleting an offer runs the FK's SET NULL in the owner's own session. That
    -- is not an edit of the update, and refusing it would make an announced
    -- offer impossible to delete. The offer row is already gone by then.
    v_offer_released := OLD.offer_id IS NOT NULL AND NEW.offer_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.business_offers o WHERE o.id = OLD.offer_id);

    IF v_was_live AND NEW.published_at IS DISTINCT FROM OLD.published_at THEN
      RAISE EXCEPTION 'An update that has gone live cannot be re-published. Post it again instead.';
    END IF;

    IF v_was_live AND (
         NEW.title IS DISTINCT FROM OLD.title
      OR NEW.body IS DISTINCT FROM OLD.body
      OR NEW.type IS DISTINCT FROM OLD.type
      OR (NEW.offer_id IS DISTINCT FROM OLD.offer_id AND NOT v_offer_released)
      OR NEW.cta_label IS DISTINCT FROM OLD.cta_label
      OR NEW.cta_url IS DISTINCT FROM OLD.cta_url
      OR NEW.event_starts_at IS DISTINCT FROM OLD.event_starts_at
    ) THEN
      RAISE EXCEPTION 'A live update cannot be edited. End it and post again.';
    END IF;

    IF NEW.ended_at IS DISTINCT FROM OLD.ended_at THEN
      IF OLD.ended_at IS NOT NULL THEN
        RAISE EXCEPTION 'An ended update cannot be restarted. Post it again instead.';
      END IF;
      IF OLD.published_at IS NULL THEN
        RAISE EXCEPTION 'A draft cannot be ended. Delete it instead.';
      END IF;
      NEW.ended_at := now();
    END IF;

    IF NOT v_admin THEN
      NEW.moderation_status := OLD.moderation_status;
      NEW.moderation_note   := OLD.moderation_note;
      NEW.moderated_by      := OLD.moderated_by;
      NEW.moderated_at      := OLD.moderated_at;
    ELSIF NEW.moderation_status IS DISTINCT FROM OLD.moderation_status THEN
      NEW.moderated_by := auth.uid();
      NEW.moderated_at := now();
    END IF;

    v_publishing := NEW.published_at IS NOT NULL
                AND NEW.published_at IS DISTINCT FROM OLD.published_at;
  END IF;

  IF v_publishing THEN
    IF NEW.published_at < now() - interval '5 minutes' THEN
      RAISE EXCEPTION 'That time has already passed.';
    END IF;
    IF NEW.published_at > now() + interval '14 days' THEN
      RAISE EXCEPTION 'Schedule up to 14 days ahead.';
    END IF;
    IF coalesce(NEW.title, '') = '' AND coalesce(NEW.body, '') = ''
       AND NOT EXISTS (SELECT 1 FROM public.business_update_media m WHERE m.update_id = NEW.id) THEN
      RAISE EXCEPTION 'Add some text, a photo or a video.';
    END IF;
  END IF;

  -- An offer update must point at a real offer of the same business, checked
  -- whenever it is published or its offer changes. A scheduled offer update
  -- whose offer was deleted goes live as a plain announcement of it.
  IF NEW.type = 'offer' AND NEW.published_at IS NOT NULL AND NOT v_offer_released
     AND (v_publishing OR TG_OP = 'INSERT' OR NEW.offer_id IS DISTINCT FROM OLD.offer_id OR NEW.type IS DISTINCT FROM OLD.type) THEN
    IF NEW.offer_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.business_offers o
      WHERE o.id = NEW.offer_id AND o.business_id = NEW.business_id
    ) THEN
      RAISE EXCEPTION 'Choose the offer this update is about.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bu_10_guard ON public.business_updates;
CREATE TRIGGER trg_bu_10_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.business_updates
  FOR EACH ROW EXECUTE FUNCTION public.guard_business_update();

/*
  Media follow their update. The path and business checks apply to everyone,
  because a row pointing at another business's folder would let its owner sign
  someone else's files. The "live means fixed" rule applies to web callers.
  When the parent is already gone (a cascade delete), the row just goes.
*/
CREATE OR REPLACE FUNCTION public.guard_business_update_media()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_web       boolean := coalesce(auth.role(), '') IN ('anon', 'authenticated');
  v_update_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.update_id ELSE NEW.update_id END;
  v_parent    public.business_updates%ROWTYPE;
BEGIN
  SELECT * INTO v_parent FROM public.business_updates u WHERE u.id = v_update_id;
  IF NOT FOUND THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Update not found.';
  END IF;

  IF v_web AND v_parent.published_at IS NOT NULL AND v_parent.published_at <= now() THEN
    RAISE EXCEPTION 'Media cannot change once the update is live.';
  END IF;
  IF TG_OP = 'UPDATE' AND v_web AND OLD.update_id IS DISTINCT FROM NEW.update_id THEN
    RAISE EXCEPTION 'Media cannot move between updates.';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  IF NEW.business_id IS DISTINCT FROM v_parent.business_id THEN
    RAISE EXCEPTION 'Media must belong to the same business as its update.';
  END IF;
  IF left(NEW.storage_path, 74) IS DISTINCT FROM (NEW.business_id::text || '/' || NEW.update_id::text || '/')
     OR length(NEW.storage_path) <= 74
     OR (NEW.poster_path IS NOT NULL
         AND left(NEW.poster_path, 74) IS DISTINCT FROM (NEW.business_id::text || '/' || NEW.update_id::text || '/')) THEN
    RAISE EXCEPTION 'Media path must be <business_id>/<update_id>/<file>.';
  END IF;
  IF TG_OP = 'INSERT' AND (
    SELECT count(*) FROM public.business_update_media m WHERE m.update_id = NEW.update_id
  ) >= 10 THEN
    RAISE EXCEPTION 'Up to 10 photos or videos.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bum_10_guard ON public.business_update_media;
CREATE TRIGGER trg_bum_10_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.business_update_media
  FOR EACH ROW EXECUTE FUNCTION public.guard_business_update_media();

-- 4. RLS: updates -----------------------------------------------------------------

ALTER TABLE public.business_updates ENABLE ROW LEVEL SECURITY;

/*
  The gate. The EXISTS on businesses runs under the caller's own businesses
  policy, so an update from an unlisted or suspended business vanishes with it.
*/
DROP POLICY IF EXISTS "Public reads active updates" ON public.business_updates;
CREATE POLICY "Public reads active updates" ON public.business_updates
  FOR SELECT
  USING (
    published_at IS NOT NULL
    AND published_at <= now()
    AND expires_at > now()
    AND ended_at IS NULL
    AND moderation_status = 'ok'
    AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id)
  );

DROP POLICY IF EXISTS "Members read their updates" ON public.business_updates;
CREATE POLICY "Members read their updates" ON public.business_updates
  FOR SELECT TO authenticated
  USING (public.is_business_member(business_id));

DROP POLICY IF EXISTS "Publishers create updates" ON public.business_updates;
CREATE POLICY "Publishers create updates" ON public.business_updates
  FOR INSERT TO authenticated
  WITH CHECK (public.has_business_role(business_id, public.update_publisher_roles()));

DROP POLICY IF EXISTS "Publishers change updates" ON public.business_updates;
CREATE POLICY "Publishers change updates" ON public.business_updates
  FOR UPDATE TO authenticated
  USING (public.has_business_role(business_id, public.update_publisher_roles()))
  WITH CHECK (public.has_business_role(business_id, public.update_publisher_roles()));

DROP POLICY IF EXISTS "Publishers delete updates" ON public.business_updates;
CREATE POLICY "Publishers delete updates" ON public.business_updates
  FOR DELETE TO authenticated
  USING (public.has_business_role(business_id, public.update_publisher_roles()));

-- 5. RLS: media -------------------------------------------------------------------

ALTER TABLE public.business_update_media ENABLE ROW LEVEL SECURITY;

-- This EXISTS runs under the caller's RLS on business_updates, which is the
-- point: for the public it only matches an update that is active right now.
DROP POLICY IF EXISTS "Public reads active update media" ON public.business_update_media;
CREATE POLICY "Public reads active update media" ON public.business_update_media
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.business_updates u WHERE u.id = update_id));

DROP POLICY IF EXISTS "Members read their update media" ON public.business_update_media;
CREATE POLICY "Members read their update media" ON public.business_update_media
  FOR SELECT TO authenticated
  USING (public.is_business_member(business_id));

DROP POLICY IF EXISTS "Publishers manage update media" ON public.business_update_media;
CREATE POLICY "Publishers manage update media" ON public.business_update_media
  FOR ALL TO authenticated
  USING (public.has_business_role(business_id, public.update_publisher_roles()))
  WITH CHECK (public.has_business_role(business_id, public.update_publisher_roles()));

-- 6. Storage ----------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('business-updates', 'business-updates', false, 52428800,
        ARRAY['image/webp', 'image/jpeg', 'image/png', 'video/mp4', 'video/webm'])
ON CONFLICT (id) DO UPDATE SET
  public             = false,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

/*
  Signing a link runs this select policy. Members read their whole archive;
  everyone else reads a file only while a media row for it is visible to them,
  which under the media policy means its update is active right now.
*/
DROP POLICY IF EXISTS "business_updates_read" ON storage.objects;
CREATE POLICY "business_updates_read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'business-updates'
    AND (
      public.is_business_member(public.update_path_business(name))
      OR EXISTS (
        SELECT 1 FROM public.business_update_media m
        WHERE m.storage_path = name OR m.poster_path = name
      )
    )
  );

/*
  Whether the caller may write a file at this path. Writing is allowed only
  while the update behind the folder is a draft or scheduled: once it is live,
  the files keepers were told about are fixed, and a hidden update's files are
  kept for review. A folder with no update behind it takes no uploads, so the
  bucket cannot be used as free storage. Deleting is also allowed once an
  update has ended (cleanup), and for files whose update row is already gone.

  SECURITY DEFINER so it can read the update row whatever the caller's RLS;
  it decides only for the caller's own businesses (has_business_role).
*/
CREATE OR REPLACE FUNCTION public.update_storage_writable(p_name text, p_for_delete boolean)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_biz uuid := public.update_path_business(p_name);
  v_seg text := split_part(p_name, '/', 2);
  v_row public.business_updates%ROWTYPE;
BEGIN
  IF coalesce(auth.role(), '') <> 'authenticated' THEN RETURN false; END IF;
  IF v_biz IS NULL
     OR v_seg !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR NOT public.has_business_role(v_biz, public.update_publisher_roles()) THEN
    RETURN false;
  END IF;

  SELECT * INTO v_row FROM public.business_updates u WHERE u.id = v_seg::uuid;
  IF NOT FOUND THEN RETURN p_for_delete; END IF;
  IF v_row.business_id <> v_biz OR v_row.moderation_status = 'hidden' THEN RETURN false; END IF;
  IF v_row.published_at IS NULL OR v_row.published_at > now() THEN RETURN true; END IF;
  RETURN p_for_delete
     AND (v_row.ended_at IS NOT NULL OR public.business_update_expiry(v_row.published_at) <= now());
END;
$$;

DROP POLICY IF EXISTS "business_updates_upload" ON storage.objects;
CREATE POLICY "business_updates_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'business-updates' AND public.update_storage_writable(name, false));

DROP POLICY IF EXISTS "business_updates_change" ON storage.objects;
CREATE POLICY "business_updates_change" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'business-updates' AND public.update_storage_writable(name, false))
  WITH CHECK (bucket_id = 'business-updates' AND public.update_storage_writable(name, false));

DROP POLICY IF EXISTS "business_updates_remove" ON storage.objects;
CREATE POLICY "business_updates_remove" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'business-updates' AND public.update_storage_writable(name, true));
