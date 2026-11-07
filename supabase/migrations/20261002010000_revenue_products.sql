-- The catalogue of what NowOpen sells, priced by an operator and nobody else.
--
-- ── WHY A TABLE AND NOT A CONSTANT ───────────────────────────────────────
--
-- Every price on this platform currently lives in src/data/pricingPlans.ts and
-- ships in the JavaScript bundle. Changing one means an engineer, a build and a
-- deploy — so prices do not change, discounts cannot be trialled, and the
-- people who own the commercial decision cannot make it.
--
-- The promoted-business products below (Featured Business, Sponsored Result,
-- Category Spotlight, City Spotlight, Homepage Feature, Featured Offer,
-- Industry Takeover) do not exist anywhere yet. They are being created here
-- rather than in a constant so that the commercial decision belongs to whoever
-- owns it from the first day, instead of being migrated out of code later.
--
-- The existing plan constants are deliberately NOT moved in this migration.
-- They work, they are covered by tests, and a pricing migration and a new
-- product catalogue are two changes; doing both at once means neither can be
-- reverted on its own.
--
-- ── NOTHING IS FOR SALE UNTIL SOMEBODY PRICES IT ─────────────────────────
--
-- Every row is seeded INACTIVE with a NULL price. This migration defines what
-- these products ARE; it does not decide what they cost, because inventing a
-- price is inventing a commercial term. A CHECK enforces it: a product cannot
-- be active without a real price, so there is no path where the platform
-- advertises something at a number nobody chose.
--
-- ── MONEY IS STORED IN MINOR UNITS ───────────────────────────────────────
--
-- `price_minor` is kobo/cents as a bigint, never a float. ₦2,500.00 is
-- 250000. Floating-point money is how a total comes to ₦2,499.9999999997, and
-- it is unfixable once it is in the ledger.

create table if not exists public.revenue_products (
  id uuid primary key default gen_random_uuid(),

  -- Stable identifier the application refers to. Renaming the display name
  -- must never change what the code buys.
  slug text not null unique,
  name text not null,
  description text,

  /*
   * What KIND of thing this is, because the purchase flows differ:
   *   promotion   — time-boxed visibility on an existing listing
   *   placement   — an advertising slot from the inventory
   *   subscription— recurring plan
   *   service     — one-off marketplace work
   */
  kind text not null check (kind in ('promotion', 'placement', 'subscription', 'service')),

  -- Minor units. NULL means "not priced yet", which is different from free.
  price_minor bigint check (price_minor is null or price_minor >= 0),
  currency text not null default 'NGN' check (char_length(currency) = 3),

  -- How long a purchase lasts. NULL for things that do not expire.
  duration_days integer check (duration_days is null or duration_days > 0),

  /*
   * Where it can be sold. NULL means "anywhere" — a scope of NULL is not the
   * same as an empty list, which would mean "nowhere" and silently hide it.
   */
  scope_category text,
  scope_location text,

  /*
   * How many can run at once. Enforced by the campaign layer, declared here so
   * the limit is a commercial setting rather than a number in a component.
   * NULL means no ceiling.
   */
  max_concurrent integer check (max_concurrent is null or max_concurrent > 0),

  active boolean not null default false,
  sort_order integer not null default 100,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Who last changed a price. A commercial figure with no author is not
  -- auditable, and this table decides what people are charged.
  updated_by uuid references auth.users(id) on delete set null,

  /*
   * THE GUARD THAT MATTERS. A product may not be on sale without a price a
   * person set. Without this, `active` defaulting true on some future insert
   * would put a ₦0 or priceless product in front of customers.
   */
  constraint revenue_products_active_needs_price
    check (not active or (price_minor is not null and price_minor > 0))
);

comment on table public.revenue_products is
  'What NowOpen sells. Prices are set by operators; a product cannot be active without one.';
comment on column public.revenue_products.price_minor is
  'Minor units (kobo/cents) as an integer. Never a float — see the migration header.';

create index if not exists idx_revenue_products_active
  on public.revenue_products (kind, sort_order) where active;

-- ── Keep updated_at honest ───────────────────────────────────────────────
create or replace function public.touch_revenue_product()
returns trigger language plpgsql as $$
begin
  NEW.updated_at := now();
  return NEW;
end $$;

drop trigger if exists revenue_products_touch on public.revenue_products;
create trigger revenue_products_touch
  before update on public.revenue_products
  for each row execute function public.touch_revenue_product();

-- ── RLS ──────────────────────────────────────────────────────────────────
--
-- Anyone may read what is ON SALE — /advertise has to show prices to logged-out
-- visitors. Nobody but an admin may read a draft product or write anything:
-- an unpriced, unlaunched product is a commercial plan, not public information.

alter table public.revenue_products enable row level security;

drop policy if exists "active products are public" on public.revenue_products;
create policy "active products are public"
  on public.revenue_products for select
  using (active);

drop policy if exists "admins read every product" on public.revenue_products;
create policy "admins read every product"
  on public.revenue_products for select
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

drop policy if exists "admins write products" on public.revenue_products;
create policy "admins write products"
  on public.revenue_products for all
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

-- ── The seven promotion products from the brief ──────────────────────────
--
-- Definitions only. price_minor stays NULL and active stays false until an
-- operator decides what each is worth. `on conflict do nothing` so re-running
-- this never overwrites a price somebody has since set.

insert into public.revenue_products (slug, name, description, kind, duration_days, sort_order)
values
  ('featured-business', 'Featured Business',
   'Appear prominently in relevant discovery for a fixed period.', 'promotion', 30, 10),
  ('sponsored-result', 'Sponsored Result',
   'Appear in a clearly labelled sponsored position in search and category results.', 'promotion', 30, 20),
  ('category-spotlight', 'Category Spotlight',
   'Promotion within a single industry category.', 'promotion', 30, 30),
  ('city-spotlight', 'City Spotlight',
   'Promotion within a single city or location.', 'promotion', 30, 40),
  ('homepage-feature', 'Homepage Feature',
   'A placement on the NowOpen homepage.', 'promotion', 14, 50),
  ('featured-offer', 'Featured Offer',
   'Promote an active offer a business is already running.', 'promotion', 14, 60),
  ('industry-takeover', 'Industry Takeover',
   'A premium campaign across an entire category.', 'promotion', 30, 70)
on conflict (slug) do nothing;
