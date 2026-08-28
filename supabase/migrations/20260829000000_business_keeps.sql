/*
  # Keep — the relationship between a person and a business

  A directory is somewhere you visit once. Keeping a business is the thing that
  brings someone back: they choose to hear from it, and the business gains an
  audience it can reach without paying a platform to reach them.

  1. `business_keeps` — one row per person per business, with the TOPICS they
     agreed to hear about. Topics are the consent record, not a preference
     nicety: a business that sends promotions to someone who only asked for
     opening updates has misused something they were given.

     UNIQUE (user_id, business_id) because keeping twice is not a thing. The
     app upserts on that key, so tapping Keep again edits the topics rather
     than erroring.

  2. Rows are private. The person manages their own; the business OWNER can
     read the keeps for their own business, because an audience you cannot see
     the size of is not an audience you can act on. Nobody else reads anything —
     who follows whom is not public here, and a Keep is not a public endorsement
     the way a review is.

  3. Requires a signed-in user, by design. The whole point is receiving updates,
     and `notifications.user_id` references auth.users; an anonymous keep would
     be a promise the product could not keep.

  Re-runnable: IF NOT EXISTS throughout, policies dropped first.
*/

CREATE TABLE IF NOT EXISTS public.business_keeps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  -- Which updates this person agreed to. Empty means "kept, but tell me
  -- nothing" — a legitimate choice, and not the same as not keeping.
  topics      text[] NOT NULL DEFAULT ARRAY['promotions','products','events','openings','announcements']::text[],
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, business_id)
);

CREATE INDEX IF NOT EXISTS idx_business_keeps_user     ON public.business_keeps (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_keeps_business ON public.business_keeps (business_id);

ALTER TABLE public.business_keeps ENABLE ROW LEVEL SECURITY;

-- The person: full control over their own keeps, and nobody else's.
DROP POLICY IF EXISTS "Users manage their own keeps" ON public.business_keeps;
CREATE POLICY "Users manage their own keeps" ON public.business_keeps
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- The business owner: read only, and only for a business they own. They need
-- to know the size and the topic mix of their audience; they have no business
-- editing someone else's consent.
DROP POLICY IF EXISTS "Owners read keeps for their business" ON public.business_keeps;
CREATE POLICY "Owners read keeps for their business" ON public.business_keeps
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id
      AND (b.user_id::text = auth.uid()::text OR public.is_admin())
  ));
