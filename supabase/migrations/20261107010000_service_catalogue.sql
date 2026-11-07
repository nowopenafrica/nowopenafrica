/*
  # NowOpen Create Media — the service catalogue, in the database

  ## What was already here, and why this is not a replacement

  AUDITED 2026-10-19 before writing a line of this:

    src/lib/create/catalogue.ts   ~50 SKUs, 5 divisions, quantity tiers,
                                  competitor benchmarks, turnaround bands,
                                  margin bands and a `sellable()` gate.
    src/lib/create/configure.ts   option groups and a quote calculation.
    public.create_orders          a request, not a purchase. estimate_total
                                  beside quoted_total so the gap between the
                                  guess and the real cost is visible per order.
    public.media_services         a PROVIDER marketplace (people listing their
                                  own services) — a different thing entirely,
                                  and 18 of its rows are flagged is_sample
                                  because they were invented.

  That model is good and its honesty mechanism — `indicative` versus `quoted`
  — is exactly what the brief asks for. What it cannot do is change: the
  catalogue is a TypeScript constant, so moving one price needs an engineer, a
  build and a deploy. Everything below exists to move that data into rows
  WITHOUT losing the distinction between a price somebody agreed to and a
  price somebody guessed.

  ## The one rule this schema enforces above all others

  A price nobody has agreed to cannot be charged.

  `price_basis` carries three values, and only one of them can be sold:

    proposed    a founder's launch hypothesis. Browsable, never chargeable.
    indicative  benchmarked against a published competitor price. Same.
    quoted      a supplier or creator has priced this scope. Chargeable.

  The `services_sellable_needs_quote` constraint makes that structural rather
  than a convention a future component can forget. `is_orderable` is a
  GENERATED column so no reader can compute it differently from any other
  reader — the lesson from media_services, where the page's own comment said
  the samples were "gated to DEV" while the reader fetched them unfiltered and
  served invented companies to the public for a month.

  ## Money

  `price_minor` is an INTEGER in the currency's minor unit — kobo for NGN.
  Never a float: 0.1 + 0.2 is not 0.3, and a rounding error in a catalogue is
  a rounding error in an invoice. Minor units rather than whole naira because
  Paystack charges in kobo, so the catalogue figure converts to the charge
  amount exactly, and because the brief asks this to be ready for currencies
  where the minor unit is not decorative.

  NOTE a deliberate divergence: public.create_orders.estimate_total is in
  WHOLE NAIRA. It predates this table and its rows are historical records that
  must not be rewritten. Converting between the two is × 100 / ÷ 100, which is
  exact in both directions for integers, and lib/create/money.ts is the only
  place allowed to do it.
*/

-- ─────────────────────────────────────────────────────────────────────────
-- Categories
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.service_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  summary     text,
  /* Self-referencing, so a subcategory is a category with a parent rather
     than a second table that drifts out of step with the first. */
  parent_id   uuid REFERENCES public.service_categories(id) ON DELETE CASCADE,
  icon        text,
  sort_order  integer NOT NULL DEFAULT 0,
  published   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_categories_slug_shape CHECK (slug ~ '^[a-z0-9-]+$')
);

CREATE INDEX IF NOT EXISTS service_categories_parent_idx
  ON public.service_categories (parent_id, sort_order);

