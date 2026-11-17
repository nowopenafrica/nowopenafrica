-- NOC purchases: priced by the database, credited once, after verification.
--
-- ── THE PATH ─────────────────────────────────────────────────────────────
--
--   1. noc_start_purchase(pack)     signed-in caller. Checks the market's
--      purchase_mode, prices the order FROM THE PACK ROW, snapshots price and
--      rate, creates the payment_intent itself and returns the reference and
--      amount for Paystack. The browser never names an amount.
--   2. Paystack charges the customer.
--   3. verify-payment or paystack-webhook asks Paystack (secret key / signed
--      event) and calls noc_fulfil_purchase(reference, paid_minor, currency,
--      domain, via). That function, in ONE transaction, locks the order,
--      compares the paid amount and currency with the snapshot, marks the
--      intent paid and writes the purchase entry. A replay finds the order
--      already fulfilled and returns the same answer.
--
-- ── TEST MONEY ───────────────────────────────────────────────────────────
--
-- Paystack reports `domain: "test"` for test-key charges. Those credits go
-- into the 'sandbox' class: spendable by the tester, excluded from cash,
-- revenue and liability. A test charge against a LIVE order is refused.
--
-- The old credit_fulfil_purchase(reference) is retired: it granted what the
-- pack said without comparing it with what was paid (measured 2026-11-15).

create table if not exists public.noc_purchase_orders (
  id              uuid primary key default gen_random_uuid(),
  reference       text not null unique,
  user_id         uuid not null references public.users(id) on delete restrict,
  market          text not null references public.noc_markets(code),
  pack_slug       text not null,
  credits         integer not null check (credits > 0),
  bonus_credits   integer not null default 0 check (bonus_credits >= 0),
  price_minor     bigint not null check (price_minor > 0),
  currency        text not null,
  minor_per_noc   bigint not null check (minor_per_noc > 0),
  mode            text not null check (mode in ('sandbox', 'live')),
  status          text not null default 'initiated'
                  check (status in ('initiated', 'fulfilled', 'mismatch', 'refunded', 'cancelled')),
  paid_minor      bigint,
  paid_currency   text,
  provider_domain text check (provider_domain is null or provider_domain in ('test', 'live')),
  verified_via    text check (verified_via is null or verified_via in ('client', 'webhook', 'reconcile')),
  credit_class    public.noc_credit_class,
  transaction_id  uuid references public.credit_transactions(id),
  refund_transaction_id uuid references public.credit_transactions(id),
  refund_reason   text,
  note            text,
  created_at      timestamptz not null default now(),
  paid_at         timestamptz,
  fulfilled_at    timestamptz,
  refunded_at     timestamptz
);

create index if not exists noc_purchase_orders_user_idx on public.noc_purchase_orders (user_id, created_at desc);
create index if not exists noc_purchase_orders_status_idx on public.noc_purchase_orders (status, created_at desc);

