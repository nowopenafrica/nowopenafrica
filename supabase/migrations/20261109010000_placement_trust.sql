-- Placement trust model: every advertising placement gets a trust state the
-- database enforces, rather than one a component asserts.
--
-- WHAT THIS ADDS (spec docs/superpowers/specs/2026-10-31-inventory-trust-model-design.md, Part B)
--
--   media_owners             who owns or represents a placement, and whether a
--                            human has checked their documents (B1)
--   media_owner_contacts     how to reach them; admin-only; no source, no row (B1)
--   advertisements           + owner_id, owner_role, lifecycle, country_code,
--                            audience_note, estimated_daily_traffic (B2, B4).
--                            Nothing renamed, nothing dropped: URLs and saved
--                            plans keep working.
--   placement_availability   append-only availability statements that expire
--                            by medium (B3)
--   placement_freshness      medium group -> days, editable without code (B3)
--   placement_field_source   where pricing / dimensions / image / audience came
--                            from (B4)
--   placement_trust          the public, read-only answer (B5)
--   media_owners_public      owner name, website, countries, verification (B6)
--   placement_confirmations_expiring
--                            admin-only: latest confirmations that lapse within
--                            3 days. Computed at read. The spec asked for a daily
--                            job to write this list; a view gives the same answer
--                            with no cron, no secret and nothing sent (ruling in
--                            the plan ledger).
--
-- WHY
--
-- All 97 placements are unverified imports with no owner (see
-- 20260907181000_advert_inventory_provenance.sql). The Promote pages must be
-- able to say "Source listed" and "Availability requires confirmation" for
-- them, and must never say "verified" or "available" unless a person checked.
-- So:
--
--   * partner_verified is IMPOSSIBLE without a linked owner whose verification
--     is 'verified' (trigger, because a CHECK cannot read another row).
--     Un-verifying an owner downgrades its placements to partner_supplied.
--   * availability is never stored as a flag. It is the latest confirmation,
--     read against now(), so it lapses on its own.
--   * only an admin (or a direct/service connection) may change lifecycle,
--     the owner link or the owner role. The existing "Owners can update
--     advertisements" policy lets a row's user_id edit it; without this guard
--     that user could link their row to a verified owner and promote it.
--   * every lifecycle change, owner verification change, owner link and
--     confirmation writes to public.audit_log.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--
--   * It does not touch rights_holder or rights_verified_*. Those stay null
--     until a real owner claims a placement.
--   * It does not invent a date for the existing rate card: the pricing source
--     rows it writes carry as_of = NULL because nobody recorded when that
--     rate card was published.
--   * It marks nothing verified and records no confirmations.
--
-- BACKFILL
--
--   lifecycle = 'imported' on every row (the column default already does this;
--   the UPDATE is explicit and limited to null/default rows so a re-run never
--   undoes an admin's change). country_code from the text after the LAST comma
--   of location ("City, Country"), mapped by name; a country not in the list
--   stays NULL rather than guessed. One placement_field_source row per priced
--   row: pricing, source_listed, 'published rate card'.
--
-- HOW TO VERIFY (Task 2 of the plan, controller only, founder go-ahead)
--
--   select lifecycle, count(*) from advertisements group by 1;      -- 97 imported
--   select count(*) from advertisements where country_code is null; -- expect 0
--   select count(*) from placement_field_source;                    -- = priced rows
--   select trust_label, availability, count(*) from placement_trust group by 1,2;
--                                       -- all source_listed / requires_confirmation
--   and, under an anon JWT, selects on media_owner_contacts and
--   placement_availability return no rows.
--
-- EXPECTED LINTER WARNINGS
--
-- The Supabase database linter will report "security definer view" for
-- public.placement_trust and public.media_owners_public. That is intended:
-- both run with the view owner's rights so an anonymous reader gets the
-- derived, public-safe answer without any read access to media_owners,
-- placement_availability or placement_field_source. Each names its columns
-- explicitly (no contact, no note, no verification note) and has ALL revoked
-- with only SELECT granted back. placement_confirmations_expiring is
-- security_invoker and is not flagged.
--
-- Written with line comments only: Postgres block comments nest, and a stray
-- terminator in prose has broken a push before.

-- ---------------------------------------------------------------------------
-- B1. Media owners
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.media_owners (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL CHECK (btrim(name) <> ''),
  website           text,
  country_codes     text[] NOT NULL DEFAULT '{}',
  business_id       uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  verification      text NOT NULL DEFAULT 'unverified' CHECK (verification IN ('unverified', 'documents_submitted', 'verified', 'rejected')),
  verified_at       timestamptz,
  verified_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  verification_note text,
  relationship      text NOT NULL DEFAULT 'prospect' CHECK (relationship IN ('prospect', 'contacted', 'onboarding', 'active', 'paused', 'declined')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- Verification has a time. Who did it is stamped by media_owners_before_write
  -- from auth.uid() (client values ignored) and is also in audit_log. verified_by
  -- is not required here so that ON DELETE SET NULL can never make deleting an
  -- admin's users row fail this CHECK.
  CONSTRAINT media_owners_verified_has_time
    CHECK (verification <> 'verified' OR verified_at IS NOT NULL),
  -- B7: verifying requires a note on which documents were checked.
  CONSTRAINT media_owners_verified_has_note
    CHECK (verification <> 'verified' OR btrim(coalesce(verification_note, '')) <> '')
);

COMMENT ON TABLE public.media_owners IS
  'Owners and authorised representatives of advertising placements. Public reads go through media_owners_public; this table is admin-only.';

CREATE TABLE IF NOT EXISTS public.media_owner_contacts (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id                   uuid NOT NULL REFERENCES public.media_owners(id) ON DELETE CASCADE,
  kind                       text NOT NULL CHECK (kind IN ('email', 'phone', 'form', 'social', 'other')),
  value                      text NOT NULL CHECK (btrim(value) <> ''),
  -- Where the contact was found. No source, no row.
  source_url                 text NOT NULL CHECK (btrim(source_url) <> ''),
  found_at                   timestamptz NOT NULL,
  confidence                 text NOT NULL DEFAULT 'low' CHECK (confidence IN ('high', 'medium', 'low')),
  is_public_business_contact boolean NOT NULL DEFAULT false,
  created_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_owner_contacts_owner ON public.media_owner_contacts (owner_id);

-- ---------------------------------------------------------------------------
-- B2. Placements: extend advertisements (no rename, no drop)
-- ---------------------------------------------------------------------------

-- owner_id has no ON DELETE action on purpose: deleting an owner who still has
-- placements fails loudly instead of silently orphaning a partner_verified row.
ALTER TABLE public.advertisements
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.media_owners(id),
  ADD COLUMN IF NOT EXISTS owner_role text,
  ADD COLUMN IF NOT EXISTS lifecycle text NOT NULL DEFAULT 'imported',
  ADD COLUMN IF NOT EXISTS country_code text,
  -- B4 audience fields: settable only with a partner or verified audience source.
  ADD COLUMN IF NOT EXISTS audience_note text,
  ADD COLUMN IF NOT EXISTS estimated_daily_traffic integer;

ALTER TABLE public.advertisements DROP CONSTRAINT IF EXISTS advertisements_lifecycle_check;
ALTER TABLE public.advertisements ADD CONSTRAINT advertisements_lifecycle_check
  CHECK (lifecycle IN ('discovered', 'imported', 'partner_supplied', 'partner_verified', 'rejected', 'archived'));

ALTER TABLE public.advertisements DROP CONSTRAINT IF EXISTS advertisements_owner_role_check;
ALTER TABLE public.advertisements ADD CONSTRAINT advertisements_owner_role_check
  CHECK (owner_role IS NULL OR owner_role IN ('owner', 'authorised_representative'));

ALTER TABLE public.advertisements DROP CONSTRAINT IF EXISTS advertisements_owner_role_required;
ALTER TABLE public.advertisements ADD CONSTRAINT advertisements_owner_role_required
  CHECK (owner_id IS NULL OR owner_role IS NOT NULL);

ALTER TABLE public.advertisements DROP CONSTRAINT IF EXISTS advertisements_country_code_format;
ALTER TABLE public.advertisements ADD CONSTRAINT advertisements_country_code_format
  CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$');

ALTER TABLE public.advertisements DROP CONSTRAINT IF EXISTS advertisements_daily_traffic_nonnegative;
ALTER TABLE public.advertisements ADD CONSTRAINT advertisements_daily_traffic_nonnegative
  CHECK (estimated_daily_traffic IS NULL OR estimated_daily_traffic >= 0);

CREATE INDEX IF NOT EXISTS idx_advertisements_owner ON public.advertisements (owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_advertisements_lifecycle ON public.advertisements (lifecycle);

COMMENT ON COLUMN public.advertisements.lifecycle IS
  'Where the placement stands now. provenance records how it arrived. partner_verified requires a linked owner whose verification is verified (trigger placement_trust_guard).';

-- ---------------------------------------------------------------------------
-- B3. Freshness windows and availability confirmations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.placement_freshness (
  medium_group text PRIMARY KEY,
  days         integer NOT NULL CHECK (days > 0),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ON CONFLICT DO NOTHING: an admin's edited window survives a re-run.
INSERT INTO public.placement_freshness (medium_group, days) VALUES
  ('outdoor', 30), ('transit', 30), ('digital', 14), ('broadcast', 7), ('print', 7), ('online', 7)
ON CONFLICT (medium_group) DO NOTHING;

-- Mirrors ADVERT_CATEGORY_GROUPS in src/data/advertCategories.ts. Exact,
-- case-sensitive match, as groupForAdvertCategory does. Unknown -> NULL, and
-- the stamp trigger then uses 7 days, the strictest window.
CREATE OR REPLACE FUNCTION public.placement_medium_group(category text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE
    WHEN category IN ('Billboard', 'Street Furniture', 'Stadium') THEN 'outdoor'
    WHEN category IN ('Transit', 'Vehicle Wrap', 'Airport') THEN 'transit'
    WHEN category IN ('Digital Screen', 'Mall Media', 'Cinema') THEN 'digital'
    WHEN category IN ('Radio', 'Television') THEN 'broadcast'
    WHEN category IN ('Print') THEN 'print'
    WHEN category IN ('Online') THEN 'online'
    ELSE NULL
  END;
$fn$;

COMMENT ON FUNCTION public.placement_medium_group(text) IS
  'Medium group for a placement category. Must mirror ADVERT_CATEGORY_GROUPS in src/data/advertCategories.ts.';

CREATE TABLE IF NOT EXISTS public.placement_availability (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advert_id          uuid NOT NULL REFERENCES public.advertisements(id) ON DELETE CASCADE,
  status             text NOT NULL CHECK (status IN ('available', 'booked', 'unavailable', 'maintenance')),
  period_from        date,
  period_to          date,
  confirmed_at       timestamptz NOT NULL DEFAULT now(),
  confirmed_by_owner uuid REFERENCES public.media_owners(id) ON DELETE SET NULL,
  recorded_by        uuid REFERENCES public.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  method             text NOT NULL CHECK (method IN ('portal', 'email', 'phone', 'document', 'admin')),
  -- Always set by placement_availability_stamp; a supplied value is ignored.
  valid_until        timestamptz NOT NULL,
  note               text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT placement_availability_period_order
    CHECK (period_to IS NULL OR period_from IS NULL OR period_to >= period_from)
);

CREATE INDEX IF NOT EXISTS idx_placement_availability_latest
  ON public.placement_availability (advert_id, confirmed_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_placement_availability_valid_until
  ON public.placement_availability (valid_until);

-- valid_until = confirmed_at + the window for the placement's medium. Invoker
-- rights are enough: advertisements and placement_freshness are publicly
-- readable. A confirmation from an owner must come from THAT placement's
-- owner, and a confirmation may not be dated in the future (it would extend
-- its own validity).
CREATE OR REPLACE FUNCTION public.placement_availability_stamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_category text;
  v_owner    uuid;
  v_days     integer;
BEGIN
  SELECT coalesce(a.category, a.type), a.owner_id
    INTO v_category, v_owner
    FROM public.advertisements a
   WHERE a.id = NEW.advert_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Placement % does not exist', NEW.advert_id USING errcode = '23503';
  END IF;

  IF NEW.confirmed_by_owner IS NOT NULL AND NEW.confirmed_by_owner IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'A confirmation can only be attributed to the owner linked to this placement'
      USING errcode = '23514';
  END IF;

  NEW.confirmed_at := coalesce(NEW.confirmed_at, now());
  IF NEW.confirmed_at > now() + interval '1 hour' THEN
    RAISE EXCEPTION 'A confirmation cannot be dated in the future' USING errcode = '23514';
  END IF;

  SELECT f.days INTO v_days
    FROM public.placement_freshness f
   WHERE f.medium_group = public.placement_medium_group(v_category);

  NEW.valid_until := NEW.confirmed_at + make_interval(days => coalesce(v_days, 7));
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS placement_availability_stamp ON public.placement_availability;
CREATE TRIGGER placement_availability_stamp
  BEFORE INSERT ON public.placement_availability
  FOR EACH ROW EXECUTE FUNCTION public.placement_availability_stamp();

-- Append-only: what was confirmed, when, for which placement and until when
-- can never be rewritten. Only the admin note may change.
CREATE OR REPLACE FUNCTION public.placement_availability_freeze()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.valid_until IS DISTINCT FROM OLD.valid_until
     OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
     OR NEW.advert_id IS DISTINCT FROM OLD.advert_id
     OR NEW.period_from IS DISTINCT FROM OLD.period_from
     OR NEW.period_to IS DISTINCT FROM OLD.period_to
     OR NEW.confirmed_by_owner IS DISTINCT FROM OLD.confirmed_by_owner
     OR NEW.method IS DISTINCT FROM OLD.method
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.recorded_by IS DISTINCT FROM OLD.recorded_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Availability confirmations are append-only; record a new confirmation instead'
      USING errcode = '42501';
  END IF;
  -- The note is the one editable column, and only an admin (or a no-JWT
  -- connection) may change it. RLS says the same; this holds if a policy widens.
  IF NEW.note IS DISTINCT FROM OLD.note
     AND coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an admin can annotate an availability confirmation' USING errcode = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS placement_availability_freeze ON public.placement_availability;
CREATE TRIGGER placement_availability_freeze
  BEFORE UPDATE ON public.placement_availability
  FOR EACH ROW EXECUTE FUNCTION public.placement_availability_freeze();

-- ---------------------------------------------------------------------------
-- B4. Field provenance
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.placement_field_source (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advert_id    uuid NOT NULL REFERENCES public.advertisements(id) ON DELETE CASCADE,
  field        text NOT NULL CHECK (field IN ('pricing', 'dimensions', 'image_url', 'audience')),
  basis        text NOT NULL CHECK (basis IN ('source_listed', 'partner_supplied', 'verified')),
  source_label text NOT NULL CHECK (btrim(source_label) <> ''),
  as_of        date,
  recorded_by  uuid REFERENCES public.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT placement_field_source_one_per_field UNIQUE (advert_id, field)
);

-- updated_at touch for the tables that carry one (media_owners has its own
-- BEFORE trigger, media_owners_before_write, which also touches).
CREATE OR REPLACE FUNCTION public.placement_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS placement_field_source_touch ON public.placement_field_source;
CREATE TRIGGER placement_field_source_touch
  BEFORE UPDATE ON public.placement_field_source
  FOR EACH ROW EXECUTE FUNCTION public.placement_touch_updated_at();

DROP TRIGGER IF EXISTS placement_freshness_touch ON public.placement_freshness;
CREATE TRIGGER placement_freshness_touch
  BEFORE UPDATE ON public.placement_freshness
  FOR EACH ROW EXECUTE FUNCTION public.placement_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Trust guard on advertisements (B2 constraint, B4 audience rule, B6 who)
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER because it reads media_owners and placement_field_source,
-- which are admin-only under RLS: as invoker, an owner editing their own row
-- would see no owner row and be refused for the wrong reason.
--
-- Who may change the trust columns (lifecycle, owner_id, owner_role):
--   admin (public.is_admin())                    yes
--   no JWT: service_role, SQL editor, migration  yes
--   any other anon / authenticated caller        no, raises
-- Guarded on auth.role(): inside a definer function current_user is the
-- function owner and would refuse nobody.
CREATE OR REPLACE FUNCTION public.placement_trust_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_web_non_admin boolean := coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_admin();
  v_verification  text;
BEGIN
  IF v_web_non_admin THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.owner_id IS NOT NULL OR NEW.owner_role IS NOT NULL OR NEW.lifecycle <> 'imported' THEN
        RAISE EXCEPTION 'Only an admin can set a placement''s owner or lifecycle' USING errcode = '42501';
      END IF;
    ELSIF (NEW.lifecycle, NEW.owner_id, NEW.owner_role)
          IS DISTINCT FROM (OLD.lifecycle, OLD.owner_id, OLD.owner_role) THEN
      RAISE EXCEPTION 'Only an admin can change a placement''s owner or lifecycle' USING errcode = '42501';
    END IF;
  END IF;

  -- partner_verified needs a linked owner whose documents a person checked.
  -- Enforced for every caller, the service role included.
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

DROP TRIGGER IF EXISTS placement_trust_guard ON public.advertisements;
CREATE TRIGGER placement_trust_guard
  BEFORE INSERT OR UPDATE ON public.advertisements
  FOR EACH ROW EXECUTE FUNCTION public.placement_trust_guard();

-- Audit lifecycle changes and owner links, and (M3) demote a 'verified' field
-- source when a non-admin edits the field it vouched for. SECURITY DEFINER
-- because audit_log's insert policy requires actor_id = auth.uid() and
-- is_admin(), which a downgrade cascaded from media_owners, a service call or
-- an owner's own edit cannot meet; and placement_field_source is admin-only.
--
-- A lifecycle reason, when there is one, arrives through the transaction-local
-- setting nowopen.lifecycle_reason, set only by public.set_placement_lifecycle.
-- That keeps the lifecycle change to ONE audit row carrying its reason.
CREATE OR REPLACE FUNCTION public.placement_trust_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_web_non_admin     boolean := coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_admin();
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
  IF v_web_non_admin THEN
    RAISE EXCEPTION 'Only an admin can change a placement''s owner or lifecycle' USING errcode = '42501';
  END IF;

  IF v_lifecycle_changed THEN
    INSERT INTO public.audit_log (actor_id, actor_email, action, entity_type, entity_id, detail)
    VALUES (auth.uid(), auth.jwt() ->> 'email', 'placement.lifecycle', 'advertisement', NEW.id::text,
            jsonb_build_object(
              'from', CASE WHEN TG_OP = 'UPDATE' THEN OLD.lifecycle END,
              'to', NEW.lifecycle,
              'reason', nullif(current_setting('nowopen.lifecycle_reason', true), ''),
              'via', coalesce(auth.role(), 'direct')));
  END IF;

  IF v_owner_changed THEN
    INSERT INTO public.audit_log (actor_id, actor_email, action, entity_type, entity_id, detail)
    VALUES (auth.uid(), auth.jwt() ->> 'email', 'placement.owner_link', 'advertisement', NEW.id::text,
            jsonb_build_object(
              'from_owner', CASE WHEN TG_OP = 'UPDATE' THEN OLD.owner_id END,
              'from_role', CASE WHEN TG_OP = 'UPDATE' THEN OLD.owner_role END,
              'to_owner', NEW.owner_id,
              'to_role', NEW.owner_role,
              'via', coalesce(auth.role(), 'direct')));
  END IF;

  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS placement_trust_audit ON public.advertisements;
CREATE TRIGGER placement_trust_audit
  AFTER INSERT OR UPDATE ON public.advertisements
  FOR EACH ROW EXECUTE FUNCTION public.placement_trust_audit();

-- ---------------------------------------------------------------------------
-- Owner verification: touch, audit, and downgrade on un-verify
-- ---------------------------------------------------------------------------

-- BEFORE write on media_owners: touch updated_at and (M2) stamp who verified
-- and when from the request, ignoring whatever the client sent. Leaving
-- 'verified' clears both; the history is in audit_log.
CREATE OR REPLACE FUNCTION public.media_owners_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;

  IF NEW.verification = 'verified'
     AND (TG_OP = 'INSERT' OR OLD.verification IS DISTINCT FROM 'verified') THEN
    NEW.verified_by := auth.uid();
    NEW.verified_at := now();
  ELSIF NEW.verification = 'verified' THEN
    NEW.verified_by := OLD.verified_by;
    NEW.verified_at := OLD.verified_at;
  ELSE
    NEW.verified_by := NULL;
    NEW.verified_at := NULL;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS media_owners_before_write ON public.media_owners;
CREATE TRIGGER media_owners_before_write
  BEFORE INSERT OR UPDATE ON public.media_owners
  FOR EACH ROW EXECUTE FUNCTION public.media_owners_before_write();

-- SECURITY DEFINER so the downgrade reaches every linked placement and the
-- audit rows are written whatever the caller. The downgrade UPDATE fires
-- placement_trust_audit, so each downgraded placement is audited too.
CREATE OR REPLACE FUNCTION public.media_owner_after_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.verification IS NOT DISTINCT FROM OLD.verification THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.verification = 'unverified' THEN
    RETURN NULL;
  END IF;

  -- RLS already limits media_owners writes to admins; refuse anyone else here too.
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an admin can change a media owner''s verification' USING errcode = '42501';
  END IF;

  INSERT INTO public.audit_log (actor_id, actor_email, action, entity_type, entity_id, detail)
  VALUES (auth.uid(), auth.jwt() ->> 'email', 'media_owner.verification', 'media_owner', NEW.id::text,
          jsonb_build_object(
            'from', CASE WHEN TG_OP = 'UPDATE' THEN OLD.verification END,
            'to', NEW.verification,
            'via', coalesce(auth.role(), 'direct')));

  IF TG_OP = 'UPDATE' AND OLD.verification = 'verified' AND NEW.verification <> 'verified' THEN
    UPDATE public.advertisements
       SET lifecycle = 'partner_supplied'
     WHERE owner_id = NEW.id
       AND lifecycle = 'partner_verified';
  END IF;

  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS media_owner_after_write ON public.media_owners;
CREATE TRIGGER media_owner_after_write
  AFTER INSERT OR UPDATE ON public.media_owners
  FOR EACH ROW EXECUTE FUNCTION public.media_owner_after_write();

-- ---------------------------------------------------------------------------
-- Confirmation audit
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.placement_availability_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- RLS already limits inserts to admins; refuse anyone else here too.
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_admin() THEN
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
            'via', coalesce(auth.role(), 'direct')));
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS placement_availability_audit ON public.placement_availability;
CREATE TRIGGER placement_availability_audit
  AFTER INSERT ON public.placement_availability
  FOR EACH ROW EXECUTE FUNCTION public.placement_availability_audit();

-- ---------------------------------------------------------------------------
-- B7. Lifecycle with a reason (called by the admin dashboard's setLifecycle)
-- ---------------------------------------------------------------------------

-- Reject, archive or otherwise move a placement, with a required reason.
-- The reason rides a transaction-local setting into placement_trust_audit, so
-- the change produces exactly ONE audit_log row and its detail carries the
-- reason. placement_trust_guard still applies: partner_verified needs a
-- verified owner whoever calls this.
--
-- Admin-only on the web. A no-JWT caller (service_role, SQL editor) is let
-- through, as everywhere in this repo's auth.role() pattern: it can already
-- write the table directly, so refusing it here buys nothing.
CREATE OR REPLACE FUNCTION public.set_placement_lifecycle(p_advert_id uuid, p_lifecycle text, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_current text;
BEGIN
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an admin can change a placement''s lifecycle' USING errcode = '42501';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required to change a placement''s lifecycle' USING errcode = '22023';
  END IF;

  IF p_lifecycle IS NULL OR p_lifecycle NOT IN
     ('discovered', 'imported', 'partner_supplied', 'partner_verified', 'rejected', 'archived') THEN
    RAISE EXCEPTION 'Unknown lifecycle %', coalesce(p_lifecycle, 'null') USING errcode = '22023';
  END IF;

  SELECT a.lifecycle INTO v_current
    FROM public.advertisements a
   WHERE a.id = p_advert_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Placement % does not exist', p_advert_id USING errcode = 'P0002';
  END IF;

  -- Already there: nothing changes, so nothing is audited.
  IF v_current = p_lifecycle THEN
    RETURN;
  END IF;

  PERFORM set_config('nowopen.lifecycle_reason', btrim(p_reason), true);
  UPDATE public.advertisements SET lifecycle = p_lifecycle WHERE id = p_advert_id;
  PERFORM set_config('nowopen.lifecycle_reason', '', true);
END;
$fn$;

COMMENT ON FUNCTION public.set_placement_lifecycle(uuid, text, text) IS
  'Admin-only: set a placement''s lifecycle with a required reason. Writes one audit_log row (placement.lifecycle) whose detail includes the reason.';

REVOKE ALL ON FUNCTION public.set_placement_lifecycle(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_placement_lifecycle(uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- B6. RLS: every new table
-- ---------------------------------------------------------------------------

ALTER TABLE public.media_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_owner_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placement_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placement_freshness ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placement_field_source ENABLE ROW LEVEL SECURITY;

-- media_owners: admin-only. The public reads media_owners_public.
DROP POLICY IF EXISTS "Admins manage media owners" ON public.media_owners;
CREATE POLICY "Admins manage media owners" ON public.media_owners
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- media_owner_contacts: admin-only, always.
DROP POLICY IF EXISTS "Admins manage media owner contacts" ON public.media_owner_contacts;
CREATE POLICY "Admins manage media owner contacts" ON public.media_owner_contacts
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- placement_availability: admins read, insert, and update the note (the
-- freeze trigger refuses anything else). No DELETE policy for anyone.
DROP POLICY IF EXISTS "Admins read placement availability" ON public.placement_availability;
CREATE POLICY "Admins read placement availability" ON public.placement_availability
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins record placement availability" ON public.placement_availability;
CREATE POLICY "Admins record placement availability" ON public.placement_availability
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins annotate placement availability" ON public.placement_availability;
CREATE POLICY "Admins annotate placement availability" ON public.placement_availability
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- placement_freshness: windows are not secret; anyone may read, admins edit.
DROP POLICY IF EXISTS "Anyone reads placement freshness" ON public.placement_freshness;
CREATE POLICY "Anyone reads placement freshness" ON public.placement_freshness
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage placement freshness" ON public.placement_freshness;
CREATE POLICY "Admins manage placement freshness" ON public.placement_freshness
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- placement_field_source: admin-only. The public sees price_basis via placement_trust.
DROP POLICY IF EXISTS "Admins manage placement field sources" ON public.placement_field_source;
CREATE POLICY "Admins manage placement field sources" ON public.placement_field_source
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- B5 / B6. Views
-- ---------------------------------------------------------------------------
--
-- placement_trust and media_owners_public run with the view owner's rights
-- (security_invoker is left off on purpose): that is how an anonymous reader
-- gets the derived answer without being able to read placement_availability,
-- media_owners or placement_field_source themselves. Each view therefore
-- names its columns explicitly and selects no contact, note or verification
-- note.
--
-- Supabase's default privileges grant ALL on new relations to anon and
-- authenticated, and a single-table view such as media_owners_public is
-- auto-updatable: left alone, anon could UPDATE media_owners through it with
-- the owner's rights. So every view has ALL revoked first and only SELECT
-- granted back.

CREATE OR REPLACE VIEW public.placement_trust AS
SELECT
  a.id AS advert_id,
  CASE a.lifecycle
    WHEN 'partner_verified' THEN 'partner_verified'
    WHEN 'partner_supplied' THEN 'partner_supplied'
    ELSE 'source_listed'
  END AS trust_label,
  CASE
    WHEN c.valid_until > now() AND c.status = 'available' THEN 'confirmed_available'
    WHEN c.valid_until > now() THEN c.status
    ELSE 'requires_confirmation'
  END AS availability,
  CASE WHEN c.valid_until > now() THEN c.confirmed_at END AS availability_confirmed_at,
  CASE WHEN c.valid_until > now() THEN c.valid_until END AS availability_valid_until,
  CASE WHEN c.valid_until > now() THEN c.period_to END AS period_to,
  o.name AS owner_name,
  o.website AS owner_website,
  coalesce(fs.basis, 'source_listed') AS price_basis,
  fs.as_of AS price_as_of
FROM public.advertisements a
LEFT JOIN LATERAL (
  SELECT pa.status, pa.confirmed_at, pa.valid_until, pa.period_to
    FROM public.placement_availability pa
   WHERE pa.advert_id = a.id
   ORDER BY pa.confirmed_at DESC, pa.created_at DESC
   LIMIT 1
) c ON true
LEFT JOIN public.media_owners o ON o.id = a.owner_id
LEFT JOIN public.placement_field_source fs ON fs.advert_id = a.id AND fs.field = 'pricing'
WHERE a.lifecycle NOT IN ('rejected', 'archived');

COMMENT ON VIEW public.placement_trust IS
  'Public trust state per placement. Availability is the latest confirmation read against now(), so it lapses without a job. Rejected and archived placements are excluded.';

REVOKE ALL ON public.placement_trust FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.placement_trust TO anon, authenticated;

-- Only owners the public has a reason to see: not rejected, and holding at
-- least one placement that is still listed. Prospects on the outreach list
-- with nothing linked stay private.
CREATE OR REPLACE VIEW public.media_owners_public AS
SELECT o.id, o.name, o.website, o.country_codes, o.verification
FROM public.media_owners o
WHERE o.verification <> 'rejected'
  AND EXISTS (
    SELECT 1 FROM public.advertisements a
     WHERE a.owner_id = o.id
       AND a.lifecycle NOT IN ('rejected', 'archived')
  );

REVOKE ALL ON public.media_owners_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.media_owners_public TO anon, authenticated;

-- Admin-only: the LATEST confirmation per placement that lapses within 3
-- days. Older confirmations already superseded are not listed. Invoker rights,
-- so placement_availability's admin-only RLS applies, plus an explicit admin
-- filter so the view is empty for a non-admin even if a grant is widened later.
-- A no-JWT caller (service_role, for sub-project 3's reminders) also sees it.
CREATE OR REPLACE VIEW public.placement_confirmations_expiring
WITH (security_invoker = true) AS
SELECT
  latest.id AS confirmation_id,
  latest.advert_id,
  a.title AS advert_title,
  latest.status,
  latest.method,
  latest.confirmed_at,
  latest.valid_until,
  latest.confirmed_by_owner,
  a.owner_id
FROM (
  SELECT DISTINCT ON (pa.advert_id) pa.*
    FROM public.placement_availability pa
   ORDER BY pa.advert_id, pa.confirmed_at DESC, pa.created_at DESC
) latest
JOIN public.advertisements a ON a.id = latest.advert_id
WHERE latest.valid_until > now()
  AND latest.valid_until <= now() + interval '3 days'
  AND a.lifecycle NOT IN ('rejected', 'archived')
  AND (public.is_admin() OR coalesce(auth.role(), '') NOT IN ('anon', 'authenticated'));

REVOKE ALL ON public.placement_confirmations_expiring FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.placement_confirmations_expiring TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- B9. Backfill the existing rows, honestly
-- ---------------------------------------------------------------------------

-- ADD COLUMN ... NOT NULL DEFAULT 'imported' above already gives all 97 rows
-- 'imported'. This statement states the intent and catches the one case the
-- default cannot: a lifecycle column that already existed and was nullable.
-- It touches only rows that need a change (NULL), so on a normal apply and on
-- every re-run it updates nothing: no tuple rewrite, no trigger, no audit row,
-- and never an admin's later decision.
UPDATE public.advertisements SET lifecycle = 'imported'
WHERE lifecycle IS NULL;

-- Country from the text after the LAST comma of location. Every country found
-- in the placement seeds (scripts/sql/seed_african_ad_placements.sql,
-- scripts/sql/update_placement_pricing.sql and the 2024 seed migrations),
-- plus spelling variants. Matched lower-cased and trimmed; anything else stays
-- NULL rather than guessed.
UPDATE public.advertisements a
SET country_code = m.iso
FROM (VALUES
  ('nigeria', 'NG'),
  ('ghana', 'GH'),
  ('kenya', 'KE'),
  ('south africa', 'ZA'),
  ('egypt', 'EG'),
  ('tanzania', 'TZ'),
  ('senegal', 'SN'),
  ('cameroon', 'CM'),
  ('mozambique', 'MZ'),
  ('zimbabwe', 'ZW'),
  ('botswana', 'BW'),
  ('algeria', 'DZ'),
  ('ethiopia', 'ET'),
  ('morocco', 'MA'),
  ('namibia', 'NA'),
  ('rwanda', 'RW'),
  ('tunisia', 'TN'),
  ('uganda', 'UG'),
  ('zambia', 'ZM'),
  ('dr congo', 'CD'),
  ('drc', 'CD'),
  ('democratic republic of the congo', 'CD'),
  ('côte d''ivoire', 'CI'),
  ('cote d''ivoire', 'CI'),
  ('ivory coast', 'CI')
) AS m(country, iso)
WHERE a.country_code IS NULL
  AND a.location LIKE '%,%'
  -- Only rows that need a change: a re-run finds every mapped row already set.
  AND lower(btrim(regexp_replace(a.location, '^.*,', ''))) = m.country;

-- One pricing source row per priced placement. "Priced" means pricing > 0,
-- the same test as isPriced in src/lib/promote/mix.ts. as_of is NULL: nobody
-- recorded when the rate card was published, and a made-up date would be
-- invented data. ON CONFLICT makes a re-run insert nothing.
INSERT INTO public.placement_field_source (advert_id, field, basis, source_label, as_of)
SELECT a.id, 'pricing', 'source_listed', 'published rate card', NULL::date
FROM public.advertisements a
WHERE a.pricing > 0
ON CONFLICT (advert_id, field) DO NOTHING;
