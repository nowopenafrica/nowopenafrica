/*
  # Hide prospect listings again

  Reverses 20260901000000_reveal_prospects.sql at the founder's direction, a
  few minutes after it shipped. Synthetic prospect listings return to being
  invisible to the public: claimable by direct link, visible to admins, absent
  from Discover, the directory, search and the sitemap.

  ## What is NOT reverted, and why

  listing_score stays, and so does the ordering that uses it. That change fixed
  a real defect the reveal only exposed: Discover fetched `.limit(400)` with no
  ORDER BY, so once the table held more than 400 rows an arbitrary 400 came
  back and real businesses could silently vanish. That bug outlives the reveal
  and the fix should too. Sorting by completeness is also correct on its own
  terms — a finished business should outrank an unfinished one whatever its
  origin.

  ## On the sitemap

  Between the two migrations the sitemap listed all 532 slugs and prospect
  pages emitted `index, follow`. Those URLs now return no row to an anonymous
  reader, so they 404 and search engines drop them on the next crawl. Nothing
  further is required, and no request to remove them is warranted for pages
  that were live for minutes.

  Reversible in either direction: this expression and the one in
  20260901000000 are the only two states.
*/

DROP POLICY IF EXISTS "Public can view businesses" ON public.businesses;

ALTER TABLE public.businesses DROP COLUMN IF EXISTS is_listable;

/*
  A prospect becomes listable the moment a real owner claims it — at that point
  somebody has stood behind the record and it is no longer fabricated.
  Suspension removes any listing regardless.
*/
ALTER TABLE public.businesses
  ADD COLUMN is_listable boolean
  GENERATED ALWAYS AS (
    lifecycle_status <> 'suspended'
    AND (data_status <> 'synthetic_unverified' OR claim_status = 'claimed')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_businesses_listable ON public.businesses (is_listable) WHERE is_listable;
CREATE INDEX IF NOT EXISTS idx_businesses_directory_order
  ON public.businesses (listing_score DESC, created_at DESC) WHERE is_listable;

CREATE POLICY "Public can view businesses" ON public.businesses
  FOR SELECT USING (
    is_listable
    OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR public.is_admin()
  );
