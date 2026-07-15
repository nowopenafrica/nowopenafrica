/*
  # Business verified badge (premium)

  Adds a `verified` flag to businesses. Verification is granted by admins
  (or automatically for paid plans once billing is wired up) — users cannot
  set it themselves, because the existing owner UPDATE policy is column-blind
  but the admin dashboard is the only place the toggle is exposed.

  For stronger enforcement you can revoke owner UPDATE on this column via a
  trigger, but that's optional; the UI does not offer self-verification.
*/

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS verified boolean DEFAULT false;

-- Prevent a business owner from flipping their own `verified` flag while
-- still letting admins (who bypass this via the is_admin() policy) do so.
CREATE OR REPLACE FUNCTION public.guard_business_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.verified IS DISTINCT FROM OLD.verified AND NOT public.is_admin() THEN
    NEW.verified := OLD.verified;  -- silently ignore owner attempts to change it
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_business_verified ON businesses;
CREATE TRIGGER trg_guard_business_verified
  BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION public.guard_business_verified();
