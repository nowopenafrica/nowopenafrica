-- Advertising inventory: record where a placement came from and who may sell it.
--
-- THE PROBLEM THIS SOLVES
--
-- `advertisements` holds 97 rows. 89 are `status = 'active'`. `user_id` is NULL
-- on every single one. The titles name specific, real, third-party properties:
--
--   "2 Double-Sided Freestanding Screens, The Palms, Lekki, Lagos"
--   "16 Digital Screens, Railway Ticketing & Waiting Area, Lagos"
--   "LED Portrait Billboard, 5th Roundabout Lekki FTF Ajah, Lagos"
--   "2-Sided Unipole Billboard, Aba Road, Port Harcourt"
--
-- ...each with a day rate. So the platform was publicly presenting 89 bookable
-- advertising placements at named real-world sites, owned by nobody in the
-- data, and submitting all 97 to Google for indexing.
--
-- Whether NowOpen holds the rights to broker these cannot be determined from
-- the database, and it MUST NOT be guessed. This migration therefore does
-- three things and deliberately not a fourth:
--
--   1. It gives the table somewhere to record provenance, which it had no way
--      to express — that absence is the actual defect.
--   2. It defaults every existing row to `unverified_import`, which is the only
--      honest description of a row with no owner and no rights record.
--   3. It leaves `status` untouched. Silently flipping 89 rows would destroy
--      information about the founder's intent, and these may well be a
--      legitimate rate card.
--   4. It does NOT mark anything verified. No row gains `rights_verified_at`
--      here. Verification is a human act with a counterparty, and fabricating
--      it in SQL would be precisely the invented-data problem this platform has
--      spent real effort removing.
--
-- The public sitemap already stopped requesting indexation for any placement
-- without an accountable owner (see api/sitemap.xml.ts). Nothing was deleted.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'advert_provenance') THEN
    CREATE TYPE public.advert_provenance AS ENUM (
      -- The owner of the site listed it themselves and holds the rights.
      'owner_submitted',
      -- A media owner or broker supplied a rate card under an agreement.
      'partner_rate_card',
      -- NowOpen owns or directly controls the placement.
      'platform_owned',
      -- Present in the data with no established provenance. The default, and
      -- the honest description of all 97 existing rows.
      'unverified_import'
    );
  END IF;
END $$;

ALTER TABLE public.advertisements
  ADD COLUMN IF NOT EXISTS provenance public.advert_provenance
    NOT NULL DEFAULT 'unverified_import',
  -- Who NowOpen believes may sell this placement. Free text on purpose: a
  -- structured party table is premature while the count is 97 and the rights
  -- question is unanswered.
  ADD COLUMN IF NOT EXISTS rights_holder text,
  -- Set ONLY by a human who has seen an agreement. Never defaulted, never
  -- backfilled.
  ADD COLUMN IF NOT EXISTS rights_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS rights_verified_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rights_note text,
  -- A rate with no currency is a 1000× mispricing waiting to happen: `14`
  -- could be ₦14, $14 or ₦14,000.
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'NGN',
  -- Inventory that is no longer available should stop being offered without
  -- anybody having to remember.
  ADD COLUMN IF NOT EXISTS available_from date,
  ADD COLUMN IF NOT EXISTS available_to date;

COMMENT ON COLUMN public.advertisements.provenance IS
  'Where this placement came from. Defaults to unverified_import: a row with no owner and no rights record is not verified inventory, whatever its status says.';

COMMENT ON COLUMN public.advertisements.rights_verified_at IS
  'Set only by a human who has seen an agreement authorising NowOpen to sell this placement. Never defaulted and never backfilled — verification cannot be manufactured in SQL.';

COMMENT ON COLUMN public.advertisements.currency IS
  'ISO-4217 for price_per_day. Defaults to NGN, the platform''s working currency.';

CREATE INDEX IF NOT EXISTS idx_advertisements_sellable
  ON public.advertisements (provenance, status)
  WHERE rights_verified_at IS NOT NULL;

/*
 * One definition of "may we offer this", so every surface agrees.
 *
 * A placement is sellable when somebody is accountable for it: either a real
 * owner listed it, or a human recorded verified rights. `status = 'active'` is
 * explicitly NOT sufficient — 89 rows carry it today with neither.
 */
CREATE OR REPLACE FUNCTION public.advert_is_sellable(a public.advertisements)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    (a.user_id IS NOT NULL OR a.rights_verified_at IS NOT NULL)
    AND a.status = 'active'
    AND (a.available_from IS NULL OR a.available_from <= current_date)
    AND (a.available_to   IS NULL OR a.available_to   >= current_date);
$$;

COMMENT ON FUNCTION public.advert_is_sellable IS
  'Whether a placement may be publicly offered. Requires an accountable party — an owner, or human-verified rights — not merely status = active.';
