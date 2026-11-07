-- NowOpen Credits — wallet, immutable ledger, reservations, configurable costs.
--
-- ── WHY THIS EXISTS, AND WHY IT IS URGENT ────────────────────────────────
--
-- MEASURED 2026-10-06, before writing any of this:
--
--   credit wallet / ledger / actions / packages      none, anywhere
--   src/data/pricingPlans.ts                         sells "50 AI credits /
--                                                    month" on Free Launch,
--                                                    500 on Growth, 2,000 on
--                                                    Business Pro
--
-- The pricing page has been promising a credit allowance that no part of the
-- platform could grant, spend or even count. This migration is the thing that
-- makes that claim true; until the grants in Phase 4 are wired to signup and
-- plan activation, the claim is still ahead of the product, and the pricing
-- copy should say "coming soon" rather than a number.
--
-- ── THE ONE DESIGN RULE ──────────────────────────────────────────────────
--
-- A balance is never written. It is only ever the arithmetic result of a
-- ledger entry, computed inside the same transaction, under a row lock.
--
-- Everything here follows from that:
--
--   · credit_transactions is APPEND-ONLY, enforced by a trigger. A mistake is
--     corrected with a reversing entry, never an edit. An auditable ledger that
--     can be quietly rewritten is not auditable.
--   · No role may write credit_wallets or credit_transactions directly. RLS
--     grants SELECT on your own rows and nothing else; every mutation goes
--     through a SECURITY DEFINER function below.
--   · The spending functions take NO user id. They act on auth.uid(). A
--     parameter a client controls is a parameter a client can point at somebody
--     else's wallet, so it simply does not exist.
--   · Every grant carries a unique `reference`. A webhook delivered three
--     times grants once. This is a UNIQUE INDEX, not a check-then-insert,
--     because check-then-insert is a race.
--
-- ── WHAT THIS MIGRATION DOES NOT DO ──────────────────────────────────────
--
-- It grants nobody any credits and prices nothing. `credit_actions.credit_cost`
-- and `credit_packages.price_minor` are NULLABLE and seeded NULL on purpose,
-- following `revenue_products`: an unpriced thing is NOT free and NOT for sale
-- — it is refused until a person who owns the commercial decision sets a
-- number. The seeds below are the catalogue of what CAN be priced, not an
-- assertion that any of it is.

-- ════════════════════════════════════════════════════════════════════════
-- CATALOGUE — what credits can be spent on, and bought in
-- ════════════════════════════════════════════════════════════════════════

-- What a credit can be spent on. Cost lives here, never in application code,
-- so changing it is a commercial decision rather than a deploy.
create table if not exists public.credit_actions (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
  description     text,
  category        text not null,
  -- NULL means "nobody has priced this", which REFUSES the action. It does
  -- not mean free. See credit_cost_of() below.
  credit_cost     integer check (credit_cost is null or credit_cost >= 0),
  enabled         boolean not null default false,
  -- Lowest plan that may perform it at all; NULL = any plan, including free.
  min_plan        text,
  -- True for operations that call a paid external API and can fail after we
  -- have committed to them — these must reserve before executing.
  requires_reservation boolean not null default false,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.users(id) on delete set null
);

comment on table public.credit_actions is
  'The catalogue of credit-consuming actions. credit_cost NULL means unpriced, which refuses the action rather than allowing it free.';

-- What credits can be bought in. Mirrors revenue_products: price in minor
-- units, NULL price means not for sale.
create table if not exists public.credit_packages (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
  description     text,
  credits         integer not null check (credits > 0),
  bonus_credits   integer not null default 0 check (bonus_credits >= 0),
  -- Minor units (kobo for NGN), bigint — the same convention as
  -- revenue_products.price_minor. NULL = unpriced = not purchasable.
  price_minor     bigint check (price_minor is null or price_minor >= 0),
  currency        text not null default 'NGN',
  active          boolean not null default false,
  featured        boolean not null default false,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.users(id) on delete set null
);

comment on table public.credit_packages is
  'Purchasable credit bundles. price_minor NULL means nobody has priced it, so it is not for sale — never render it as free.';

-- ════════════════════════════════════════════════════════════════════════
-- WALLET
-- ════════════════════════════════════════════════════════════════════════

