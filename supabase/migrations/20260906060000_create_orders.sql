/*
  # NowOpen Create — orders

  The Create page could show a catalogue and nothing else: every button went to
  /studio or /waitlist, so a visitor who knew exactly what they wanted had no
  way to say so. This is the missing end of Choose -> Customise -> Price ->
  Order.

  ## Why it is a request, not a purchase

  There is no payment here, and that is deliberate rather than unfinished. Every
  printed price in the catalogue is a market estimate with no supplier quote
  behind it (see src/lib/create/catalogue.ts). Taking money against a number
  nobody has agreed to means either eating the difference on every order or
  going back to the customer to put the price up — and the second is worse.

  So an order captures the full specification and the estimate it was shown,
  and a person comes back with a real price. `quoted_total` is where that price
  lands, beside `estimate_total`, so the gap between what we guessed and what it
  actually costs is visible per order rather than lost. That is the data that
  turns the catalogue from estimates into quotes.

  The flow does not need rebuilding when it does: a SKU whose basis is 'quoted'
  is already orderable outright, and this table already holds everything a
  payment step would need.

  ## What it is not

  It creates nothing public. An order is a private request between a customer
  and NowOpen, readable only by staff.
*/

CREATE TABLE IF NOT EXISTS public.create_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The catalogue SKU, kept as text: the catalogue lives in code, and a foreign
  -- key to a table that does not exist would be a fiction.
  sku             text NOT NULL,
  product         text NOT NULL,
  quantity        integer,
  /** Finish, sides, turnaround — whatever the product offered. */
  options         jsonb NOT NULL DEFAULT '{}'::jsonb,
  design_route    text NOT NULL
                  CHECK (design_route IN ('template', 'upload', 'ai', 'creator')),
  /** One line a printer can quote from without opening the app. */
  spec            text NOT NULL,
  /** What the customer was shown, in kobo-free naira. */
  estimate_total  integer NOT NULL DEFAULT 0,
  estimate_basis  text NOT NULL DEFAULT 'indicative'
                  CHECK (estimate_basis IN ('indicative', 'quoted')),
  /** What it actually costs, once a partner has priced it. */
  quoted_total    integer,

  contact         text NOT NULL,
  business_name   text,
  note            text,

  status          text NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new', 'quoting', 'quoted', 'accepted', 'in_production', 'delivered', 'cancelled')),
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  handled_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  handled_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_create_orders_open
  ON public.create_orders (created_at DESC) WHERE status IN ('new', 'quoting');

ALTER TABLE public.create_orders ENABLE ROW LEVEL SECURITY;

-- Anyone may place one. Requiring an account before somebody can say what they
-- want to buy is the friction this whole page exists to remove.
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
    -- A customer cannot arrive already accepted, already quoted a price, or
    -- attached to a member of staff.
    AND status = 'new'
    AND quoted_total IS NULL
    AND handled_by IS NULL
  );

-- No public SELECT. These rows carry other people's contact details and what
-- they are spending; a public-insert table that is also publicly readable is a
-- customer list anyone can download.
--
-- This is also why the client must not chain .select() onto the insert: RLS
-- would refuse the whole statement and blame the insert.
DROP POLICY IF EXISTS "create_orders_staff_read" ON public.create_orders;
CREATE POLICY "create_orders_staff_read"
  ON public.create_orders FOR SELECT
  TO authenticated
  USING (public.is_staff());

DROP POLICY IF EXISTS "create_orders_staff_update" ON public.create_orders;
CREATE POLICY "create_orders_staff_update"
  ON public.create_orders FOR UPDATE
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Confirm afterwards:
--   as anon:  insert ... -> 201
--             select * from create_orders -> 0 rows
