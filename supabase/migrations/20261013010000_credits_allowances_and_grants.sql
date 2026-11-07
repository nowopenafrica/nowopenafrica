-- Monthly plan allowances, and the grants that make them real.
--
-- ── WHY THIS HAD TO SHIP WITH THE PRICES ─────────────────────────────────
--
-- The pricing page hides every credit claim until at least one action is
-- priced and enabled (see isCreditProgrammeLive). Pricing the actions on their
-- own would therefore switch "50 AI credits / month" back on — while nothing
-- in the platform granted anybody a single credit. That is the same false
-- claim removed on 2026-10-06, re-enabled by a config change.
--
-- So the allowance, the grant and the prices land together. After this
-- migration the sentence on /pricing is a description of what the database
-- does when somebody signs up.
--
-- ── THE DESIGN: SIGNUP IS MONTH ONE ──────────────────────────────────────
--
-- There is no separate "welcome bonus" concept. The plan says 50 credits a
-- month; signing up grants the first month. The monthly tick grants every
-- month after. One rule, one number on the pricing page, nothing to reconcile
-- between a welcome grant and an allowance.
--
-- Idempotency is the period key: `allowance:<user>:<YYYY-MM>`. Running the
-- tick five times in a month grants once, because the reference is the same
-- and credit_transactions has a unique index on (type, reference). The month
-- is a LAGOS month — every "today" in this codebase is a local day, and a
-- UTC month boundary would grant an hour early for the whole audience.

create table if not exists public.credit_plan_allowances (
  plan            text primary key,
  monthly_credits integer not null check (monthly_credits >= 0),
  -- An allowance can be switched off without losing the configured number.
  enabled         boolean not null default true,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.users(id) on delete set null
);

comment on table public.credit_plan_allowances is
  'Credits each plan grants per month. A plan with no row here grants nothing automatically — which is correct for Enterprise, whose allowance is negotiated.';

-- The figures published on /pricing (src/data/pricingPlans.ts: aiCredits).
-- Enterprise is deliberately absent: its allowance is "custom", and inventing
-- a number here would make the platform grant something nobody agreed.
insert into public.credit_plan_allowances (plan, monthly_credits) values
  ('starter',      50),
  ('growth',      500),
  ('business-pro', 2000)
on conflict (plan) do nothing;

-- ════════════════════════════════════════════════════════════════════════
-- THE GRANT
-- ════════════════════════════════════════════════════════════════════════

/**
 * Grant one user their allowance for one month. Idempotent on the period.
 *
 * Returns true when credits were actually added, false when the month was
 * already granted or the plan has no allowance — so the caller can report
 * honestly instead of assuming.
 */
