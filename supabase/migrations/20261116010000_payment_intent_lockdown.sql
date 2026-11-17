-- Payment intents: a browser may START a checkout, never finish one.
--
-- MEASURED 2026-11-15 (rolled-back transaction against production): the
-- INSERT policy on payment_intents was WITH CHECK (true) for anon and
-- authenticated. An anonymous request inserted
--   kind='credits', item_id='pack.business', status='paid', user_id=<anyone>
-- and credit_fulfil_purchase then granted 6,000 credits. verify-payment's
-- "already paid" branch runs fulfilment and plan activation without asking
-- Paystack, so the same row bought a Business Pro plan. Nothing was paid.
--
-- The rule after this migration:
--   · a client row is 'lead' or 'initiated', with no verified_via;
--   · it names nobody but the caller (user_id NULL or auth.uid());
--   · 'credits' rows are never client-created. NOC purchases are opened by
--     noc_start_purchase(), which prices them from the database.
--   · only service_role (the verifiers) or an admin may move status,
--     verified_via, the amount, the kind, the item or the account.
--
-- Also fixes HANDOVER decision 4a: the credit triggers set a service_role
-- JWT claim with is_local = true, which lasts for the REST of the caller's
-- transaction, not just the grant. They now call an internal function that
-- needs no claim at all.

-- ── 1. INSERT: start a checkout, nothing more ───────────────────────────
drop policy if exists "Anyone can start a checkout" on public.payment_intents;
create policy "Anyone can start a checkout" on public.payment_intents
  for insert to anon, authenticated
  with check (
    coalesce(status, 'lead') in ('lead', 'initiated')
    and verified_via is null
    and (user_id is null or user_id = auth.uid())
    and kind <> 'credits'
  );

-- ── 2. UPDATE: the money fields belong to the verifiers ─────────────────
create or replace function public.guard_payment_intent_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No JWT role at all = a direct postgres session (migration, SQL editor).
  -- Every PostgREST request carries one: anon, authenticated or service_role.
  if auth.role() is null or auth.role() = 'service_role' or public.is_admin() then
    return NEW;
  end if;
  if NEW.status is distinct from OLD.status
     or NEW.verified_via is distinct from OLD.verified_via
     or NEW.amount_local is distinct from OLD.amount_local
     or NEW.currency is distinct from OLD.currency
     or NEW.kind is distinct from OLD.kind
     or NEW.item_id is distinct from OLD.item_id
     or NEW.user_id is distinct from OLD.user_id
     or NEW.reference is distinct from OLD.reference then
    raise exception 'Payment status and amounts are set by payment verification only.'
      using errcode = 'insufficient_privilege';
  end if;
  return NEW;
end $$;

drop trigger if exists guard_payment_intent_fields on public.payment_intents;
create trigger guard_payment_intent_fields
  before update on public.payment_intents
  for each row execute function public.guard_payment_intent_fields();

-- NOC orders have no USD price; NULL is honest, a 0 would be a false figure.
-- The admin screens already render NULL as "—".
alter table public.payment_intents alter column amount_usd drop not null;

-- ── 3. Credit triggers without a borrowed service_role claim ────────────
create or replace function public._credit_grant_allowance_core(
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
begin
  v_period := coalesce(p_period, to_char(now() at time zone 'Africa/Lagos', 'YYYY-MM'));

  select u.plan, u.plan_status into v_plan, v_status from public.users u where u.id = p_user;
  if v_plan is null then return false; end if;
  if coalesce(v_status, 'active') <> 'active' then return false; end if;

  select a.monthly_credits into v_credits
    from public.credit_plan_allowances a where a.plan = v_plan and a.enabled;
  if v_credits is null or v_credits = 0 then return false; end if;

  v_ref := format('allowance:%s:%s', p_user, v_period);
  if exists (select 1 from public.credit_transactions
              where type = 'subscription_grant' and reference = v_ref) then
    return false;
  end if;

  perform public.credit_apply(
    p_user, 'subscription_grant', v_credits,
    'plan:' || v_plan, v_ref,
    format('%s credits — %s plan, %s', v_credits, v_plan, v_period),
    null, jsonb_build_object('plan', v_plan, 'period', v_period));
  return true;
end $$;

revoke all on function public._credit_grant_allowance_core(uuid, text) from public, anon, authenticated;

create or replace function public.credit_grant_allowance(p_user uuid, p_period text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and auth.uid() is not null then
    raise exception 'Allowances are granted server-side only.' using errcode = 'insufficient_privilege';
  end if;
  return public._credit_grant_allowance_core(p_user, p_period);
end $$;

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
    if public._credit_grant_allowance_core(v_user) then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;

create or replace function public.credit_grant_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public._credit_grant_allowance_core(NEW.id);
  exception when others then
    raise notice 'credit_grant_on_signup: could not grant the opening allowance (%).', sqlerrm;
  end;
  return NEW;
end $$;

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
      perform public._credit_grant_allowance_core(NEW.id);
    exception when others then
      raise notice 'credit_grant_on_plan_change: could not grant (%).', sqlerrm;
    end;
  end if;
  return NEW;
end $$;

-- ── Self-check ───────────────────────────────────────────────────────────
do $check$
declare n integer;
begin
  select count(*) into n from pg_policies
   where tablename = 'payment_intents' and policyname = 'Anyone can start a checkout'
     and with_check ilike '%verified_via IS NULL%';
  assert n = 1, 'insert policy was not tightened';

  select count(*) into n from pg_proc where proname in ('credit_grant_on_signup','credit_grant_on_plan_change')
     and prosrc ilike '%set_config%';
  assert n = 0, 'a credit trigger still sets a JWT claim';
end $check$;
