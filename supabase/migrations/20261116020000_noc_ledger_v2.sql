-- NowOpen Credits (NOC), ledger v2: credit classes, double entry, markets,
-- rate snapshots, programme flags and the compliance gate.
--
-- Extends the ledger built on 2026-10-06 (20261012010000…20261013020000).
-- Nothing there is replaced; credit_transactions stays the one record of a
-- movement and keeps its append-only trigger, its (type, reference)
-- idempotency index and its arithmetic checks.
--
-- ── WHAT CHANGES ─────────────────────────────────────────────────────────
--
-- 1. CLASSES. A wallet now holds separate balances:
--      purchased    bought with real money
--      included     the monthly allowance a plan includes
--      promotional  welcome, launch, goodwill grants
--      reward       earned by an event (a claim, a referral)
--      sandbox      bought with a Paystack TEST payment: spendable by the
--                   tester, never counted as cash, revenue or liability
--
-- 2. DOUBLE ENTRY. Every credit_transactions row now has ledger lines in
--    noc_ledger_lines that sum to ZERO: the wallet side (by class) and a
--    system counter-account (system:sold:purchased, system:redeemed:reward …).
--    Issuance, redemption, expiry and reversals can therefore be balanced
--    against each other instead of inferred.
--
-- 3. THE CACHED BALANCE IS PROVED. credit_wallets.balance stays (it is the row
--    every spend locks) but a DEFERRED constraint trigger checks at commit
--    that it equals the sum of that user's wallet lines, that every
--    transaction balances to zero, and that no class account is negative. A
--    transaction that breaks any of those cannot commit. No client role can
--    write any of these tables; RLS gives SELECT on your own rows only.
--
-- 4. SNAPSHOTS. Every entry records the market rate (minor units per NOC) in
--    force when it was written, and the price of what it bought or sold.
--
-- 5. PROGRAMME RULES IN THE SCHEMA. NOC is closed-loop: not transferable, not
--    withdrawable, no crypto. Those are CHECK constraints, not intentions —
--    turning one on is a schema change, not a settings change.
--
-- 6. LAUNCH GATE. A market's purchase_mode is 'off', 'sandbox' (admins only,
--    Paystack test payments) or 'live'. 'live' is refused by trigger unless it
--    names an unrevoked compliance approval for that market, recorded with the
--    approver's name, role and a document reference. Revoking the approval
--    switches the market off.

-- ════════════════════════════════════════════════════════════════════════
-- CLASSES
-- ════════════════════════════════════════════════════════════════════════

do $$ begin
  if not exists (select 1 from pg_type where typname = 'noc_credit_class') then
    create type public.noc_credit_class as enum
      ('purchased', 'included', 'promotional', 'reward', 'sandbox');
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- MARKETS AND RATES
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.noc_markets (
  code            text primary key check (code ~ '^[A-Z]{2}$'),
  name            text not null,
  currency        text not null check (currency ~ '^[A-Z]{3}$'),
  -- What one NOC is worth at face value, in the market currency's minor
  -- units (kobo for NGN). Used for the NGN-beside-NOC display and for the
  -- snapshot on every entry. Pack prices are set separately and may discount.
  minor_per_noc   bigint not null check (minor_per_noc > 0),
  rate_note       text,
  enabled         boolean not null default false,
  purchase_mode   text not null default 'off' check (purchase_mode in ('off', 'sandbox', 'live')),
  launch_approval_id uuid,
  launched_at     timestamptz,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.users(id) on delete set null
);

comment on table public.noc_markets is
  'One row per market NOC is offered in. purchase_mode live is refused unless launch_approval_id names an unrevoked live_purchases approval for the market.';

create table if not exists public.noc_rate_history (
  id              bigserial primary key,
  market          text not null references public.noc_markets(code),
  minor_per_noc   bigint not null check (minor_per_noc > 0),
  note            text,
  set_by          uuid references public.users(id) on delete set null,
  effective_from  timestamptz not null default now()
);

create table if not exists public.noc_compliance_approvals (
  id              uuid primary key default gen_random_uuid(),
  scope           text not null check (scope in ('live_purchases', 'settlement')),
  market          text references public.noc_markets(code),
  approver_name   text not null check (btrim(approver_name) <> ''),
  approver_role   text not null check (btrim(approver_role) <> ''),
  document_ref    text not null check (btrim(document_ref) <> ''),
  notes           text,
  recorded_by     uuid not null references public.users(id) on delete restrict,
  recorded_at     timestamptz not null default now(),
  revoked_at      timestamptz,
  revoked_by      uuid references public.users(id) on delete set null,
  revoke_reason   text,
  check (scope <> 'live_purchases' or market is not null)
);

