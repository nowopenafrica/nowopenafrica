/*
  # NowOpen Create — the reference, the artwork, and the way back in

  The configurator ended with "Request received." and nothing else. An order on
  the Create page is placed WITHOUT AN ACCOUNT, deliberately, so that closing
  sentence was the end of the road: no inbox, no dashboard, no way for the
  customer to ever see the job again or to say yes when we came back with a
  price. Two of the four artwork routes worked; "I have the artwork" collected
  no artwork.

  This closes the loop.

  ## 1. reference

  A short unguessable code, generated on the client (the table is insert-only to
  the public, so nothing can come back from the insert). It is the receipt, and
  the URL carrying it is the customer's only way back. It is therefore a bearer
  token, and everything below is shaped by that: what it exposes is narrow, and
  what it can change is one transition.

  ## 2. create_order_status()

  There is still no public SELECT on this table and there must not be — these
  rows carry other people's contact details and what they are spending, so a
  readable public-insert table is a customer list anyone can download. A
  SECURITY DEFINER function is the alternative: it answers about exactly one
  reference, and it returns the job, the price and where it has got to. It does
  NOT return the contact, the note, or anything about any other order.

  ## 3. accept_create_order()

  The quote arrives, and the customer needs a way to say yes that is not a
  reply-all email. This flips quoted -> accepted and nothing else: it cannot
  create, cannot price, cannot cancel, and cannot move an order that is not
  sitting on a real quoted price. Acceptance moves no money — the price is still
  agreed by a person — so the worst a stolen reference can do is agree to a
  quote the same holder could already read.

  ## 4. create-artwork

  A PRIVATE bucket. Print-ready artwork is somebody's unreleased campaign or
  price list; business-images is world-readable and would publish it.

  The hard part is that the uploader is anonymous. An anonymous-writable bucket
  is a free file host, so an upload is only allowed when a create_orders row
  placed in the last hour ALREADY DECLARED that exact path. The order is written
  first and names the file; the upload is permitted because the order asked for
  it. That check has to run past this table's RLS, hence the definer helper.
*/

-- 1. Columns ------------------------------------------------------------------

ALTER TABLE public.create_orders ADD COLUMN IF NOT EXISTS reference     text;
ALTER TABLE public.create_orders ADD COLUMN IF NOT EXISTS artwork_path  text;
ALTER TABLE public.create_orders ADD COLUMN IF NOT EXISTS artwork_name  text;
/* What staff tell the customer alongside the real price. Shown on the status
   page: a number that changed with no explanation is a number people argue
   with rather than accept. */
ALTER TABLE public.create_orders ADD COLUMN IF NOT EXISTS quote_note    text;
ALTER TABLE public.create_orders ADD COLUMN IF NOT EXISTS accepted_at   timestamptz;

-- Existing rows predate the reference. Hex is a subset of the reference
-- alphabet, so md5 gives a value that satisfies the same shape.
UPDATE public.create_orders
SET reference = 'NOC-'
  || upper(substr(md5(id::text || 'a'), 1, 5)) || '-'
  || upper(substr(md5(id::text || 'b'), 1, 5))
WHERE reference IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_create_orders_reference
  ON public.create_orders (reference);

-- 2. Insert policy: a reference is now mandatory ------------------------------
-- Replacing rather than adding: WITH CHECK clauses on separate policies are
-- OR-ed, so a second permissive policy would be a way around the first.

DROP POLICY IF EXISTS "create_orders_public_insert" ON public.create_orders;
CREATE POLICY "create_orders_public_insert"
  ON public.create_orders FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    btrim(sku) <> '' AND btrim(product) <> '' AND btrim(contact) <> ''
    AND length(contact) <= 160
    AND length(spec) <= 1000
    AND length(coalesce(note, '')) <= 1000
    AND (quantity IS NULL OR (quantity > 0 AND quantity <= 1000000))
    AND estimate_total >= 0
    -- The reference is the customer's only way back, so it cannot be absent,
    -- and its shape is fixed here rather than trusted from the browser.
    AND reference ~ '^NOC-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$'
    -- An order may only claim artwork inside its own folder. Without this an
    -- order could name another order's file and read it back through staff.
    AND (
      artwork_path IS NULL
      OR (artwork_path LIKE reference || '/%' AND length(artwork_path) <= 200)
    )
    -- A customer cannot arrive already accepted, already quoted a price,
    -- already priced by us, or attached to a member of staff.
    AND status = 'new'
    AND quoted_total IS NULL
    AND quote_note IS NULL
    AND accepted_at IS NULL
    AND handled_by IS NULL
  );