create or replace function public.credit_grant_allowance(
  p_user   uuid,
  p_period text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_status text;
  v_credits integer;
  v_period text;
  v_ref text;
  v_existing uuid;
begin
  if auth.role() <> 'service_role' and auth.uid() is not null then
    raise exception 'Allowances are granted server-side only.' using errcode = 'insufficient_privilege';
  end if;

  -- The Lagos month, so the boundary matches the audience's calendar.
  v_period := coalesce(p_period, to_char(now() at time zone 'Africa/Lagos', 'YYYY-MM'));

  select u.plan, u.plan_status into v_plan, v_status
    from public.users u where u.id = p_user;
  if v_plan is null then return false; end if;

  -- A lapsed or cancelled plan does not keep paying out. NULL status is
  -- treated as active: the column was added after most rows existed.
  if coalesce(v_status, 'active') <> 'active' then return false; end if;

  select a.monthly_credits into v_credits
    from public.credit_plan_allowances a
   where a.plan = v_plan and a.enabled;
  if v_credits is null or v_credits = 0 then return false; end if;

  v_ref := format('allowance:%s:%s', p_user, v_period);

  -- Ask first, so the return value tells the truth about what happened. The
  -- unique index is still the guarantee; this is only for the answer.
  select id into v_existing from public.credit_transactions
   where type = 'subscription_grant' and reference = v_ref;
  if v_existing is not null then return false; end if;

  perform public.credit_apply(
    p_user, 'subscription_grant', v_credits,
    'plan:' || v_plan, v_ref,
    format('%s credits — %s plan, %s', v_credits, v_plan, v_period),
    null, jsonb_build_object('plan', v_plan, 'period', v_period));

  return true;
end $$;

/**
 * Grant this month's allowance to everyone entitled to one.
 *
 * Run monthly by pg_cron. Safe to run at any time and any number of times:
 * everybody already granted for the period is skipped by the period key, so a
 * retry after a partial failure finishes the job rather than doubling it.
 */
create or replace function public.credit_grant_allowances_due()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_n integer := 0;
begin
  if auth.role() <> 'service_role' and auth.uid() is not null then
    raise exception 'Allowances are granted server-side only.' using errcode = 'insufficient_privilege';
  end if;

  for v_user in
    select u.id from public.users u
     join public.credit_plan_allowances a on a.plan = u.plan and a.enabled
    where coalesce(u.plan_status, 'active') = 'active'
  loop
    if public.credit_grant_allowance(v_user) then v_n := v_n + 1; end if;
  end loop;

  return v_n;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- SIGNUP — month one
-- ════════════════════════════════════════════════════════════════════════

/*
 * Why this hangs off public.users and not auth.users.
 *
 * The row in public.users carries the plan, and it is written after the auth
 * row. A trigger on auth.users would fire before any plan existed and grant
 * nothing. This fires when the profile appears, which is when there is a plan
 * to read.
 *
 * Like welcome_new_user(), the body cannot raise: a failed credit grant must
 * never stop somebody creating an account. A missing allowance is recoverable
 * — the monthly tick grants it — and a signup that fails because of one is not.
 */
create or replace function public.credit_grant_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
    perform public.credit_grant_allowance(NEW.id);
  exception when others then
    raise notice 'credit_grant_on_signup: could not grant the opening allowance (%).', sqlerrm;
  end;
  return NEW;
end $$;

drop trigger if exists on_user_credit_allowance on public.users;
create trigger on_user_credit_allowance
  after insert on public.users
  for each row execute function public.credit_grant_on_signup();

/*
 * And when somebody CHANGES plan, grant the new plan's allowance for the
 * current month.
 *
 * The period key makes this safe: a user upgrading mid-month who already had
 * the starter allowance has reference allowance:<id>:2026-10 on file, so the
 * upgrade grants nothing extra until next month. Topping up the difference on
 * upgrade is a commercial decision, not a technical one — this does the
 * conservative thing and can be changed deliberately.
 */
create or replace function public.credit_grant_on_plan_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.plan is distinct from OLD.plan
     or coalesce(NEW.plan_status,'active') is distinct from coalesce(OLD.plan_status,'active') then
    begin
      perform set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
      perform public.credit_grant_allowance(NEW.id);
    exception when others then
      raise notice 'credit_grant_on_plan_change: could not grant (%).', sqlerrm;
    end;
  end if;
  return NEW;
end $$;

drop trigger if exists on_user_plan_credit_allowance on public.users;
create trigger on_user_plan_credit_allowance
  after update of plan, plan_status on public.users
  for each row execute function public.credit_grant_on_plan_change();

-- ════════════════════════════════════════════════════════════════════════
-- BUYING CREDITS — fulfilled from a VERIFIED payment, never a client claim
-- ════════════════════════════════════════════════════════════════════════

/**
 * Turn a paid payment_intent into credits.
 *
 * Takes the payment REFERENCE, not an amount and not a credit count. The
 * caller cannot say how many credits to grant: this reads the intent, checks
 * the platform itself marked it paid, looks up the pack, and grants what the
 * pack says. A browser that could name the number would name a large one.
 *
 * Idempotent twice over — the intent must be status 'paid', and the ledger
 * reference is the payment reference, so the webhook and verify-payment can
 * both call it and the customer is credited once.
 */
create or replace function public.credit_fulfil_purchase(p_reference text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent record;
  v_pack record;
  v_total integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Credit purchases are fulfilled server-side only.' using errcode = 'insufficient_privilege';
  end if;

  select pi.id, pi.status, pi.kind, pi.item_id, pi.user_id
    into v_intent
    from public.payment_intents pi
   where pi.reference = p_reference;

  if not found then
    raise exception 'No payment with reference %.', p_reference using errcode = 'no_data_found';
  end if;
  -- The money must have been confirmed with Paystack by verify-payment or the
  -- signed webhook. This function never decides that for itself.
  if v_intent.status <> 'paid' then
    raise exception 'Payment % is %, not paid — refusing to grant credits.', p_reference, v_intent.status
      using errcode = 'restrict_violation';
  end if;
  if v_intent.kind <> 'credits' then
    raise exception 'Payment % is a % purchase, not credits.', p_reference, v_intent.kind
      using errcode = 'restrict_violation';
  end if;
  if v_intent.user_id is null then
    raise exception 'Payment % has no account to credit.', p_reference using errcode = 'restrict_violation';
  end if;

  select cp.slug, cp.credits, cp.bonus_credits, cp.active, cp.price_minor
    into v_pack
    from public.credit_packages cp where cp.slug = v_intent.item_id;
  if not found then
    raise exception 'Payment % names unknown pack "%".', p_reference, v_intent.item_id
      using errcode = 'no_data_found';
  end if;

  -- The bonus is part of what was bought, so it is part of the same entry:
  -- the customer paid for 550, not 500 plus a gift.
  v_total := v_pack.credits + v_pack.bonus_credits;

  perform public.credit_apply(
    v_intent.user_id, 'purchase', v_total,
    'pack:' || v_pack.slug,
    'payment:' || p_reference,
    format('%s credits (%s + %s bonus) — %s', v_total, v_pack.credits, v_pack.bonus_credits, v_pack.slug),
    null,
    jsonb_build_object('pack', v_pack.slug, 'payment_reference', p_reference,
                       'credits', v_pack.credits, 'bonus', v_pack.bonus_credits));

  return v_total;
end $$;

revoke all on function public.credit_grant_allowance(uuid, text) from public, anon, authenticated;
revoke all on function public.credit_grant_allowances_due() from public, anon, authenticated;
revoke all on function public.credit_fulfil_purchase(text) from public, anon, authenticated;
grant execute on function public.credit_grant_allowance(uuid, text) to service_role;
grant execute on function public.credit_grant_allowances_due() to service_role;
grant execute on function public.credit_fulfil_purchase(text) to service_role;

-- The allowance table is readable (the pricing page states these numbers) and
-- writable only by admins.
alter table public.credit_plan_allowances enable row level security;

drop policy if exists credit_plan_allowances_read on public.credit_plan_allowances;
create policy credit_plan_allowances_read on public.credit_plan_allowances
  for select to anon, authenticated using (true);

drop policy if exists credit_plan_allowances_admin on public.credit_plan_allowances;
create policy credit_plan_allowances_admin on public.credit_plan_allowances
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

grant select on public.credit_plan_allowances to anon, authenticated;