comment on table public.noc_compliance_approvals is
  'Recorded legal/compliance approvals. A record, not a toggle: rows are never edited except to revoke them once.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'noc_markets_launch_approval_fk') then
    alter table public.noc_markets
      add constraint noc_markets_launch_approval_fk
      foreign key (launch_approval_id) references public.noc_compliance_approvals(id);
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- PROGRAMME — one row
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.noc_programme (
  id              boolean primary key default true check (id),
  -- Closed loop. These are constants with a column so the rule is visible
  -- to anyone reading the schema, and the CHECK makes them unchangeable.
  transferable    boolean not null default false check (not transferable),
  withdrawable    boolean not null default false check (not withdrawable),
  crypto_enabled  boolean not null default false check (not crypto_enabled),
  rewards_enabled boolean not null default false,
  settlement_enabled boolean not null default false,
  -- Which class a spend draws from first. Free credits before paid ones, so
  -- a customer's money is the last thing used.
  spend_order     public.noc_credit_class[] not null
                  default array['sandbox','reward','promotional','included','purchased']::public.noc_credit_class[],
  -- When true, the admin who approves an adjustment must not be the admin
  -- who requested it. Off by default: with few admins it would block every
  -- correction. Both names are recorded either way.
  adjustment_require_distinct_approver boolean not null default false,
  default_market  text not null default 'NG' references public.noc_markets(code),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.users(id) on delete set null,
  check (cardinality(spend_order) = 5
         and spend_order @> array['purchased','included','promotional','reward','sandbox']::public.noc_credit_class[])
);

comment on table public.noc_programme is
  'NOC programme switches. transferable/withdrawable/crypto_enabled are CHECK-locked false: NOC is closed-loop.';

-- ════════════════════════════════════════════════════════════════════════
-- CONFIG AUDIT — every change to prices, packs, markets and switches
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.noc_config_audit (
  id          bigserial primary key,
  entity      text not null,
  entity_key  text,
  action      text not null,
  before      jsonb,
  after       jsonb,
  actor       uuid,
  at          timestamptz not null default now()
);

create or replace function public.noc_config_audit_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_key text;
begin
  v_key := coalesce(
    (case when tg_op = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end) ->> 'slug',
    (case when tg_op = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end) ->> 'code',
    (case when tg_op = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end) ->> 'plan',
    (case when tg_op = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end) ->> 'id');
  insert into public.noc_config_audit (entity, entity_key, action, before, after, actor)
  values (tg_table_name, v_key, lower(tg_op),
          case when tg_op = 'INSERT' then null else to_jsonb(OLD) end,
          case when tg_op = 'DELETE' then null else to_jsonb(NEW) end,
          auth.uid());
  return null;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- GENERIC "APPEND ONLY" GUARD
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.noc_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only (attempted %).', tg_table_name, tg_op
    using errcode = 'restrict_violation';
end $$;

drop trigger if exists noc_rate_history_append_only on public.noc_rate_history;
create trigger noc_rate_history_append_only before update or delete on public.noc_rate_history
  for each row execute function public.noc_append_only();

drop trigger if exists noc_config_audit_append_only on public.noc_config_audit;
create trigger noc_config_audit_append_only before update or delete on public.noc_config_audit
  for each row execute function public.noc_append_only();

-- Approvals: only the revocation columns may change, and only once.
create or replace function public.noc_approval_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Compliance approvals are never deleted; revoke instead.' using errcode = 'restrict_violation';
  end if;
  if OLD.revoked_at is not null then
    raise exception 'That approval is already revoked.' using errcode = 'restrict_violation';
  end if;
  if (to_jsonb(NEW) - array['revoked_at','revoked_by','revoke_reason'])
     is distinct from (to_jsonb(OLD) - array['revoked_at','revoked_by','revoke_reason']) then
    raise exception 'A recorded approval cannot be edited; revoke it and record a new one.' using errcode = 'restrict_violation';
  end if;
  if NEW.revoked_at is null then
    raise exception 'The only change an approval accepts is its revocation.' using errcode = 'restrict_violation';
  end if;
  return NEW;
end $$;

drop trigger if exists noc_approval_guard on public.noc_compliance_approvals;
create trigger noc_approval_guard before update or delete on public.noc_compliance_approvals
  for each row execute function public.noc_approval_guard();

-- Revoking an approval switches off whatever relied on it.
create or replace function public.noc_approval_revoked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.revoked_at is not null and OLD.revoked_at is null then
    update public.noc_markets
       set purchase_mode = 'off', launch_approval_id = null, updated_at = now()
     where launch_approval_id = NEW.id;
    if NEW.scope = 'settlement' and not exists (
      select 1 from public.noc_compliance_approvals a
       where a.scope = 'settlement' and a.revoked_at is null and a.id <> NEW.id) then
      update public.noc_programme set settlement_enabled = false, updated_at = now() where id;
    end if;
  end if;
  return NEW;
end $$;

drop trigger if exists noc_approval_revoked on public.noc_compliance_approvals;
create trigger noc_approval_revoked after update on public.noc_compliance_approvals
  for each row execute function public.noc_approval_revoked();

