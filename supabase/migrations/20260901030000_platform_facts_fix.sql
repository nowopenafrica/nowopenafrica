/*
  # platform_facts(): correct the offers column

  The previous definition read business_offers.is_active. The column is
  `active`, so the function would have raised on its very first call — and
  because it is only reachable to an admin, that would have surfaced as the
  Chief of Staff brief failing rather than as anything obvious.

  Also narrows "offers running" to what the word means: active AND not expired,
  matching the public Offers page. A count that includes finished offers is a
  number the founder would act on wrongly.
*/
CREATE OR REPLACE FUNCTION public.platform_facts()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  SELECT jsonb_build_object(
    'listings_public',    (SELECT count(*) FROM public.businesses WHERE is_listable),
    'listings_total',     (SELECT count(*) FROM public.businesses),
    'claimed',            (SELECT count(*) FROM public.businesses WHERE claim_status = 'claimed'),
    'verified',           (SELECT count(*) FROM public.businesses WHERE verification_status = 'verified'),
    'missing_hours',      (SELECT count(*) FROM public.businesses
                            WHERE is_listable
                              AND coalesce(nullif(btrim(coalesce(opening_hours, hours, '')), ''), NULL) IS NULL),
    'claims_pending',     (SELECT count(*) FROM public.business_claims WHERE status = 'pending'),
    'reports_open',       (SELECT count(*) FROM public.business_reports WHERE status = 'open'),
    'review_queue',       (SELECT count(*) FROM public.radar_candidates WHERE status IN ('pending','review')),
    'offers_running',     (SELECT count(*) FROM public.business_offers
                            WHERE coalesce(active, true)
                              AND (starts_at IS NULL OR starts_at <= now())
                              AND (ends_at   IS NULL OR ends_at   >= now())),
    'founding_claimed',   (SELECT count(*) FROM public.founding_members)
  ) INTO r;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_facts() FROM public;
GRANT EXECUTE ON FUNCTION public.platform_facts() TO authenticated;
