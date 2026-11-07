/*
  # The pricing engine, on the server

  ## The hole this closes

  Today the browser computes a quote (src/lib/create/configure.ts) and posts
  `estimate_total` into public.create_orders. The insert policy checks only
  `estimate_total >= 0`. So a customer can post any number they like — zero
  included — and the row is accepted, because nothing on the server knows what
  the configuration should cost.

  That has not caused a loss yet for one reason only: create_orders takes no
  money. The moment it does, the client-supplied total becomes the amount
  charged. This function exists so the price is decided where the customer
  cannot reach it, BEFORE that step rather than after the first bad order.

  ## What it returns, and why it refuses

  `price_service(sku, quantity, options)` returns a jsonb quote: itemised
  lines, a total in minor units, the basis, the turnaround band, and — when
  it will not price the thing — a `refusal` saying which rule stopped it.

  It refuses rather than guesses when:

    - the service is not published, or does not exist;
    - the service says quote_required, because a scope nobody has read cannot
      be priced by arithmetic;
    - a tiered service is asked for a quantity below its smallest tier (a
      printer's minimum run is a real constraint, not a rounding problem);
    - a required option is missing or is given a choice that does not exist.

  A refusal is a RESULT, not an error: the caller shows the quote path. An
  exception would be indistinguishable from the database being down.

  ## SECURITY INVOKER, deliberately

  It reads only published catalogue rows, which the anon role may already
  read, so it needs no elevated rights — and SECURITY DEFINER here would read
  DRAFT prices on behalf of the public. The one job of this function is to be
  the authority on price; borrowing the owner's rights to do it would let an
  unpublished figure out of the building.

  BUT: a SECURITY INVOKER function called by a role that BYPASSES row-level
  security — service_role, or the table owner — does not get the public's
  view of these tables. It gets everything, drafts included. So the
  `publication_status = 'published'` test below is written into the WHERE
  clause and is NOT left to the RLS policy. The policy protects the table;
  this predicate protects the price. Relying on RLS alone here is the way
  this function would quietly start quoting draft figures to anyone calling
  it through a server-side key.
*/

