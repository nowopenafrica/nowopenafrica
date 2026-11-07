/*
  # The order price is decided by the server

  ## The hole

  public.create_orders accepts an INSERT from anon, and its policy checks
  `estimate_total >= 0`. Nothing else. The browser computed the quote and
  posted the number, so any client — or any `curl` — could post any figure it
  liked, zero included, and the row was accepted as the price the customer
  was shown.

  It has cost nothing so far because this table takes no money. The day it
  does, that number is the amount charged.

  ## Why a TRIGGER and not an RPC

  The obvious fix is a `submit_create_order()` function and revoking the
  public INSERT. It is also the fix that breaks production for as long as it
  takes to deploy the client: the moment the policy goes, every already-loaded
  browser session can no longer place an order, and orders are the only thing
  this page exists to collect.

  A BEFORE INSERT trigger closes the same hole with no such window, and closes
  it more completely:

    - it applies to EVERY door — the current client, a future one, a direct
      PostgREST call, a script, a psql session;
    - no client change is required for it to be true;
    - and there is no second, privileged entry point to keep in step with the
      policy.

  The client's number is simply overwritten wherever the server knows better.

  ## What happens to a SKU the server cannot price

  Not every SKU in this table is in the catalogue. Business packs and the free
  Studio items still live in src/lib/create/catalogue.ts, and a pack is a real
  order somebody places. Refusing those would break a working flow to fix a
  different one.

  So the row records WHERE ITS PRICE CAME FROM, in `price_source`:

    server   priced by price_service(). Authoritative.
    client   the browser's figure, for a SKU the catalogue does not hold.
             Staff must treat it as the customer's understanding, not ours.

  Nobody has to guess later which kind they are looking at, and when the last
  legacy SKU moves into the catalogue the 'client' value simply stops
  appearing.

  ## And an invalid configuration is refused outright

  If a SKU IS in the catalogue and price_service refuses it — a quantity below
  the minimum run, a quantity past the rate card, an option that does not
  exist — then the order describes something that cannot be made at the price
  the customer saw. Recording it with the browser's number is how a bad order
  reaches production. The insert fails with the refusal's own message, which
  is written to be read by a person.

  The one refusal that is not an error is `quote_required`: that service is
  meant to be enquired about. It stores a zero total and `server`, because the
  server positively determined there is no price, which is different from not
  having looked.
*/

ALTER TABLE public.create_orders
  ADD COLUMN IF NOT EXISTS price_source text NOT NULL DEFAULT 'client';

ALTER TABLE public.create_orders
  DROP CONSTRAINT IF EXISTS create_orders_price_source_known;
ALTER TABLE public.create_orders
  ADD CONSTRAINT create_orders_price_source_known
  CHECK (price_source IN ('server', 'client'));

COMMENT ON COLUMN public.create_orders.price_source IS
  'server = priced by price_service() at insert time and authoritative. '
  'client = the browser''s figure, for a SKU the services catalogue does not '
  'hold (packs, legacy items). Never treat a client figure as agreed.';

CREATE OR REPLACE FUNCTION public.guard_create_order_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  quote   jsonb;
  refusal text;
BEGIN
  /*
    SECURITY INVOKER on purpose. price_service only reads published catalogue
    rows, which the inserting role may already read, and running this as the
    owner would price an order against DRAFT figures.
  */
  quote := public.price_service(NEW.sku, NEW.quantity, COALESCE(NEW.options, '{}'::jsonb));
  refusal := quote ->> 'refusal';

  IF refusal IS NULL THEN
    /*
      price_service works in MINOR units; this table has always been in whole
      naira and its existing rows are historical records of what a customer
      was shown, so they are not being rewritten. The division is exact
      because price_service truncates every total to whole major units.
    */
    NEW.estimate_total := ((quote ->> 'total')::bigint) / 100;
    NEW.estimate_basis := CASE WHEN (quote ->> 'orderable')::boolean THEN 'quoted' ELSE 'indicative' END;
    NEW.price_source := 'server';
    RETURN NEW;
  END IF;

  /* A SKU this catalogue does not hold — a pack, or a free Studio item. */
  IF refusal = 'unknown_service' THEN
    NEW.price_source := 'client';
    RETURN NEW;
  END IF;

  /* Priced by a person, by design. Zero is the honest total, not a guess. */
  IF refusal = 'quote_required' THEN
    NEW.estimate_total := 0;
    NEW.estimate_basis := 'indicative';
    NEW.price_source := 'server';
    RETURN NEW;
  END IF;

  /*
    Anything else means the configuration itself is wrong. Refuse it, using
    the refusal's own sentence — these are written for a customer to read.
  */
  RAISE EXCEPTION USING
    MESSAGE = COALESCE(quote ->> 'message', 'That configuration cannot be priced.'),
    ERRCODE = 'check_violation';
END $$;

DROP TRIGGER IF EXISTS create_orders_price_guard ON public.create_orders;
CREATE TRIGGER create_orders_price_guard
  BEFORE INSERT ON public.create_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_create_order_price();

/*
  The insert policy's own price check is now redundant but stays: the trigger
  decides the figure, and a policy that still refuses a negative one costs
  nothing and holds if the trigger is ever dropped by accident.

  The policy is deliberately NOT narrowed to require price_source, because a
  client that does not know about the column must keep working — the column
  has a default and the trigger sets it regardless of what was sent.
*/
