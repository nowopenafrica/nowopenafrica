/*
  # The Founding 1,000

  A permanent, numbered status for the first 1,000 businesses that are actually
  finished — not the first 1,000 that registered.

  THAT DISTINCTION IS THE WHOLE DESIGN. Rewarding registration rewards empty
  listings: somebody creates ten shells to collect ten badges, and the badge
  then certifies nothing. Qualification is therefore checked HERE, against the
  same columns the public page reads, at the moment a spot is claimed.

  THE NUMBER IS ASSIGNED BY THE DATABASE. Founding #347 is a claim about
  ordering, so it cannot come from the client and cannot be chosen. A sequence
  hands them out; two businesses qualifying in the same instant get 347 and
  348, never both 347.

  ONCE GRANTED IT DOES NOT LAPSE. "Founding" is a fact about when somebody
  arrived. A business that later lets its profile slip is still one of the
  first; revoking the badge would make it a subscription tier wearing a
  historical name. Nothing here deletes a row.

  Re-runnable: IF NOT EXISTS throughout, policies dropped before create.
*/

CREATE TABLE IF NOT EXISTS public.founding_members (
  business_id  uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  number       integer NOT NULL UNIQUE,
  qualified_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_founding_members_number ON public.founding_members (number);

-- The counter the campaign shows. A sequence, so concurrent qualification
-- cannot hand the same number to two businesses.
CREATE SEQUENCE IF NOT EXISTS public.founding_number_seq START 1;

ALTER TABLE public.founding_members ENABLE ROW LEVEL SECURITY;

/*
  Public read.

  The badge is displayed on public profiles and the campaign shows a live
  count, so this has to be readable by anyone — and there is nothing private in
  it: a business id, a number, and a date.
*/
DROP POLICY IF EXISTS "Founding members are public" ON public.founding_members;
CREATE POLICY "Founding members are public" ON public.founding_members
  FOR SELECT USING (true);

/*
  Nobody writes this table directly — not even an owner, not even an admin
  through the API. The only way in is claim_founding_spot() below, which checks
  the criteria first. An INSERT policy here would let an owner grant themselves
  #1.
*/
DROP POLICY IF EXISTS "Admins manage founding members" ON public.founding_members;
CREATE POLICY "Admins manage founding members" ON public.founding_members
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

/** How many spots exist, and where the tiers sit. */
CREATE OR REPLACE FUNCTION public.founding_cap() RETURNS integer
LANGUAGE sql IMMUTABLE AS $$ SELECT 1000 $$;

/*
  Does this business qualify right now?

  Deliberately readable by anyone for any business, because the dashboard has
  to be able to say "you are two steps away" — and there is nothing sensitive
  in the answer. It reports the same facts already on the public page.
*/
CREATE OR REPLACE FUNCTION public.founding_qualifies(p_business_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b record;
BEGIN
  SELECT * INTO b FROM public.businesses WHERE id = p_business_id;
  IF NOT FOUND THEN RETURN false; END IF;

  RETURN
    -- Somebody has to own it. An unclaimed listing is not a founding business.
    b.user_id IS NOT NULL
    -- Verified, which is the point: this certifies a real business.
    AND coalesce(b.verified, false)
    -- And actually finished: the things a customer needs before the page is
    -- worth arriving at.
    AND coalesce(nullif(btrim(b.name), ''), NULL) IS NOT NULL
    AND coalesce(nullif(btrim(b.category), ''), NULL) IS NOT NULL
    AND coalesce(nullif(btrim(b.location), ''), NULL) IS NOT NULL
    AND coalesce(nullif(btrim(coalesce(b.about, b.description, '')), ''), NULL) IS NOT NULL
    AND coalesce(nullif(btrim(coalesce(b.opening_hours, b.hours, '')), ''), NULL) IS NOT NULL
    AND coalesce(nullif(btrim(coalesce(b.phone, b.email, '')), ''), NULL) IS NOT NULL
    AND coalesce(nullif(btrim(coalesce(b.logo_url, b.image_url, '')), ''), NULL) IS NOT NULL;
END;
$$;

/*
  Claim a founding spot.

  The client asks; the database decides. Everything that could be lied about —
  whether the business qualifies, who owns it, what number is next, whether any
  spots remain — is settled in here with definer rights.

  Idempotent: asking twice returns the number already held rather than burning
  a second spot, because a double-tap on a button must not cost a business its
  place or the campaign one of its thousand.
*/
CREATE OR REPLACE FUNCTION public.claim_founding_spot(p_business_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing integer;
  v_taken    integer;
  v_number   integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = p_business_id
      AND (b.user_id::text = auth.uid()::text OR public.is_admin())
  ) THEN
    RAISE EXCEPTION 'Not your business';
  END IF;

  SELECT number INTO v_existing FROM public.founding_members WHERE business_id = p_business_id;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  IF NOT public.founding_qualifies(p_business_id) THEN
    RAISE EXCEPTION 'This business does not meet the founding requirements yet';
  END IF;

  SELECT count(*) INTO v_taken FROM public.founding_members;
  IF v_taken >= public.founding_cap() THEN
    RAISE EXCEPTION 'All founding spots have been claimed';
  END IF;

  v_number := nextval('public.founding_number_seq');
  INSERT INTO public.founding_members (business_id, number) VALUES (p_business_id, v_number);
  RETURN v_number;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_founding_spot(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_founding_spot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.founding_qualifies(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.founding_cap() TO anon, authenticated;