-- ════════════════════════════════════════════════════════════════════════
-- LAUNCH GATE — enforced on the table, whoever writes it
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.noc_market_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.purchase_mode = 'live' then
    if NEW.launch_approval_id is null or not exists (
      select 1 from public.noc_compliance_approvals a
       where a.id = NEW.launch_approval_id
         and a.scope = 'live_purchases'
         and a.market = NEW.code
         and a.revoked_at is null) then
      raise exception 'Live NOC purchases in % need a recorded, unrevoked compliance approval for that market.', NEW.code
        using errcode = 'restrict_violation';
    end if;
    if not NEW.enabled then
      raise exception 'Enable market % before taking live payments in it.', NEW.code using errcode = 'restrict_violation';
    end if;
    if tg_op = 'INSERT' or OLD.purchase_mode is distinct from 'live' then
      NEW.launched_at := now();
    end if;
  elsif NEW.purchase_mode = 'off' then
    NEW.launch_approval_id := null;
  end if;

  NEW.updated_at := now();
  return NEW;
end $$;

drop trigger if exists noc_market_guard on public.noc_markets;
create trigger noc_market_guard before insert or update on public.noc_markets
  for each row execute function public.noc_market_guard();

-- Every rate a market has ever had, so an old snapshot can be checked.
create or replace function public.noc_market_rate_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or NEW.minor_per_noc is distinct from OLD.minor_per_noc then
    insert into public.noc_rate_history (market, minor_per_noc, note, set_by)
    values (NEW.code, NEW.minor_per_noc, NEW.rate_note, auth.uid());
  end if;
  return null;
end $$;

drop trigger if exists noc_market_rate_history on public.noc_markets;
create trigger noc_market_rate_history after insert or update on public.noc_markets
  for each row execute function public.noc_market_rate_history();

create or replace function public.noc_programme_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.settlement_enabled and not exists (
    select 1 from public.noc_compliance_approvals a
     where a.scope = 'settlement' and a.revoked_at is null) then
    raise exception 'Media-owner settlement needs a recorded, unrevoked settlement approval.'
      using errcode = 'restrict_violation';
  end if;
  NEW.updated_at := now();
  return NEW;
end $$;

drop trigger if exists noc_programme_guard on public.noc_programme;
create trigger noc_programme_guard before insert or update on public.noc_programme
  for each row execute function public.noc_programme_guard();

-- ════════════════════════════════════════════════════════════════════════
-- SEED — Nigeria first, purchases OFF
-- ════════════════════════════════════════════════════════════════════════

-- ₦50 per NOC is not a new number: it is the price per credit of the base
-- pack an admin already set (pack.starter: ₦5,000 for 100 credits, no bonus).
-- Larger packs discount below it. Change it in Admin → Credits → Markets.
insert into public.noc_markets (code, name, currency, minor_per_noc, rate_note, enabled, purchase_mode)
values ('NG', 'Nigeria', 'NGN', 5000,
        'Face value from pack.starter (₦5,000 / 100 credits), set 2026-11-16. Not yet confirmed by the founder.',
        true, 'off')
on conflict (code) do nothing;

insert into public.noc_programme (id) values (true) on conflict (id) do nothing;

-- ════════════════════════════════════════════════════════════════════════
-- DOUBLE ENTRY
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.noc_accounts (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  kind          text not null check (kind in ('wallet', 'system')),
  user_id       uuid references public.users(id) on delete restrict,
  credit_class  public.noc_credit_class not null,
  created_at    timestamptz not null default now(),
  check ((kind = 'wallet') = (user_id is not null)),
  unique (user_id, credit_class)
);

comment on table public.noc_accounts is
  'Chart of NOC accounts: one wallet account per user per class, and system counter-accounts (system:<sold|issued|redeemed|expired|adjustment|reversed>:<class>).';

create table if not exists public.noc_ledger_lines (
  id              bigserial primary key,
  transaction_id  uuid not null references public.credit_transactions(id) on delete restrict,
  account_id      uuid not null references public.noc_accounts(id) on delete restrict,
  credit_class    public.noc_credit_class not null,
  -- Signed, from the account's point of view: + adds to it, − takes from it.
  amount          integer not null check (amount <> 0),
  created_at      timestamptz not null default now()
);

create index if not exists noc_ledger_lines_account_idx on public.noc_ledger_lines (account_id);
create index if not exists noc_ledger_lines_txn_idx on public.noc_ledger_lines (transaction_id);

drop trigger if exists noc_ledger_lines_append_only on public.noc_ledger_lines;
create trigger noc_ledger_lines_append_only before update or delete on public.noc_ledger_lines
  for each row execute function public.noc_append_only();

drop trigger if exists noc_accounts_append_only on public.noc_accounts;
create trigger noc_accounts_append_only before update or delete on public.noc_accounts
  for each row execute function public.noc_append_only();

-- Snapshots on the movement itself.
alter table public.credit_transactions add column if not exists market text references public.noc_markets(code);
alter table public.credit_transactions add column if not exists rate_snapshot jsonb;
alter table public.credit_transactions add column if not exists price_snapshot jsonb;

comment on column public.credit_transactions.rate_snapshot is
  'The market rate when this entry was written: {market, currency, minor_per_noc, captured_at}.';
comment on column public.credit_transactions.price_snapshot is
  'What was bought or sold and at what price when this entry was written (pack price, action cost).';

