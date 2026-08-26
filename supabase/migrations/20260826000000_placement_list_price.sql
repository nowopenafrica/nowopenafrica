/*
  # Rate-card price, so a discount can be shown as one

  Nigerian OOH is sold off a published rate card and then discounted, and every
  listing on an operator's site shows both numbers — the card price struck
  through, the price you actually pay beside it. That pairing is the offer. A
  single number cannot express it: N1,800,000 alone is just a price, while
  N2,000,000 struck through next to it is a reason to book.

  price_per_day stays what the advertiser pays. list_price_per_day is what the
  card says before discount, and is NULL when a placement is not discounted —
  which is why it is nullable rather than defaulted. Defaulting it to
  price_per_day would make every placement claim a discount of zero, and the UI
  would have to guess which of those were real.

  Safe to re-run: ADD COLUMN IF NOT EXISTS, and the constraint is dropped first.
*/

ALTER TABLE public.advertisements
  ADD COLUMN IF NOT EXISTS list_price_per_day numeric;

COMMENT ON COLUMN public.advertisements.list_price_per_day IS
  'Undiscounted rate-card price per day. NULL when the placement is not discounted.';

-- A "was" price below the price being charged is not a discount, it is a
-- mistake, and it would render as a struck-through number smaller than the one
-- beside it. Catch it at the database rather than in every reader.
ALTER TABLE public.advertisements
  DROP CONSTRAINT IF EXISTS advertisements_list_price_above_price;
ALTER TABLE public.advertisements
  ADD CONSTRAINT advertisements_list_price_above_price
  CHECK (list_price_per_day IS NULL OR price_per_day IS NULL OR list_price_per_day > price_per_day);