CREATE OR REPLACE FUNCTION public.price_service(
  p_sku      text,
  p_quantity integer DEFAULT NULL,
  p_options  jsonb   DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  svc        public.services%ROWTYPE;
  lines      jsonb := '[]'::jsonb;
  base       bigint := 0;
  total      bigint := 0;
  tier       public.service_price_tiers%ROWTYPE;
  smallest   integer;
  largest    integer;
  opt        record;
  choice     public.service_option_choices%ROWTYPE;
  chosen_key text;
  delta      bigint;
  t_min      integer;
  t_max      integer;
BEGIN
  IF p_options IS NULL OR jsonb_typeof(p_options) <> 'object' THEN
    p_options := '{}'::jsonb;
  END IF;

  SELECT * INTO svc FROM public.services
   WHERE sku = p_sku AND publication_status = 'published';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('refusal', 'unknown_service',
      'message', 'That service is not in the catalogue.');
  END IF;

  IF svc.quote_required OR svc.pricing_model = 'custom_quote' THEN
    RETURN jsonb_build_object('refusal', 'quote_required', 'sku', svc.sku,
      'service', svc.name, 'currency', svc.currency,
      'message', 'This one is priced after someone reads the brief.');
  END IF;

  t_min := COALESCE(svc.turnaround_min_days, 0);
  t_max := COALESCE(svc.turnaround_max_days, 0);

  -- ── the base line ─────────────────────────────────────────────────────
  IF svc.pricing_model = 'free' THEN
    base := 0;
    lines := lines || jsonb_build_array(jsonb_build_object('label', svc.name, 'amount', 0));

  ELSIF EXISTS (SELECT 1 FROM public.service_price_tiers WHERE service_id = svc.id) THEN
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
      RETURN jsonb_build_object('refusal', 'quantity_required', 'sku', svc.sku,
        'message', 'This is priced by quantity, so a quantity is needed.');
    END IF;

    SELECT min(min_quantity), max(min_quantity) INTO smallest, largest
      FROM public.service_price_tiers WHERE service_id = svc.id;

    /*
      Below the smallest tier is a REFUSAL, not the smallest tier's price.
      A printer's minimum run is a real constraint; quietly charging the
      100-piece price for an order of 10 tells the customer a lie about what
      they are buying and hands production an order it will reject.
    */
    IF p_quantity < smallest THEN
      RETURN jsonb_build_object('refusal', 'below_minimum', 'sku', svc.sku,
        'minimum', smallest,
        'message', format('The smallest run for this is %s.', smallest));
    END IF;

    /*
      ── AND THE SAME MISTAKE AT THE OTHER END ──────────────────────────
      Measured against the live catalogue: asking for 250 standard business
      cards returned the price of 100, because the only tier is 100 and
      "the largest tier at or below the quantity" is still that one. The
      customer would have been quoted ₦15,000 for two and a half times the
      goods, and production would have been handed an order at a price that
      does not cover it.

      Extrapolating is not available either: print does not scale linearly
      (plates, setup and sheet sizes do not care about arithmetic), so a
      quantity past the top of the rate card is a QUOTE, not a sum.
    */
    IF p_quantity > largest THEN
      RETURN jsonb_build_object('refusal', 'above_rate_card', 'sku', svc.sku,
        'maximum', largest,
        'message', format('The rate card stops at %s. Larger runs are quoted.', largest));
    END IF;

    SELECT * INTO tier FROM public.service_price_tiers
     WHERE service_id = svc.id AND min_quantity <= p_quantity
     ORDER BY min_quantity DESC LIMIT 1;

    base := tier.price_minor;
    lines := lines || jsonb_build_array(jsonb_build_object(
      'label', format('%s × %s', svc.name, tier.min_quantity), 'amount', base));

  ELSE
    IF svc.price_minor IS NULL THEN
      RETURN jsonb_build_object('refusal', 'no_price', 'sku', svc.sku,
        'message', 'This service has no price set.');
    END IF;

    base := svc.price_minor;
    /*
      A per-unit model multiplies; a fixed one does not. Multiplying a fixed
      price by a quantity nobody asked for is how a ₦35,000 pitch deck
      becomes ₦350,000.
    */
    IF svc.pricing_model IN ('per_item', 'per_page', 'per_slide', 'per_screen',
                             'per_unit', 'per_minute', 'per_second', 'per_square_metre')
    THEN
      IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RETURN jsonb_build_object('refusal', 'quantity_required', 'sku', svc.sku,
          'message', format('This is priced %s, so a number is needed.',
                            COALESCE(svc.price_unit, 'per unit')));
      END IF;
      base := base * p_quantity;
      lines := lines || jsonb_build_array(jsonb_build_object(
        'label', format('%s × %s', svc.name, p_quantity), 'amount', base));
    ELSE
      lines := lines || jsonb_build_array(jsonb_build_object('label', svc.name, 'amount', base));
    END IF;
  END IF;

  total := base;

  -- ── options ───────────────────────────────────────────────────────────
  FOR opt IN
    SELECT * FROM public.service_options WHERE service_id = svc.id ORDER BY sort_order, key
  LOOP
    chosen_key := p_options ->> opt.key;

    IF chosen_key IS NULL THEN
      IF opt.required THEN
        RETURN jsonb_build_object('refusal', 'option_required', 'sku', svc.sku,
          'option', opt.key,
          'message', format('Choose a %s.', lower(opt.label)));
      END IF;
      CONTINUE;
    END IF;

    SELECT * INTO choice FROM public.service_option_choices
     WHERE option_id = opt.id AND key = chosen_key;

    /*
      An unknown choice is REJECTED, never ignored. Ignoring it prices a
      configuration the customer did not ask for and then delivers against
      the order rather than the intention.
    */
    IF NOT FOUND THEN
      RETURN jsonb_build_object('refusal', 'invalid_option', 'sku', svc.sku,
        'option', opt.key, 'value', chosen_key,
        'message', format('%s does not offer that.', opt.label));
    END IF;

    /*
      Integer arithmetic throughout — no float ever touches money.

      delta_bp is basis points of the base line, and the result is truncated
      to whole MAJOR units (whole naira), because a surcharge of ₦1,125.37 is
      not a thing anyone can pay and a catalogue that produces one has a
      rounding bug waiting in the invoice. Truncation rather than rounding up,
      so the arithmetic never surprises the customer upward.
    */
    delta := CASE
      WHEN choice.delta_bp <> 0 THEN ((base * choice.delta_bp) / 10000 / 100) * 100
      ELSE choice.delta_minor
    END;

    IF delta <> 0 THEN
      lines := lines || jsonb_build_array(jsonb_build_object(
        'label', format('%s: %s', opt.label, choice.label), 'amount', delta));
      total := total + delta;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'sku',        svc.sku,
    'service',    svc.name,
    'currency',   svc.currency,
    'lines',      lines,
    'total',      total,
    'basis',      svc.price_basis,
    /* The one field a checkout must read before taking money. */
    'orderable',  svc.is_orderable,
    'turnaround', jsonb_build_array(t_min, t_max)
  );
END $$;

REVOKE ALL ON FUNCTION public.price_service(text, integer, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.price_service(text, integer, jsonb) TO anon, authenticated;

COMMENT ON FUNCTION public.price_service(text, integer, jsonb) IS
  'The authority on what a configuration costs. Returns a jsonb quote or a '
  'refusal naming the rule that stopped it. Never trust a total that came '
  'from a browser; call this and compare.';