-- Where credit_actions sits in the product.
alter table public.credit_actions add column if not exists pillar text
  check (pillar is null or pillar in ('discover', 'create', 'promote'));
update public.credit_actions set pillar = 'create'
 where pillar is null and slug in ('ai.business_description','ai.page_extract','ai.caption_translate','ai.image','ai.video_clip');
update public.credit_actions set pillar = 'discover'
 where pillar is null and slug = 'ai.customer_reply';

alter table public.credit_packages add column if not exists market text references public.noc_markets(code);
update public.credit_packages set market = 'NG' where market is null and currency = 'NGN';

-- ── account helpers ─────────────────────────────────────────────────────

create or replace function public.noc_wallet_account(p_user uuid, p_class public.noc_credit_class)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  select id into v_id from public.noc_accounts where user_id = p_user and credit_class = p_class;
  if v_id is null then
    insert into public.noc_accounts (code, kind, user_id, credit_class)
    values (format('wallet:%s:%s', p_user, p_class), 'wallet', p_user, p_class)
    on conflict (code) do nothing;
    select id into v_id from public.noc_accounts where user_id = p_user and credit_class = p_class;
  end if;
  return v_id;
end $$;

create or replace function public.noc_system_account(p_kind text, p_class public.noc_credit_class)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_code text := format('system:%s:%s', p_kind, p_class); v_id uuid;
begin
  select id into v_id from public.noc_accounts where code = v_code;
  if v_id is null then
    insert into public.noc_accounts (code, kind, credit_class) values (v_code, 'system', p_class)
    on conflict (code) do nothing;
    select id into v_id from public.noc_accounts where code = v_code;
  end if;
  return v_id;
end $$;

-- Which system account is on the other side of an entry of this type.
create or replace function public.noc_counter_kind(p_type public.credit_txn_type)
returns text
language sql
immutable
as $$
  select case p_type
    when 'purchase'           then 'sold'
    when 'subscription_grant' then 'issued'
    when 'promotional_grant'  then 'issued'
    when 'usage'              then 'redeemed'
    when 'refund'             then 'redeemed'
    when 'expiration'         then 'expired'
    when 'admin_adjustment'   then 'adjustment'
    when 'reversal'           then 'reversed'
  end
$$;

create or replace function public.noc_class_balance(p_user uuid, p_class public.noc_credit_class)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(l.amount), 0)::integer
    from public.noc_ledger_lines l
   where l.account_id = (select a.id from public.noc_accounts a
                          where a.user_id = p_user and a.credit_class = p_class)
$$;

-- ════════════════════════════════════════════════════════════════════════
-- THE ONE WRITE PATH, v2
-- ════════════════════════════════════════════════════════════════════════

drop function if exists public.credit_apply(uuid, public.credit_txn_type, integer, text, text, text, uuid, jsonb);

/*
 * Same contract as before — lock the wallet, read under the lock, write the
 * entry and the balance in one transaction, idempotent on (type, reference) —
 * plus the class allocation, the double-entry lines and the snapshots.
 *
 *   p_class   which class a credit goes INTO, or the single class a debit
 *             must come FROM. NULL on a debit = follow programme.spend_order.
 *   p_lines   an explicit allocation [{"class":"reward","amount":-3}, …]
 *             summing to p_amount. Used to mirror an earlier entry exactly
 *             (usage refunds, reversals).
 */
create or replace function public.credit_apply(
  p_user           uuid,
  p_type           public.credit_txn_type,
  p_amount         integer,
  p_source         text default null,
  p_reference      text default null,
  p_description    text default null,
  p_business       uuid default null,
  p_metadata       jsonb default '{}'::jsonb,
  p_class          public.noc_credit_class default null,
  p_price_snapshot jsonb default null,
  p_lines          jsonb default null
)
returns public.credit_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet    public.credit_wallets;
  v_before    integer;
  v_after     integer;
  v_txn       public.credit_transactions;
  v_class     public.noc_credit_class;
  v_alloc     jsonb := '[]'::jsonb;
  v_remaining integer;
  v_bal       integer;
  v_take      integer;
  v_cls       public.noc_credit_class;
  v_amt       integer;
  v_sum       integer := 0;
  v_market    public.noc_markets;
  v_prog      public.noc_programme;
  v_rate      jsonb;
  v_item      jsonb;
  v_counter   text;
