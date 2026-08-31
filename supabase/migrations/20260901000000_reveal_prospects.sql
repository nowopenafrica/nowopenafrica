/*
  # Reveal prospect listings, and stop them burying the real ones

  Founder decision on 1 Sep 2026: the synthetic prospect listings are to be
  publicly visible rather than held back until claimed.

  ## What changes

  is_listable no longer excludes data_status 'synthetic_unverified'. Suspended
  businesses are still excluded — that exclusion is a moderation control, not a
  seeding policy, and it stays.

  Provenance is untouched. data_status still records that these rows began as
  synthetic seeds, source_license still says so, and every one of them still
  renders with an "Unclaimed" badge and no verification. Revealing a record
  changes who can see it, never what it claims to be.

  ## Why the ordering change ships in the same migration

  /businesses orders by created_at DESC. All 500 prospects were created on the
  same day, so revealing them without touching the sort would put 500 listings
  with no phone, address or hours ahead of all 32 real businesses on every
  page — the reveal would make the directory look emptier, not fuller, which is
  the opposite of the intent.

  listing_score fixes that generally rather than special-casing seeds: a
  finished business outranks an unfinished one whatever its origin, so a
  claimed prospect climbs the moment its owner fills the page in. That is the
  same incentive the Founding programme runs on.

  Reversible: to hide prospects again, restore the previous is_listable
  expression. Nothing here deletes or rewrites a row.
*/

/*
  The public read policy is written against is_listable, so it has to come down
  before the column can be replaced and go back up straight after. Between the
  two statements the table has no public SELECT policy at all — RLS denies by
  default — so a reader mid-migration sees nothing rather than everything. That
  is the safe way round.
*/
DROP POLICY IF EXISTS "Public can view businesses" ON public.businesses;

-- A generated column cannot be altered in place; drop and recreate.
ALTER TABLE public.businesses DROP COLUMN IF EXISTS is_listable;

ALTER TABLE public.businesses
  ADD COLUMN is_listable boolean
  GENERATED ALWAYS AS (lifecycle_status <> 'suspended') STORED;

CREATE INDEX IF NOT EXISTS idx_businesses_listable ON public.businesses (is_listable) WHERE is_listable;

/*
  How complete a listing is, 0–100.

  Weighted by what a customer actually needs before the page is worth arriving
  at: something to call, somewhere to go, and whether they are open. Prose and
  images matter, but they do not help anybody reach the business.

  Stored and generated, so ordering by it costs nothing and it can never drift
  from the row it describes.
*/
ALTER TABLE public.businesses DROP COLUMN IF EXISTS listing_score;

ALTER TABLE public.businesses
  ADD COLUMN listing_score integer
  GENERATED ALWAYS AS (
      (CASE WHEN coalesce(nullif(btrim(coalesce(phone, whatsapp, email, '')), ''), NULL) IS NOT NULL THEN 25 ELSE 0 END)
    + (CASE WHEN coalesce(nullif(btrim(coalesce(opening_hours, hours, '')), ''), NULL) IS NOT NULL THEN 20 ELSE 0 END)
    + (CASE WHEN coalesce(nullif(btrim(coalesce(address, '')), ''), NULL) IS NOT NULL THEN 15 ELSE 0 END)
    + (CASE WHEN coalesce(nullif(btrim(coalesce(about, description, '')), ''), NULL) IS NOT NULL THEN 15 ELSE 0 END)
    + (CASE WHEN coalesce(nullif(btrim(coalesce(logo_url, image_url, '')), ''), NULL) IS NOT NULL THEN 15 ELSE 0 END)
    + (CASE WHEN coalesce(nullif(btrim(coalesce(website, '')), ''), NULL) IS NOT NULL THEN 5 ELSE 0 END)
    + (CASE WHEN user_id IS NOT NULL THEN 5 ELSE 0 END)
  ) STORED;

/* The directory's default sort: finished first, then newest. */
CREATE INDEX IF NOT EXISTS idx_businesses_directory_order
  ON public.businesses (listing_score DESC, created_at DESC) WHERE is_listable;

/* Restored unchanged in shape — only the expression behind it moved. */
CREATE POLICY "Public can view businesses" ON public.businesses
  FOR SELECT USING (
    is_listable
    OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR public.is_admin()
  );
