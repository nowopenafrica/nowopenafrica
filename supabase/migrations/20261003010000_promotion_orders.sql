-- A business buying visibility: the record of the transaction and the licence
-- for a promotion to be shown.
--
-- ── WHY NOT REUSE AN EXISTING TABLE ──────────────────────────────────────
--
-- Checked first. `campaigns` is marketing landing pages (slug, hero copy) and
-- `os_campaigns` is a business's own internal planning (focus, audience,
-- channels). Neither records money changing hands, and overloading either
-- would mean one table answering "what are we promoting on the homepage" and
-- "what did this customer pay for", which are different questions with
-- different access rules.
--
-- ── THE GUARD THIS TABLE EXISTS FOR ──────────────────────────────────────
--
-- A promotion may not go live on a payment the server has not confirmed.
--
-- MEASURED 2026-09-22: of 15 payment_intents, 2 are `paid` and BOTH carry
-- `verified_via = 'client'` — the browser said the payment succeeded and
-- nothing checked. Zero have ever been confirmed by webhook. If activation
-- trusted `status = 'paid'`, a forged client callback would buy homepage
-- placement for free, and the first anyone would know is the homepage.
--
-- So activation is gated in the DATABASE on a webhook-verified payment, by
-- trigger, rather than in whichever code path happens to activate an order.
-- Client-side payment state is not evidence.
--
-- A consequence worth stating plainly: until the Paystack webhook URL is
-- registered, NOTHING can be activated by purchase. That is the correct
-- failure — a platform that cannot verify payment should not be selling.

create table if not exists public.promotion_orders (
  id uuid primary key default gen_random_uuid(),

  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null references public.revenue_products(id) on delete restrict,
  -- Who bought it. Null-able because an admin may place an order on behalf of
  -- a business that has not claimed its profile yet.
  user_id uuid references auth.users(id) on delete set null,

  /*
   * THE PRICE THAT WAS CHARGED, not the price that is current.
   *
   * revenue_products.price_minor will change. An order that read it live would
   * silently restate history every time somebody edited a price, and a receipt
   * that disagrees with the charge is a dispute nobody can settle.
   */
  price_minor bigint not null check (price_minor >= 0),
  currency text not null check (char_length(currency) = 3),

  -- Snapshots too, for the same reason: what this order actually bought.
  scope_category text,
  scope_location text,

  /*
   * The payment this order is waiting on. Matches payment_intents.reference,
   * which is what Paystack echoes back on the webhook.
   */
  payment_reference text,

  status text not null default 'draft'
    check (status in ('draft', 'awaiting_payment', 'active', 'expired', 'cancelled', 'refunded')),

  starts_at timestamptz,
  ends_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- An order past draft must know what it is waiting to be paid for.
  constraint promotion_orders_paid_states_need_reference
    check (status in ('draft', 'cancelled') or payment_reference is not null),

  -- A live promotion must have a window. "Active, forever, starting never" is
  -- how a free placement outlives the campaign that paid for it.
  constraint promotion_orders_active_needs_window
    check (status <> 'active' or (starts_at is not null and ends_at is not null and ends_at > starts_at))
);

comment on table public.promotion_orders is
  'A purchased promotion. Cannot reach status=active without a webhook-verified payment — see promotion_orders_require_verified_payment.';

create index if not exists idx_promotion_orders_business on public.promotion_orders (business_id, status);
create index if not exists idx_promotion_orders_live on public.promotion_orders (status, ends_at) where status = 'active';
create index if not exists idx_promotion_orders_reference on public.promotion_orders (payment_reference);

-- ── The activation guard ─────────────────────────────────────────────────

create or replace function public.promotion_orders_require_verified_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_via text;
begin
  -- Only the transition INTO active is policed. Expiring, cancelling and
  -- refunding an already-live order must stay possible without re-proving a
  -- payment that was verified months ago.
  if NEW.status <> 'active' then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and OLD.status = 'active' then
    return NEW;
  end if;

  if coalesce(btrim(NEW.payment_reference), '') = '' then
    raise exception 'A promotion cannot go live without a payment reference.'
      using errcode = '42501';
  end if;

  select pi.status, pi.verified_via into v_status, v_via
    from public.payment_intents pi
   where pi.reference = NEW.payment_reference;

  if v_status is null then
    raise exception 'No payment found for reference %.', NEW.payment_reference
      using errcode = '42501';
  end if;

  if v_status <> 'paid' then
    raise exception 'Payment % is %, not paid.', NEW.payment_reference, v_status
      using errcode = '42501';
  end if;

  /*
   * THE POINT OF ALL THIS. `client` means the browser reported success and
   * nothing checked — it is a claim, not a confirmation. Only the webhook,
   * whose signature is verified against PAYSTACK_SECRET_KEY, is evidence.
   */
  if coalesce(v_via, '') <> 'webhook' then
    raise exception
      'Payment % was confirmed by "%" — only a webhook-verified payment can activate a promotion.',
      NEW.payment_reference, coalesce(v_via, 'nothing')
      using errcode = '42501';
  end if;

  return NEW;
end $$;

drop trigger if exists promotion_orders_verify_payment on public.promotion_orders;
create trigger promotion_orders_verify_payment
  before insert or update on public.promotion_orders
  for each row execute function public.promotion_orders_require_verified_payment();

create or replace function public.touch_promotion_order()
returns trigger language plpgsql as $$
begin NEW.updated_at := now(); return NEW; end $$;

drop trigger if exists promotion_orders_touch on public.promotion_orders;
create trigger promotion_orders_touch
  before update on public.promotion_orders
  for each row execute function public.touch_promotion_order();

-- ── RLS ──────────────────────────────────────────────────────────────────
--
-- An order is commercial information about one business. The BUYER and admins
-- see it; nobody else, including other businesses. What the public may see is
-- the promotion's EFFECT — a labelled sponsored card — never the order.

alter table public.promotion_orders enable row level security;

drop policy if exists "buyers read their own orders" on public.promotion_orders;
create policy "buyers read their own orders"
  on public.promotion_orders for select
  using (
    user_id = auth.uid()
    or exists (select 1 from public.businesses b where b.id = business_id and b.user_id = auth.uid())
  );

drop policy if exists "admins read every order" on public.promotion_orders;
create policy "admins read every order"
  on public.promotion_orders for select
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

/*
 * Writes are admin-only for now, deliberately.
 *
 * The purchase flow runs server-side (it has to: it creates the payment intent
 * and must not let a browser choose its own price), so no owner-facing INSERT
 * policy is needed yet. Granting one now would be a write path with no caller
 * and no test — the shape of hole this codebase keeps finding.
 */
drop policy if exists "admins write orders" on public.promotion_orders;
create policy "admins write orders"
  on public.promotion_orders for all
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

-- ── Expiry ───────────────────────────────────────────────────────────────
--
-- A promotion that outlives what was paid for is a free placement. Called by
-- the scheduler alongside the other ticks.

create or replace function public.expire_due_promotions()
returns integer
language sql
security definer
set search_path = public
as $$
  with done as (
    update public.promotion_orders
       set status = 'expired'
     where status = 'active'
       and ends_at is not null
       and ends_at <= now()
    returning 1
  )
  select count(*)::integer from done
$$;

revoke all on function public.expire_due_promotions() from public, anon, authenticated;