begin
  if p_amount = 0 then
    raise exception 'A ledger entry of zero says nothing; refusing to write one.' using errcode = 'check_violation';
  end if;

  select * into v_prog from public.noc_programme where id;

  insert into public.credit_wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  -- FOR UPDATE: the lock that makes concurrent spends on one wallet serialise.
  select * into v_wallet from public.credit_wallets where user_id = p_user for update;

  -- Idempotency FIRST, under the lock: a replay returns the original entry
  -- even if the balance has moved since (a replayed debit must not fail with
  -- "not enough credits" just because the first one already spent them).
  if p_reference is not null then
    select * into v_txn from public.credit_transactions where type = p_type and reference = p_reference;
    if found then return v_txn; end if;
  end if;

  v_before := v_wallet.balance;
  v_after  := v_before + p_amount;
  if v_after < 0 then
    raise exception 'Not enough credits: % available, % needed.', v_before, abs(p_amount) using errcode = 'check_violation';
  end if;

  -- ── allocate across classes ───────────────────────────────────────────
  if p_lines is not null then
    for v_item in select * from jsonb_array_elements(p_lines) loop
      v_amt := (v_item ->> 'amount')::integer;
      if v_amt = 0 or sign(v_amt) <> sign(p_amount) then
        raise exception 'Every allocated line must move the same way as the entry.' using errcode = 'check_violation';
      end if;
      v_sum := v_sum + v_amt;
    end loop;
    if v_sum <> p_amount then
      raise exception 'Allocated lines (%) do not add up to the entry (%).', v_sum, p_amount using errcode = 'check_violation';
    end if;
    v_alloc := p_lines;
  elsif p_amount > 0 then
    v_class := coalesce(p_class, case p_type
      when 'purchase'           then 'purchased'::public.noc_credit_class
      when 'subscription_grant' then 'included'::public.noc_credit_class
      when 'promotional_grant'  then 'promotional'::public.noc_credit_class
    end);
    if v_class is null then
      raise exception 'A % credit must say which class it goes into.', p_type using errcode = 'check_violation';
    end if;
    v_alloc := jsonb_build_array(jsonb_build_object('class', v_class, 'amount', p_amount));
  elsif p_class is not null then
    v_alloc := jsonb_build_array(jsonb_build_object('class', p_class, 'amount', p_amount));
  else
    v_remaining := -p_amount;
    foreach v_cls in array v_prog.spend_order loop
      exit when v_remaining = 0;
      v_bal := public.noc_class_balance(p_user, v_cls);
      v_take := least(v_bal, v_remaining);
      if v_take > 0 then
        v_alloc := v_alloc || jsonb_build_array(jsonb_build_object('class', v_cls, 'amount', -v_take));
        v_remaining := v_remaining - v_take;
      end if;
    end loop;
    if v_remaining > 0 then
      raise exception 'Not enough credits across classes: % short.', v_remaining using errcode = 'check_violation';
    end if;
  end if;

  -- No class may go below zero, whatever the total says.
  for v_item in select * from jsonb_array_elements(v_alloc) loop
    v_amt := (v_item ->> 'amount')::integer;
    if v_amt < 0 then
      v_bal := public.noc_class_balance(p_user, (v_item ->> 'class')::public.noc_credit_class);
      if v_bal + v_amt < 0 then
        raise exception 'Not enough % credits: % available, % needed.', v_item ->> 'class', v_bal, abs(v_amt)
          using errcode = 'check_violation';
      end if;
    end if;
  end loop;

  -- ── rate snapshot ─────────────────────────────────────────────────────
  select * into v_market from public.noc_markets
   where code = coalesce(p_metadata ->> 'market', v_prog.default_market);
  if not found then
    raise exception 'No NOC market configured for this entry.' using errcode = 'no_data_found';
  end if;
  v_rate := jsonb_build_object('market', v_market.code, 'currency', v_market.currency,
                               'minor_per_noc', v_market.minor_per_noc, 'captured_at', now());

  begin
    insert into public.credit_transactions
      (wallet_id, user_id, business_id, type, amount, balance_before, balance_after,
       source, reference, description, metadata, market, rate_snapshot, price_snapshot)
    values
      (v_wallet.id, p_user, p_business, p_type, p_amount, v_before, v_after,
       p_source, p_reference, p_description, coalesce(p_metadata, '{}'::jsonb),
       v_market.code, v_rate, p_price_snapshot)
    returning * into v_txn;
  exception when unique_violation then
    select * into v_txn from public.credit_transactions where type = p_type and reference = p_reference;
    return v_txn;
  end;

  -- ── the two sides ─────────────────────────────────────────────────────
  v_counter := public.noc_counter_kind(p_type);
  for v_item in select * from jsonb_array_elements(v_alloc) loop
    v_cls := (v_item ->> 'class')::public.noc_credit_class;
    v_amt := (v_item ->> 'amount')::integer;
    insert into public.noc_ledger_lines (transaction_id, account_id, credit_class, amount)
    values (v_txn.id, public.noc_wallet_account(p_user, v_cls), v_cls, v_amt),
           (v_txn.id, public.noc_system_account(v_counter, v_cls), v_cls, -v_amt);
  end loop;

  update public.credit_wallets
     set balance = v_after,
         lifetime_purchased   = lifetime_purchased   + case when p_type = 'purchase'           then p_amount else 0 end,
         lifetime_granted     = lifetime_granted     + case when p_type = 'subscription_grant' then p_amount else 0 end,
         lifetime_promotional = lifetime_promotional + case when p_type = 'promotional_grant'  then p_amount else 0 end,
         lifetime_consumed    = lifetime_consumed    + case when p_type = 'usage'              then abs(p_amount) else 0 end,
         lifetime_refunded    = lifetime_refunded    + case when p_type = 'refund'             then p_amount else 0 end,
         lifetime_expired     = lifetime_expired     + case when p_type = 'expiration'         then abs(p_amount) else 0 end
   where id = v_wallet.id;

  return v_txn;
