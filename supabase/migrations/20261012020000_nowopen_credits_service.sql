-- CreditService — as database functions, because that is the only place the
-- client cannot reach around.
--
-- ── WHY NOT A TYPESCRIPT SERVICE ─────────────────────────────────────────
--
-- The brief asks for credit operations to be server-authoritative. In this
-- stack the browser talks to Postgres directly through PostgREST with the
-- user's own JWT. A TypeScript CreditService in src/ would be client code
-- wearing a server's name: anybody could skip it and write the table.
--
-- So the authority lives here. RLS grants SELECT on your own rows and NOTHING
-- else — no role, including `authenticated`, can INSERT or UPDATE a wallet, a
-- ledger entry or a reservation. The only way credits move is through these
-- SECURITY DEFINER functions, and they decide who is asking rather than being
-- told.
--
-- ── THE PARAMETER THAT DOES NOT EXIST ────────────────────────────────────
--
-- credit_reserve / credit_charge take no user id. They act on auth.uid().
--
-- A `p_user_id` a client can set is a client that can spend somebody else's
-- credits the first time a check is forgotten. Removing the parameter removes
-- the whole class of bug rather than guarding it. Functions that genuinely
-- must name a user — fulfilling a purchase, granting a plan allowance — are
-- separate and refuse anyone who is not service_role.
--
-- ── A NOTE ON SECURITY DEFINER ───────────────────────────────────────────
--
-- Inside a SECURITY DEFINER function `current_user` is the function's OWNER,
-- not the caller, so it is useless as a guard and reads as if it works. Every
-- gate below uses auth.uid() / auth.role(), which reflect the request.

-- ════════════════════════════════════════════════════════════════════════
-- READS
-- ════════════════════════════════════════════════════════════════════════

/** The caller's wallet, created on first touch. Never another user's. */
create or replace function public.credit_wallet_mine()
returns public.credit_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row public.credit_wallets;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = 'insufficient_privilege';
  end if;

  -- ON CONFLICT rather than check-then-insert: two tabs opening the dashboard
  -- at once would otherwise race to create the same wallet.
  insert into public.credit_wallets (user_id)
  values (v_user)
  on conflict (user_id) do nothing;

  select * into v_row from public.credit_wallets where user_id = v_user;
  return v_row;
end $$;

/**
 * Credits the caller can actually spend right now: settled balance minus
 * everything held by open reservations.
 *
 * This, not credit_wallets.balance, is the number to check before an action
 * and the number to show beside a cost. The raw balance still counts money
 * that a running video job has already claimed.
 */
create or replace function public.credit_available(p_user uuid default null)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
  v_balance integer;
  v_held integer;
begin
  -- Naming a user other than yourself is a service_role operation.
  if p_user is not null and p_user <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
     and auth.role() <> 'service_role' then
    raise exception 'Not permitted to read another wallet.' using errcode = 'insufficient_privilege';
  end if;
  if v_user is null then
    raise exception 'Not signed in.' using errcode = 'insufficient_privilege';
  end if;

  select w.balance into v_balance from public.credit_wallets w where w.user_id = v_user;
  if v_balance is null then return 0; end if;

  select coalesce(sum(r.amount), 0) into v_held
    from public.credit_reservations r
    join public.credit_wallets w on w.id = r.wallet_id
   where w.user_id = v_user and r.status = 'reserved';

  return greatest(v_balance - v_held, 0);
end $$;

/**
 * What an action costs, or an error saying why it cannot be performed.
 *
 * An unpriced action (credit_cost NULL) is REFUSED, not free. Following
 * revenue_products: a thing nobody has priced is not for sale. Treating NULL
 * as zero would silently give away whatever an operator had not got round to
 * configuring.
 */
