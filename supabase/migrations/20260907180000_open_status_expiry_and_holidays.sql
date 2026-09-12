-- Open Now: make a manual override expire, and let a business declare that it
-- trades through public holidays.
--
-- WHY
--
-- 1. `open_status` short-circuited the schedule with no expiry of any kind. An
--    owner who marked themselves closed once — for one afternoon — appeared
--    closed forever, with no signal to them or to a customer. It is the single
--    most damaging state a listing can be stuck in: permanently telling
--    customers not to come. Nothing in the app writes the column today, so the
--    bug is latent rather than active, and this closes it before the toggle
--    that would trigger it ever ships.
--
-- 2. The status engine had no concept of a public holiday. Nigeria has six
--    fixed public holidays plus Easter and two lunar Eids, and on every one of
--    them the platform's headline promise was confidently wrong. A business
--    that genuinely trades on holidays now has a way to say so.
--
-- SAFETY. Both columns are additive and nullable, and the application already
-- treats them as optional — `overrideStillApplies` deliberately keeps honouring
-- an override that has no timestamp, precisely so that applying this migration
-- (or not applying it) cannot change what a live listing says.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS open_status_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS opens_on_holidays boolean NOT NULL DEFAULT false;

ALTER TABLE public.business_locations
  ADD COLUMN IF NOT EXISTS open_status_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS opens_on_holidays boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.businesses.open_status_set_at IS
  'When open_status was last set. An override applies only on the local day it was set (see overrideStillApplies in src/lib/openingHours.ts). NULL means "no timestamp recorded", which the app still honours so that pre-existing overrides are not silently reopened.';

COMMENT ON COLUMN public.businesses.opens_on_holidays IS
  'The business trades on public holidays. Default false: a holiday closes a listing unless the owner has said otherwise, because a customer wrongly told "open" travels to a locked door and blames the platform.';

-- Keep the timestamp honest without trusting the client to send it.
CREATE OR REPLACE FUNCTION public.stamp_open_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.open_status IS DISTINCT FROM OLD.open_status THEN
    NEW.open_status_set_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_open_status_change ON public.businesses;
CREATE TRIGGER stamp_open_status_change
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.stamp_open_status_change();

DROP TRIGGER IF EXISTS stamp_open_status_change ON public.business_locations;
CREATE TRIGGER stamp_open_status_change
  BEFORE UPDATE ON public.business_locations
  FOR EACH ROW EXECUTE FUNCTION public.stamp_open_status_change();

-- Announced public holidays.
--
-- Fixed-date holidays and Easter are computed in application code, because
-- they are determinable without guessing. This table is for the ones that are
-- NOT: Eid al-Fitr and Eid al-Adha follow lunar observation and are announced
-- rather than calculated, and a guessed Eid date would be fabricated data of
-- exactly the kind this platform has spent effort removing. It is seeded
-- empty, on purpose, and filled by an admin who knows the announced date.
CREATE TABLE IF NOT EXISTS public.public_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country text NOT NULL DEFAULT 'NG',
  holiday_date date NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (country, holiday_date, name)
);

CREATE INDEX IF NOT EXISTS idx_public_holidays_lookup
  ON public.public_holidays (country, holiday_date);

ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;

-- Readable by anyone: the public status engine needs it, and a holiday
-- calendar is not sensitive.
DROP POLICY IF EXISTS "Public holidays are readable" ON public.public_holidays;
CREATE POLICY "Public holidays are readable"
  ON public.public_holidays FOR SELECT USING (true);

-- Writable only by staff. A holiday closes every listing in the country for a
-- day, which makes this one of the highest-leverage tables on the platform.
DROP POLICY IF EXISTS "Staff manage public holidays" ON public.public_holidays;
CREATE POLICY "Staff manage public holidays"
  ON public.public_holidays FOR ALL
  USING (public.is_staff())
  WITH CHECK (public.is_staff());
