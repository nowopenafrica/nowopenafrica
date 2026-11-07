-- The opening credit catalogue.
--
-- ── WHY SIX ACTIONS AND NOT TWENTY-ONE ───────────────────────────────────
--
-- The brief lists twenty-one credit-consuming actions — competitor analysis,
-- growth plan, content calendar, campaign strategy, ad creative, voiceover,
-- and so on. I audited the codebase for each one. Six of them exist as
-- working, reachable code:
--
--   ai.business_description   generate-profile edge fn, wired to
--                             BusinessStoryEditor. The only model-backed owner
--                             action currently shipping.
--   ai.image                  generate-image edge fn via lib/studioModels.ts
--   ai.video_clip             generate-image edge fn via lib/videoGen.ts
--   ai.page_extract           extract-page edge fn, wired to the business form
--   ai.caption_translate      translate-caption edge fn
--   ai.customer_reply         chatbot edge fn
--
-- The other fifteen have no implementation. Seeding them would put switches in
-- the admin screen that turn nothing on, and a price list in front of
-- customers for things the platform cannot do. When one is built, it gets a
-- row — a row here is a claim that the action exists.
--
-- Separately: the Creative Studio's "AI" panels are rule-based and make no
-- model call at all (lib/studioBrand.ts and friends). They cost nothing to
-- run, so they are not in this list. Charging credits for arithmetic the
-- browser already did would be a fee with no cost behind it.
--
-- ── WHY EVERYTHING IS UNPRICED AND DISABLED ──────────────────────────────
--
-- credit_cost is NULL and enabled is false on every row.
--
-- This is the designed starting state, not an oversight. credit_cost_of()
-- REFUSES an unpriced action rather than treating it as free, so nothing can
-- be spent until somebody who owns the commercial decision sets a number — and
-- that number should be set against measured provider cost, which this
-- platform does not yet have (there is no AI cost metering; that is the next
-- piece of work). Picking prices now would mean inventing a margin.
--
-- The one judgement embedded here is `requires_reservation`, which is a
-- technical property rather than a commercial one: true for anything that
-- calls a paid external API and can fail after we have committed to charging.

insert into public.credit_actions
  (slug, name, description, category, credit_cost, enabled, requires_reservation, metadata)
values
  ('ai.business_description',
   'AI business description',
   'Writes your business story, services and about text from what is already on your profile.',
   'content', null, false, false,
   jsonb_build_object('edge_function', 'generate-profile', 'surface', 'BusinessStoryEditor')),

  ('ai.page_extract',
   'Import from your website',
   'Reads a page you own and fills in your profile from it.',
   'content', null, false, false,
   jsonb_build_object('edge_function', 'extract-page', 'surface', 'business form')),

  ('ai.caption_translate',
   'Translate a caption',
   'Translates a caption or post into another language.',
   'content', null, false, false,
   jsonb_build_object('edge_function', 'translate-caption')),

  ('ai.customer_reply',
   'AI customer reply',
   'Drafts a reply to a customer question using your business details.',
   'engagement', null, false, false,
   jsonb_build_object('edge_function', 'chatbot')),

  -- Reserved: an image provider can fail, rate-limit or time out after the
  -- request is in flight, and the customer must not pay for that.
  ('ai.image',
   'AI image',
   'Generates an image for your brand, posts or adverts.',
   'creative', null, false, true,
   jsonb_build_object('edge_function', 'generate-image', 'surface', 'lib/studioModels.ts')),

  -- Reserved, and the most expensive thing here: video generation is the one
  -- action where a silent failure would cost real money.
  ('ai.video_clip',
   'AI video clip',
   'Generates a short video clip for your reels, posts or adverts.',
   'creative', null, false, true,
   jsonb_build_object('edge_function', 'generate-image', 'surface', 'lib/videoGen.ts'))
on conflict (slug) do nothing;

-- ── Credit packs ─────────────────────────────────────────────────────────
--
-- Shapes only. price_minor is NULL on every one, so none is for sale and the
-- purchase UI must say so rather than render a placeholder number — the same
-- rule revenue_products already follows.
--
-- The credits/bonus ratios are the ones in the brief, kept as a starting
-- proposal for whoever sets the prices. They are not a recommendation: a bonus
-- that is generous against an unmeasured provider cost is how a credit system
-- loses money per sale.

insert into public.credit_packages
  (slug, name, description, credits, bonus_credits, price_minor, currency, active, featured, sort_order)
values
  ('pack.starter',  'Starter pack',  'A first top-up to try the AI tools.',      100,    0, null, 'NGN', false, false, 10),
  ('pack.growth',   'Growth pack',   'For businesses posting regularly.',        500,   50, null, 'NGN', false, true,  20),
  ('pack.pro',      'Pro pack',      'For businesses running campaigns.',      1500,  200, null, 'NGN', false, false, 30),
  ('pack.business', 'Business pack', 'For teams creating at volume.',          5000, 1000, null, 'NGN', false, false, 40)
on conflict (slug) do nothing;

-- ── What an operator still has to do ─────────────────────────────────────
--
-- Nothing above is live. To make it live:
--   1. measure provider cost per action (not yet metered — see the audit),
--   2. set credit_cost on the actions worth charging for,
--   3. set price_minor on the packs, against that cost,
--   4. set enabled/active true,
--   5. wire the grants (signup welcome, plan allowance) — Phase 4.
--
-- Until step 5, src/data/pricingPlans.ts should not advertise a monthly credit
-- figure, because nothing grants one.

comment on table public.credit_actions is
  'The catalogue of credit-consuming actions. A row asserts the action EXISTS in code. credit_cost NULL means unpriced, which refuses it rather than allowing it free.';