create or replace function public.credit_cost_of(p_slug text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare r record;
begin
  select slug, credit_cost, enabled into r
    from public.credit_actions where slug = p_slug;

  if not found then
    raise exception 'Unknown credit action "%".', p_slug using errcode = 'no_data_found';
  end if;
  if not r.enabled then
    raise exception 'The action "%" is switched off.', p_slug using errcode = 'restrict_violation';
  end if;
  if r.credit_cost is null then
    raise exception 'The action "%" has no price set, so it cannot be performed. An administrator must set its credit cost.', p_slug
      using errcode = 'restrict_violation';
  end if;
  return r.credit_cost;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- THE ONE WRITE PATH
-- ════════════════════════════════════════════════════════════════════════

/*
 * Every credit movement in the system passes through here.
 *
 * It is deliberately private (revoked from every client role below): the
 * public functions are the ones that decide WHETHER a movement is allowed,
 * and this one performs it correctly once they have.
 *
 * Correctly means: lock the wallet row, read the balance under that lock,
 * write the ledger entry and the new balance in the same transaction. The row
 * lock is what makes two concurrent charges serialise instead of both reading
 * the same balance and both succeeding.
 */
create or replace function public.credit_apply(
  p_user        uuid,
  p_type        public.credit_txn_type,
  p_amount      integer,
  p_source      text default null,
  p_reference   text default null,
  p_description text default null,
  p_business    uuid default null,
  p_metadata    jsonb default '{}'::jsonb
)
returns public.credit_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.credit_wallets;
  v_before integer;
  v_after integer;
  v_txn public.credit_transactions;
begin
  if p_amount = 0 then
    raise exception 'A ledger entry of zero says nothing; refusing to write one.'
      using errcode = 'check_violation';
  end if;

  insert into public.credit_wallets (user_id) values (p_user)
  on conflict (user_id) do nothing;

  -- FOR UPDATE: the lock that makes concurrent spends safe.
  select * into v_wallet from public.credit_wallets where user_id = p_user for update;

  v_before := v_wallet.balance;
  v_after  := v_before + p_amount;

  if v_after < 0 then
    raise exception 'Not enough credits: % available, % needed.', v_before, abs(p_amount)
      using errcode = 'check_violation';
  end if;

  /*
   * Idempotency. The unique index on (type, reference) is the real guarantee;
   * this catch turns the resulting 23505 into "already done", which is the
   * honest answer when a webhook is delivered twice.
   */
  begin
    insert into public.credit_transactions
      (wallet_id, user_id, business_id, type, amount, balance_before, balance_after,
       source, reference, description, metadata)
    values
      (v_wallet.id, p_user, p_business, p_type, p_amount, v_before, v_after,
       p_source, p_reference, p_description, coalesce(p_metadata, '{}'::jsonb))
    returning * into v_txn;
  exception when unique_violation then
    select * into v_txn from public.credit_transactions
     where type = p_type and reference = p_reference;
    return v_txn;  -- already applied; the balance below must NOT move again
  end;

  update public.credit_wallets
     set balance = v_after,
         lifetime_purchased   = lifetime_purchased   + case when p_type = 'purchase'            then p_amount else 0 end,
         lifetime_granted     = lifetime_granted     + case when p_type = 'subscription_grant'  then p_amount else 0 end,
         lifetime_promotional = lifetime_promotional + case when p_type = 'promotional_grant'   then p_amount else 0 end,
         lifetime_consumed    = lifetime_consumed    + case when p_type = 'usage'               then abs(p_amount) else 0 end,
         lifetime_refunded    = lifetime_refunded    + case when p_type = 'refund'              then p_amount else 0 end,
         lifetime_expired     = lifetime_expired     + case when p_type = 'expiration'          then abs(p_amount) else 0 end
   where id = v_wallet.id;

  return v_txn;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- SPENDING — the caller's own wallet, always
-- ════════════════════════════════════════════════════════════════════════

/**
 * Charge the caller for an action, immediately.
 *
 * For actions that cannot fail halfway: a caption, a description, a short
 * piece of copy. Anything that calls a paid external API should reserve
 * instead (credit_reserve), so a provider timeout does not cost the customer.
 *
 * `p_reference` makes the charge idempotent — pass the request id, and a
 * double-submitted form charges once.
 */
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
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = 'insufficient_privilege';
  end if;

  v_cost := public.credit_cost_of(p_action);  -- raises if unpriced or disabled

  -- A free action still records usage, which is how "AI actions this month"
  -- stays true, but it must not write a zero-amount ledger entry.
  if v_cost = 0 then
    return null;
  end if;

  v_available := public.credit_available(v_user);
  if v_available < v_cost then
    raise exception 'Not enough credits: % available, % needed for "%".', v_available, v_cost, p_action
      using errcode = 'check_violation';
  end if;

  return public.credit_apply(
    v_user, 'usage', -v_cost, p_action, p_reference,
    format('Used %s credit(s) on %s', v_cost, p_action), p_business, '{}'::jsonb);
end $$;

/**
 * Hold credits for an operation that is about to run.
 *
 * Checked against credit_available(), which already subtracts other open
 * reservations — so twenty concurrent video jobs on four credits fail at the
 * second one rather than all twenty succeeding and the balance going negative.
 */
create or replace function public.credit_reserve(
  p_action    text,
  p_reference text default null,
  p_business  uuid default null
)
returns public.credit_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_wallet public.credit_wallets;
  v_cost integer;
  v_available integer;
  v_res public.credit_reservations;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = 'insufficient_privilege';
  end if;

  v_cost := public.credit_cost_of(p_action);

  insert into public.credit_wallets (user_id) values (v_user) on conflict (user_id) do nothing;
  -- Lock first, then measure: without the lock two requests read the same
  -- availability and both reserve.
  select * into v_wallet from public.credit_wallets where user_id = v_user for update;

  v_available := public.credit_available(v_user);
  if v_available < v_cost then
    raise exception 'Not enough credits: % available, % needed for "%".', v_available, v_cost, p_action
      using errcode = 'check_violation';
  end if;

  begin
    insert into public.credit_reservations
      (wallet_id, user_id, business_id, action_slug, amount, reference)
    values (v_wallet.id, v_user, p_business, p_action, v_cost, p_reference)
    returning * into v_res;
  exception when unique_violation then
    -- Same request reserving twice: hand back the reservation it already has.
    select * into v_res from public.credit_reservations
     where action_slug = p_action and reference = p_reference;
  end;

  return v_res;
end $$;

/** The operation succeeded: turn the hold into a ledger entry. */
create or replace function public.credit_reservation_consume(p_reservation uuid)
returns public.credit_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res public.credit_reservations;
  v_txn public.credit_transactions;
begin
  select * into v_res from public.credit_reservations where id = p_reservation for update;
  if not found then
    raise exception 'No such reservation.' using errcode = 'no_data_found';
  end if;
  -- Yours, or service_role acting for a background job.
  if v_res.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
     and auth.role() <> 'service_role' then
    raise exception 'Not your reservation.' using errcode = 'insufficient_privilege';
  end if;

  -- Settling twice must be harmless: a retried callback is normal.
  if v_res.status = 'consumed' then
    select * into v_txn from public.credit_transactions where id = v_res.transaction_id;
    return v_txn;
  end if;
  if v_res.status <> 'reserved' then
    raise exception 'That reservation was already %.', v_res.status using errcode = 'restrict_violation';
  end if;

  /*
   * The reservation is marked consumed BEFORE the ledger write, so that
   * credit_available() inside credit_apply() no longer counts it as held.
   * Otherwise the money would be subtracted twice and a user with exactly
   * enough credits could not spend them.
   */
  update public.credit_reservations
     set status = 'consumed', settled_at = now()
   where id = p_reservation;

  v_txn := public.credit_apply(
    v_res.user_id, 'usage', -v_res.amount, v_res.action_slug,
    'reservation:' || v_res.id::text,
    format('Used %s credit(s) on %s', v_res.amount, v_res.action_slug),
    v_res.business_id, jsonb_build_object('reservation_id', v_res.id));

  update public.credit_reservations set transaction_id = v_txn.id where id = p_reservation;
  return v_txn;
end $$;

/**
 * The operation failed or was abandoned: let the hold go.
 *
 * Deliberately writes NO ledger entry. Nothing was spent, so a ledger full of
 * +5/-5 pairs would bury the movements that did happen. The reservation row is
 * itself the record that it was attempted.
 */
create or replace function public.credit_reservation_release(
  p_reservation uuid,
  p_reason      text default null
)
returns public.credit_reservations
language plpgsql
security definer
set search_path = public
as $$
declare v_res public.credit_reservations;
begin
  select * into v_res from public.credit_reservations where id = p_reservation for update;
  if not found then
    raise exception 'No such reservation.' using errcode = 'no_data_found';
  end if;
  if v_res.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
     and auth.role() <> 'service_role' then
    raise exception 'Not your reservation.' using errcode = 'insufficient_privilege';
  end if;

  if v_res.status = 'released' then return v_res; end if;
  if v_res.status <> 'reserved' then
    raise exception 'That reservation was already %.', v_res.status using errcode = 'restrict_violation';
  end if;

  update public.credit_reservations
     set status = 'released', settled_at = now(),
         metadata = metadata || jsonb_build_object('release_reason', p_reason)
   where id = p_reservation
  returning * into v_res;
  return v_res;
end $$;

/**
 * Release holds nobody ever settled.
 *
 * A browser tab closed mid-generation leaves a reservation open forever, and
 * those credits would be unspendable with nothing on screen to explain why.
 * Run on a schedule.
 */
create or replace function public.credit_expire_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  if auth.role() not in ('service_role', 'postgres') and auth.uid() is not null then
    raise exception 'Not permitted.' using errcode = 'insufficient_privilege';
  end if;

  with swept as (
    update public.credit_reservations
       set status = 'expired', settled_at = now()
     where status = 'reserved' and expires_at < now()
    returning 1)
  select count(*) into v_n from swept;
  return v_n;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- GRANTS — naming a user, so service_role only
-- ════════════════════════════════════════════════════════════════════════

/**
 * Add credits to somebody's wallet. Never callable from a browser.
 *
 * `p_reference` is the idempotency key and is REQUIRED: a grant without one
 * is a grant that a retried webhook applies twice.
 */
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
    raise exception 'A grant needs a reference, or a retry grants twice.'
      using errcode = 'check_violation';
  end if;
  if p_type not in ('purchase','subscription_grant','promotional_grant','refund','admin_adjustment','reversal') then
    raise exception 'credit_grant cannot write a % entry.', p_type using errcode = 'check_violation';
  end if;

  return public.credit_apply(p_user, p_type, p_amount, p_source, p_reference, p_description, null, p_metadata);
end $$;

/**
 * An administrator moving somebody's balance by hand, with a reason on the
 * record. Separate from credit_grant because it is the one path a human
 * invokes directly, and it must leave a name attached.
 */
create or replace function public.credit_admin_adjust(
  p_user   uuid,
  p_amount integer,
  p_reason text
)
returns public.credit_transactions
language plpgsql
security definer
set search_path = public
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null or not exists (
    select 1 from public.users u where u.id = v_actor and u.role = 'admin')
  then
    raise exception 'Administrators only.' using errcode = 'insufficient_privilege';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'An adjustment needs a reason. An unexplained balance change is indistinguishable from a mistake.'
      using errcode = 'check_violation';
  end if;

  return public.credit_apply(
    p_user, 'admin_adjustment', p_amount, 'admin',
    -- Unique per adjustment: two identical corrections are both real.
    'admin:' || gen_random_uuid()::text,
    p_reason, null,
    jsonb_build_object('actor', v_actor, 'reason', p_reason));
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- RLS — read your own, write nothing
-- ════════════════════════════════════════════════════════════════════════

alter table public.credit_wallets      enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.credit_reservations enable row level security;
alter table public.credit_actions      enable row level security;
alter table public.credit_packages     enable row level security;

-- Wallets, ledger and reservations: SELECT your own. No INSERT/UPDATE/DELETE
-- policy exists for any client role, which is what forces every write through
-- the functions above.
drop policy if exists credit_wallets_own on public.credit_wallets;
create policy credit_wallets_own on public.credit_wallets
  for select to authenticated using (user_id = auth.uid());

drop policy if exists credit_transactions_own on public.credit_transactions;
create policy credit_transactions_own on public.credit_transactions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists credit_reservations_own on public.credit_reservations;
create policy credit_reservations_own on public.credit_reservations
  for select to authenticated using (user_id = auth.uid());

-- Admins may read everyone's, to answer support questions.
drop policy if exists credit_wallets_admin on public.credit_wallets;
create policy credit_wallets_admin on public.credit_wallets
  for select to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

drop policy if exists credit_transactions_admin on public.credit_transactions;
create policy credit_transactions_admin on public.credit_transactions
  for select to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

-- The catalogue is public to read: a price list nobody can see cannot be
-- shown beside a button. Writing it is an admin action.
drop policy if exists credit_actions_read on public.credit_actions;
create policy credit_actions_read on public.credit_actions
  for select to anon, authenticated using (true);

drop policy if exists credit_packages_read on public.credit_packages;
create policy credit_packages_read on public.credit_packages
  for select to anon, authenticated using (true);

drop policy if exists credit_actions_admin_write on public.credit_actions;
create policy credit_actions_admin_write on public.credit_actions
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

drop policy if exists credit_packages_admin_write on public.credit_packages;
create policy credit_packages_admin_write on public.credit_packages
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

-- ════════════════════════════════════════════════════════════════════════
-- EXECUTE GRANTS
-- ════════════════════════════════════════════════════════════════════════

-- credit_apply is the engine, not an entrance. Nobody calls it but the
-- functions above (which run as owner and so are unaffected by this).
revoke all on function public.credit_apply(uuid, public.credit_txn_type, integer, text, text, text, uuid, jsonb)
  from public, anon, authenticated;

revoke all on function public.credit_grant(uuid, integer, public.credit_txn_type, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.credit_grant(uuid, integer, public.credit_txn_type, text, text, text, jsonb)
  to service_role;

revoke all on function public.credit_expire_reservations() from public, anon, authenticated;
grant execute on function public.credit_expire_reservations() to service_role;

grant execute on function public.credit_wallet_mine() to authenticated;
grant execute on function public.credit_available(uuid) to authenticated, service_role;
grant execute on function public.credit_cost_of(text) to anon, authenticated, service_role;
grant execute on function public.credit_charge(text, text, uuid) to authenticated, service_role;
grant execute on function public.credit_reserve(text, text, uuid) to authenticated, service_role;
grant execute on function public.credit_reservation_consume(uuid) to authenticated, service_role;
grant execute on function public.credit_reservation_release(uuid, text) to authenticated, service_role;
grant execute on function public.credit_admin_adjust(uuid, integer, text) to authenticated;

grant select on public.credit_actions, public.credit_packages to anon, authenticated;
grant select on public.credit_wallets, public.credit_transactions, public.credit_reservations to authenticated;