-- One wallet per USER, not per business.
--
-- Plans are per user (users.plan, subscriptions.user_id) and one person may
-- own several businesses. Giving each business its own wallet would mean a
-- single subscription's allowance could not be spent across the businesses it
-- was bought for. Transactions still carry business_id for attribution, so
-- "what did this business cost me" remains answerable.
create table if not exists public.credit_wallets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null unique references public.users(id) on delete cascade,
  -- Settled balance. Never written except by the functions below.
  balance         integer not null default 0 check (balance >= 0),
  -- Lifetime counters, for the dashboard and for support questions that would
  -- otherwise need a full ledger scan.
  lifetime_purchased   integer not null default 0 check (lifetime_purchased >= 0),
  lifetime_granted     integer not null default 0 check (lifetime_granted >= 0),
  lifetime_promotional integer not null default 0 check (lifetime_promotional >= 0),
  lifetime_consumed    integer not null default 0 check (lifetime_consumed >= 0),
  lifetime_refunded    integer not null default 0 check (lifetime_refunded >= 0),
  lifetime_expired     integer not null default 0 check (lifetime_expired >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.credit_wallets is
  'One credit wallet per user. balance is a derived figure maintained only by the credit_* functions, never written directly.';
comment on column public.credit_wallets.balance is
  'SETTLED balance. Money still held by an open reservation is included here — spendable money is credit_available(), which subtracts reservations.';

-- ════════════════════════════════════════════════════════════════════════
-- LEDGER — append only
-- ════════════════════════════════════════════════════════════════════════

do $$ begin
  if not exists (select 1 from pg_type where typname = 'credit_txn_type') then
    create type public.credit_txn_type as enum (
      'purchase',            -- bought with money, fulfilled from a verified payment
      'subscription_grant',  -- the monthly allowance a plan includes
      'promotional_grant',   -- welcome, referral, launch, partner, goodwill
      'usage',               -- spent on an action (negative)
      'refund',              -- a failed operation returning what it reserved
      'admin_adjustment',    -- a human correction, always with a reason
      'expiration',          -- promotional credits reaching their date (negative)
      'reversal'             -- undoing an earlier entry, e.g. a charged-back payment
    );
  end if;
end $$;

create table if not exists public.credit_transactions (
  id              uuid primary key default gen_random_uuid(),
  wallet_id       uuid not null references public.credit_wallets(id) on delete restrict,
  user_id         uuid not null references public.users(id) on delete restrict,
  -- Attribution only. Which business the spend was for; never affects routing.
  business_id     uuid references public.businesses(id) on delete set null,
  type            public.credit_txn_type not null,
  -- Signed: positive adds, negative spends. The sign must agree with the type,
  -- which the check below enforces.
  amount          integer not null check (amount <> 0),
  balance_before  integer not null check (balance_before >= 0),
  balance_after   integer not null check (balance_after >= 0),
  -- Where it came from: an action slug, a package slug, 'signup', 'plan:growth'.
  source          text,
  /*
   * The idempotency key. A payment reference, a reservation id, a billing
   * period — anything that identifies THIS movement uniquely. The partial
   * unique index below means a webhook delivered three times grants once.
   */
  reference       text,
  description     text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),

  -- The arithmetic must hold on the row itself. If this ever fails, the bug is
  -- caught at write time rather than discovered during a reconciliation.
  constraint credit_txn_arithmetic check (balance_after = balance_before + amount),
  -- Credits-in are positive, credits-out are negative. No exceptions:
  -- admin_adjustment and reversal may be either, and are listed as such.
  constraint credit_txn_sign check (
    case type
      when 'purchase'           then amount > 0
      when 'subscription_grant' then amount > 0
      when 'promotional_grant'  then amount > 0
      when 'refund'             then amount > 0
      when 'usage'              then amount < 0
      when 'expiration'         then amount < 0
      else true  -- admin_adjustment, reversal: signed either way, by design
    end
  )
);

comment on table public.credit_transactions is
  'Append-only credit ledger. Enforced immutable by credit_transactions_immutable: corrections are reversing entries, never edits.';

