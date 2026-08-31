/*
  # Founding qualification must use real verification, not the legacy flag

  founding_qualifies() checked `businesses.verified`. On live, that boolean is
  true for 24 of the 32 businesses — every one of which has verification_tier
  'none', trust_score 0, email_verified false, phone_verified false and no
  owner at all. It is a seed-data flag, not a verification result.

  The consequence: the moment anybody claimed one of those seeded listings,
  they would satisfy the "verified" requirement instantly, without a single
  check having been performed, and collect a permanent founding number. The
  badge would then certify nothing — which is the exact failure the programme
  was designed to avoid, arriving through a different door.

  This repoints the check at the derived signals, matching deriveTier() in
  src/lib/trust.ts: a confirmed email AND a confirmed phone, which is the
  'bronze' floor. Each of those required somebody to complete a step, so they
  cannot be true by accident of seeding.

  Numbers already issued are untouched. Nothing here deletes a row — the table
  is empty today in any case, so no member loses standing.

  Re-runnable: CREATE OR REPLACE only.
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
    /*
      Real verification, matching the bronze floor of deriveTier(). Note this
      deliberately does NOT accept b.verified: that column is set on seeded
      records and proves nothing about the business behind them.
    */
    AND coalesce(b.email_verified, false)
    AND coalesce(b.phone_verified, false)
    -- And actually finished: what a customer needs before the page is worth
    -- arriving at.
    AND coalesce(nullif(btrim(b.name), ''), NULL) IS NOT NULL
    AND coalesce(nullif(btrim(b.category), ''), NULL) IS NOT NULL
    AND coalesce(nullif(btrim(b.location), ''), NULL) IS NOT NULL
    AND coalesce(nullif(btrim(coalesce(b.about, b.description, '')), ''), NULL) IS NOT NULL
    AND coalesce(nullif(btrim(coalesce(b.opening_hours, b.hours, '')), ''), NULL) IS NOT NULL
    AND coalesce(nullif(btrim(coalesce(b.phone, b.email, '')), ''), NULL) IS NOT NULL
    AND coalesce(nullif(btrim(coalesce(b.logo_url, b.image_url, '')), ''), NULL) IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.founding_qualifies(uuid) TO anon, authenticated;