end $$;

revoke all on function public.credit_apply(uuid, public.credit_txn_type, integer, text, text, text, uuid, jsonb,
  public.noc_credit_class, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.noc_wallet_account(uuid, public.noc_credit_class) from public, anon, authenticated;
revoke all on function public.noc_system_account(text, public.noc_credit_class) from public, anon, authenticated;
revoke all on function public.noc_class_balance(uuid, public.noc_credit_class) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- PROOF AT COMMIT
-- ════════════════════════════════════════════════════════════════════════

/*
 * Runs at COMMIT (deferred) for every new entry and every new line:
 *   · the entry's lines sum to zero, and there are at least two;
 *   · its wallet lines sum to the entry's amount;
 *   · no wallet class account it touched is negative;
 *   · the user's cached balance equals the sum of all their wallet lines.
 * Any failure aborts the whole transaction.
 */
create or replace function public.noc_check_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Through jsonb: PL/pgSQL resolves both CASE arms against NEW's row type.
  v_txn_id uuid := (case when tg_table_name = 'credit_transactions'
                         then to_jsonb(NEW) ->> 'id' else to_jsonb(NEW) ->> 'transaction_id' end)::uuid;
  v_txn public.credit_transactions;
  v_n integer;
  v_all bigint;
  v_wallet_sum bigint;
  v_cached integer;
  v_lines_total bigint;
begin
  select * into v_txn from public.credit_transactions where id = v_txn_id;

  select count(*), coalesce(sum(l.amount), 0),
         coalesce(sum(l.amount) filter (where a.kind = 'wallet'), 0)
    into v_n, v_all, v_wallet_sum
    from public.noc_ledger_lines l join public.noc_accounts a on a.id = l.account_id
   where l.transaction_id = v_txn_id;

  if v_n < 2 then
    raise exception 'NOC entry % has % ledger line(s); double entry needs at least two.', v_txn_id, v_n
      using errcode = 'check_violation';
  end if;
  if v_all <> 0 then
    raise exception 'NOC entry % does not balance (lines sum to %).', v_txn_id, v_all using errcode = 'check_violation';
  end if;
  if v_wallet_sum <> v_txn.amount then
    raise exception 'NOC entry %: wallet lines (%) differ from the entry amount (%).', v_txn_id, v_wallet_sum, v_txn.amount
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.noc_accounts a
     where a.kind = 'wallet' and a.user_id = v_txn.user_id
       and (select coalesce(sum(l.amount), 0) from public.noc_ledger_lines l where l.account_id = a.id) < 0) then
    raise exception 'A % class balance would be negative.', v_txn.user_id using errcode = 'check_violation';
  end if;

  select w.balance into v_cached from public.credit_wallets w where w.user_id = v_txn.user_id;
  select coalesce(sum(l.amount), 0) into v_lines_total
    from public.noc_ledger_lines l join public.noc_accounts a on a.id = l.account_id
   where a.kind = 'wallet' and a.user_id = v_txn.user_id;
  if v_cached <> v_lines_total then
    raise exception 'Wallet balance for % (%) differs from its ledger lines (%).', v_txn.user_id, v_cached, v_lines_total
      using errcode = 'check_violation';
  end if;
  return null;
end $$;

-- ── backfill the 18 entries written before double entry ─────────────────
-- Every existing entry is a subscription_grant (measured 2026-11-15): the
-- wallet side is the 'included' class, the other side system:issued:included.
-- The generic branch below handles any other type too, in case that changed.
do $backfill$
declare r record; v_cls public.noc_credit_class;
begin
  for r in
    select t.* from public.credit_transactions t
     where not exists (select 1 from public.noc_ledger_lines l where l.transaction_id = t.id)
     order by t.created_at
  loop
    v_cls := case r.type
      when 'purchase'          then 'purchased'
      when 'promotional_grant' then 'promotional'
      else 'included' end;
    insert into public.noc_ledger_lines (transaction_id, account_id, credit_class, amount, created_at)
    values (r.id, public.noc_wallet_account(r.user_id, v_cls), v_cls, r.amount, r.created_at),
           (r.id, public.noc_system_account(public.noc_counter_kind(r.type), v_cls), v_cls, -r.amount, r.created_at);
  end loop;
end $backfill$;

-- The 18 old entries keep market/rate_snapshot NULL: they were written
-- before any rate existed, and inventing one afterwards would be fiction.

drop trigger if exists noc_check_entry_txn on public.credit_transactions;
create constraint trigger noc_check_entry_txn
  after insert on public.credit_transactions
  deferrable initially deferred
  for each row execute function public.noc_check_entry();

drop trigger if exists noc_check_entry_line on public.noc_ledger_lines;
create constraint trigger noc_check_entry_line
  after insert on public.noc_ledger_lines
  deferrable initially deferred
  for each row execute function public.noc_check_entry();