-- 3. Status lookup ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_order_status(p_reference text)
RETURNS TABLE (
  reference      text,
  product        text,
  quantity       integer,
  spec           text,
  status         text,
  estimate_total integer,
  estimate_basis text,
  quoted_total   integer,
  quote_note     text,
  has_artwork    boolean,
  created_at     timestamptz,
  accepted_at    timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.reference, o.product, o.quantity, o.spec, o.status,
         o.estimate_total, o.estimate_basis, o.quoted_total, o.quote_note,
         o.artwork_path IS NOT NULL, o.created_at, o.accepted_at
  FROM public.create_orders o
  -- Exact match only. No prefix, no pattern: this must never be a way to walk
  -- the table with a partial reference.
  WHERE o.reference = p_reference
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.create_order_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_status(text) TO anon, authenticated;

-- 4. Accepting a quote --------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_create_order(p_reference text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hit boolean;
BEGIN
  UPDATE public.create_orders
  SET status = 'accepted', accepted_at = now()
  WHERE reference = p_reference
    AND status = 'quoted'
    -- Nothing can be accepted that has no real price on it. Accepting an
    -- estimate would be agreeing to a number nobody has stood behind.
    AND quoted_total IS NOT NULL;

  GET DIAGNOSTICS hit = ROW_COUNT;
  RETURN hit;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_create_order(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_create_order(text) TO anon, authenticated;

-- 5. Artwork bucket -----------------------------------------------------------
-- If this INSERT is blocked by the project's storage permissions, create a
-- PRIVATE bucket named "create-artwork" in Dashboard - Storage instead, with a
-- 25MB limit and the MIME list below, then add the object policies by hand.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'create-artwork', 'create-artwork', false, 26214400,
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

/*
  The gate on an anonymous upload.

  Definer because the check reads create_orders, which anon cannot select — a
  policy subquery runs as the calling role, so without this it would find
  nothing and refuse every upload.

  Three conditions, and all three matter: the order must exist, it must have
  named this exact path, and it must be recent. The last one is what stops a
  reference that leaks later from becoming an upload slot forever.
*/
CREATE OR REPLACE FUNCTION public.create_order_can_upload(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.create_orders o
    WHERE o.artwork_path = p_name
      AND o.created_at > now() - interval '1 hour'
  );
$$;

REVOKE ALL ON FUNCTION public.create_order_can_upload(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_can_upload(text) TO anon, authenticated;

DROP POLICY IF EXISTS "create_artwork_declared_insert" ON storage.objects;
CREATE POLICY "create_artwork_declared_insert"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'create-artwork' AND public.create_order_can_upload(name));

-- Staff only. No public read: this is the customer's unreleased artwork, and
-- it is fetched through a short-lived signed URL, never a public one.
DROP POLICY IF EXISTS "create_artwork_staff_read" ON storage.objects;
CREATE POLICY "create_artwork_staff_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'create-artwork' AND public.is_staff());

DROP POLICY IF EXISTS "create_artwork_staff_delete" ON storage.objects;
CREATE POLICY "create_artwork_staff_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'create-artwork' AND public.is_staff());

-- No UPDATE policy anywhere: an uploaded file cannot be swapped for another
-- after the fact, by the customer or by anyone holding the reference.

NOTIFY pgrst, 'reload schema';

-- Confirm afterwards:
--   as anon:  select * from create_order_status('NOC-...')  -> 1 row, no contact
--             select * from create_order_status('NOC-WRONG') -> 0 rows
--             select accept_create_order('NOC-...')          -> false while 'new'
--             upload to create-artwork/<undeclared path>      -> denied
