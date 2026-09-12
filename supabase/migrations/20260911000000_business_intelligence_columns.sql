/*
  # Business Intelligence — profile state, removal lifecycle, availability

  First migration of the NowOpen Business Intelligence & Profile Enrichment
  Engine. Everything here is ADDITIVE: existing rows keep their meaning, and
  nothing is backfilled with invented data.

  Three concerns land together because they are three columns on the same row,
  but they are deliberately SEPARATE axes:

    1. `profile_state`  — the shape of the record (draft → published).
    2. `removal_status` — is this business still on the directory?
    3. availability    — what we know about the business's hours.

  ## Why removal is its own column, not a claim_status value

  A business can be claimed and removed at the same time, and mixing "who owns
  this" with "is this still open" is exactly the confusion §2 warns about.
  Claim life and directory life are different questions; `claim_status`
  already answers the first, so `removal_status` answers the second. Existing
  deletion_requests lead to a hard DELETE with an audit log; this adds a
  soft-tombstone alternative that preserves the row for provenance while
  `is_listable` (a generated column) drops to false — mirroring how reviews
  are hidden by moderation rather than destroyed.

  ## Availability vocabulary

  `availability_mode` names HOW the shown hours were produced:
    - `derived`      — the business's own opening_hours (public content)
    - `confirmed`    — an owner or verified source confirmed the availability
    - `default_24_7` — NowOpen's SAFE DEFAULT: unclaimed AND no hours recorded,
                       so we do not guess hours from the category. Never
                       written into `opening_hours`; the UI renders it as
                       "24/7 default · hours unconfirmed".
    - `not_set`      — nothing we can show

  `availability_confirmation` is the §2 confidence triple:
    - `confirmed` — an owner or admin verified it
    - `timed`     — derived from concrete time ranges in opening_hours
    - `unknown`   — neither

  `is_24_hours` + `is_24_hours_confirmed` are the "24/7 confirmed vs default"
  distinction: a default_24_7 row is `is_24_hours = true` but
  `is_24_hours_confirmed = false`, so a public page can say "assumed open
  24/7, please confirm" instead of asserting it. `hours_source`,
  `hours_source_url`, `hours_last_verified` record where the hours came from
  and how fresh they are.

  ## data_confidence — EXTEND, never rename

  The vocabulary is extended with the values the enrichment spec names
  (unknown/low/partial) so the engine can express "we have not even tried"
  without abusing `unconfirmed`. Existing rows and the other values are
  untouched.

  Re-runnable throughout.
*/

-- 1. Profile state ---------------------------------------------------------

-- Default 'published' deliberately: every existing row and every shell created
-- by radar_publish_candidate is already public. A draft-first path is built by
-- the import flow when it wants to gate publication, not by a default that
-- would silently hide live listings.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS profile_state text NOT NULL DEFAULT 'published';

ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_profile_state_check;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_profile_state_check
  CHECK (profile_state IN ('draft','ready_for_review','published','paused','archived'));

-- 2. Removal lifecycle (soft tombstone) ------------------------------------

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS removal_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS removal_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS removal_requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS removal_reason text,
  ADD COLUMN IF NOT EXISTS removal_resolved_at timestamptz;

ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_removal_status_check;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_removal_status_check
  CHECK (removal_status IN ('none','removal_requested','removal_approved','removed'));

COMMENT ON COLUMN public.businesses.removal_status IS
  'Soft tombstone: removal_requested → removal_approved → removed. Removed rows keep their provenance and stay hidden (is_listable drops to false) instead of being destroyed.';

-- 3. Availability / hours metadata ------------------------------------------

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS availability_mode text NOT NULL DEFAULT 'derived',
  ADD COLUMN IF NOT EXISTS is_24_hours boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_24_hours_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS availability_confirmation text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS hours_source text,
  ADD COLUMN IF NOT EXISTS hours_source_url text,
  ADD COLUMN IF NOT EXISTS hours_last_verified timestamptz;

ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_availability_mode_check;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_availability_mode_check
  CHECK (availability_mode IN ('derived','confirmed','default_24_7','not_set'));

ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_availability_confirmation_check;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_availability_confirmation_check
  CHECK (availability_confirmation IN ('confirmed','timed','unknown'));

COMMENT ON COLUMN public.businesses.availability_mode IS
  'How the shown hours were produced: derived (from opening_hours), confirmed (owner/verified source), default_24_7 (NowOpen safe default for unclaimed rows with no hours — never written into opening_hours), not_set.';
COMMENT ON COLUMN public.businesses.is_24_hours IS
  'The business trades all day, every day — either from its own hours or from NowOpen''s default. Read with is_24_hours_confirmed: a confirmed=false row must be shown as an assumption, never asserted.';
COMMENT ON COLUMN public.businesses.availability_confirmation IS
  'confidence triple for availability: confirmed (owner/admin verified), timed (derived from concrete time ranges), unknown (no evidence).';