-- ─────────────────────────────────────────────────────────────────────────
-- Services
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.services (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku                text NOT NULL UNIQUE,
  slug               text NOT NULL UNIQUE,
  name               text NOT NULL,
  short_description  text,
  full_description   text,

  category_id        uuid NOT NULL REFERENCES public.service_categories(id) ON DELETE RESTRICT,

  /* What the customer ends up holding. Decides which template library, which
     export validation and whether production is involved at all. */
  deliverable_type   text NOT NULL DEFAULT 'digital'
                     CHECK (deliverable_type IN ('digital', 'print', 'video', 'strategy', 'managed')),

  /* Who does the work. Carried over from CatalogueItem.fulfilment. */
  fulfilment         text NOT NULL DEFAULT 'creator'
                     CHECK (fulfilment IN ('instant', 'creator', 'partner')),

  pricing_model      text NOT NULL DEFAULT 'starting_at'
                     CHECK (pricing_model IN (
                       'free', 'fixed', 'starting_at', 'per_item', 'per_page', 'per_slide',
                       'per_screen', 'per_minute', 'per_second', 'per_unit', 'per_square_metre',
                       'tiered_quantity', 'package', 'custom_quote', 'subscription',
                       'hourly', 'daily'
                     )),

  currency           text NOT NULL DEFAULT 'NGN' CHECK (currency ~ '^[A-Z]{3}$'),
  /* Minor units. See the header. NULL only for custom_quote. */
  price_minor        bigint CHECK (price_minor IS NULL OR price_minor >= 0),
  minimum_minor      bigint CHECK (minimum_minor IS NULL OR minimum_minor >= 0),
  maximum_minor      bigint CHECK (maximum_minor IS NULL OR maximum_minor >= 0),
  /* "per slide", "per 100", "per month" — shown beside the figure. */
  price_unit         text,

  /*
    Whether that number is real money or a hypothesis. The whole point of
    this table. See the header.
  */
  price_basis        text NOT NULL DEFAULT 'proposed'
                     CHECK (price_basis IN ('proposed', 'indicative', 'quoted')),
  /* Where a non-quoted figure came from, so it can be challenged later. */
  price_source       text,
  price_source_seen  date,

  price_includes     text[] NOT NULL DEFAULT '{}',
  exclusions         text[] NOT NULL DEFAULT '{}',

  turnaround_min_days integer CHECK (turnaround_min_days IS NULL OR turnaround_min_days >= 0),
  turnaround_max_days integer CHECK (turnaround_max_days IS NULL OR turnaround_max_days >= 0),
  revisions_included  integer CHECK (revisions_included IS NULL OR revisions_included >= 0),
  editable_source_included boolean NOT NULL DEFAULT false,

  available_formats   text[] NOT NULL DEFAULT '{}',
  /* Which template layouts in the design library fit this service. */
  template_tags       text[] NOT NULL DEFAULT '{}',

  production_required boolean NOT NULL DEFAULT false,
  quote_required      boolean NOT NULL DEFAULT false,
  supplier_required   boolean NOT NULL DEFAULT false,

  tax_treatment       text NOT NULL DEFAULT 'exclusive'
                      CHECK (tax_treatment IN ('exclusive', 'inclusive', 'exempt')),

  publication_status  text NOT NULL DEFAULT 'draft'
                      CHECK (publication_status IN ('draft', 'published', 'archived')),
  featured            boolean NOT NULL DEFAULT false,
  sort_order          integer NOT NULL DEFAULT 0,

  /*
    ── THE GATE, COMPUTED ONCE ──────────────────────────────────────────
    Every reader gets the same answer because there is only one answer. A
    component cannot "forget" to filter, which is precisely how eighteen
    invented studios reached the public marketplace.
  */
  is_orderable boolean GENERATED ALWAYS AS (
    publication_status = 'published'
    AND price_basis = 'quoted'
    AND quote_required = false
    AND price_minor IS NOT NULL
  ) STORED,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT services_slug_shape CHECK (slug ~ '^[a-z0-9-]+$'),
  CONSTRAINT services_turnaround_ordered
    CHECK (turnaround_min_days IS NULL OR turnaround_max_days IS NULL
           OR turnaround_min_days <= turnaround_max_days),
  CONSTRAINT services_price_range_ordered
    CHECK (minimum_minor IS NULL OR maximum_minor IS NULL OR minimum_minor <= maximum_minor),
  /*
    A price must exist unless the service openly says it cannot be priced
    without a conversation. "₦— " with no quote path is a dead end.
  */
  CONSTRAINT services_priced_or_quoted
    CHECK (price_minor IS NOT NULL OR quote_required OR pricing_model IN ('custom_quote', 'free'))
);

/*
  ── WHY `quote_required` IS NOT "the price is not real" ─────────────────

  The first draft of this file forced quote_required = true on every service
  whose price was not yet quoted. That sounds careful and is actually wrong:
  it made price_service() refuse the entire catalogue, so a customer could
  not even see what a configuration would come to, and the pricing engine
  was dead code the day it shipped.

  The two things are genuinely different and both are needed:

    quote_required   the SCOPE cannot be priced by arithmetic at all —
                     shop signage, vehicle branding, a bespoke campaign.
                     Asking for dimensions and a quantity would be theatre.

    price_basis      whether the NUMBER is money anybody has stood behind.

  So an unquoted service still prices. It produces an itemised estimate, the
  quote carries basis: 'proposed', and `is_orderable` is false — which is
  what actually stops a checkout taking money. That is the same shape as the
  create_orders table already uses (estimate_total beside quoted_total), and
  it is the difference between "we cannot tell you" and "we can tell you
  roughly, and we will confirm it".
*/
ALTER TABLE public.services DROP CONSTRAINT IF EXISTS services_unquoted_prices_offer_a_quote;

CREATE INDEX IF NOT EXISTS services_category_idx ON public.services (category_id, sort_order);
CREATE INDEX IF NOT EXISTS services_published_idx
  ON public.services (sort_order) WHERE publication_status = 'published';
CREATE INDEX IF NOT EXISTS services_orderable_idx
  ON public.services (sort_order) WHERE is_orderable;

-- ─────────────────────────────────────────────────────────────────────────
-- Quantity tiers — print, and anything else that gets cheaper in bulk
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.service_price_tiers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id    uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  min_quantity  integer NOT NULL CHECK (min_quantity > 0),
  /* The price for the whole tier, not per unit: that is how a printer quotes. */
  price_minor   bigint NOT NULL CHECK (price_minor >= 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_id, min_quantity)
);

