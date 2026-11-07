/*
  # The options the configurator offers, taught to the pricing engine

  ## The mismatch this closes

  The previous migration made the server decide an order's price. But the
  options that change that price — finish, sides, rush — were only ever known
  to the browser (src/lib/create/configure.ts). So a customer could choose
  "Rush", watch the total go up by 35%, place the order, and have the server
  overwrite the total with the figure WITHOUT the rush on it.

  That is worse than the hole it replaced: the number on screen and the number
  in the order would disagree, and the customer would be right and the record
  would be wrong.

  So the same three option groups, with the same deltas, are seeded here. The
  percentages are expressed in basis points (3500 = +35%) because the engine
  does integer arithmetic on money and a float has no business anywhere near
  a price.

  ## Why these three and no more

  They are the ones taken from configure.ts verbatim, which chose them because
  they are what actually changes a printer's charge. A longer list produces a
  customer browsing specifications instead of ordering.

  ## Which services get which

  - Rush is offered wherever a PERSON does the work, so: everything except the
    partner-produced print run, which is a machine's queue and not ours to
    jump. That mirrors `optionGroupsFor()` exactly.
  - Finish and sides are physical properties, so they go on produced goods
    only. Asking about the paper stock of a pitch deck is noise.

  Re-runnable: options and choices are keyed per service and upserted.
*/

-- ─────────────────────────────────────────────────────────────────────────
-- Turnaround — on everything a creator makes
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO public.service_options (service_id, key, label, help, required, sort_order)
SELECT s.id, 'speed', 'Turnaround', 'Rush moves you to the front of the queue.', false, 10
  FROM public.services s
 WHERE s.fulfilment = 'creator'
   AND s.pricing_model <> 'custom_quote'
ON CONFLICT (service_id, key) DO UPDATE
  SET label = EXCLUDED.label, help = EXCLUDED.help, sort_order = EXCLUDED.sort_order;

INSERT INTO public.service_option_choices (option_id, key, label, delta_bp, sort_order)
SELECT o.id, v.key, v.label, v.delta_bp, v.sort_order
  FROM public.service_options o
  JOIN public.services s ON s.id = o.service_id
 CROSS JOIN (VALUES
   ('standard', 'Standard', 0,    10),
   ('rush',     'Rush',     3500, 20)
 ) AS v(key, label, delta_bp, sort_order)
 WHERE o.key = 'speed' AND s.fulfilment = 'creator'
ON CONFLICT (option_id, key) DO UPDATE
  SET label = EXCLUDED.label, delta_bp = EXCLUDED.delta_bp, sort_order = EXCLUDED.sort_order;

-- ─────────────────────────────────────────────────────────────────────────
-- Finish and sides — on things that are physically produced
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO public.service_options (service_id, key, label, help, required, sort_order)
SELECT s.id, 'finish', 'Finish', NULL, false, 20
  FROM public.services s
 WHERE s.production_required AND s.pricing_model <> 'custom_quote'
ON CONFLICT (service_id, key) DO UPDATE SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order;

INSERT INTO public.service_option_choices (option_id, key, label, delta_bp, sort_order)
SELECT o.id, v.key, v.label, v.delta_bp, v.sort_order
  FROM public.service_options o
  JOIN public.services s ON s.id = o.service_id
 CROSS JOIN (VALUES
   ('standard', 'Standard',         0,    10),
   ('rounded',  'Rounded corners',  800,  20),
   ('matte',    'Matte',            1000, 30),
   ('premium',  'Premium',          2500, 40)
 ) AS v(key, label, delta_bp, sort_order)
 WHERE o.key = 'finish' AND s.production_required
ON CONFLICT (option_id, key) DO UPDATE
  SET label = EXCLUDED.label, delta_bp = EXCLUDED.delta_bp, sort_order = EXCLUDED.sort_order;

INSERT INTO public.service_options (service_id, key, label, help, required, sort_order)
SELECT s.id, 'sides', 'Printed', NULL, false, 30
  FROM public.services s
 WHERE s.production_required AND s.pricing_model <> 'custom_quote'
ON CONFLICT (service_id, key) DO UPDATE SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order;

/*
  A negative delta. One side costs the printer less, so it costs the customer
  less — and the engine's integer arithmetic handles a negative basis point
  the same way it handles a positive one, truncating toward zero.
*/
INSERT INTO public.service_option_choices (option_id, key, label, delta_bp, sort_order)
SELECT o.id, v.key, v.label, v.delta_bp, v.sort_order
  FROM public.service_options o
  JOIN public.services s ON s.id = o.service_id
 CROSS JOIN (VALUES
   ('double', 'Both sides', 0,     10),
   ('single', 'One side',   -1000, 20)
 ) AS v(key, label, delta_bp, sort_order)
 WHERE o.key = 'sides' AND s.production_required
ON CONFLICT (option_id, key) DO UPDATE
  SET label = EXCLUDED.label, delta_bp = EXCLUDED.delta_bp, sort_order = EXCLUDED.sort_order;

DO $$
DECLARE opts int; choices int;
BEGIN
  SELECT count(*) INTO opts FROM public.service_options;
  SELECT count(*) INTO choices FROM public.service_option_choices;
  RAISE NOTICE 'Options seeded: % option groups, % choices.', opts, choices;
END $$;
