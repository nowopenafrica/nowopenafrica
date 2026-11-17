-- Create template tiers: Free Library, Premium Studio, Signature.
--
-- Founder approved the tier recommendation on 2026-11-18 ("approve the NOC
-- tier recommendation and apply the prices"). Review sheet:
-- https://claude.ai/artifact/QCYtk6G8kf2PKN7vLJ9aGV (section "tiers", Q11).
--
-- WHAT THIS DOES
--   One credit_actions row per engine Create item (25, the list in
--   src/lib/create/engineItems.ts), slug create.template.<item>, category
--   'template', pillar 'create'. Price in NOC at the live NG face value of
--   N50. Tier, the review bar to enter it and the done-for-you anchor live
--   in metadata.
--
-- WHAT THIS DOES NOT DO
--   Every row is enabled = false, and a CHECK keeps template rows off until
--   the entitlement phase (P3) exists, which drops the CHECK. Disabled rows
--   are refused by credit_cost_of() and noc_quote(), and are filtered out of
--   /wallet, /pricing and the header chip (isActionLive). Nothing becomes
--   purchasable and no customer-facing screen changes. Credit purchases stay
--   off (noc_markets.purchase_mode).
--
-- PRICE RULE (approved)
--   Premium   ~20% of the done-for-you service price, 5-NOC rounding, 25..100.
--   Signature ~40% of done-for-you or 2x Premium, cap 250.
--   Free      everyday social formats, 0 NOC for good.
-- BARS (approved)
--   free      existing publish gate: review score >= 85, no criticals.
--   premium   >= 90, no criticals, every format clean, a real visual idea.
--   signature >= 95, no criticals, named human reviewer, full kit, source.
-- The done-for-you anchors are services.price_minor values that are still
-- proposed (0 of 132 orderable); they are recorded for reference only.

alter table public.credit_actions
  drop constraint if exists credit_actions_template_off;
alter table public.credit_actions
  add constraint credit_actions_template_off
  check (category <> 'template' or not enabled);

comment on constraint credit_actions_template_off on public.credit_actions is
  'Create template prices are configuration only until entitlements (P3) exist. Drop this constraint in that migration, not by hand.';

with t(item, label, tier, noc, anchor_sku) as (values
  ('instagram-post',     'Instagram post',            'free',      0,   'ds-social-graphic'),
  ('story',              'Story',                     'free',      0,   'ds-social-graphic'),
  ('reels-cover',        'Reels cover',               'free',      0,   'ds-social-graphic'),
  ('page-banner',        'Page banner',               'free',      0,   'ds-social-graphic'),
  ('youtube-thumbnail',  'YouTube thumbnail',         'free',      0,   'ds-thumbnail'),
  ('sale-post',          'Sale post',                 'free',      0,   'ds-social-graphic'),
  ('offer-flyer',        'Offer flyer',               'free',      0,   'ds-flyer'),
  ('flyer',              'Flyer',                     'free',      0,   'ds-flyer'),
  ('notice',             'Notice',                    'free',      0,   null),
  ('speaker-card',       'Speaker card',              'free',      0,   'ds-social-graphic'),
  ('business-card',      'Business card',             'premium',   30,  'ds-business-card'),
  ('display-ad',         'Display ad',                'premium',   30,  'ds-digital-ad'),
  ('invitation',         'Invitation',                'premium',   30,  'ds-invitation'),
  ('event-poster',       'Event poster',              'premium',   30,  'ds-event-flyer'),
  ('ticket',             'Ticket',                    'premium',   25,  null),
  ('poster',             'Poster',                    'premium',   35,  'ds-poster'),
  ('price-list',         'Price list',                'premium',   40,  'ds-price-list'),
  ('rate-card',          'Rate card',                 'premium',   40,  'ds-price-list'),
  ('menu',               'Menu',                      'premium',   50,  'ds-menu'),
  ('banner',             'Banner',                    'premium',   50,  'pk-backdrop-artwork'),
  ('roll-up',            'Roll-up banner',            'signature', 100, 'pk-rollup-artwork'),
  ('shopfront-sign',     'Shopfront sign',            'signature', 160, 'pk-signage-artwork'),
  ('billboard',          'Billboard',                 'signature', 160, 'pk-signage-artwork'),
  ('billboard-48-sheet', 'Billboard (48-sheet)',      'signature', 160, 'pk-signage-artwork'),
  ('brand-launch',       'Brand launch kit',          'signature', 200, 'br-social-kit')
)
insert into public.credit_actions
  (slug, name, description, category, pillar, credit_cost, enabled, requires_reservation, metadata)
select
  'create.template.' || t.item,
  t.label || ' design (' || initcap(t.tier) || ')',
  case t.tier
    when 'free'      then 'Free Library design. No credits needed.'
    when 'premium'   then 'Premium Studio design: commercial use for one business, print-ready export.'
    else                  'Signature design: everything in Premium plus the editable source file and the full kit.'
  end,
  'template',
  'create',
  t.noc,
  false,
  false,
  jsonb_build_object(
    'engine_item', t.item,
    'tier', t.tier,
    'min_review_score', case t.tier when 'free' then 85 when 'premium' then 90 else 95 end,
    'no_criticals', true,
    'requires_named_reviewer', t.tier = 'signature',
    'includes_source_file', t.tier = 'signature',
    'anchor_sku', t.anchor_sku,
    'anchor_minor', (select s.price_minor from public.services s where s.sku = t.anchor_sku),
    'price_rule', case t.tier when 'free' then 'free' when 'premium' then '~20% of done-for-you' else '~40% of done-for-you' end,
    'approved', '2026-11-18 founder (Q11)'
  )
from t
on conflict (slug) do update set
  name        = excluded.name,
  description = excluded.description,
  category    = excluded.category,
  pillar      = excluded.pillar,
  credit_cost = excluded.credit_cost,
  enabled     = false,
  metadata    = excluded.metadata;
