/*
  # NOWOPEN YOUR BUSINESS — send it, we set it up, you claim it

  The existing "Send us your business name" box works, but it is a widget on a
  page. This turns it into the thing it should have been: one link you can put
  on a flyer, a QR code, a WhatsApp status or the end of a founder video, that
  asks for one thing somebody already knows.

  ## What changes here

  1. `location` — the second question. A business name with no town is a name we
     cannot research, cannot disambiguate ("Bella's Laundry" in which city?) and
     cannot hand to anybody. It is the difference between a lead and a note.

  2. `kind` — 'owner' or 'nomination'. Two loops, one queue: somebody sending
     THEIR business is a person waiting to hear back, and somebody nominating
     their barber is a tip. Working them identically would either pester a
     business that never asked, or leave an owner waiting. Same table because
     the job is the same; separate column because the outreach is not.

     Note the nomination page itself writes to `radar_candidates`, the existing
     review queue, not here — this column is for a nomination that arrives
     through the send-business flow.

  3. `source` / `referrer` — which surface actually produced this. The whole
     point of a campaign link is being able to say Instagram produced four and
     WhatsApp produced ninety. `source` is constrained to a known list in the
     client so the dimension stays countable; `referrer` is the raw origin.

  ## What does NOT change

  It still creates NOTHING public. A submission is a job of work in a queue that
  a person reads. Anyone can say a business exists, and saying so must never
  make it appear — that rule is the reason the directory can be trusted at all.

  There is still NO public SELECT. These rows are other people's phone numbers.
*/

ALTER TABLE public.profile_requests ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.profile_requests ADD COLUMN IF NOT EXISTS referrer text;
ALTER TABLE public.profile_requests ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'owner';

ALTER TABLE public.profile_requests DROP CONSTRAINT IF EXISTS profile_requests_kind_check;
ALTER TABLE public.profile_requests ADD CONSTRAINT profile_requests_kind_check
  CHECK (kind IN ('owner', 'nomination'));

CREATE INDEX IF NOT EXISTS idx_profile_requests_source
  ON public.profile_requests (source, created_at DESC);

-- Replacing the insert policy rather than adding one: WITH CHECK clauses on
-- separate permissive policies are OR-ed, so a second policy is a way round the
-- first rather than an addition to it.
DROP POLICY IF EXISTS "profile_requests_public_insert" ON public.profile_requests;
CREATE POLICY "profile_requests_public_insert"
  ON public.profile_requests FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    btrim(business_name) <> ''
    AND btrim(contact) <> ''
    AND length(business_name) <= 160
    AND length(contact) <= 160
    AND length(coalesce(location, '')) <= 160
    AND length(coalesce(note, '')) <= 500
    AND length(coalesce(source, '')) <= 40
    AND length(coalesce(referrer, '')) <= 200
    AND kind IN ('owner', 'nomination')
    -- A submitter cannot pre-set a status or attach itself to a business.
    AND status = 'new'
    AND business_id IS NULL
    AND handled_by IS NULL
  );

/*
  The acquisition funnel, in one round trip.

  Every number here is counted from a real table. There are no targets, no
  projections and no seeded figures: if nobody has sent a business, this returns
  zeroes, and a dashboard showing zero is the only honest thing it can show.

  Definer because it spans profile_requests, radar_candidates and businesses,
  and the guard is inside rather than relying on the caller: a function that
  returns counts of other people's submissions is not a public function.
*/
CREATE OR REPLACE FUNCTION public.acquisition_funnel()
RETURNS TABLE (
  requests_new        bigint,
  requests_contacted  bigint,
  requests_building   bigint,
  requests_live       bigint,
  requests_declined   bigint,
  nominations_open    bigint,
  businesses_unclaimed bigint,
  businesses_pending  bigint,
  businesses_claimed  bigint,
  businesses_verified bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.profile_requests WHERE status = 'new'),
    (SELECT count(*) FROM public.profile_requests WHERE status = 'contacted'),
    (SELECT count(*) FROM public.profile_requests WHERE status = 'building'),
    (SELECT count(*) FROM public.profile_requests WHERE status = 'live'),
    (SELECT count(*) FROM public.profile_requests WHERE status = 'declined'),
    (SELECT count(*) FROM public.radar_candidates
       WHERE source_key = 'public_suggestion' AND status IN ('pending', 'review')),
    (SELECT count(*) FROM public.businesses WHERE claim_status = 'unclaimed'),
    (SELECT count(*) FROM public.businesses WHERE claim_status = 'claim_pending'),
    (SELECT count(*) FROM public.businesses WHERE claim_status = 'claimed'),
    (SELECT count(*) FROM public.businesses WHERE verified = true);
END;
$$;

REVOKE ALL ON FUNCTION public.acquisition_funnel() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acquisition_funnel() TO authenticated;

/*
  Which surface produced the requests. Same guard, same reason.
*/
CREATE OR REPLACE FUNCTION public.acquisition_by_source()
RETURNS TABLE (source text, total bigint, live bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT coalesce(r.source, 'unknown'), count(*),
         count(*) FILTER (WHERE r.status = 'live')
  FROM public.profile_requests r
  GROUP BY 1
  ORDER BY 2 DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.acquisition_by_source() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acquisition_by_source() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Confirm afterwards:
--   as anon:  insert with location + kind -> 201
--             insert with status 'live'   -> 401
--             select acquisition_funnel() -> 0 rows (not staff)
