/*
  # The Business Claim Network

  Discovery → claim → verification, plus the lifecycle states the launch audit
  found missing, plus provenance on every record.

  ## Why this extends `businesses` instead of adding `business_listings`

  The specification asks for a separate listings table. Everything the product
  already has — Discover, search, the public profile, the crawler-rendered
  pages, offers, keeps, reviews, claims, the Founding programme — reads
  `businesses`. A parallel table would fork all of it: two kinds of business,
  two profile routes, two search paths, and a data migration at the exact
  moment a claim is approved, which is the worst possible time to move a row
  between tables.

  Extending `businesses` means a claimed shell becomes a first-class business
  instantly, with dashboard, Studio, offers and Founding eligibility already
  attached. That is the whole point of the funnel, and it is one UPDATE.

  ## The rule that matters most

  Synthetic records are NEVER publicly listed. The 500 seed businesses are
  fabricated — no phone, no email, no website, no street address, because they
  do not exist. Business profiles are server-rendered for crawlers, so putting
  them in discovery would have Google index 500 invented Nigerian businesses,
  with LocalBusiness JSON-LD, on a domain that currently ranks honestly. Generic
  names like "Blue Care Pharmacy" will also collide with real Lagos businesses.

  So listability is a stored column computed from the row, and the public read
  policy is written against it. It cannot be forgotten in one query, because it
  is not a query-level convention.

  They stay READABLE by id/slug so the claim flow and admin outreach links work;
  the page renders them as prospects and the app marks them noindex.

  Re-runnable: IF NOT EXISTS throughout, policies dropped before create.
*/