-- One entry per (type, reference). This is what makes every grant idempotent.
create unique index if not exists credit_transactions_reference_idx
  on public.credit_transactions (type, reference)
  where reference is not null;

create index if not exists credit_transactions_wallet_idx
  on public.credit_transactions (wallet_id, created_at desc);
create index if not exists credit_transactions_user_idx
  on public.credit_transactions (user_id, created_at desc);
create index if not exists credit_transactions_business_idx
  on public.credit_transactions (business_id, created_at desc)
  where business_id is not null;

-- The ledger is append-only, for every role including the table owner.
--
-- Not a convention or a code review rule — the database refuses. An audit
-- trail that privileged code can quietly rewrite provides no assurance to
-- anyone, which is the entire point of keeping one.
create or replace function public.credit_transactions_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'credit_transactions is append-only (attempted %). Correct a mistake with a reversing entry, never by editing history.',
    tg_op
    using errcode = 'restrict_violation';
end $$;

drop trigger if exists credit_transactions_no_update on public.credit_transactions;
create trigger credit_transactions_no_update
  before update or delete on public.credit_transactions
  for each row execute function public.credit_transactions_immutable();

-- ════════════════════════════════════════════════════════════════════════
-- RESERVATIONS — money held while an expensive operation runs
-- ════════════════════════════════════════════════════════════════════════

do $$ begin
  if not exists (select 1 from pg_type where typname = 'credit_reservation_status') then
    create type public.credit_reservation_status as enum (
      'reserved', 'consumed', 'released', 'expired'
    );
  end if;
end $$;

/*
 * Why reserve at all.
 *
 * Image and video generation call a paid external API that can fail, time out,
 * or come back empty AFTER we have decided to charge. Deducting first and
 * refunding on failure leaves a window in which the balance is wrong; charging
 * after success means a user can fire twenty concurrent jobs on four credits.
 *
 * A reservation closes both: the money is held immediately — so it cannot be
 * spent twice — and only becomes a ledger entry when the work actually
 * succeeded. Released reservations never touch the ledger at all, because
 * nothing happened and a ledger full of +5/-5 pairs obscures what did.
 */
create table if not exists public.credit_reservations (
  id              uuid primary key default gen_random_uuid(),
  wallet_id       uuid not null references public.credit_wallets(id) on delete restrict,
  user_id         uuid not null references public.users(id) on delete restrict,
  business_id     uuid references public.businesses(id) on delete set null,
  action_slug     text not null references public.credit_actions(slug) on update cascade,
  amount          integer not null check (amount > 0),
  status          public.credit_reservation_status not null default 'reserved',
  -- Idempotency for the reserve step itself: the same request id reserves once.
  reference       text,
  -- An abandoned reservation must not hold somebody's credits forever. The
  -- sweeper below releases anything past this.
  expires_at      timestamptz not null default now() + interval '30 minutes',
  settled_at      timestamptz,
  -- The ledger entry this became, once consumed. NULL while open or released.
  transaction_id  uuid references public.credit_transactions(id) on delete set null,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create unique index if not exists credit_reservations_reference_idx
  on public.credit_reservations (action_slug, reference)
  where reference is not null;

-- The hot path: summing open reservations for one wallet.
create index if not exists credit_reservations_open_idx
  on public.credit_reservations (wallet_id)
  where status = 'reserved';
create index if not exists credit_reservations_expiry_idx
  on public.credit_reservations (expires_at)
  where status = 'reserved';

comment on table public.credit_reservations is
  'Credits held while an expensive operation runs. Consumed reservations become ledger entries; released ones never do, because nothing happened.';

-- ════════════════════════════════════════════════════════════════════════
-- TOUCH TRIGGERS — matching the revenue_products convention
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.credit_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists credit_actions_touch on public.credit_actions;
create trigger credit_actions_touch before update on public.credit_actions
  for each row execute function public.credit_touch_updated_at();

drop trigger if exists credit_packages_touch on public.credit_packages;
create trigger credit_packages_touch before update on public.credit_packages
  for each row execute function public.credit_touch_updated_at();

drop trigger if exists credit_wallets_touch on public.credit_wallets;
create trigger credit_wallets_touch before update on public.credit_wallets
  for each row execute function public.credit_touch_updated_at();
