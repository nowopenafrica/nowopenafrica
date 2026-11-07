-- Partner portal: a NowOpen business can act as a media owner (documents,
-- verification, placements, claims, imports), with every rule enforced here.
--
-- Spec: docs/superpowers/specs/2026-11-01-partner-portal-design.md
-- Builds on 20261109010000_placement_trust.sql and
-- 20261109020000_placement_trust_v2.sql (both applied; not edited).
--
-- WHAT THIS ADDS
--
--   media_owner_documents    registration and site-proof uploads, per owner
--   placement_claims         "this is my site" requests; one pending per placement
--   placement_imports        spreadsheet import history, per owner
--   advertisements           + pending_review lifecycle, size_spec, rate_amount,
--                            rate_period, media_urls, site_address. The
--                            rate's currency is
--                            the existing currency column (NOT NULL, default
--                            'NGN'); no second currency column.
--   media_owners             one owner per business (partial unique index);
--                            members read their owner through
--                            get_my_media_owner (selected columns only)
--   placement_availability   + notified_at (expiry notice sent once)
--   owner RPCs               enable_media_owner, submit_owner_verification,
--                            owner_create_placement, owner_update_placement,
--                            owner_record_availability, owner_claim_placement,
--                            owner_verification_reason, get_my_media_owner
--   admin RPCs               admin_review_placement, admin_decide_claim,
--                            admin_reject_owner
--   storage                  verification-docs media-owners/{owner_id}/ and
--                            business-images placements/{advert_id}/
--   expiry notices           dispatch_confirmation_expiry_notices, pg_cron
--                            every 15 minutes
--
-- HOW AN OWNER WRITES WITHOUT BEING ABLE TO PROMOTE THEMSELVES
--
-- placement_trust_guard refuses every non-admin web caller who sets a
-- placement's owner or lifecycle, and the audit triggers refuse them again.
-- The owner functions below are the one exception. They set the
-- transaction-local flag nowopen.owner_write around exactly one write, after
-- their own checks, and clear it straight after. The same pattern as
-- brand_social.trusted (20261108030000_brand_social_bulk_exports.sql):
-- PostgREST does not expose set_config, so a client cannot set the flag. Even
-- with the flag, the guard only accepts an INSERT whose owner_role is 'owner'
-- and whose lifecycle is pending_review or partner_verified, and
-- partner_verified still needs a verified owner whoever calls.
--
-- Those trigger functions are replaced here (CREATE OR REPLACE, same
-- signatures). Each keeps its v1 body; the only change is the flag, plus the
-- promotion on verify in media_owner_after_write.
--
-- AUTH PATTERN (as everywhere in this repo): guard on auth.role(), never
-- current_user, which inside a SECURITY DEFINER function is the function
-- owner and refuses nobody. A no-JWT caller (service_role, SQL editor,
-- pg_cron) is let through: it can already write the tables directly.
--
-- OWNER-CREATED PLACEMENTS STORE user_id = NULL
--
-- The legacy user_id policies (AdvertForm's own rows) never reach an owned
-- placement: every advertisements UPDATE and DELETE policy keyed on user_id,
-- the two in the repo and the two that exist only on live ("Users can update
-- own advertisements", "Users can delete own advertisements"), is narrowed to
-- owner_id IS NULL, and owner rows carry no user_id at all. The owner portal
-- lists placements by owner_id. Owned rows change only through the owner
-- functions or an admin.
--
-- NOTE FOR TASK 3 (client): there is no member UPDATE policy on
-- verification-docs, on purpose (evidence stays as filed). Upload owner
-- documents with upsert: false and a unique path
-- (media-owners/{owner_id}/{kind}-{timestamp}.{ext}); upsert: true on an
-- existing path fails.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--
--   * It does not narrow "Public can view advertisements" (USING true):
--     pending_review rows stay readable from the table, as rejected and
--     archived ones already are. Public surfaces read placement_trust or
--     filter with isListedPlacement (src/lib/promote/trust.ts), which must
--     learn pending_review in the client tasks.
--   * It does not touch "Admins can manage advertisements".
--   * Nothing is applied by this file's author. The controller applies it
--     with the founder's go-ahead: dry run, apply, ledger, then
--     scripts/check-partner-portal.sql (Task 2).
--
-- Idempotent. Line comments only: Postgres block comments nest.

-- ---------------------------------------------------------------------------
-- 1. advertisements: pending_review, structured size, the owner's own rate
-- ---------------------------------------------------------------------------

ALTER TABLE public.advertisements DROP CONSTRAINT IF EXISTS advertisements_lifecycle_check;
ALTER TABLE public.advertisements ADD CONSTRAINT advertisements_lifecycle_check
  CHECK (lifecycle IN ('discovered', 'imported', 'pending_review', 'partner_supplied', 'partner_verified', 'rejected', 'archived'));

-- media_urls is read by the client (src/types/index.ts) and is an owner-
-- editable field in spec section 5, but no migration created it. IF NOT
-- EXISTS makes this a no-op if the live table already has it.
ALTER TABLE public.advertisements
  ADD COLUMN IF NOT EXISTS size_spec jsonb,
  ADD COLUMN IF NOT EXISTS rate_amount numeric,
  ADD COLUMN IF NOT EXISTS rate_period text,
  ADD COLUMN IF NOT EXISTS media_urls text[],
  -- The street, landmark or address of an owner's site. location stays
  -- "City, Country" (Promote's city filter reads its first comma segment,
  -- and all live rows have that shape), so the address never goes there.
  ADD COLUMN IF NOT EXISTS site_address text;

ALTER TABLE public.advertisements DROP CONSTRAINT IF EXISTS advertisements_rate_period_check;
ALTER TABLE public.advertisements ADD CONSTRAINT advertisements_rate_period_check
  CHECK (rate_period IS NULL OR rate_period IN ('day', 'week', 'month'));

ALTER TABLE public.advertisements DROP CONSTRAINT IF EXISTS advertisements_rate_amount_nonnegative;
ALTER TABLE public.advertisements ADD CONSTRAINT advertisements_rate_amount_nonnegative
  CHECK (rate_amount IS NULL OR rate_amount >= 0);

-- A rate has a period. Its currency is the existing currency column, which
-- is NOT NULL, so a rate always has one; the owner functions check its
-- format (no new constraint on a column live rows already fill).
ALTER TABLE public.advertisements DROP CONSTRAINT IF EXISTS advertisements_rate_complete;
ALTER TABLE public.advertisements ADD CONSTRAINT advertisements_rate_complete
  CHECK (rate_amount IS NULL OR rate_period IS NOT NULL);

-- The kinds mirror SizeSpec (src/lib/promote/sizeSpec.ts, Task 4).
ALTER TABLE public.advertisements DROP CONSTRAINT IF EXISTS advertisements_size_spec_kind;
ALTER TABLE public.advertisements ADD CONSTRAINT advertisements_size_spec_kind
  CHECK (size_spec IS NULL OR (jsonb_typeof(size_spec) = 'object'
         AND size_spec ->> 'kind' IN ('area', 'screen', 'airtime', 'vehicle', 'other')));

COMMENT ON COLUMN public.advertisements.rate_amount IS
  'The owner''s own rate, in currency per rate_period. pricing (USD per day) is derived from it at save time.';

-- ---------------------------------------------------------------------------
-- 2. One media owner per business
-- ---------------------------------------------------------------------------

-- If the live table ever holds two owners for one business this fails loudly
-- on apply, which is the right time to find out (the dry run will say).
CREATE UNIQUE INDEX IF NOT EXISTS media_owners_one_per_business
  ON public.media_owners (business_id) WHERE business_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Documents, claims, imports
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.media_owner_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL REFERENCES public.media_owners(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('registration', 'signage_permit', 'rate_card', 'authorisation_letter')),
  storage_path text NOT NULL,
  uploaded_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  uploaded_at  timestamptz NOT NULL DEFAULT now(),
  -- A row can only point inside its own owner's folder, so a member cannot
  -- record another owner's file as their evidence.
  CONSTRAINT media_owner_documents_own_folder
    CHECK (storage_path LIKE 'media-owners/' || owner_id::text || '/%')
);

CREATE INDEX IF NOT EXISTS idx_media_owner_documents_owner
  ON public.media_owner_documents (owner_id, uploaded_at DESC);

CREATE TABLE IF NOT EXISTS public.placement_claims (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advert_id     uuid NOT NULL REFERENCES public.advertisements(id) ON DELETE CASCADE,
  owner_id      uuid NOT NULL REFERENCES public.media_owners(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('owner', 'authorised_representative')),
  statement     text NOT NULL CHECK (btrim(statement) <> ''),
  document_path text,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at    timestamptz,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- A representative shows the owner's signed authorisation letter.
  CONSTRAINT placement_claims_representative_document
    CHECK (role <> 'authorised_representative' OR btrim(coalesce(document_path, '')) <> ''),
  CONSTRAINT placement_claims_document_own_folder
    CHECK (document_path IS NULL OR document_path LIKE 'media-owners/' || owner_id::text || '/%'),
  CONSTRAINT placement_claims_decided_has_time
    CHECK (status = 'pending' OR decided_at IS NOT NULL),
  -- The owner sees the reason; a rejection without one tells them nothing.
  CONSTRAINT placement_claims_rejected_has_reason
    CHECK (status <> 'rejected' OR btrim(coalesce(reason, '')) <> '')
);

-- Two owners claiming the same site at once: the second waits for the first
-- decision.
CREATE UNIQUE INDEX IF NOT EXISTS placement_claims_one_pending
  ON public.placement_claims (advert_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_placement_claims_owner
  ON public.placement_claims (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_placement_claims_pending
  ON public.placement_claims (created_at DESC) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.placement_imports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL REFERENCES public.media_owners(id) ON DELETE CASCADE,
  file_name    text NOT NULL CHECK (btrim(file_name) <> ''),
  rows_total   integer NOT NULL DEFAULT 0 CHECK (rows_total >= 0),
  rows_created integer NOT NULL DEFAULT 0 CHECK (rows_created >= 0),
  rows_claimed integer NOT NULL DEFAULT 0 CHECK (rows_claimed >= 0),
  rows_failed  integer NOT NULL DEFAULT 0 CHECK (rows_failed >= 0),
  error_report jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(error_report) = 'array'),
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_placement_imports_owner
  ON public.placement_imports (owner_id, created_at DESC);

-- Expiry notices are sent once per confirmation.
ALTER TABLE public.placement_availability ADD COLUMN IF NOT EXISTS notified_at timestamptz;

-- ---------------------------------------------------------------------------
-- 4. Helpers
-- ---------------------------------------------------------------------------

-- Is this caller a member of the business behind this media owner? SECURITY
-- DEFINER because media_owners is admin-only under RLS: as invoker a member
-- would see no owner row and be refused for the wrong reason. Used by RLS and
-- storage policies; the RPCs call is_business_member themselves.
CREATE OR REPLACE FUNCTION public.is_media_owner_member(p_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT public.is_admin()
      OR (coalesce(auth.role(), '') = 'authenticated'
          AND EXISTS (
            SELECT 1 FROM public.media_owners o
             WHERE o.id = p_owner_id
               AND o.business_id IS NOT NULL
               AND public.is_business_member(o.business_id)));
$fn$;

-- Storage folder names are text: compare as text so a folder that is not a
-- uuid is simply refused rather than raising a cast error.
CREATE OR REPLACE FUNCTION public.media_owner_folder_access(p_folder text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT coalesce(auth.role(), '') = 'authenticated'
     AND EXISTS (
       SELECT 1 FROM public.media_owners o
        WHERE o.id::text = p_folder
          AND public.is_media_owner_member(o.id));
$fn$;

CREATE OR REPLACE FUNCTION public.placement_folder_access(p_folder text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT coalesce(auth.role(), '') = 'authenticated'
     AND EXISTS (
       SELECT 1 FROM public.advertisements a
        WHERE a.id::text = p_folder
          AND a.owner_id IS NOT NULL
          AND public.is_media_owner_member(a.owner_id));
$fn$;

REVOKE ALL ON FUNCTION public.is_media_owner_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.media_owner_folder_access(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.placement_folder_access(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_media_owner_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.media_owner_folder_access(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.placement_folder_access(text) TO authenticated, service_role;

-- A stock photograph is not a photo of the site. Mirrors STOCK_HOSTS in
-- src/lib/stockImage.ts: exact host or any subdomain of it, never a substring
-- of a business's own domain name. A test compares the two lists.
CREATE OR REPLACE FUNCTION public.is_stock_image_url(p_url text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT coalesce(
    lower(btrim(p_url)) ~ '^(https?:)?//([^/?#@]*@)?([a-z0-9-]+\.)*(pexels\.com|unsplash\.com|pixabay\.com|picsum\.photos|placehold\.co|placeholder\.com)(:[0-9]+)?([/?#]|$)',
    false);
$fn$;

COMMENT ON FUNCTION public.is_stock_image_url(text) IS
  'True for a stock-library image URL. Must mirror STOCK_HOSTS in src/lib/stockImage.ts.';

-- ISO code -> the country name advertisements.location carries. The reverse
-- of the country_code backfill in 20261109010000_placement_trust.sql: every
-- name here lower-cases to a name that backfill maps back to the same code,
-- so "City, Country" round-trips. A code outside the list is NULL and the
-- owner functions refuse it in plain words rather than guess a name.
CREATE OR REPLACE FUNCTION public.placement_country_name(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE upper(btrim(p_code))
    WHEN 'NG' THEN 'Nigeria'
    WHEN 'GH' THEN 'Ghana'
    WHEN 'KE' THEN 'Kenya'
    WHEN 'ZA' THEN 'South Africa'
    WHEN 'EG' THEN 'Egypt'
    WHEN 'TZ' THEN 'Tanzania'
    WHEN 'SN' THEN 'Senegal'
    WHEN 'CM' THEN 'Cameroon'
    WHEN 'MZ' THEN 'Mozambique'
    WHEN 'ZW' THEN 'Zimbabwe'
    WHEN 'BW' THEN 'Botswana'
    WHEN 'DZ' THEN 'Algeria'
    WHEN 'ET' THEN 'Ethiopia'
    WHEN 'MA' THEN 'Morocco'
    WHEN 'NA' THEN 'Namibia'
    WHEN 'RW' THEN 'Rwanda'
    WHEN 'TN' THEN 'Tunisia'
    WHEN 'UG' THEN 'Uganda'
    WHEN 'ZM' THEN 'Zambia'
    WHEN 'CD' THEN 'DR Congo'
    WHEN 'CI' THEN 'Côte d''Ivoire'
    ELSE NULL
  END;
$fn$;

COMMENT ON FUNCTION public.placement_country_name(text) IS
  'Country name for an ISO code, as advertisements.location writes it ("City, Country"). Reverse of the placement_trust country_code backfill.';

-- ---------------------------------------------------------------------------
-- 5. Trust triggers, replaced: the owner path through the guard
-- ---------------------------------------------------------------------------

-- v1 body (20261109010000_placement_trust.sql) plus the owner path. Who may
-- set lifecycle, owner_id, owner_role:
--   admin                                         yes
--   no JWT: service_role, SQL editor, migration   yes
--   an owner function with nowopen.owner_write    INSERT only: owner_role
--                                                 'owner', lifecycle
--                                                 pending_review or
--                                                 partner_verified, and the
--                                                 caller a member of that
--                                                 owner's business
--   any other anon / authenticated caller         no, raises
CREATE OR REPLACE FUNCTION public.placement_trust_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_web_non_admin boolean := coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_admin();
  v_trusted       boolean := coalesce(current_setting('nowopen.owner_write', true), '') = 'on';
  v_verification  text;
BEGIN
  IF v_web_non_admin THEN
    IF TG_OP = 'INSERT' THEN
      IF v_trusted THEN
        IF NEW.owner_id IS NULL OR NEW.owner_role IS DISTINCT FROM 'owner' OR NEW.lifecycle NOT IN ('pending_review', 'partner_verified') THEN
          RAISE EXCEPTION 'An owner can only list a placement as its owner, for review or as partner verified'
            USING errcode = '42501';
        END IF;
        -- Defence in depth: the owner functions check membership before
        -- setting the flag; the guard checks it again.
        IF NOT public.is_media_owner_member(NEW.owner_id) THEN
          RAISE EXCEPTION 'Only a member of this media owner''s business can list its placements'
            USING errcode = '42501';
        END IF;
      ELSIF NEW.owner_id IS NOT NULL OR NEW.owner_role IS NOT NULL OR NEW.lifecycle <> 'imported' THEN
        RAISE EXCEPTION 'Only an admin can set a placement''s owner or lifecycle' USING errcode = '42501';
      END IF;
    ELSIF (NEW.lifecycle, NEW.owner_id, NEW.owner_role)
          IS DISTINCT FROM (OLD.lifecycle, OLD.owner_id, OLD.owner_role) THEN
      RAISE EXCEPTION 'Only an admin can change a placement''s owner or lifecycle' USING errcode = '42501';
    END IF;
  END IF;

  -- partner_verified needs a linked owner whose documents a person checked.
  -- Enforced for every caller, the service role and the owner path included.
  IF NEW.lifecycle = 'partner_verified' THEN
    IF NEW.owner_id IS NULL THEN
      RAISE EXCEPTION 'partner_verified requires a linked media owner' USING errcode = '23514';
    END IF;
    SELECT o.verification INTO v_verification
      FROM public.media_owners o
     WHERE o.id = NEW.owner_id;
    IF v_verification IS DISTINCT FROM 'verified' THEN
      RAISE EXCEPTION 'partner_verified requires the linked media owner to be verified (is %)',
        coalesce(v_verification, 'missing') USING errcode = '23514';
    END IF;
  END IF;

  -- Audience figures only with a partner or verified audience source.
  IF (TG_OP = 'INSERT' AND (NEW.audience_note IS NOT NULL OR NEW.estimated_daily_traffic IS NOT NULL))
     OR (TG_OP = 'UPDATE'
         AND (NEW.audience_note, NEW.estimated_daily_traffic)
             IS DISTINCT FROM (OLD.audience_note, OLD.estimated_daily_traffic)
         AND (NEW.audience_note IS NOT NULL OR NEW.estimated_daily_traffic IS NOT NULL)) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.placement_field_source s
       WHERE s.advert_id = NEW.id
         AND s.field = 'audience'
         AND s.basis IN ('partner_supplied', 'verified')
    ) THEN
      RAISE EXCEPTION 'Audience figures need a partner-supplied or verified audience source first'
        USING errcode = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

-- v1 body plus the owner path: an owner-created placement is audited (its
-- lifecycle and its owner link) instead of refused.
CREATE OR REPLACE FUNCTION public.placement_trust_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_web_non_admin     boolean := coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_admin();
  v_trusted           boolean := coalesce(current_setting('nowopen.owner_write', true), '') = 'on';
  v_lifecycle_changed boolean;
  v_owner_changed     boolean;
  v_fields            text[] := '{}';
  v_src               record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_lifecycle_changed := NEW.lifecycle <> 'imported';
    v_owner_changed     := NEW.owner_id IS NOT NULL;
  ELSE
    v_lifecycle_changed := NEW.lifecycle IS DISTINCT FROM OLD.lifecycle;
    v_owner_changed     := (NEW.owner_id, NEW.owner_role) IS DISTINCT FROM (OLD.owner_id, OLD.owner_role);

    -- Fields a non-admin edited. A verified source no longer describes them.
    IF v_web_non_admin THEN
      IF NEW.pricing IS DISTINCT FROM OLD.pricing THEN v_fields := v_fields || 'pricing'; END IF;
      IF NEW.image_url IS DISTINCT FROM OLD.image_url THEN v_fields := v_fields || 'image_url'; END IF;
      IF NEW.dimensions IS DISTINCT FROM OLD.dimensions THEN v_fields := v_fields || 'dimensions'; END IF;
      IF (NEW.audience_note, NEW.estimated_daily_traffic)
         IS DISTINCT FROM (OLD.audience_note, OLD.estimated_daily_traffic) THEN
        v_fields := v_fields || 'audience';
      END IF;
    END IF;
  END IF;

  IF cardinality(v_fields) > 0 THEN
    FOR v_src IN
      UPDATE public.placement_field_source s
         SET basis = 'partner_supplied', as_of = (now() AT TIME ZONE 'Africa/Lagos')::date
       WHERE s.advert_id = NEW.id
         AND s.basis = 'verified'
         AND s.field = ANY (v_fields)
      RETURNING s.id, s.field
    LOOP
      INSERT INTO public.audit_log (actor_id, actor_email, action, entity_type, entity_id, detail)
      VALUES (auth.uid(), auth.jwt() ->> 'email', 'placement.field_source_downgrade', 'advertisement', NEW.id::text,
              jsonb_build_object(
                'field_source_id', v_src.id,
                'field', v_src.field,
                'from', 'verified',
                'to', 'partner_supplied',
                'via', coalesce(auth.role(), 'direct')));
    END LOOP;
  END IF;

  IF NOT (v_lifecycle_changed OR v_owner_changed) THEN
    RETURN NULL;
  END IF;

  -- Defence in depth: placement_trust_guard already refuses this caller.
  IF v_web_non_admin AND NOT v_trusted THEN
    RAISE EXCEPTION 'Only an admin can change a placement''s owner or lifecycle' USING errcode = '42501';
  END IF;

  IF v_lifecycle_changed THEN
    INSERT INTO public.audit_log (actor_id, actor_email, action, entity_type, entity_id, detail)
    VALUES (auth.uid(), auth.jwt() ->> 'email', 'placement.lifecycle', 'advertisement', NEW.id::text,
            jsonb_build_object(
              'from', CASE WHEN TG_OP = 'UPDATE' THEN OLD.lifecycle END,
              'to', NEW.lifecycle,
              'reason', nullif(current_setting('nowopen.lifecycle_reason', true), ''),
              'via', CASE WHEN v_trusted THEN 'owner_portal' ELSE coalesce(auth.role(), 'direct') END));
  END IF;

  IF v_owner_changed THEN
    INSERT INTO public.audit_log (actor_id, actor_email, action, entity_type, entity_id, detail)
    VALUES (auth.uid(), auth.jwt() ->> 'email', 'placement.owner_link', 'advertisement', NEW.id::text,
            jsonb_build_object(
              'from_owner', CASE WHEN TG_OP = 'UPDATE' THEN OLD.owner_id END,
              'from_role', CASE WHEN TG_OP = 'UPDATE' THEN OLD.owner_role END,
              'to_owner', NEW.owner_id,
              'to_role', NEW.owner_role,
              'via', CASE WHEN v_trusted THEN 'owner_portal' ELSE coalesce(auth.role(), 'direct') END));
  END IF;

  RETURN NULL;
END;
$fn$;

-- v1 body plus:
--   * an owner may move their own owner to documents_submitted, only through
--     submit_owner_verification (the flag);
--   * becoming verified promotes the owner's partner_supplied placements to
--     partner_verified. Placements waiting for review are left alone: they
--     stay in the one admin queue until someone decides.
CREATE OR REPLACE FUNCTION public.media_owner_after_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_trusted boolean := coalesce(current_setting('nowopen.owner_write', true), '') = 'on';
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.verification IS NOT DISTINCT FROM OLD.verification THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.verification = 'unverified' THEN
    RETURN NULL;
  END IF;

  -- RLS limits media_owners writes to admins; refuse anyone else here too,
  -- except an owner submitting their documents through the owner function.
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_admin()
     AND NOT (v_trusted AND TG_OP = 'UPDATE' AND NEW.verification = 'documents_submitted') THEN
    RAISE EXCEPTION 'Only an admin can change a media owner''s verification' USING errcode = '42501';
  END IF;

  INSERT INTO public.audit_log (actor_id, actor_email, action, entity_type, entity_id, detail)
  VALUES (auth.uid(), auth.jwt() ->> 'email', 'media_owner.verification', 'media_owner', NEW.id::text,
          jsonb_build_object(
            'from', CASE WHEN TG_OP = 'UPDATE' THEN OLD.verification END,
            'to', NEW.verification,
            'via', CASE WHEN v_trusted THEN 'owner_portal' ELSE coalesce(auth.role(), 'direct') END));

  IF TG_OP = 'UPDATE' AND OLD.verification = 'verified' AND NEW.verification <> 'verified' THEN
    UPDATE public.advertisements
       SET lifecycle = 'partner_supplied'
     WHERE owner_id = NEW.id
       AND lifecycle = 'partner_verified';
  END IF;

  -- Each promoted placement is audited by placement_trust_audit.
  IF TG_OP = 'UPDATE' AND NEW.verification = 'verified' AND OLD.verification IS DISTINCT FROM 'verified' THEN
    UPDATE public.advertisements
       SET lifecycle = 'partner_verified'
     WHERE owner_id = NEW.id
       AND lifecycle = 'partner_supplied';
  END IF;

  RETURN NULL;
END;
$fn$;

-- v1 body plus the owner path (owner_record_availability).
CREATE OR REPLACE FUNCTION public.placement_availability_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_trusted boolean := coalesce(current_setting('nowopen.owner_write', true), '') = 'on';
BEGIN
  -- RLS limits inserts to admins; refuse anyone else here too, except an
  -- owner recording through owner_record_availability.
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_admin() AND NOT v_trusted THEN
    RAISE EXCEPTION 'Only an admin can record an availability confirmation' USING errcode = '42501';
  END IF;

  INSERT INTO public.audit_log (actor_id, actor_email, action, entity_type, entity_id, detail)
  VALUES (auth.uid(), auth.jwt() ->> 'email', 'placement.confirmation', 'advertisement', NEW.advert_id::text,
          jsonb_build_object(
            'confirmation_id', NEW.id,
            'status', NEW.status,
            'method', NEW.method,
            'confirmed_at', NEW.confirmed_at,
            'valid_until', NEW.valid_until,
            'confirmed_by_owner', NEW.confirmed_by_owner,
            'via', CASE WHEN v_trusted THEN 'owner_portal' ELSE coalesce(auth.role(), 'direct') END));
  RETURN NULL;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 6. Owner functions
-- ---------------------------------------------------------------------------

-- "I sell advertising space". Idempotent: a second call returns the same id.
-- Name and website come from the business, so an owner cannot list under a
-- name their business does not carry.
CREATE OR REPLACE FUNCTION public.enable_media_owner(p_business_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_name    text;
  v_website text;
  v_id      uuid;
BEGIN
  IF p_business_id IS NULL THEN
    RAISE EXCEPTION 'A business is required' USING errcode = '22023';
  END IF;
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Only a member of this business can turn on Media owner mode' USING errcode = '42501';
  END IF;

  SELECT nullif(btrim(b.name), ''), nullif(btrim(b.website), '')
    INTO v_name, v_website
    FROM public.businesses b
   WHERE b.id = p_business_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business % does not exist', p_business_id USING errcode = 'P0002';
  END IF;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Give the business a name before turning on Media owner mode' USING errcode = '22023';
  END IF;

  INSERT INTO public.media_owners (name, website, business_id, relationship)
  VALUES (v_name, v_website, p_business_id, 'onboarding')
  ON CONFLICT (business_id) WHERE business_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT o.id INTO v_id FROM public.media_owners o WHERE o.business_id = p_business_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.audit_log (actor_id, actor_email, action, entity_type, entity_id, detail)
  VALUES (auth.uid(), auth.jwt() ->> 'email', 'media_owner.enabled', 'media_owner', v_id::text,
          jsonb_build_object('business_id', p_business_id, 'via', coalesce(auth.role(), 'direct')));
  RETURN v_id;
END;
$fn$;

-- Both kinds of document present, then "Under review". Re-submitting after a
-- rejection is allowed; already submitted or verified is a no-op.
CREATE OR REPLACE FUNCTION public.submit_owner_verification(p_owner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_business     uuid;
  v_verification text;
BEGIN
  SELECT o.business_id, o.verification INTO v_business, v_verification
    FROM public.media_owners o
   WHERE o.id = p_owner_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Media owner % does not exist', p_owner_id USING errcode = 'P0002';
  END IF;
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_business_member(v_business) THEN
    RAISE EXCEPTION 'Only a member of this media owner''s business can submit its documents' USING errcode = '42501';
  END IF;

  IF v_verification IN ('documents_submitted', 'verified') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.media_owner_documents d
                  WHERE d.owner_id = p_owner_id AND d.kind = 'registration') THEN
    RAISE EXCEPTION 'Add your company registration first' USING errcode = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.media_owner_documents d
                  WHERE d.owner_id = p_owner_id AND d.kind IN ('signage_permit', 'rate_card', 'authorisation_letter')) THEN
    RAISE EXCEPTION 'Add one site proof first: a signage permit, a rate card or an authorisation letter'
      USING errcode = '22023';
  END IF;

  PERFORM set_config('nowopen.owner_write', 'on', true);
  UPDATE public.media_owners SET verification = 'documents_submitted' WHERE id = p_owner_id;
  PERFORM set_config('nowopen.owner_write', 'off', true);
END;
$fn$;

-- List a placement. The lifecycle comes from the owner's verification and
-- never from the client: verified -> partner_verified (public at once),
-- anything else -> pending_review (an admin decides).
CREATE OR REPLACE FUNCTION public.owner_create_placement(p_owner_id uuid, p jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_business     uuid;
  v_verification text;
  v_lifecycle    text;
  v_id           uuid;
  v_title        text;
  v_image        text;
  v_media        text[];
  v_rate_amount  numeric;
  v_pricing      numeric;
  v_category     text;
  v_city         text;
  v_country_code text;
  v_country_name text;
  v_currency     text;
BEGIN
  SELECT o.business_id, o.verification INTO v_business, v_verification
    FROM public.media_owners o
   WHERE o.id = p_owner_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Media owner % does not exist', p_owner_id USING errcode = 'P0002';
  END IF;
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_business_member(v_business) THEN
    RAISE EXCEPTION 'Only a member of this media owner''s business can list its placements' USING errcode = '42501';
  END IF;
  IF v_verification = 'rejected' THEN
    RAISE EXCEPTION 'Your verification was not approved. Add new documents and submit them again before listing placements.'
      USING errcode = '42501';
  END IF;

  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'Placement details are required' USING errcode = '22023';
  END IF;

  -- Required fields, each with a plain message (type is NOT NULL on live:
  -- a missing one must never surface as a raw 23502).
  v_category := coalesce(nullif(btrim(p ->> 'category'), ''), nullif(btrim(p ->> 'type'), ''));
  IF v_category IS NULL THEN
    RAISE EXCEPTION 'Choose the type of placement' USING errcode = '22023';
  END IF;
  v_title := nullif(btrim(p ->> 'title'), '');
  IF v_title IS NULL THEN
    RAISE EXCEPTION 'A site name is required' USING errcode = '22023';
  END IF;
  v_city := nullif(btrim(p ->> 'city'), '');
  IF v_city IS NULL THEN
    RAISE EXCEPTION 'A city is required' USING errcode = '22023';
  END IF;
  IF position(',' IN v_city) > 0 THEN
    RAISE EXCEPTION 'Enter the city on its own; put the street or landmark in the address' USING errcode = '22023';
  END IF;
  v_country_code := upper(nullif(btrim(p ->> 'country_code'), ''));
  IF v_country_code IS NULL THEN
    RAISE EXCEPTION 'Choose the country' USING errcode = '22023';
  END IF;
  v_country_name := public.placement_country_name(v_country_code);
  IF v_country_name IS NULL THEN
    RAISE EXCEPTION 'NowOpen does not list placements in that country yet' USING errcode = '22023';
  END IF;

  v_currency := coalesce(upper(nullif(btrim(p ->> 'currency'), '')), 'NGN');
  IF v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency must be a three-letter code such as NGN' USING errcode = '22023';
  END IF;

  v_image := nullif(btrim(p ->> 'image_url'), '');
  v_media := CASE WHEN jsonb_typeof(p -> 'media_urls') = 'array'
                  THEN ARRAY(SELECT jsonb_array_elements_text(p -> 'media_urls')) END;
  IF public.is_stock_image_url(v_image)
     OR EXISTS (SELECT 1 FROM unnest(coalesce(v_media, '{}'::text[])) u WHERE public.is_stock_image_url(u)) THEN
    RAISE EXCEPTION 'Upload a photo of the actual site.' USING errcode = '22023';
  END IF;

  v_rate_amount := nullif(p ->> 'rate_amount', '')::numeric;
  v_pricing     := nullif(p ->> 'pricing', '')::numeric;
  v_lifecycle   := CASE WHEN v_verification = 'verified' THEN 'partner_verified' ELSE 'pending_review' END;

  PERFORM set_config('nowopen.owner_write', 'on', true);
  INSERT INTO public.advertisements (
    title, description, category, type, location, country_code, site_address,
    size_spec, dimensions, rate_amount, currency, rate_period, pricing,
    image_url, media_urls, business_id,
    owner_id, owner_role, lifecycle, provenance)
  VALUES (
    v_title,
    nullif(btrim(p ->> 'description'), ''),
    v_category,
    v_category,
    -- "City, Country", the shape every live row has. The landmark goes to
    -- site_address, never into location.
    v_city || ', ' || v_country_name,
    v_country_code,
    nullif(btrim(p ->> 'site_address'), ''),
    CASE WHEN jsonb_typeof(p -> 'size_spec') = 'object' THEN p -> 'size_spec' END,
    nullif(btrim(p ->> 'dimensions'), ''),
    v_rate_amount,
    v_currency,
    nullif(btrim(p ->> 'rate_period'), ''),
    v_pricing,
    v_image,
    v_media,
    -- user_id is left NULL (ruling): owned rows are listed by owner_id and
    -- never reachable through the legacy user_id policies. business_id is a
    -- uuid on live; no cast.
    v_business,
    p_owner_id,
    'owner',
    v_lifecycle,
    'owner_submitted')
  RETURNING id INTO v_id;
  PERFORM set_config('nowopen.owner_write', 'off', true);

  -- The price is the owner's own, dated today (Lagos). No price, no row: a
  -- pricing source with nothing to describe would be a claim about nothing.
  IF v_rate_amount IS NOT NULL OR v_pricing IS NOT NULL THEN
    INSERT INTO public.placement_field_source (advert_id, field, basis, source_label, as_of)
    VALUES (v_id, 'pricing', 'partner_supplied', 'owner rate card', (now() AT TIME ZONE 'Africa/Lagos')::date)
    ON CONFLICT (advert_id, field) DO NOTHING;
  END IF;

  RETURN v_id;
END;
$fn$;

-- Edit a placement linked to the caller's owner, on the spec section 5 fields
-- only. Any other key is refused, not ignored, so a client bug is loud.
-- Lifecycle is not written: a verified owner editing their price stays
-- partner_verified, and the pricing source row's date moves to today.
CREATE OR REPLACE FUNCTION public.owner_update_placement(p_advert_id uuid, p jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_allowed  text[] := ARRAY['title', 'description', 'size_spec', 'dimensions', 'rate_amount', 'currency', 'rate_period', 'pricing', 'image_url', 'media_urls', 'city', 'country_code', 'site_address'];
  v_bad      text[];
  v_old      public.advertisements%ROWTYPE;
  v_new      public.advertisements%ROWTYPE;
  v_business uuid;
  v_media    text[];
  v_city     text;
  v_country  text;
  v_location text;
BEGIN
  SELECT * INTO v_old FROM public.advertisements a WHERE a.id = p_advert_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Placement % does not exist', p_advert_id USING errcode = 'P0002';
  END IF;
  IF v_old.owner_id IS NULL THEN
    RAISE EXCEPTION 'This placement has no owner yet; claim it first' USING errcode = '42501';
  END IF;
  SELECT o.business_id INTO v_business FROM public.media_owners o WHERE o.id = v_old.owner_id;
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_business_member(v_business) THEN
    RAISE EXCEPTION 'Only a member of this placement''s owner can edit it' USING errcode = '42501';
  END IF;

  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'Placement details are required' USING errcode = '22023';
  END IF;
  SELECT array_agg(k ORDER BY k) INTO v_bad
    FROM jsonb_object_keys(p) AS k
   WHERE NOT (k = ANY (v_allowed));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'These fields cannot be changed here: %', array_to_string(v_bad, ', ') USING errcode = '42501';
  END IF;

  IF p ? 'title' AND nullif(btrim(p ->> 'title'), '') IS NULL THEN
    RAISE EXCEPTION 'A site name is required' USING errcode = '22023';
  END IF;
  IF p ? 'currency' AND coalesce(upper(btrim(p ->> 'currency')), '') !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency must be a three-letter code such as NGN' USING errcode = '22023';
  END IF;

  -- location is recomposed as "City, Country" whenever the city or the
  -- country changes; it is never taken as a free string. The current city is
  -- the first comma segment of the current location, as Promote reads it.
  v_location := v_old.location;
  IF p ? 'city' OR p ? 'country_code' THEN
    v_city := CASE WHEN p ? 'city' THEN nullif(btrim(p ->> 'city'), '')
                   ELSE nullif(btrim(split_part(coalesce(v_old.location, ''), ',', 1)), '') END;
    v_country := CASE WHEN p ? 'country_code' THEN upper(nullif(btrim(p ->> 'country_code'), ''))
                      ELSE v_old.country_code END;
    IF v_city IS NULL THEN
      RAISE EXCEPTION 'A city is required' USING errcode = '22023';
    END IF;
    IF position(',' IN v_city) > 0 THEN
      RAISE EXCEPTION 'Enter the city on its own; put the street or landmark in the address' USING errcode = '22023';
    END IF;
    IF v_country IS NULL THEN
      RAISE EXCEPTION 'Choose the country' USING errcode = '22023';
    END IF;
    IF public.placement_country_name(v_country) IS NULL THEN
      RAISE EXCEPTION 'NowOpen does not list placements in that country yet' USING errcode = '22023';
    END IF;
    v_location := v_city || ', ' || public.placement_country_name(v_country);
  END IF;

  v_media := CASE WHEN jsonb_typeof(p -> 'media_urls') = 'array'
                  THEN ARRAY(SELECT jsonb_array_elements_text(p -> 'media_urls')) END;
  IF (p ? 'image_url' AND public.is_stock_image_url(p ->> 'image_url'))
     OR EXISTS (SELECT 1 FROM unnest(coalesce(v_media, '{}'::text[])) u WHERE public.is_stock_image_url(u)) THEN
    RAISE EXCEPTION 'Upload a photo of the actual site.' USING errcode = '22023';
  END IF;

  UPDATE public.advertisements a
     SET title         = CASE WHEN p ? 'title' THEN btrim(p ->> 'title') ELSE a.title END,
         description   = CASE WHEN p ? 'description' THEN nullif(btrim(p ->> 'description'), '') ELSE a.description END,
         size_spec     = CASE WHEN p ? 'size_spec'
                              THEN CASE WHEN jsonb_typeof(p -> 'size_spec') = 'object' THEN p -> 'size_spec' END
                              ELSE a.size_spec END,
         dimensions    = CASE WHEN p ? 'dimensions' THEN nullif(btrim(p ->> 'dimensions'), '') ELSE a.dimensions END,
         rate_amount   = CASE WHEN p ? 'rate_amount' THEN nullif(p ->> 'rate_amount', '')::numeric ELSE a.rate_amount END,
         currency      = CASE WHEN p ? 'currency' THEN upper(btrim(p ->> 'currency')) ELSE a.currency END,
         rate_period   = CASE WHEN p ? 'rate_period' THEN nullif(btrim(p ->> 'rate_period'), '') ELSE a.rate_period END,
         pricing       = CASE WHEN p ? 'pricing' THEN nullif(p ->> 'pricing', '')::numeric ELSE a.pricing END,
         image_url     = CASE WHEN p ? 'image_url' THEN nullif(btrim(p ->> 'image_url'), '') ELSE a.image_url END,
         media_urls    = CASE WHEN p ? 'media_urls' THEN v_media ELSE a.media_urls END,
         location      = v_location,
         country_code  = CASE WHEN p ? 'country_code' THEN upper(nullif(btrim(p ->> 'country_code'), '')) ELSE a.country_code END,
         site_address  = CASE WHEN p ? 'site_address' THEN nullif(btrim(p ->> 'site_address'), '') ELSE a.site_address END,
         updated_at    = now()
   WHERE a.id = p_advert_id
  RETURNING a.* INTO v_new;

  -- A price change is a new partner-supplied statement, dated today (Lagos).
  -- placement_field_source holds one row per field, so "a new row" is an
  -- upsert of that row.
  IF (v_new.rate_amount, v_new.currency, v_new.rate_period, v_new.pricing)
     IS DISTINCT FROM (v_old.rate_amount, v_old.currency, v_old.rate_period, v_old.pricing) THEN
    INSERT INTO public.placement_field_source (advert_id, field, basis, source_label, as_of, recorded_by)
    VALUES (p_advert_id, 'pricing', 'partner_supplied', 'owner rate card', (now() AT TIME ZONE 'Africa/Lagos')::date, auth.uid())
    ON CONFLICT (advert_id, field) DO UPDATE SET basis = 'partner_supplied',
                                                 source_label = EXCLUDED.source_label,
                                                 as_of = (now() AT TIME ZONE 'Africa/Lagos')::date,
                                                 recorded_by = EXCLUDED.recorded_by;

    INSERT INTO public.audit_log (actor_id, actor_email, action, entity_type, entity_id, detail)
    VALUES (auth.uid(), auth.jwt() ->> 'email', 'placement.owner_price', 'advertisement', p_advert_id::text,
            jsonb_build_object(
              'from', jsonb_build_object('rate_amount', v_old.rate_amount, 'currency', v_old.currency,
                                         'rate_period', v_old.rate_period, 'pricing', v_old.pricing),
              'to', jsonb_build_object('rate_amount', v_new.rate_amount, 'currency', v_new.currency,
                                       'rate_period', v_new.rate_period, 'pricing', v_new.pricing),
              'via', coalesce(auth.role(), 'direct')));
  END IF;
END;
$fn$;

-- "Available from / to", "Booked until", "Unavailable", "Maintenance". The
-- confirmation names the placement's own owner (placement_availability_stamp
-- refuses any other) and is audited by placement_availability_audit.
CREATE OR REPLACE FUNCTION public.owner_record_availability(p_advert_id uuid, p_status text, p_from date, p_to date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_owner    uuid;
  v_business uuid;
  v_id       uuid;
BEGIN
  SELECT a.owner_id INTO v_owner FROM public.advertisements a WHERE a.id = p_advert_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Placement % does not exist', p_advert_id USING errcode = 'P0002';
  END IF;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'This placement has no owner yet; claim it first' USING errcode = '42501';
  END IF;
  SELECT o.business_id INTO v_business FROM public.media_owners o WHERE o.id = v_owner;
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_business_member(v_business) THEN
    RAISE EXCEPTION 'Only a member of this placement''s owner can confirm its availability' USING errcode = '42501';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('available', 'booked', 'unavailable', 'maintenance') THEN
    RAISE EXCEPTION 'Unknown availability %', coalesce(p_status, 'null') USING errcode = '22023';
  END IF;
  IF p_from IS NULL THEN
    RAISE EXCEPTION 'A start date is required' USING errcode = '22023';
  END IF;
  IF p_status = 'booked' AND p_to IS NULL THEN
    RAISE EXCEPTION 'Booked needs an end date' USING errcode = '22023';
  END IF;

  PERFORM set_config('nowopen.owner_write', 'on', true);
  INSERT INTO public.placement_availability (advert_id, status, period_from, period_to, confirmed_by_owner, method)
  VALUES (p_advert_id, p_status, p_from, p_to, v_owner, 'portal')
  RETURNING id INTO v_id;
  PERFORM set_config('nowopen.owner_write', 'off', true);

  RETURN v_id;
END;
$fn$;

-- "Is this your site?" Only on a placement with no owner; one pending claim
-- per placement (unique index). Approval is admin_decide_claim.
CREATE OR REPLACE FUNCTION public.owner_claim_placement(p_advert_id uuid, p_owner_id uuid, p_role text, p_statement text, p_document_path text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_business      uuid;
  v_current_owner uuid;
  v_lifecycle     text;
  v_doc           text := nullif(btrim(p_document_path), '');
  v_id            uuid;
  v_verification  text;
BEGIN
  SELECT o.business_id, o.verification INTO v_business, v_verification
    FROM public.media_owners o WHERE o.id = p_owner_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Media owner % does not exist', p_owner_id USING errcode = 'P0002';
  END IF;
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_business_member(v_business) THEN
    RAISE EXCEPTION 'Only a member of this media owner''s business can claim for it' USING errcode = '42501';
  END IF;
  IF v_verification = 'rejected' THEN
    RAISE EXCEPTION 'Your verification was not approved. Add new documents and submit them again before claiming placements.'
      USING errcode = '42501';
  END IF;

  IF p_role IS NULL OR p_role NOT IN ('owner', 'authorised_representative') THEN
    RAISE EXCEPTION 'Unknown claim role %', coalesce(p_role, 'null') USING errcode = '22023';
  END IF;
  IF nullif(btrim(p_statement), '') IS NULL THEN
    RAISE EXCEPTION 'Say how this site is yours' USING errcode = '22023';
  END IF;
  IF p_role = 'authorised_representative' AND v_doc IS NULL THEN
    RAISE EXCEPTION 'Upload the owner''s signed authorisation letter' USING errcode = '22023';
  END IF;

  SELECT a.owner_id, a.lifecycle INTO v_current_owner, v_lifecycle
    FROM public.advertisements a
   WHERE a.id = p_advert_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Placement % does not exist', p_advert_id USING errcode = 'P0002';
  END IF;
  IF v_current_owner IS NOT NULL THEN
    RAISE EXCEPTION 'This placement already has an owner' USING errcode = '42501';
  END IF;
  IF v_lifecycle IN ('rejected', 'archived') THEN
    RAISE EXCEPTION 'This placement is no longer listed' USING errcode = '22023';
  END IF;

  BEGIN
    INSERT INTO public.placement_claims (advert_id, owner_id, role, statement, document_path)
    VALUES (p_advert_id, p_owner_id, p_role, btrim(p_statement), v_doc)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'A claim for this placement is already waiting for a decision' USING errcode = '23505';
  END;

  INSERT INTO public.audit_log (actor_id, actor_email, action, entity_type, entity_id, detail)
  VALUES (auth.uid(), auth.jwt() ->> 'email', 'placement.claim_submitted', 'advertisement', p_advert_id::text,
          jsonb_build_object('claim_id', v_id, 'owner_id', p_owner_id, 'role', p_role,
                             'via', coalesce(auth.role(), 'direct')));
  RETURN v_id;
END;
$fn$;

-- "Not approved: {reason}". audit_log is admin-only, so the owner reads the
-- latest rejection reason through this, for their own owner only, and only
-- while verification is 'rejected'.
CREATE OR REPLACE FUNCTION public.owner_verification_reason(p_owner_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_business     uuid;
  v_verification text;
  v_reason       text;
BEGIN
  SELECT o.business_id, o.verification INTO v_business, v_verification
    FROM public.media_owners o WHERE o.id = p_owner_id;
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_business_member(v_business) THEN
    RAISE EXCEPTION 'Only a member of this media owner''s business can read this' USING errcode = '42501';
  END IF;
  -- A reason only while the owner stands rejected: after a resubmission or a
  -- verification the old reason no longer applies.
  IF v_verification IS DISTINCT FROM 'rejected' THEN
    RETURN NULL;
  END IF;
  SELECT l.detail ->> 'reason' INTO v_reason
    FROM public.audit_log l
   WHERE l.action = 'media_owner.rejected'
     AND l.entity_type = 'media_owner'
     AND l.entity_id = p_owner_id::text
   ORDER BY l.created_at DESC
   LIMIT 1;
  RETURN v_reason;
END;
$fn$;

-- The owner row as its business members see it: only id, name, website,
-- country_codes, verification, verified_at and verification_note. Never
-- relationship (the internal sales stage) or verified_by (an admin's id).
-- Replaces a member SELECT policy on media_owners, which showed the whole
-- row. No owner yet: no row.
CREATE OR REPLACE FUNCTION public.get_my_media_owner(p_business_id uuid)
RETURNS TABLE (
  id                uuid,
  name              text,
  website           text,
  country_codes     text[],
  verification      text,
  verified_at       timestamptz,
  verification_note text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
#variable_conflict use_column
BEGIN
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Only a member of this business can read its media owner' USING errcode = '42501';
  END IF;
  RETURN QUERY
    SELECT o.id, o.name, o.website, o.country_codes, o.verification, o.verified_at, o.verification_note
      FROM public.media_owners o
     WHERE o.business_id = p_business_id;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 7. Admin functions
-- ---------------------------------------------------------------------------

-- Approve: pending_review -> partner_supplied. Reject: -> rejected, reason
-- required. Both through set_placement_lifecycle, so each decision is ONE
-- audit row carrying its reason.
CREATE OR REPLACE FUNCTION public.admin_review_placement(p_advert_id uuid, p_approve boolean, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_lifecycle text;
BEGIN
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an admin can review a placement' USING errcode = '42501';
  END IF;
  IF p_approve IS NULL THEN
    RAISE EXCEPTION 'Approve or reject' USING errcode = '22023';
  END IF;

  SELECT a.lifecycle INTO v_lifecycle FROM public.advertisements a WHERE a.id = p_advert_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Placement % does not exist', p_advert_id USING errcode = 'P0002';
  END IF;
  IF v_lifecycle IS DISTINCT FROM 'pending_review' THEN
    RAISE EXCEPTION 'This placement is not waiting for review (is %)', coalesce(v_lifecycle, 'null') USING errcode = '22023';
  END IF;

  IF p_approve THEN
    PERFORM public.set_placement_lifecycle(p_advert_id, 'partner_supplied',
                                           coalesce(nullif(btrim(p_reason), ''), 'Approved after review'));
  ELSE
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
      RAISE EXCEPTION 'A reason is required to reject a placement' USING errcode = '22023';
    END IF;
    PERFORM public.set_placement_lifecycle(p_advert_id, 'rejected', p_reason);
  END IF;
END;
$fn$;

-- Approve: link the owner (role from the claim) and set the lifecycle from
-- the owner's verification. Reject: reason required, the owner sees it.
CREATE OR REPLACE FUNCTION public.admin_decide_claim(p_claim_id uuid, p_approve boolean, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_claim         public.placement_claims%ROWTYPE;
  v_current_owner     uuid;
  v_current_lifecycle text;
  v_verification      text;
  v_lifecycle         text;
BEGIN
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an admin can decide a claim' USING errcode = '42501';
  END IF;
  IF p_approve IS NULL THEN
    RAISE EXCEPTION 'Approve or reject' USING errcode = '22023';
  END IF;
  IF NOT p_approve AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RAISE EXCEPTION 'A reason is required to reject a claim' USING errcode = '22023';
  END IF;

  SELECT * INTO v_claim FROM public.placement_claims c WHERE c.id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim % does not exist', p_claim_id USING errcode = 'P0002';
  END IF;
  IF v_claim.status <> 'pending' THEN
    RAISE EXCEPTION 'This claim was already decided (%)', v_claim.status USING errcode = '22023';
  END IF;

  IF p_approve THEN
    SELECT a.owner_id, a.lifecycle INTO v_current_owner, v_current_lifecycle
      FROM public.advertisements a WHERE a.id = v_claim.advert_id FOR UPDATE;
    IF v_current_owner IS NOT NULL THEN
      RAISE EXCEPTION 'This placement already has an owner' USING errcode = '22023';
    END IF;
    -- Approving must not re-list a placement rejected or archived since the
    -- claim was filed.
    IF v_current_lifecycle IN ('rejected', 'archived') THEN
      RAISE EXCEPTION 'This placement is no longer listed (is %); reject the claim instead', v_current_lifecycle
        USING errcode = '22023';
    END IF;
    SELECT o.verification INTO v_verification FROM public.media_owners o WHERE o.id = v_claim.owner_id;
    IF v_verification = 'rejected' THEN
      RAISE EXCEPTION 'This media owner''s verification was rejected; reject the claim instead' USING errcode = '22023';
    END IF;
    v_lifecycle := CASE WHEN v_verification = 'verified' THEN 'partner_verified' ELSE 'partner_supplied' END;

    -- The reason rides into placement_trust_audit's lifecycle row.
    PERFORM set_config('nowopen.lifecycle_reason', coalesce(nullif(btrim(p_reason), ''), 'Claim approved'), true);
    UPDATE public.advertisements
       SET owner_id = v_claim.owner_id, owner_role = v_claim.role, lifecycle = v_lifecycle
     WHERE id = v_claim.advert_id;
    PERFORM set_config('nowopen.lifecycle_reason', '', true);
  END IF;

  UPDATE public.placement_claims
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         decided_by = auth.uid(),
         decided_at = now(),
         reason = nullif(btrim(p_reason), '')
   WHERE id = p_claim_id;

  INSERT INTO public.audit_log (actor_id, actor_email, action, entity_type, entity_id, detail)
  VALUES (auth.uid(), auth.jwt() ->> 'email', 'placement.claim_decision', 'advertisement', v_claim.advert_id::text,
          jsonb_build_object('claim_id', p_claim_id, 'owner_id', v_claim.owner_id,
                             'approved', p_approve, 'reason', nullif(btrim(p_reason), ''),
                             'lifecycle', v_lifecycle, 'via', coalesce(auth.role(), 'direct')));
END;
$fn$;

-- Reject an owner's verification with a reason. media_owner_after_write
-- audits the status change (and downgrades if they were verified); this
-- writes the reason the owner sees.
CREATE OR REPLACE FUNCTION public.admin_reject_owner(p_owner_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an admin can reject a media owner' USING errcode = '42501';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required to reject a media owner' USING errcode = '22023';
  END IF;

  UPDATE public.media_owners SET verification = 'rejected' WHERE id = p_owner_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Media owner % does not exist', p_owner_id USING errcode = 'P0002';
  END IF;

  INSERT INTO public.audit_log (actor_id, actor_email, action, entity_type, entity_id, detail)
  VALUES (auth.uid(), auth.jwt() ->> 'email', 'media_owner.rejected', 'media_owner', p_owner_id::text,
          jsonb_build_object('reason', btrim(p_reason), 'via', coalesce(auth.role(), 'direct')));
END;
$fn$;

REVOKE ALL ON FUNCTION public.enable_media_owner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_owner_verification(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owner_create_placement(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owner_update_placement(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owner_record_availability(uuid, text, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owner_claim_placement(uuid, uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owner_verification_reason(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_media_owner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_review_placement(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_decide_claim(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_reject_owner(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.enable_media_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_owner_verification(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owner_create_placement(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owner_update_placement(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owner_record_availability(uuid, text, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owner_claim_placement(uuid, uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owner_verification_reason(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_media_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_placement(uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_decide_claim(uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reject_owner(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.media_owner_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placement_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placement_imports ENABLE ROW LEVEL SECURITY;

-- media_owners stays admin-only under RLS. Members read their owner through
-- get_my_media_owner (selected columns). The drop removes the member policy
-- an earlier draft of this file created, in case it was ever applied.
DROP POLICY IF EXISTS "Members read their media owner" ON public.media_owners;

-- Documents: members record and read their own; evidence is never edited or
-- deleted by them. Clients must not chain .select() onto the insert.
DROP POLICY IF EXISTS "Admins manage media owner documents" ON public.media_owner_documents;
CREATE POLICY "Admins manage media owner documents" ON public.media_owner_documents
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Members read media owner documents" ON public.media_owner_documents;
CREATE POLICY "Members read media owner documents" ON public.media_owner_documents
  FOR SELECT TO authenticated USING (public.is_media_owner_member(owner_id));

DROP POLICY IF EXISTS "Members record media owner documents" ON public.media_owner_documents;
CREATE POLICY "Members record media owner documents" ON public.media_owner_documents
  FOR INSERT TO authenticated
  WITH CHECK (public.is_media_owner_member(owner_id) AND uploaded_by = auth.uid());

-- Claims: filed only through owner_claim_placement, decided only through
-- admin_decide_claim. Members read their own (status and reason).
DROP POLICY IF EXISTS "Admins manage placement claims" ON public.placement_claims;
CREATE POLICY "Admins manage placement claims" ON public.placement_claims
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Members read placement claims" ON public.placement_claims;
CREATE POLICY "Members read placement claims" ON public.placement_claims
  FOR SELECT TO authenticated USING (public.is_media_owner_member(owner_id));

-- Imports: the client records its own import (recordImport); history is
-- read-only afterwards.
DROP POLICY IF EXISTS "Admins manage placement imports" ON public.placement_imports;
CREATE POLICY "Admins manage placement imports" ON public.placement_imports
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Members read placement imports" ON public.placement_imports;
CREATE POLICY "Members read placement imports" ON public.placement_imports
  FOR SELECT TO authenticated USING (public.is_media_owner_member(owner_id));

DROP POLICY IF EXISTS "Members record placement imports" ON public.placement_imports;
CREATE POLICY "Members record placement imports" ON public.placement_imports
  FOR INSERT TO authenticated
  WITH CHECK (public.is_media_owner_member(owner_id) AND created_by = auth.uid());

-- advertisements: EVERY UPDATE and DELETE policy keyed on user_id, narrowed
-- to rows with no media owner. Permissive policies OR together, so one
-- policy left wide would undo the rest. Four exist:
--   "Owners can update advertisements" / "Owners can delete advertisements"
--     from 20240601000200_create_advertisements_table.sql;
--   "Users can update own advertisements" / "Users can delete own
--     advertisements", present on live (auth.uid() = user_id) but in no
--     repo migration.
-- Same names, one added condition. Both sides are cast to text so the
-- expression holds whether user_id is uuid (live) or text (the repo DDL).
-- An owned placement changes only through the owner functions or an admin,
-- so a user_id match alone cannot touch it (spec section 5).
-- "Admins can manage advertisements" (20240701000000_admin_access.sql) is
-- not touched.
DROP POLICY IF EXISTS "Owners can update advertisements" ON public.advertisements;
CREATE POLICY "Owners can update advertisements" ON public.advertisements
  FOR UPDATE TO authenticated USING (auth.uid()::text = user_id::text AND owner_id IS NULL);

DROP POLICY IF EXISTS "Owners can delete advertisements" ON public.advertisements;
CREATE POLICY "Owners can delete advertisements" ON public.advertisements
  FOR DELETE TO authenticated USING (auth.uid()::text = user_id::text AND owner_id IS NULL);

DROP POLICY IF EXISTS "Users can update own advertisements" ON public.advertisements;
CREATE POLICY "Users can update own advertisements" ON public.advertisements
  FOR UPDATE TO authenticated USING (auth.uid()::text = user_id::text AND owner_id IS NULL);

DROP POLICY IF EXISTS "Users can delete own advertisements" ON public.advertisements;
CREATE POLICY "Users can delete own advertisements" ON public.advertisements
  FOR DELETE TO authenticated USING (auth.uid()::text = user_id::text AND owner_id IS NULL);

-- ---------------------------------------------------------------------------
-- 9. Views: pending_review is not public
-- ---------------------------------------------------------------------------

-- The v2 body (20261109020000_placement_trust_v2.sql), unchanged except
-- pending_review joins the excluded lifecycles. Same columns, same order.
CREATE OR REPLACE VIEW public.placement_trust AS
SELECT
  a.id AS advert_id,
  CASE a.lifecycle
    WHEN 'partner_verified' THEN 'partner_verified'
    WHEN 'partner_supplied' THEN 'partner_supplied'
    ELSE 'source_listed'
  END AS trust_label,
  s.availability AS availability,
  CASE WHEN s.availability <> 'requires_confirmation' THEN c.confirmed_at END AS availability_confirmed_at,
  CASE WHEN s.availability <> 'requires_confirmation' THEN c.valid_until END AS availability_valid_until,
  CASE WHEN s.availability <> 'requires_confirmation' THEN c.period_to END AS period_to,
  CASE WHEN o.verification <> 'rejected' THEN o.name END AS owner_name,
  CASE WHEN o.verification <> 'rejected' THEN o.website END AS owner_website,
  fs.basis AS price_basis,
  fs.as_of AS price_as_of,
  CASE WHEN s.availability <> 'requires_confirmation' THEN c.period_from END AS period_from,
  CASE WHEN s.availability <> 'requires_confirmation' AND cb.verification <> 'rejected' THEN cb.name END AS confirmed_by_name,
  CASE WHEN s.availability <> 'requires_confirmation' THEN c.method END AS confirmation_method
FROM public.advertisements a
LEFT JOIN LATERAL (
  SELECT pa.status, pa.confirmed_at, pa.valid_until, pa.period_from, pa.period_to, pa.confirmed_by_owner, pa.method
    FROM public.placement_availability pa
   WHERE pa.advert_id = a.id
   ORDER BY pa.confirmed_at DESC, pa.created_at DESC
   LIMIT 1
) c ON true
CROSS JOIN LATERAL (
  SELECT (now() AT TIME ZONE 'Africa/Lagos')::date AS today
) d
-- The latest confirmation, read against now() (validity) and today (period).
-- The lapse checks come first, so no status survives an ended period.
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN c.valid_until IS NULL OR c.valid_until <= now() THEN 'requires_confirmation'
    WHEN c.period_to IS NOT NULL AND c.period_to < d.today THEN 'requires_confirmation'
    WHEN c.status = 'available' AND c.period_from <= d.today THEN 'confirmed_available'
    WHEN c.status = 'available' AND c.period_from > d.today THEN 'available_from'
    WHEN c.status IN ('booked', 'unavailable', 'maintenance') THEN c.status
    ELSE 'requires_confirmation'
  END AS availability
) s
LEFT JOIN public.media_owners o ON o.id = a.owner_id
LEFT JOIN public.media_owners cb ON cb.id = c.confirmed_by_owner
LEFT JOIN public.placement_field_source fs ON fs.advert_id = a.id AND fs.field = 'pricing'
WHERE a.lifecycle NOT IN ('rejected', 'archived', 'pending_review');

COMMENT ON VIEW public.placement_trust IS
  'Public trust state per placement. Availability is the latest confirmation read against now() and the Lagos day, so it lapses without a job. A future period reads available_from. confirmed_by_name is the owner the confirmation names, never the linked owner by default. Rejected, archived and pending_review placements are excluded.';

REVOKE ALL ON public.placement_trust FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.placement_trust TO anon, authenticated;

-- v1 body plus pending_review: an owner whose only placements are waiting for
-- review has nothing listed, so is not shown.
CREATE OR REPLACE VIEW public.media_owners_public AS
SELECT o.id, o.name, o.website, o.country_codes, o.verification
FROM public.media_owners o
WHERE o.verification <> 'rejected'
  AND EXISTS (
    SELECT 1 FROM public.advertisements a
     WHERE a.owner_id = o.id
       AND a.lifecycle NOT IN ('rejected', 'archived', 'pending_review')
  );

REVOKE ALL ON public.media_owners_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.media_owners_public TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. Storage
-- ---------------------------------------------------------------------------

-- verification-docs (private, 20240808000000_trust_and_verification.sql):
-- media-owners/{owner_id}/... is read and written by that owner's business
-- members. Admins already read the whole bucket ("Owners read own
-- verification docs"). No member UPDATE or DELETE: evidence stays as filed.
DROP POLICY IF EXISTS "Media owner members read owner documents" ON storage.objects;
CREATE POLICY "Media owner members read owner documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'verification-docs'
         AND (storage.foldername(name))[1] = 'media-owners'
         AND public.media_owner_folder_access((storage.foldername(name))[2]));

DROP POLICY IF EXISTS "Media owner members upload owner documents" ON storage.objects;
CREATE POLICY "Media owner members upload owner documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'verification-docs'
              AND (storage.foldername(name))[1] = 'media-owners'
              AND public.media_owner_folder_access((storage.foldername(name))[2]));

-- business-images (public): "Authenticated can upload business images" lets any
-- signed-in user insert anywhere in the bucket, so a permissive policy here
-- would add nothing. A RESTRICTIVE one does: under placements/{advert_id}/
-- only that placement's owner members may write. Every other path in the
-- bucket, and every other bucket, passes this check untouched.
DROP POLICY IF EXISTS "Placement photos only from the placement owner" ON storage.objects;
CREATE POLICY "Placement photos only from the placement owner" ON storage.objects
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'business-images'
              OR coalesce((storage.foldername(name))[1], '') <> 'placements'
              OR public.placement_folder_access((storage.foldername(name))[2]));

DROP POLICY IF EXISTS "Placement photo changes only from the placement owner" ON storage.objects;
CREATE POLICY "Placement photo changes only from the placement owner" ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'business-images'
         OR coalesce((storage.foldername(name))[1], '') <> 'placements'
         OR public.placement_folder_access((storage.foldername(name))[2]))
  WITH CHECK (bucket_id <> 'business-images'
              OR coalesce((storage.foldername(name))[1], '') <> 'placements'
              OR public.placement_folder_access((storage.foldername(name))[2]));

-- Any member of the owner may replace a placement photo, not only the member
-- who uploaded it (the bucket's own UPDATE policy is per uploader).
DROP POLICY IF EXISTS "Placement owner members replace placement photos" ON storage.objects;
CREATE POLICY "Placement owner members replace placement photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'business-images'
         AND (storage.foldername(name))[1] = 'placements'
         AND public.placement_folder_access((storage.foldername(name))[2]))
  WITH CHECK (bucket_id = 'business-images'
              AND (storage.foldername(name))[1] = 'placements'
              AND public.placement_folder_access((storage.foldername(name))[2]));

-- ---------------------------------------------------------------------------
-- 11. Expiry notices (in-app only)
-- ---------------------------------------------------------------------------

-- One notice per member of the owning business when a placement's LATEST
-- confirmation lapses within 3 days. A superseded confirmation is not
-- noticed. notified_at is claimed first (UPDATE ... WHERE notified_at IS
-- NULL), so two overlapping runs cannot both send. SQL-only, the same
-- pattern as dispatch_scheduled_update_alerts: nothing leaves the database,
-- so there is no secret to hold; web callers are refused and revoked.
CREATE OR REPLACE FUNCTION public.dispatch_confirmation_expiry_notices()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r       record;
  v_hit   uuid;
  v_count integer := 0;
BEGIN
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Only the scheduler sends confirmation notices' USING errcode = '42501';
  END IF;

  FOR r IN
    SELECT latest.id AS confirmation_id, latest.valid_until, a.title, o.business_id
      FROM (
        SELECT DISTINCT ON (pa.advert_id) pa.id, pa.advert_id, pa.valid_until, pa.notified_at
          FROM public.placement_availability pa
         ORDER BY pa.advert_id, pa.confirmed_at DESC, pa.created_at DESC
      ) latest
      JOIN public.advertisements a ON a.id = latest.advert_id
      JOIN public.media_owners o ON o.id = a.owner_id
     WHERE latest.valid_until > now()
       AND latest.valid_until <= now() + interval '3 days'
       AND latest.notified_at IS NULL
       AND o.business_id IS NOT NULL
       AND a.lifecycle NOT IN ('rejected', 'archived')
  LOOP
    v_hit := NULL;
    UPDATE public.placement_availability SET notified_at = now() WHERE id = r.confirmation_id AND notified_at IS NULL
    RETURNING id INTO v_hit;
    CONTINUE WHEN v_hit IS NULL;

    INSERT INTO public.notifications (user_id, title, body, type, link)
    SELECT m.user_id,
           'Availability confirmation expiring',
           format('%s: the availability you confirmed runs out on %s. Confirm it again to keep it showing to advertisers.',
                  r.title, to_char(r.valid_until AT TIME ZONE 'Africa/Lagos', 'FMDD Mon YYYY')),
           'placement_confirmation_expiring',
           '/dashboard?tab=media-owner'
      FROM (
        SELECT u.id AS user_id
          FROM public.businesses b
          JOIN auth.users u ON u.id::text = b.user_id::text
         WHERE b.id = r.business_id
        UNION
        SELECT bm.user_id
          FROM public.business_members bm
         WHERE bm.business_id = r.business_id
           AND bm.status = 'active'
           AND bm.user_id IS NOT NULL
      ) m;

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.dispatch_confirmation_expiry_notices() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.dispatch_confirmation_expiry_notices() IS
  'In-app notices to a media owner''s business members when a placement''s latest availability confirmation lapses within 3 days. Once per confirmation (notified_at). Runs every 15 minutes from pg_cron.';

SELECT cron.unschedule('nowopen-confirmation-expiry')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nowopen-confirmation-expiry');
SELECT cron.schedule('nowopen-confirmation-expiry', '*/15 * * * *',
  $cron$select public.dispatch_confirmation_expiry_notices();$cron$);