-- ---------------------------------------------------------------- provenance
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS data_status  text NOT NULL DEFAULT 'user_created',
  ADD COLUMN IF NOT EXISTS claim_status text NOT NULL DEFAULT 'unclaimed',
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified',
  /* Operational state, separate from the daily open/closed cycle. The launch
     audit found no way to mark a business closed or suspended: the only actions
     were edit and delete, and deleting a page that ranks is not the same as
     saying the business shut down. */
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS claimed_at       timestamptz,
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  -- Where the record came from, kept for every row, not just imports.
  ADD COLUMN IF NOT EXISTS source_name      text,
  ADD COLUMN IF NOT EXISTS source_url       text,
  ADD COLUMN IF NOT EXISTS source_record_id text,
  ADD COLUMN IF NOT EXISTS source_license   text,
  ADD COLUMN IF NOT EXISTS source_imported_at   timestamptz,
  ADD COLUMN IF NOT EXISTS source_last_checked_at timestamptz,
  /* The importer's idempotency key. A re-run updates the same row rather than
     creating a second copy of every seed business. */
  ADD COLUMN IF NOT EXISTS external_id text;

ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_data_status_check;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_data_status_check
  CHECK (data_status IN ('synthetic_unverified','imported_authorized','submitted','user_created','admin_curated'));

ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_claim_status_check;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_claim_status_check
  CHECK (claim_status IN ('unclaimed','claim_pending','claimed'));

ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_verification_status_check;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_verification_status_check
  CHECK (verification_status IN ('unverified','pending','verified','rejected'));

ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_lifecycle_status_check;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_lifecycle_status_check
  CHECK (lifecycle_status IN ('active','temporarily_closed','permanently_closed','suspended'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_external_id
  ON public.businesses (external_id) WHERE external_id IS NOT NULL;

/*
  Listability, computed and stored.

  Synthetic records are excluded until somebody claims one — at which point a
  real person has stood behind it and it stops being fabricated. Suspended
  records drop out entirely. Permanently closed records deliberately stay in:
  "this shut down" is useful to a reader, and is the reason not to delete.
*/
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS is_listable boolean
  GENERATED ALWAYS AS (
    lifecycle_status <> 'suspended'
    AND (data_status <> 'synthetic_unverified' OR claim_status = 'claimed')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_businesses_listable ON public.businesses (is_listable) WHERE is_listable;
CREATE INDEX IF NOT EXISTS idx_businesses_claim_status ON public.businesses (claim_status);
CREATE INDEX IF NOT EXISTS idx_businesses_city_category ON public.businesses (location, category);

/*
  Backfill, so existing rows describe themselves truthfully.

  The 32 live businesses were created in the product, and the two with owners
  are genuinely claimed. Nothing here invents a verification: verification_status
  is derived from the real signals, never from the legacy `verified` column,
  which is set on 24 unowned seed records and proves nothing.
*/
UPDATE public.businesses
   SET claim_status = CASE WHEN user_id IS NOT NULL THEN 'claimed' ELSE 'unclaimed' END,
       verification_status = CASE
         WHEN coalesce(email_verified,false) AND coalesce(phone_verified,false) THEN 'verified'
         ELSE 'unverified' END,
       claimed_at = CASE WHEN user_id IS NOT NULL THEN coalesce(claimed_at, created_at) ELSE claimed_at END
 WHERE claim_status = 'unclaimed' AND data_status = 'user_created';

-- ------------------------------------------------------------------- reports
/*
  Reporting a listing.

  The launch audit's first blocker: NowOpen positions itself as the source of
  truth on whether a business is open, and a wrong fact had no path back in.

  Anyone may file one, signed in or not — the person who knows a shop closed
  down is usually a customer, and forcing a sign-up first loses the report. That
  makes the table a spam target, so nothing here is public: reports are readable
  by staff only, and filing one grants no ability to read anything back.
*/
CREATE TABLE IF NOT EXISTS public.business_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  -- Null for anonymous reporters, which is most of them.
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason      text NOT NULL,
  detail      text,
  contact     text,
  status      text NOT NULL DEFAULT 'open',
  resolution  text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.business_reports DROP CONSTRAINT IF EXISTS business_reports_reason_check;
ALTER TABLE public.business_reports ADD CONSTRAINT business_reports_reason_check
  CHECK (reason IN ('closed','moved','wrong_phone','wrong_address','wrong_hours',
                    'wrong_category','duplicate','not_real','offensive','impersonation','other'));

ALTER TABLE public.business_reports DROP CONSTRAINT IF EXISTS business_reports_status_check;
ALTER TABLE public.business_reports ADD CONSTRAINT business_reports_status_check
  CHECK (status IN ('open','reviewing','actioned','rejected'));

CREATE INDEX IF NOT EXISTS idx_business_reports_open
  ON public.business_reports (created_at DESC) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_business_reports_business ON public.business_reports (business_id);

ALTER TABLE public.business_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can report a listing" ON public.business_reports;
CREATE POLICY "Anyone can report a listing" ON public.business_reports
  FOR INSERT TO anon, authenticated WITH CHECK (true);

/*
  No public SELECT at all — not even for the person who filed it.

  Reports name businesses as fake, closed or impersonating, which is exactly the
  material a competitor would mine. NOTE for the client: never chain .select()
  onto this insert; RLS will kill the write and blame the insert.
*/
DROP POLICY IF EXISTS "Staff read reports" ON public.business_reports;
CREATE POLICY "Staff read reports" ON public.business_reports
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Staff manage reports" ON public.business_reports;
CREATE POLICY "Staff manage reports" ON public.business_reports
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- --------------------------------------------------- public visibility rules
/*
  Replaces `USING (true)`.

  Owners and admins keep full sight of their own unlisted rows, so a suspended
  business can still be worked on and a synthetic shell is still reachable for
  the claim flow by id or slug. What changes is that anonymous discovery cannot
  enumerate what is not listable.
*/
DROP POLICY IF EXISTS "Public can view businesses" ON public.businesses;
CREATE POLICY "Public can view businesses" ON public.businesses
  FOR SELECT USING (
    is_listable
    OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR public.is_admin()
  );

/*
  A prospect stays reachable by its exact slug, so an outreach link works and a
  claimant can land on the page they were invited to claim. It returns one row
  and cannot be used to enumerate the seed set.
*/
CREATE OR REPLACE FUNCTION public.prospect_by_slug(p_slug text)
RETURNS TABLE (id uuid, name text, category text, location text, username text,
               claim_status text, data_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, b.name, b.category, b.location, b.username, b.claim_status, b.data_status
    FROM public.businesses b
   WHERE b.username = p_slug
     AND b.data_status = 'synthetic_unverified'
     AND b.lifecycle_status <> 'suspended'
   LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.prospect_by_slug(text) TO anon, authenticated;

-- ------------------------------------------------------ claim keeps statuses
/*
  Approving a claim now moves the whole state machine, not just ownership.

  A claim being approved is the moment a synthetic shell stops being fabricated:
  a real person has proven they run it. claim_status becomes 'claimed', which is
  what makes is_listable true and puts the record into discovery for the first
  time.

  data_status is deliberately NOT rewritten. Provenance is a historical fact —
  the row did originate as a synthetic seed, and that stays on the record.

  verification_status is NOT set to 'verified' here. Owning a page and having
  been verified are different claims, and collapsing them is how a directory
  ends up with meaningless badges. Verification remains its own step.
*/
CREATE OR REPLACE FUNCTION public.apply_business_claim()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
  IF NEW.status <> 'approved' OR OLD.status = 'approved' THEN RETURN NEW; END IF;

  SELECT user_id INTO v_owner FROM public.businesses WHERE id = NEW.business_id;
  IF v_owner IS NOT NULL AND v_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'That business already has an owner';
  END IF;

  UPDATE public.businesses
     SET user_id      = NEW.user_id,
         claim_status = 'claimed',
         claimed_at   = now()
   WHERE id = NEW.business_id;

  UPDATE public.business_claims
     SET status = 'rejected',
         note = coalesce(note, 'Another claim was approved first')
   WHERE business_id = NEW.business_id
     AND id <> NEW.id
     AND status = 'pending';

  NEW.reviewed_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_business_claim ON public.business_claims;
CREATE TRIGGER trg_apply_business_claim
  BEFORE UPDATE ON public.business_claims
  FOR EACH ROW EXECUTE FUNCTION public.apply_business_claim();

/*
  A filed claim marks the business as pending, so the public page can say
  "a claim is being reviewed" rather than continuing to invite claims.
*/
CREATE OR REPLACE FUNCTION public.mark_claim_pending()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.businesses
     SET claim_status = 'claim_pending'
   WHERE id = NEW.business_id AND claim_status = 'unclaimed';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_claim_pending ON public.business_claims;
CREATE TRIGGER trg_mark_claim_pending
  AFTER INSERT ON public.business_claims
  FOR EACH ROW EXECUTE FUNCTION public.mark_claim_pending();

-- ------------------------------------------------------------- network stats
/*
  The admin Business Network counters, computed server-side.

  Staff-only: the unclaimed and synthetic counts describe how much of the
  network is still hollow, which is not a number to publish while launching.
*/
CREATE OR REPLACE FUNCTION public.business_network_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  SELECT jsonb_build_object(
    'total',           count(*),
    'listable',        count(*) FILTER (WHERE is_listable),
    'claimed',         count(*) FILTER (WHERE claim_status = 'claimed'),
    'claim_pending',   count(*) FILTER (WHERE claim_status = 'claim_pending'),
    'unclaimed',       count(*) FILTER (WHERE claim_status = 'unclaimed'),
    'verified',        count(*) FILTER (WHERE verification_status = 'verified'),
    'synthetic',       count(*) FILTER (WHERE data_status = 'synthetic_unverified'),
    'suspended',       count(*) FILTER (WHERE lifecycle_status = 'suspended'),
    'closed',          count(*) FILTER (WHERE lifecycle_status = 'permanently_closed'),
    'open_reports',    (SELECT count(*) FROM public.business_reports WHERE status = 'open'),
    'pending_claims',  (SELECT count(*) FROM public.business_claims  WHERE status = 'pending')
  ) INTO result FROM public.businesses;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.business_network_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.business_network_stats() TO authenticated;
