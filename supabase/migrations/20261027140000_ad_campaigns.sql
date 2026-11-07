/*
  # An advertiser's media plan

  Today a business can book ONE placement at a time, through the existing
  Paystack flow, or send a single enquiry. What it cannot do is assemble the
  thing it actually wants — three billboards, a bus and a screen, in two
  cities, against a budget — and take that to the media owners as one ask.

  ## Why this is not `public.campaigns`

  There is already a `campaigns` table, and it means something else: the
  PLATFORM's own marketing campaigns, with a slug, a hero headline and a
  target number of signups ("Africa is NowOpen", "Restaurant Week"). An
  advertiser's media plan shares a word with it and nothing else. This
  codebase has been bitten twice by two different ideas sharing one noun, so
  these are separate tables with separate names.

  ## Every price here is INDICATIVE, and the schema says so

  MEASURED on production: all 97 rows of `advertisements` are
  `provenance = 'unverified_import'` with zero rights verified. The rates
  come from published Nigerian OOH rate cards, not from a quote a board's
  owner has given NowOpen for anybody's dates.

  So there is no such thing as a confirmed line in this plan today, and
  `price_basis` records that per placement rather than letting a sum in the
  interface imply otherwise. The column exists so that the day a real quote
  arrives, the plan can show it differently — not so that today's numbers
  can be dressed up.

  ## Status stops short of "booked"

  `draft` and `enquiry_sent` are the only states this table can reach. A
  booking is the existing payment flow and lives where it already lives;
  marking a plan "confirmed" here would be a claim nothing has verified.

  Re-runnable.
*/

CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  /** The advertiser, when the plan belongs to a listed business. */
  business_id   uuid REFERENCES public.businesses(id) ON DELETE SET NULL,

  name          text NOT NULL,
  objective     text,
  /** Free text: the plan is a conversation starter, not a form to satisfy. */
  audience      text,
  starts_on     date,
  ends_on       date,
  /** What the advertiser said they have. Never used to filter silently. */
  budget        numeric,
  currency      text NOT NULL DEFAULT 'NGN',

  status        text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'enquiry_sent', 'archived')),
  enquiry_sent_at timestamptz,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ad_campaigns IS
  'An advertiser''s media plan: several placements taken to media owners as one ask. Distinct from public.campaigns, which is the platform''s own marketing.';

CREATE TABLE IF NOT EXISTS public.ad_campaign_placements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  advert_id     uuid NOT NULL REFERENCES public.advertisements(id) ON DELETE CASCADE,

  /** How long this line runs. Null means "to be agreed". */
  days          integer CHECK (days IS NULL OR days > 0),
  starts_on     date,

  /*
    Where the number came from, per line.

    'indicative' is every line today: a published rate card, not a quote.
    'quoted' is reserved for a figure a media owner has actually given, and
    nothing writes it yet — which is the point of recording it separately
    rather than summing everything into one confident total.
  */
  price_basis   text NOT NULL DEFAULT 'indicative'
                CHECK (price_basis IN ('indicative', 'quoted', 'unpriced')),
  /** The per-day rate as it stood when the line was added. */
  rate_per_day  numeric,
  currency      text NOT NULL DEFAULT 'NGN',

  /** The artwork intended for this line, if any has been attached. */
  artwork_url   text,
  note          text,

  created_at    timestamptz NOT NULL DEFAULT now(),

  /* One line per placement per plan. Adding it twice is a mis-click. */
  UNIQUE (campaign_id, advert_id)
);

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_owner
  ON public.ad_campaigns (owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_campaign_placements_campaign
  ON public.ad_campaign_placements (campaign_id);

ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_campaign_placements ENABLE ROW LEVEL SECURITY;

/*
  A plan is private working material: what a business is considering, what
  it can spend, and which competitors' sites it looked at. Nobody but its
  owner and staff sees it, and `campaign_id` cannot be used to read somebody
  else's because the child policy joins back to the parent's owner.
*/
DROP POLICY IF EXISTS "Owners read their plans" ON public.ad_campaigns;
CREATE POLICY "Owners read their plans"
  ON public.ad_campaigns FOR SELECT
  USING (owner_id = auth.uid() OR is_staff());

DROP POLICY IF EXISTS "Owners write their plans" ON public.ad_campaigns;
CREATE POLICY "Owners write their plans"
  ON public.ad_campaigns FOR ALL
  USING (owner_id = auth.uid() OR is_staff())
  WITH CHECK (owner_id = auth.uid() OR is_staff());

DROP POLICY IF EXISTS "Owners read their plan lines" ON public.ad_campaign_placements;
CREATE POLICY "Owners read their plan lines"
  ON public.ad_campaign_placements FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.ad_campaigns c
     WHERE c.id = campaign_id AND (c.owner_id = auth.uid() OR is_staff())
  ));

DROP POLICY IF EXISTS "Owners write their plan lines" ON public.ad_campaign_placements;
CREATE POLICY "Owners write their plan lines"
  ON public.ad_campaign_placements FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.ad_campaigns c
     WHERE c.id = campaign_id AND (c.owner_id = auth.uid() OR is_staff())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ad_campaigns c
     WHERE c.id = campaign_id AND (c.owner_id = auth.uid() OR is_staff())
  ));