COMMENT ON COLUMN public.businesses.hours_source IS
  'Where the hours came from: nowopen_default, owner, admin, or a radar source key (e.g. openstreetmap). NULL when never written.';

ALTER TABLE public.business_locations
  ADD COLUMN IF NOT EXISTS availability_mode text NOT NULL DEFAULT 'derived',
  ADD COLUMN IF NOT EXISTS is_24_hours boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_24_hours_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS availability_confirmation text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS hours_source text,
  ADD COLUMN IF NOT EXISTS hours_source_url text,
  ADD COLUMN IF NOT EXISTS hours_last_verified timestamptz;

ALTER TABLE public.business_locations DROP CONSTRAINT IF EXISTS business_locations_availability_mode_check;
ALTER TABLE public.business_locations ADD CONSTRAINT business_locations_availability_mode_check
  CHECK (availability_mode IN ('derived','confirmed','default_24_7','not_set'));

ALTER TABLE public.business_locations DROP CONSTRAINT IF EXISTS business_locations_availability_confirmation_check;
ALTER TABLE public.business_locations ADD CONSTRAINT business_locations_availability_confirmation_check
  CHECK (availability_confirmation IN ('confirmed','timed','unknown'));

-- 4. data_confidence — extended vocabulary, nothing reclassified ------------

ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_data_confidence_check;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_data_confidence_check
  CHECK (data_confidence IN (
    'unknown',
    'low',
    'partial',
    'unconfirmed',
    'source_confirmed',
    'partially_confirmed',
    'owner_confirmed',
    'admin_verified'
  ));

-- 5. verification_status — partial verification ------------------------------

ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_verification_status_check;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_verification_status_check
  CHECK (verification_status IN ('unverified','pending','partially_verified','verified','expired','rejected'));

-- 6. The safe 24/7 default trigger -------------------------------------------

/*
  Unclaimed rows with no hours get NowOpen's default availability: mode
  default_24_7, is_24_hours true, is_24_hours_confirmed FALSE. The UI must
  render this as "24/7 default · hours unconfirmed" — this trigger only
  records that the default applies; it never writes a literal "Open 24/7"
  into opening_hours, so an unconfirmed default can never be mistaken for a
  confirmed fact by anything that only reads opening_hours.

  When real hours appear the mode flips back to `derived`; confirmations that
  an owner or source has already recorded are left untouched, so a subsequent
  import cannot silently downgrade a confirmed fact.
*/
CREATE OR REPLACE FUNCTION public.nowopen_default_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_has_hours boolean;
BEGIN
  v_has_hours := nullif(btrim(coalesce(NEW.opening_hours, NEW.hours, '')), '') IS NOT NULL;

  IF NOT v_has_hours AND NEW.claim_status = 'unclaimed' THEN
    NEW.availability_mode := 'default_24_7';
    NEW.is_24_hours := true;
    NEW.is_24_hours_confirmed := false;
    NEW.availability_confirmation := 'unknown';
    NEW.hours_source := 'nowopen_default';
  ELSIF NEW.availability_mode = 'default_24_7' THEN
    -- Hours now exist; the default no longer applies. Never overwrite a
    -- confirmation the owner or a verified source already set.
    NEW.availability_mode := 'derived';
    IF NEW.is_24_hours_confirmed IS FALSE AND NEW.is_24_hours IS TRUE AND v_has_hours THEN
      NEW.is_24_hours := false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_nowopen_default_availability ON public.businesses;
CREATE TRIGGER trg_nowopen_default_availability
  BEFORE INSERT OR UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.nowopen_default_availability();

DROP TRIGGER IF EXISTS trg_nowopen_default_availability ON public.business_locations;
CREATE TRIGGER trg_nowopen_default_availability
  BEFORE INSERT OR UPDATE ON public.business_locations
  FOR EACH ROW EXECUTE FUNCTION public.nowopen_default_availability();

-- 7. Existing rows: record the default where it legitimately applies ---------
-- An unclaimed row with no hours and no evidence of hours is exactly what
-- "default 24/7, unconfirmed" means. Rows that already carry hours keep the
-- `derived` default. Nothing is invented: this only names the state that
-- already existed.

UPDATE public.businesses SET
  availability_mode = 'default_24_7',
  is_24_hours = true,
  is_24_hours_confirmed = false,
  availability_confirmation = 'unknown',
  hours_source = 'nowopen_default'
WHERE claim_status = 'unclaimed'
  AND nullif(btrim(coalesce(opening_hours, hours, '')), '') IS NULL;

-- 8. Intact listing count ---------------------------------------------------
-- The backfill above must not change what is public. Run and compare:
-- select count(*) from businesses where is_listable;  -- unchanged
-- select availability_mode, count(*) from businesses group by 1;
-- select claim_status, verification_status, data_confidence, count(*)
--   from businesses group by 1, 2, 3;