-- Activation: set the prices, switch the products on.
--
-- ── WHOSE NUMBERS THESE ARE ──────────────────────────────────────────────
--
-- Every figure below comes from something the business already published or
-- specified. None was chosen here. That matters, because the earlier audit
-- found there is still NO AI cost metering — nobody can yet say what an image
-- or a video actually costs to produce — so a price invented at this point
-- would be an invented margin.
--
--   credit action costs      the monetization brief's credit economy
--   credit pack prices       the same brief ("100 Credits ₦5,000" etc.)
--   plan allowances          src/data/pricingPlans.ts (aiCredits: 50/500/2000)
--   promotion prices         src/data/pricingPlans.ts BOOST tiers, the only
--                            promotion prices this platform has ever published
--
-- ── THE ONE JUDGEMENT CALL, STATED ───────────────────────────────────────
--
-- The published Boost ladder has three DURATIONS (7 / 14 / 30 days at $3.50 /
-- $7 / $13) while revenue_products has seven PLACEMENTS. There is no published
-- price per placement, so these are priced by duration from that ladder:
-- 14-day products take the 14-day price, 30-day products the 30-day price.
--
-- That is a rule, not a guess, and it is deliberately flat: Industry Takeover
-- is plainly worth more than Sponsored Result, but no published figure says
-- how much more, and inventing a premium multiplier is exactly what this
-- migration is written to avoid. Change it with one UPDATE when the business
-- decides — that is what DB-driven pricing is for.
--
-- Converted at the bundled reference rate of ₦1,500/$1 (the same rate
-- pricingPlans.ts documents), rounded to a whole naira, stored in kobo.
--
--   $3.50  ->  ₦5,250   ->    525000 kobo   (7 days — no 7-day product today)
--   $7.00  ->  ₦10,500  ->   1050000 kobo   (14 days)
--   $13.00 ->  ₦19,500  ->   1950000 kobo   (30 days)

-- ════════════════════════════════════════════════════════════════════════
-- CREDIT ACTIONS
-- ════════════════════════════════════════════════════════════════════════
--
-- Six actions, because six have working code behind them. The brief's costs
-- map as follows; where it gave a range, the low end is used, since these are
-- short clips and a price can be raised far more comfortably than lowered.
--
--   ai.business_description  1   "AI BUSINESS DESCRIPTION — 1 credit"
--   ai.caption_translate     1   "AI CAPTION — 1 credit"
--   ai.customer_reply        1   "AI CUSTOMER RESPONSE — 1 credit"
--   ai.page_extract          1   not in the brief; it is one model call that
--                                fills a profile, so it is priced with the
--                                other single-call actions
--   ai.image                 5   "AI IMAGE — 5 credits"
--   ai.video_clip           15   "AI SHORT VIDEO — 15–50 credits"

update public.credit_actions set credit_cost =  1, enabled = true where slug = 'ai.business_description';
update public.credit_actions set credit_cost =  1, enabled = true where slug = 'ai.caption_translate';
update public.credit_actions set credit_cost =  1, enabled = true where slug = 'ai.customer_reply';
update public.credit_actions set credit_cost =  1, enabled = true where slug = 'ai.page_extract';
update public.credit_actions set credit_cost =  5, enabled = true where slug = 'ai.image';
update public.credit_actions set credit_cost = 15, enabled = true where slug = 'ai.video_clip';

-- ════════════════════════════════════════════════════════════════════════
-- CREDIT PACKS
-- ════════════════════════════════════════════════════════════════════════
--
-- Straight from the brief, in kobo:
--
--     100 credits          ₦5,000      no bonus
--     500 credits +50      ₦20,000
--   1,500 credits +200     ₦50,000
--   5,000 credits +1,000   ₦150,000
--
-- Worth noticing, and worth revisiting once provider cost is measured: the
-- effective rate falls from ₦50/credit on the smallest pack to ₦25/credit on
-- the largest. At ₦25/credit a 15-credit video clip earns ₦375. Whether that
-- covers the generation is currently unknown — see the AI metering TODO.

update public.credit_packages set price_minor =   500000, active = true where slug = 'pack.starter';
update public.credit_packages set price_minor =  2000000, active = true where slug = 'pack.growth';
update public.credit_packages set price_minor =  5000000, active = true where slug = 'pack.pro';
update public.credit_packages set price_minor = 15000000, active = true where slug = 'pack.business';

-- ════════════════════════════════════════════════════════════════════════
-- PROMOTION PRODUCTS
-- ════════════════════════════════════════════════════════════════════════
--
-- Priced by duration from the published Boost ladder, as explained above.

update public.revenue_products
   set price_minor = 1050000, active = true, updated_at = now()
 where kind = 'promotion' and duration_days = 14 and price_minor is null;

update public.revenue_products
   set price_minor = 1950000, active = true, updated_at = now()
 where kind = 'promotion' and duration_days = 30 and price_minor is null;

-- ════════════════════════════════════════════════════════════════════════
-- WHAT MUST BE TRUE AFTER THIS RUNS
-- ════════════════════════════════════════════════════════════════════════

do $check$
declare n integer;
begin
  select count(*) into n from public.credit_actions where enabled and credit_cost is null;
  assert n = 0, format('%s actions are enabled with no price — they would run free', n);

  select count(*) into n from public.credit_packages where active and price_minor is null;
  assert n = 0, format('%s packs are on sale with no price', n);

  select count(*) into n from public.revenue_products where active and price_minor is null;
  assert n = 0, format('%s promotion products are active with no price', n);

  -- The credit claim on /pricing is only honest if something grants credits.
  -- This is the dependency that forced the allowance migration to ship first.
  select count(*) into n from public.credit_plan_allowances where enabled and monthly_credits > 0;
  assert n >= 1, 'actions were priced with no plan allowance configured — /pricing would advertise credits nobody receives';

  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'credit_grant_allowance';
  assert n = 1, 'the allowance grant function is missing';

  raise notice 'prices set; every enabled product has a price and credits can actually be granted';
end $check$;