-- ════════════════════════════════════════════════════════════════════════
-- SPENDING, with price snapshots
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.credit_charge(
  p_action    text,
  p_reference text default null,
  p_business  uuid default null
)
returns public.credit_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_cost integer;
  v_available integer;
  v_pillar text;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = 'insufficient_privilege';
  end if;
  v_cost := public.credit_cost_of(p_action);
  if v_cost = 0 then return null; end if;

  -- Lock before measuring, so two charges cannot both pass the check.
  insert into public.credit_wallets (user_id) values (v_user) on conflict (user_id) do nothing;
  perform 1 from public.credit_wallets where user_id = v_user for update;

  v_available := public.credit_available(v_user);
  if v_available < v_cost then
    raise exception 'Not enough credits: % available, % needed for "%".', v_available, v_cost, p_action
      using errcode = 'check_violation';
  end if;

  select pillar into v_pillar from public.credit_actions where slug = p_action;
  return public.credit_apply(
    v_user, 'usage', -v_cost, p_action, p_reference,
    format('Used %s credit(s) on %s', v_cost, p_action), p_business, '{}'::jsonb,
    null, jsonb_build_object('action', p_action, 'credit_cost', v_cost, 'pillar', v_pillar), null);
end $$;

create or replace function public.credit_reservation_consume(p_reservation uuid)
returns public.credit_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res public.credit_reservations;
  v_txn public.credit_transactions;
  v_pillar text;
begin
  select * into v_res from public.credit_reservations where id = p_reservation for update;
  if not found then
    raise exception 'No such reservation.' using errcode = 'no_data_found';
  end if;
  if v_res.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
     and auth.role() <> 'service_role' then
    raise exception 'Not your reservation.' using errcode = 'insufficient_privilege';
  end if;
  if v_res.status = 'consumed' then
    select * into v_txn from public.credit_transactions where id = v_res.transaction_id;
    return v_txn;
  end if;
  if v_res.status <> 'reserved' then
    raise exception 'That reservation was already %.', v_res.status using errcode = 'restrict_violation';
  end if;

  update public.credit_reservations set status = 'consumed', settled_at = now() where id = p_reservation;

  select pillar into v_pillar from public.credit_actions where slug = v_res.action_slug;
  v_txn := public.credit_apply(
    v_res.user_id, 'usage', -v_res.amount, v_res.action_slug,
    'reservation:' || v_res.id::text,
    format('Used %s credit(s) on %s', v_res.amount, v_res.action_slug),
    v_res.business_id, jsonb_build_object('reservation_id', v_res.id),
    null, jsonb_build_object('action', v_res.action_slug, 'credit_cost', v_res.amount,
                             'pillar', v_pillar, 'reserved_at', v_res.created_at), null);

  update public.credit_reservations set transaction_id = v_txn.id where id = p_reservation;
  return v_txn;
end $$;

-- credit_grant: only the types whose class is implied. Refunds, reversals
-- and adjustments have their own functions, which record why.
create or replace function public.credit_grant(
  p_user        uuid,
  p_amount      integer,
  p_type        public.credit_txn_type,
  p_reference   text,
  p_source      text default null,
  p_description text default null,
  p_metadata    jsonb default '{}'::jsonb
)
returns public.credit_transactions
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Credit grants are server-side only.' using errcode = 'insufficient_privilege';
  end if;
  if p_reference is null or btrim(p_reference) = '' then
    raise exception 'A grant needs a reference, or a retry grants twice.' using errcode = 'check_violation';
  end if;
  if p_type not in ('subscription_grant', 'promotional_grant') or p_amount <= 0 then
    raise exception 'credit_grant writes positive subscription or promotional grants only; purchases, refunds, reversals and adjustments have their own functions.'
      using errcode = 'check_violation';
  end if;
  return public.credit_apply(p_user, p_type, p_amount, p_source, p_reference, p_description, null, p_metadata);
end $$;

-- The one-step admin adjustment is replaced by the request → decide workflow
-- (20261116040000). Kept as a function so an old client gets a clear answer.
create or replace function public.credit_admin_adjust(p_user uuid, p_amount integer, p_reason text)
returns public.credit_transactions
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Direct adjustments are retired. Use Admin → Credits → Adjustments (noc_admin_request_adjustment).'
    using errcode = 'feature_not_supported';
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- READS
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.noc_wallet_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_prog public.noc_programme;
  v_market public.noc_markets;
  v_balance integer := 0;
  v_held integer := 0;
  v_classes jsonb;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_prog from public.noc_programme where id;
  select * into v_market from public.noc_markets where code = v_prog.default_market;

  select coalesce(w.balance, 0) into v_balance from public.credit_wallets w where w.user_id = v_user;
  select coalesce(sum(r.amount), 0) into v_held
    from public.credit_reservations r where r.user_id = v_user and r.status = 'reserved';

  select coalesce(jsonb_object_agg(c::text, public.noc_class_balance(v_user, c)), '{}'::jsonb)
    into v_classes
    from unnest(enum_range(null::public.noc_credit_class)) c;

  return jsonb_build_object(
    'balance', coalesce(v_balance, 0),
    'held', v_held,
    'available', greatest(coalesce(v_balance, 0) - v_held, 0),
    'classes', v_classes,
    'spend_order', to_jsonb(v_prog.spend_order),
    'market', jsonb_build_object('code', v_market.code, 'currency', v_market.currency,
                                 'minor_per_noc', v_market.minor_per_noc,
                                 'purchase_mode', v_market.purchase_mode),
    'can_top_up', v_market.purchase_mode = 'live'
                  or (v_market.purchase_mode = 'sandbox' and public.is_admin()),
    'closed_loop', jsonb_build_object('transferable', v_prog.transferable,
                                      'withdrawable', v_prog.withdrawable,
                                      'crypto', v_prog.crypto_enabled)
  );
