/*
  # Branches — one brand, many locations

  A chain currently has to register each branch as a separate business. That
  splits the brand: every branch carries its own name, its own reviews, its own
  rating and its own catalogue, and a customer searching for the business finds
  five half-empty listings instead of one.

  This adds branches under a single business, each with the things that actually
  differ between them — address, phone, opening hours, timezone and its own
  open/closed override — while the brand, catalogue and reviews stay on the
  parent.

  1. `business_locations`. Public read (a branch address is exactly as public as
     the profile it sits on); the owner or an admin manages, matching the
     services/products policies.

  2. `is_primary` marks the head office / flagship, which is the one a profile
     shows first and the one the server-rendered page uses for its address.
     A partial unique index enforces at most one per business — without it a
     mis-click leaves two "main" branches and the profile picks arbitrarily.

  3. `open_status` mirrors the column on `businesses`: a branch that shut early
     knows something its timetable does not. It is NOT frozen by the trust
     guard, because unlike `verified` this is an ordinary operational field the
     owner is meant to set.

  Re-runnable: every object is IF NOT EXISTS and every policy is dropped first.
*/

CREATE TABLE IF NOT EXISTS public.business_locations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  -- What a customer would call this branch: "Yaba", "Lekki Phase 1".
  name          text NOT NULL,
  address       text,
  phone         text,
  -- Free text in the same format the parent uses, parsed by lib/openingHours.
  opening_hours text,
  -- IANA zone. A chain can cross zones (Lagos and Nairobi), so this is per
  -- branch rather than inherited.
  timezone      text,
  open_status   text CHECK (open_status IN ('open', 'closed')),
  latitude      double precision,
  longitude     double precision,
  is_primary    boolean NOT NULL DEFAULT false,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_locations_business
  ON public.business_locations (business_id);

-- At most one primary branch per business. Partial, so the many non-primary
-- rows do not collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS idx_business_locations_one_primary
  ON public.business_locations (business_id)
  WHERE is_primary;

ALTER TABLE public.business_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view business locations" ON public.business_locations;
CREATE POLICY "Public can view business locations" ON public.business_locations
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Owners manage business locations" ON public.business_locations;
CREATE POLICY "Owners manage business locations" ON public.business_locations
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id
                 AND (b.user_id::text = auth.uid()::text OR public.is_admin())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id
                 AND (b.user_id::text = auth.uid()::text OR public.is_admin())));