alter table public.noc_purchase_orders enable row level security;
drop policy if exists noc_purchase_orders_own on public.noc_purchase_orders;
create policy noc_purchase_orders_own on public.noc_purchase_orders for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
grant select on public.noc_purchase_orders to authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- 1. START
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.noc_start_purchase(p_pack text, p_market text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_prog   public.noc_programme;
  v_market public.noc_markets;
  v_pack   public.credit_packages;
  v_email  text;
  v_ref    text;
  v_mode   text;
  v_recent integer;
begin
  if v_user is null then
    raise exception 'Sign in to buy credits.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_prog from public.noc_programme where id;
  select * into v_market from public.noc_markets where code = coalesce(p_market, v_prog.default_market);
  if not found or not v_market.enabled then
    raise exception 'NOC is not offered in that market.' using errcode = 'restrict_violation';
  end if;
  v_mode := v_market.purchase_mode;
  if v_mode = 'off' then
    raise exception 'Credit top-ups are not open yet.' using errcode = 'restrict_violation';
  end if;
  if v_mode = 'sandbox' and not public.is_admin() then
    raise exception 'Credit top-ups are being tested and are not open yet.' using errcode = 'restrict_violation';
  end if;

  select * into v_pack from public.credit_packages where slug = p_pack;
  if not found or not v_pack.active or v_pack.price_minor is null then
    raise exception 'That pack is not for sale.' using errcode = 'restrict_violation';
  end if;
  if v_pack.currency <> v_market.currency or coalesce(v_pack.market, v_market.code) <> v_market.code then
    raise exception 'That pack is not sold in %.', v_market.name using errcode = 'restrict_violation';
  end if;

  -- A browser stuck in a retry loop should not open fifty orders.
  select count(*) into v_recent from public.noc_purchase_orders
   where user_id = v_user and status = 'initiated' and created_at > now() - interval '10 minutes';
  if v_recent >= 5 then
    raise exception 'Too many unfinished top-ups. Wait a few minutes and try again.' using errcode = 'check_violation';
  end if;

  select u.email into v_email from auth.users u where u.id = v_user;
  if v_email is null then
    raise exception 'Your account has no email address for the receipt.' using errcode = 'check_violation';
  end if;

  v_ref := 'noc-' || replace(gen_random_uuid()::text, '-', '');

  insert into public.payment_intents
    (kind, item_id, item_title, amount_usd, currency, amount_local, method, email, status, provider, reference, user_id)
  values
    ('credits', v_pack.slug,
     format('%s — %s NOC', v_pack.name, v_pack.credits + v_pack.bonus_credits),
     null, v_market.currency, v_pack.price_minor / 100.0, 'card', lower(v_email),
     'initiated', 'paystack', v_ref, v_user);

  insert into public.noc_purchase_orders
    (reference, user_id, market, pack_slug, credits, bonus_credits, price_minor, currency, minor_per_noc, mode)
  values
    (v_ref, v_user, v_market.code, v_pack.slug, v_pack.credits, v_pack.bonus_credits,
     v_pack.price_minor, v_market.currency, v_market.minor_per_noc, v_mode);

  return jsonb_build_object(
    'reference', v_ref,
    'amount_minor', v_pack.price_minor,
    'currency', v_market.currency,
    'email', lower(v_email),
    'mode', v_mode,
    'credits', v_pack.credits + v_pack.bonus_credits);
end $$;

revoke all on function public.noc_start_purchase(text, text) from public, anon;
grant execute on function public.noc_start_purchase(text, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- 2. FULFIL — service_role, after Paystack said so
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.noc_fulfil_purchase(
  p_reference    text,
  p_paid_minor   bigint,
  p_paid_currency text,
  p_domain       text,
  p_via          text default 'client'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.noc_purchase_orders;
  v_class public.noc_credit_class;
  v_total integer;
  v_txn   public.credit_transactions;
  v_reason text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Credit purchases are fulfilled server-side only.' using errcode = 'insufficient_privilege';
  end if;

  -- The order lock serialises verify-payment and the webhook arriving together.
  select * into v_order from public.noc_purchase_orders where reference = p_reference for update;
  if not found then
    return jsonb_build_object('fulfilled', false, 'reason', 'not_a_noc_order');
  end if;

  if v_order.status = 'fulfilled' then
    return jsonb_build_object('fulfilled', true, 'replay', true,
                              'credits', v_order.credits + v_order.bonus_credits,
                              'transaction_id', v_order.transaction_id);
  end if;
  if v_order.status in ('refunded', 'cancelled') then
    return jsonb_build_object('fulfilled', false, 'reason', v_order.status);
  end if;

  -- Compare with the SNAPSHOT, never with anything the browser wrote.
  if p_paid_minor is null or p_paid_minor <> v_order.price_minor then
    v_reason := format('amount: paid %s, order %s', p_paid_minor, v_order.price_minor);
  elsif upper(coalesce(p_paid_currency, '')) <> upper(v_order.currency) then
    v_reason := format('currency: paid %s, order %s', p_paid_currency, v_order.currency);
  elsif p_domain not in ('test', 'live') then
    v_reason := format('unknown payment domain %s', coalesce(p_domain, 'null'));
  elsif p_domain = 'test' and v_order.mode = 'live' then
    v_reason := 'a test payment cannot fund a live order';
  end if;

  if v_reason is not null then
    update public.noc_purchase_orders
       set status = 'mismatch', paid_minor = p_paid_minor, paid_currency = p_paid_currency,
           provider_domain = case when p_domain in ('test','live') then p_domain end,
           verified_via = p_via, note = v_reason
     where id = v_order.id;
    return jsonb_build_object('fulfilled', false, 'reason', 'mismatch', 'detail', v_reason);
  end if;

  -- Real money is 'purchased' even on a sandbox order; test money never is.
  v_class := case when p_domain = 'live' then 'purchased' else 'sandbox' end;
  v_total := v_order.credits + v_order.bonus_credits;

  update public.payment_intents
     set status = 'paid', verified_via = case when p_via = 'webhook' then 'webhook' else 'client' end,
         updated_at = now()
   where reference = p_reference and status <> 'paid';

  v_txn := public.credit_apply(
    v_order.user_id, 'purchase', v_total,
    'pack:' || v_order.pack_slug,
    'payment:' || p_reference,
    format('%s NOC (%s + %s bonus) — %s', v_total, v_order.credits, v_order.bonus_credits, v_order.pack_slug),
    null,
    jsonb_build_object('market', v_order.market, 'order_id', v_order.id, 'payment_reference', p_reference,
                       'provider_domain', p_domain, 'verified_via', p_via),
    v_class,
    jsonb_build_object('pack', v_order.pack_slug, 'price_minor', v_order.price_minor,
                       'currency', v_order.currency, 'credits', v_order.credits,
                       'bonus_credits', v_order.bonus_credits,
                       'face_minor_per_noc', v_order.minor_per_noc,
                       'effective_minor_per_noc', round(v_order.price_minor::numeric / v_total, 4)),
    null);

  update public.noc_purchase_orders
     set status = 'fulfilled', paid_minor = p_paid_minor, paid_currency = upper(p_paid_currency),
         provider_domain = p_domain, verified_via = p_via, credit_class = v_class,
         transaction_id = v_txn.id, paid_at = coalesce(paid_at, now()), fulfilled_at = now()
   where id = v_order.id;

  return jsonb_build_object('fulfilled', true, 'replay', false, 'credits', v_total,
                            'credit_class', v_class, 'transaction_id', v_txn.id);
end $$;

revoke all on function public.noc_fulfil_purchase(text, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.noc_fulfil_purchase(text, bigint, text, text, text) to service_role;

-- Retired: it granted the pack without comparing it with what was paid.
create or replace function public.credit_fulfil_purchase(p_reference text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'credit_fulfil_purchase is retired; payments are fulfilled by noc_fulfil_purchase with the verified amount.'
    using errcode = 'feature_not_supported';
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 3. QUOTE — the numbers a checkout shows
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.noc_quote(p_action text, p_market text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_prog   public.noc_programme;
  v_market public.noc_markets;
  v_action public.credit_actions;
  v_avail  integer := 0;
  v_short  integer;
  v_packs  jsonb;
  v_suggest jsonb;
begin
  select * into v_prog from public.noc_programme where id;
  select * into v_market from public.noc_markets where code = coalesce(p_market, v_prog.default_market);
  select * into v_action from public.credit_actions where slug = p_action;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_action');
  end if;
  if not v_action.enabled or v_action.credit_cost is null then
    return jsonb_build_object('ok', false, 'reason', 'not_available', 'action', p_action, 'name', v_action.name);
  end if;

  if v_user is not null then
    v_avail := public.credit_available(v_user);
  end if;
  v_short := greatest(v_action.credit_cost - v_avail, 0);

  select coalesce(jsonb_agg(jsonb_build_object(
           'slug', p.slug, 'name', p.name, 'credits', p.credits + p.bonus_credits,
           'price_minor', p.price_minor, 'currency', p.currency) order by p.sort_order), '[]'::jsonb)
    into v_packs
    from public.credit_packages p
   where p.active and p.price_minor is not null and p.currency = v_market.currency
     and coalesce(p.market, v_market.code) = v_market.code;

  -- Smallest pack that covers the shortfall; else the largest.
  select x into v_suggest from jsonb_array_elements(v_packs) x
   where v_short > 0 and (x ->> 'credits')::int >= v_short
   order by (x ->> 'credits')::int limit 1;
  if v_suggest is null and v_short > 0 then
    select x into v_suggest from jsonb_array_elements(v_packs) x order by (x ->> 'credits')::int desc limit 1;
  end if;

  return jsonb_build_object(
    'ok', true,
    'action', v_action.slug, 'name', v_action.name, 'pillar', v_action.pillar,
    'noc', v_action.credit_cost,
    'currency', v_market.currency,
    'minor_per_noc', v_market.minor_per_noc,
    'value_minor', v_action.credit_cost * v_market.minor_per_noc,
    'signed_in', v_user is not null,
    'available', v_avail,
    'shortfall', v_short,
    'packs', v_packs,
    'suggested_pack', v_suggest,
    'purchase_mode', v_market.purchase_mode,
    'can_top_up', v_user is not null and (v_market.purchase_mode = 'live'
                  or (v_market.purchase_mode = 'sandbox' and public.is_admin())));
end $$;

grant execute on function public.noc_quote(text, text) to anon, authenticated;

-- ── Self-check ───────────────────────────────────────────────────────────
do $check$
begin
  assert (select count(*) from public.noc_purchase_orders) = 0, 'orders table should start empty';
  assert not has_function_privilege('authenticated', 'public.noc_fulfil_purchase(text,bigint,text,text,text)', 'execute'),
    'fulfilment must not be callable by signed-in users';
  assert not has_function_privilege('anon', 'public.noc_start_purchase(text,text)', 'execute'),
    'anonymous visitors must not open orders';
end $check$;