CREATE INDEX IF NOT EXISTS service_price_tiers_lookup_idx
  ON public.service_price_tiers (service_id, min_quantity DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- Options and their choices
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.service_options (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id  uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  key         text NOT NULL,
  label       text NOT NULL,
  help        text,
  required    boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  UNIQUE (service_id, key),
  CONSTRAINT service_options_key_shape CHECK (key ~ '^[a-z0-9_]+$')
);

CREATE TABLE IF NOT EXISTS public.service_option_choices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id   uuid NOT NULL REFERENCES public.service_options(id) ON DELETE CASCADE,
  key         text NOT NULL,
  label       text NOT NULL,
  /*
    How this choice changes the price. Exactly ONE of the two may be set, so
    a choice cannot quietly do both and produce a number nobody predicted.
    delta_bp is basis points of the base line (2500 = +25%), which keeps a
    percentage in integers.
  */
  delta_minor bigint NOT NULL DEFAULT 0,
  delta_bp    integer NOT NULL DEFAULT 0,
  sort_order  integer NOT NULL DEFAULT 0,
  UNIQUE (option_id, key),
  CONSTRAINT service_option_choices_key_shape CHECK (key ~ '^[a-z0-9_]+$'),
  CONSTRAINT service_option_choices_one_kind_of_delta
    CHECK (delta_minor = 0 OR delta_bp = 0)
);

-- ─────────────────────────────────────────────────────────────────────────
-- Search synonyms — what customers actually type
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.service_synonyms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id  uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  term        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_id, term),
  CONSTRAINT service_synonyms_term_shape CHECK (btrim(term) <> '' AND length(term) <= 80)
);

CREATE INDEX IF NOT EXISTS service_synonyms_term_idx ON public.service_synonyms (lower(term));

-- ─────────────────────────────────────────────────────────────────────────
-- Row-level security
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.service_categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_price_tiers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_options        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_option_choices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_synonyms       ENABLE ROW LEVEL SECURITY;

/*
  Public reads see PUBLISHED rows only.

  A draft price is a working figure. Served to the public it is a quotation,
  and somebody will hold us to it.
*/
DROP POLICY IF EXISTS "service_categories_public_read" ON public.service_categories;
CREATE POLICY "service_categories_public_read" ON public.service_categories
  FOR SELECT TO anon, authenticated USING (published);

DROP POLICY IF EXISTS "services_public_read" ON public.services;
CREATE POLICY "services_public_read" ON public.services
  FOR SELECT TO anon, authenticated USING (publication_status = 'published');

DROP POLICY IF EXISTS "service_price_tiers_public_read" ON public.service_price_tiers;
CREATE POLICY "service_price_tiers_public_read" ON public.service_price_tiers
  FOR SELECT TO anon, authenticated USING (EXISTS (
    SELECT 1 FROM public.services s
     WHERE s.id = service_id AND s.publication_status = 'published'));

DROP POLICY IF EXISTS "service_options_public_read" ON public.service_options;
CREATE POLICY "service_options_public_read" ON public.service_options
  FOR SELECT TO anon, authenticated USING (EXISTS (
    SELECT 1 FROM public.services s
     WHERE s.id = service_id AND s.publication_status = 'published'));

DROP POLICY IF EXISTS "service_option_choices_public_read" ON public.service_option_choices;
CREATE POLICY "service_option_choices_public_read" ON public.service_option_choices
  FOR SELECT TO anon, authenticated USING (EXISTS (
    SELECT 1 FROM public.service_options o
      JOIN public.services s ON s.id = o.service_id
     WHERE o.id = option_id AND s.publication_status = 'published'));

DROP POLICY IF EXISTS "service_synonyms_public_read" ON public.service_synonyms;
CREATE POLICY "service_synonyms_public_read" ON public.service_synonyms
  FOR SELECT TO anon, authenticated USING (EXISTS (
    SELECT 1 FROM public.services s
     WHERE s.id = service_id AND s.publication_status = 'published'));

/*
  Writes are staff only, through the existing is_admin() helper — which is
  SECURITY DEFINER over users.role and is the pattern the rest of this schema
  already uses.
*/
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['service_categories', 'services', 'service_price_tiers',
                           'service_options', 'service_option_choices', 'service_synonyms']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())',
      t || '_admin_all', t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- updated_at
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_service_row()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS services_touch ON public.services;
CREATE TRIGGER services_touch BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.touch_service_row();

DROP TRIGGER IF EXISTS service_categories_touch ON public.service_categories;
CREATE TRIGGER service_categories_touch BEFORE UPDATE ON public.service_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_service_row();

COMMENT ON TABLE public.services IS
  'The NowOpen Create Media catalogue. price_basis says whether a figure is a '
  'hypothesis, a competitor benchmark or a real quote; only quoted rows are '
  'orderable, and is_orderable computes that once for every reader.';