end $$;

grant execute on function public.noc_wallet_summary() to authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════════════════

alter table public.noc_markets              enable row level security;
alter table public.noc_rate_history         enable row level security;
alter table public.noc_programme            enable row level security;
alter table public.noc_compliance_approvals enable row level security;
alter table public.noc_config_audit         enable row level security;
alter table public.noc_accounts             enable row level security;
alter table public.noc_ledger_lines         enable row level security;

-- Public reads: markets, rates and the programme rules are what a price
-- list and a checkout show. No write policy: admins change them through the
-- noc_admin_* functions, which audit.
drop policy if exists noc_markets_read on public.noc_markets;
create policy noc_markets_read on public.noc_markets for select to anon, authenticated using (true);
drop policy if exists noc_rate_history_read on public.noc_rate_history;
create policy noc_rate_history_read on public.noc_rate_history for select to anon, authenticated using (true);
drop policy if exists noc_programme_read on public.noc_programme;
create policy noc_programme_read on public.noc_programme for select to anon, authenticated using (true);

drop policy if exists noc_approvals_admin on public.noc_compliance_approvals;
create policy noc_approvals_admin on public.noc_compliance_approvals for select to authenticated using (public.is_admin());
drop policy if exists noc_config_audit_admin on public.noc_config_audit;
create policy noc_config_audit_admin on public.noc_config_audit for select to authenticated using (public.is_admin());

drop policy if exists noc_accounts_own on public.noc_accounts;
create policy noc_accounts_own on public.noc_accounts for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists noc_ledger_lines_own on public.noc_ledger_lines;
create policy noc_ledger_lines_own on public.noc_ledger_lines for select to authenticated
  using (public.is_admin() or exists (
    select 1 from public.noc_accounts a where a.id = account_id and a.user_id = auth.uid()));

grant select on public.noc_markets, public.noc_rate_history, public.noc_programme to anon, authenticated;
grant select on public.noc_compliance_approvals, public.noc_config_audit, public.noc_accounts, public.noc_ledger_lines to authenticated;

-- Config audit on everything an admin can change.
drop trigger if exists noc_audit_credit_packages on public.credit_packages;
create trigger noc_audit_credit_packages after insert or update or delete on public.credit_packages
  for each row execute function public.noc_config_audit_write();
drop trigger if exists noc_audit_credit_actions on public.credit_actions;
create trigger noc_audit_credit_actions after insert or update or delete on public.credit_actions
  for each row execute function public.noc_config_audit_write();
drop trigger if exists noc_audit_allowances on public.credit_plan_allowances;
create trigger noc_audit_allowances after insert or update or delete on public.credit_plan_allowances
  for each row execute function public.noc_config_audit_write();
drop trigger if exists noc_audit_markets on public.noc_markets;
create trigger noc_audit_markets after insert or update or delete on public.noc_markets
  for each row execute function public.noc_config_audit_write();
drop trigger if exists noc_audit_programme on public.noc_programme;
create trigger noc_audit_programme after insert or update or delete on public.noc_programme
  for each row execute function public.noc_config_audit_write();
drop trigger if exists noc_audit_approvals on public.noc_compliance_approvals;
create trigger noc_audit_approvals after insert or update on public.noc_compliance_approvals
  for each row execute function public.noc_config_audit_write();

-- ── Self-check ───────────────────────────────────────────────────────────
do $check$
declare n integer;
begin
  select count(*) into n from public.credit_transactions t
   where not exists (select 1 from public.noc_ledger_lines l where l.transaction_id = t.id);
  assert n = 0, format('%s entries have no ledger lines after backfill', n);

  select count(*) into n from (
    select transaction_id from public.noc_ledger_lines group by transaction_id having sum(amount) <> 0) x;
  assert n = 0, format('%s entries do not balance', n);

  select count(*) into n from public.credit_wallets w
   where w.balance <> (select coalesce(sum(l.amount), 0) from public.noc_ledger_lines l
                         join public.noc_accounts a on a.id = l.account_id
                        where a.kind = 'wallet' and a.user_id = w.user_id);
  assert n = 0, format('%s wallets differ from their ledger lines', n);

  select count(*) into n from public.noc_markets where purchase_mode <> 'off';
  assert n = 0, 'a market was seeded with purchases switched on';
end $check$;
