-- NOC: rewards, refunds and reversals, the adjustment workflow, admin
-- operations, reporting, and media-owner settlement (built, switched OFF).
--
-- Every movement here goes through credit_apply, so each one is a new,
-- double-entry, idempotent ledger entry. Nothing edits an earlier entry.

-- ════════════════════════════════════════════════════════════════════════
-- ADMIN GATE
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.noc_require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrators only.' using errcode = 'insufficient_privilege';
  end if;
  return auth.uid();
end $$;

revoke all on function public.noc_require_admin() from public, anon;

-- ════════════════════════════════════════════════════════════════════════
-- REWARDS — event-driven, off by default, unpriced = refused
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.noc_reward_rules (
  slug                    text primary key,
  name                    text not null,
  description             text,
  event_key               text not null,
  credit_class            public.noc_credit_class not null default 'reward'
                          check (credit_class in ('reward', 'promotional')),
  -- NULL = nobody has priced it = refused. Never read as zero or free.
  amount                  integer check (amount is null or amount > 0),
  enabled                 boolean not null default false,
  -- Abuse controls. NULL means "no limit of this kind"; the defaults are
  -- the strict ones.
  per_user_limit          integer not null default 1 check (per_user_limit > 0),
  per_user_daily_limit    integer check (per_user_daily_limit is null or per_user_daily_limit > 0),
  once_per_subject        boolean not null default true,
  global_budget           integer check (global_budget is null or global_budget > 0),
  min_account_age_hours   integer not null default 24 check (min_account_age_hours >= 0),
  require_email_confirmed boolean not null default true,
  starts_at               timestamptz,
  ends_at                 timestamptz,
  updated_at              timestamptz not null default now(),
  updated_by              uuid references public.users(id) on delete set null
);

create table if not exists public.noc_reward_grants (
  id              uuid primary key default gen_random_uuid(),
  rule_slug       text not null references public.noc_reward_rules(slug),
  user_id         uuid not null references public.users(id) on delete restrict,
  subject         text not null,
  status          text not null check (status in ('granted', 'refused')),
  reason          text,
  amount          integer,
  transaction_id  uuid references public.credit_transactions(id),
  created_at      timestamptz not null default now()
);

create unique index if not exists noc_reward_grants_once_idx
  on public.noc_reward_grants (rule_slug, user_id, subject) where status = 'granted';
create index if not exists noc_reward_grants_rule_idx on public.noc_reward_grants (rule_slug, status, created_at desc);

drop trigger if exists noc_reward_grants_append_only on public.noc_reward_grants;
create trigger noc_reward_grants_append_only before update or delete on public.noc_reward_grants
  for each row execute function public.noc_append_only();

drop trigger if exists noc_audit_reward_rules on public.noc_reward_rules;
create trigger noc_audit_reward_rules after insert or update or delete on public.noc_reward_rules
  for each row execute function public.noc_config_audit_write();

-- The catalogue of rewards the platform can emit. Amounts are NULL and
-- every rule is off: what a claim is worth is a commercial decision.
insert into public.noc_reward_rules (slug, name, description, event_key, credit_class)
values
  ('reward.business_claimed', 'Claimed your business',
   'Awarded once when a business owner''s claim is approved.', 'business.claimed', 'reward'),
  ('reward.first_update', 'First business update',
   'Awarded once when a business publishes its first update.', 'business.first_update', 'reward'),
  ('reward.referral_converted', 'Referred a business',
   'Awarded when a business you referred is claimed by its owner.', 'referral.converted', 'reward')
on conflict (slug) do nothing;

/*
 * The one place a reward is decided. Returns the grant row (granted or
 * refused, with the reason) so every attempt is on record for abuse review.
 * Internal: call through noc_emit_event or noc_reward_issue.
 */
create or replace function public._noc_reward_issue_core(p_rule text, p_user uuid, p_subject text)
returns public.noc_reward_grants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prog  public.noc_programme;
  v_rule  public.noc_reward_rules;
  v_row   public.noc_reward_grants;
  v_auth  record;
  v_n     integer;
  v_spent bigint;
  v_txn   public.credit_transactions;
  v_why   text;
  v_today date := (now() at time zone 'Africa/Lagos')::date;
begin
  select * into v_prog from public.noc_programme where id;
  select * into v_rule from public.noc_reward_rules where slug = p_rule;
  if not found then
    raise exception 'Unknown reward rule %.', p_rule using errcode = 'no_data_found';
  end if;

  -- One decision at a time per rule, so the budget and the limits cannot be
  -- raced by two events arriving together.
  perform pg_advisory_xact_lock(hashtext('noc_reward:' || p_rule));

  select u.email_confirmed_at, u.created_at into v_auth from auth.users u where u.id = p_user;

  if not v_prog.rewards_enabled then v_why := 'rewards programme is off';
  elsif not v_rule.enabled then v_why := 'rule is off';
  elsif v_rule.amount is null then v_why := 'rule has no amount set';
  elsif v_rule.starts_at is not null and now() < v_rule.starts_at then v_why := 'rule has not started';
  elsif v_rule.ends_at is not null and now() > v_rule.ends_at then v_why := 'rule has ended';
  elsif p_subject is null or btrim(p_subject) = '' then v_why := 'no subject';
  elsif v_auth is null then v_why := 'no such account';
  elsif v_rule.require_email_confirmed and v_auth.email_confirmed_at is null then v_why := 'email not confirmed';
  elsif v_auth.created_at > now() - make_interval(hours => v_rule.min_account_age_hours) then v_why := 'account too new';
  end if;

  if v_why is null and exists (
      select 1 from public.noc_reward_grants g
       where g.rule_slug = p_rule and g.user_id = p_user and g.subject = p_subject and g.status = 'granted') then
    v_why := 'already rewarded for this';
  end if;
  if v_why is null and v_rule.once_per_subject and exists (
      select 1 from public.noc_reward_grants g
       where g.rule_slug = p_rule and g.subject = p_subject and g.status = 'granted') then
    v_why := 'subject already rewarded to another account';
  end if;
  if v_why is null then
    select count(*) into v_n from public.noc_reward_grants g
     where g.rule_slug = p_rule and g.user_id = p_user and g.status = 'granted';
    if v_n >= v_rule.per_user_limit then v_why := 'per-account limit reached'; end if;
  end if;
  if v_why is null and v_rule.per_user_daily_limit is not null then
    select count(*) into v_n from public.noc_reward_grants g
     where g.rule_slug = p_rule and g.user_id = p_user and g.status = 'granted'
       and (g.created_at at time zone 'Africa/Lagos')::date = v_today;
    if v_n >= v_rule.per_user_daily_limit then v_why := 'daily limit reached'; end if;
  end if;
  if v_why is null and v_rule.global_budget is not null then
    select coalesce(sum(g.amount), 0) into v_spent from public.noc_reward_grants g
     where g.rule_slug = p_rule and g.status = 'granted';
    if v_spent + v_rule.amount > v_rule.global_budget then v_why := 'rule budget exhausted'; end if;
  end if;

  if v_why is not null then
    insert into public.noc_reward_grants (rule_slug, user_id, subject, status, reason)
    values (p_rule, p_user, coalesce(p_subject, ''), 'refused', v_why)
    returning * into v_row;
    return v_row;
  end if;

  v_txn := public.credit_apply(
    p_user, 'promotional_grant', v_rule.amount,
    'reward:' || p_rule,
    format('reward:%s:%s:%s', p_rule, p_user, p_subject),
    format('%s NOC — %s', v_rule.amount, v_rule.name),
    null, jsonb_build_object('rule', p_rule, 'subject', p_subject, 'event', v_rule.event_key),
    v_rule.credit_class,
    jsonb_build_object('rule', p_rule, 'amount', v_rule.amount), null);

  insert into public.noc_reward_grants (rule_slug, user_id, subject, status, amount, transaction_id)
  values (p_rule, p_user, p_subject, 'granted', v_rule.amount, v_txn.id)
  returning * into v_row;
  return v_row;
end $$;

revoke all on function public._noc_reward_issue_core(text, uuid, text) from public, anon, authenticated;

create or replace function public.noc_reward_issue(p_rule text, p_user uuid, p_subject text)
returns public.noc_reward_grants
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Rewards are issued server-side only.' using errcode = 'insufficient_privilege';
  end if;
  return public._noc_reward_issue_core(p_rule, p_user, p_subject);
end $$;

revoke all on function public.noc_reward_issue(text, uuid, text) from public, anon, authenticated;
grant execute on function public.noc_reward_issue(text, uuid, text) to service_role;

/*
 * Something happened; reward whoever the rules say. Never raises: an event
 * comes from a trigger on someone else's write, which must not fail because
 * of a reward. Cheap when the programme is off (one row read).
 */
create or replace function public.noc_emit_event(p_event text, p_user uuid, p_subject text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare r record; v_n integer := 0; v_g public.noc_reward_grants;
begin
  if not coalesce((select rewards_enabled from public.noc_programme where id), false) then
    return 0;
  end if;
  for r in select slug from public.noc_reward_rules where event_key = p_event and enabled loop
    begin
      v_g := public._noc_reward_issue_core(r.slug, p_user, p_subject);
      if v_g.status = 'granted' then v_n := v_n + 1; end if;
    exception when others then
      raise notice 'noc_emit_event %/%: %', p_event, r.slug, sqlerrm;
    end;
  end loop;
  return v_n;
end $$;

revoke all on function public.noc_emit_event(text, uuid, text) from public, anon, authenticated;
grant execute on function public.noc_emit_event(text, uuid, text) to service_role;

-- Wired event: a business claim is approved.
create or replace function public.noc_event_business_claimed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.noc_emit_event('business.claimed', NEW.user_id, 'business:' || NEW.id);
  exception when others then
    raise notice 'noc_event_business_claimed: %', sqlerrm;
  end;
  return NEW;
end $$;

drop trigger if exists noc_event_business_claimed on public.businesses;
create trigger noc_event_business_claimed
  after update of claim_status on public.businesses
  for each row
  when (NEW.claim_status = 'claimed' and OLD.claim_status is distinct from 'claimed' and NEW.user_id is not null)
  execute function public.noc_event_business_claimed();

alter table public.noc_reward_rules  enable row level security;
alter table public.noc_reward_grants enable row level security;
drop policy if exists noc_reward_rules_read on public.noc_reward_rules;
create policy noc_reward_rules_read on public.noc_reward_rules for select to anon, authenticated using (true);
drop policy if exists noc_reward_grants_own on public.noc_reward_grants;
create policy noc_reward_grants_own on public.noc_reward_grants for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
grant select on public.noc_reward_rules to anon, authenticated;
grant select on public.noc_reward_grants to authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- REFUNDS AND REVERSALS — new entries that mirror the original
-- ════════════════════════════════════════════════════════════════════════

-- The wallet lines of an entry, negated, as an allocation for credit_apply.
create or replace function public.noc_mirror_lines(p_txn uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('class', l.credit_class, 'amount', -l.amount)), '[]'::jsonb)
    from public.noc_ledger_lines l join public.noc_accounts a on a.id = l.account_id
   where l.transaction_id = p_txn and a.kind = 'wallet'
$$;
revoke all on function public.noc_mirror_lines(uuid) from public, anon, authenticated;

/*
 * Give back what a usage entry took, class for class: an AI job that was
 * charged and then failed. Once per entry (reference refund-usage:<id>).
 */
create or replace function public.noc_refund_usage(p_txn uuid, p_reason text)
returns public.credit_transactions
language plpgsql
security definer
set search_path = public
as $$
declare v_orig public.credit_transactions; v_actor uuid := auth.uid();
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    raise exception 'Refunds are issued by the platform or an administrator.' using errcode = 'insufficient_privilege';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A refund needs a reason.' using errcode = 'check_violation';
  end if;
  select * into v_orig from public.credit_transactions where id = p_txn;
  if not found or v_orig.type <> 'usage' then
    raise exception 'Only a usage entry can be refunded this way.' using errcode = 'restrict_violation';
  end if;
  return public.credit_apply(
    v_orig.user_id, 'refund', -v_orig.amount, v_orig.source,
    'refund-usage:' || p_txn, format('Refund: %s', p_reason), v_orig.business_id,
    jsonb_build_object('refunds', p_txn, 'reason', p_reason, 'actor', v_actor, 'market', v_orig.market),
    null, v_orig.price_snapshot, public.noc_mirror_lines(p_txn));
end $$;

revoke all on function public.noc_refund_usage(uuid, text) from public, anon;
grant execute on function public.noc_refund_usage(uuid, text) to authenticated, service_role;

/*
 * Take back a grant (allowance, promotional, reward) or an adjustment, class
 * for class. Refused if the customer has already spent it: you cannot
 * reverse credits that are gone, and pretending otherwise would push a class
 * negative. Once per entry (reference reversal:<id>).
 */
create or replace function public.noc_admin_reverse(p_txn uuid, p_reason text)
returns public.credit_transactions
language plpgsql
security definer
set search_path = public
as $$
declare v_actor uuid := public.noc_require_admin(); v_orig public.credit_transactions;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reversal needs a reason.' using errcode = 'check_violation';
  end if;
  select * into v_orig from public.credit_transactions where id = p_txn;
  if not found then
    raise exception 'No such entry.' using errcode = 'no_data_found';
  end if;
  if v_orig.type not in ('subscription_grant', 'promotional_grant', 'admin_adjustment') then
    raise exception 'Use the purchase refund for purchases and the usage refund for usage; % entries are not reversed here.', v_orig.type
      using errcode = 'restrict_violation';
  end if;
  return public.credit_apply(
    v_orig.user_id, 'reversal', -v_orig.amount, 'admin',
    'reversal:' || p_txn, format('Reversal: %s', p_reason), v_orig.business_id,
    jsonb_build_object('reverses', p_txn, 'reason', p_reason, 'actor', v_actor),
    null, null, public.noc_mirror_lines(p_txn));
end $$;

revoke all on function public.noc_admin_reverse(uuid, text) from public, anon;
grant execute on function public.noc_admin_reverse(uuid, text) to authenticated;

/*
 * Refund a NOC purchase: take the credits back (all, or p_credits of them)
 * and mark the order refunded. The CASH refund is made in the Paystack
 * dashboard by a person; this records it and says so.
 */
create or replace function public.noc_admin_refund_purchase(p_reference text, p_reason text, p_credits integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.noc_require_admin();
  v_order public.noc_purchase_orders;
  v_total integer;
  v_take  integer;
  v_bal   integer;
  v_txn   public.credit_transactions;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A refund needs a reason.' using errcode = 'check_violation';
  end if;
  select * into v_order from public.noc_purchase_orders where reference = p_reference for update;
  if not found then raise exception 'No NOC order %.', p_reference using errcode = 'no_data_found'; end if;
  if v_order.status <> 'fulfilled' then
    raise exception 'Order % is %, not fulfilled.', p_reference, v_order.status using errcode = 'restrict_violation';
  end if;

  v_total := v_order.credits + v_order.bonus_credits;
  v_take  := coalesce(p_credits, v_total);
  if v_take <= 0 or v_take > v_total then
    raise exception 'Refund between 1 and % NOC.', v_total using errcode = 'check_violation';
  end if;
  v_bal := public.noc_class_balance(v_order.user_id, v_order.credit_class);
  if v_bal < v_take then
    raise exception 'The customer has % % NOC left of %; refund at most that many and settle the rest in cash only.',
      v_bal, v_order.credit_class, v_total using errcode = 'check_violation';
  end if;

  v_txn := public.credit_apply(
    v_order.user_id, 'reversal', -v_take, 'refund:' || v_order.pack_slug,
    'refund:' || p_reference, format('Purchase refund: %s', p_reason), null,
    jsonb_build_object('order_id', v_order.id, 'reason', p_reason, 'actor', v_actor, 'market', v_order.market),
    v_order.credit_class,
    jsonb_build_object('pack', v_order.pack_slug, 'price_minor', v_order.price_minor,
                       'currency', v_order.currency, 'credits_reversed', v_take), null);

  update public.noc_purchase_orders
     set status = 'refunded', refund_transaction_id = v_txn.id, refund_reason = p_reason, refunded_at = now()
   where id = v_order.id;

  return jsonb_build_object('reversed_credits', v_take, 'transaction_id', v_txn.id,
    'cash', 'Not moved by NowOpen. Refund the customer in the Paystack dashboard.');
end $$;

revoke all on function public.noc_admin_refund_purchase(text, text, integer) from public, anon;
grant execute on function public.noc_admin_refund_purchase(text, text, integer) to authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- ADJUSTMENTS — request, then decide; both on record
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.noc_adjustment_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete restrict,
  credit_class    public.noc_credit_class not null check (credit_class <> 'sandbox'),
  amount          integer not null check (amount <> 0),
  reason          text not null check (btrim(reason) <> ''),
  evidence        text,
  status          text not null default 'pending' check (status in ('pending', 'applied', 'rejected')),
  requested_by    uuid not null references public.users(id) on delete restrict,
  requested_at    timestamptz not null default now(),
  decided_by      uuid references public.users(id) on delete restrict,
  decided_at      timestamptz,
  decision_note   text,
  transaction_id  uuid references public.credit_transactions(id)
);

create index if not exists noc_adjustment_requests_status_idx on public.noc_adjustment_requests (status, requested_at desc);

alter table public.noc_adjustment_requests enable row level security;
drop policy if exists noc_adjustment_requests_admin on public.noc_adjustment_requests;
create policy noc_adjustment_requests_admin on public.noc_adjustment_requests for select to authenticated
  using (public.is_admin());
grant select on public.noc_adjustment_requests to authenticated;

create or replace function public.noc_admin_request_adjustment(
  p_user uuid, p_class public.noc_credit_class, p_amount integer, p_reason text, p_evidence text default null)
returns public.noc_adjustment_requests
language plpgsql
security definer
set search_path = public
as $$
declare v_actor uuid := public.noc_require_admin(); v_row public.noc_adjustment_requests;
begin
  if not exists (select 1 from public.users where id = p_user) then
    raise exception 'No such account.' using errcode = 'no_data_found';
  end if;
  insert into public.noc_adjustment_requests (user_id, credit_class, amount, reason, evidence, requested_by)
  values (p_user, p_class, p_amount, p_reason, p_evidence, v_actor)
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.noc_admin_decide_adjustment(p_request uuid, p_approve boolean, p_note text default null)
returns public.noc_adjustment_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.noc_require_admin();
  v_req   public.noc_adjustment_requests;
  v_prog  public.noc_programme;
  v_txn   public.credit_transactions;
begin
  select * into v_req from public.noc_adjustment_requests where id = p_request for update;
  if not found then raise exception 'No such request.' using errcode = 'no_data_found'; end if;
  if v_req.status <> 'pending' then
    raise exception 'That request was already %.', v_req.status using errcode = 'restrict_violation';
  end if;
  select * into v_prog from public.noc_programme where id;
  if v_prog.adjustment_require_distinct_approver and v_actor = v_req.requested_by then
    raise exception 'Another administrator must decide an adjustment you requested.' using errcode = 'insufficient_privilege';
  end if;

  if p_approve then
    v_txn := public.credit_apply(
      v_req.user_id, 'admin_adjustment', v_req.amount, 'admin',
      'adjustment:' || v_req.id, v_req.reason, null,
      jsonb_build_object('request_id', v_req.id, 'requested_by', v_req.requested_by,
                         'approved_by', v_actor, 'reason', v_req.reason, 'evidence', v_req.evidence),
      v_req.credit_class, null, null);
    update public.noc_adjustment_requests
       set status = 'applied', decided_by = v_actor, decided_at = now(), decision_note = p_note, transaction_id = v_txn.id
     where id = v_req.id returning * into v_req;
  else
    update public.noc_adjustment_requests
       set status = 'rejected', decided_by = v_actor, decided_at = now(), decision_note = p_note
     where id = v_req.id returning * into v_req;
  end if;
  return v_req;
end $$;

revoke all on function public.noc_admin_request_adjustment(uuid, public.noc_credit_class, integer, text, text) from public, anon;
revoke all on function public.noc_admin_decide_adjustment(uuid, boolean, text) from public, anon;
grant execute on function public.noc_admin_request_adjustment(uuid, public.noc_credit_class, integer, text, text) to authenticated;
grant execute on function public.noc_admin_decide_adjustment(uuid, boolean, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- ADMIN CONFIG — markets, launch, approvals, programme
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.noc_admin_update_market(
  p_code text, p_minor_per_noc bigint default null, p_enabled boolean default null, p_rate_note text default null)
returns public.noc_markets
language plpgsql
security definer
set search_path = public
as $$
declare v_actor uuid := public.noc_require_admin(); v_row public.noc_markets;
begin
  update public.noc_markets
     set minor_per_noc = coalesce(p_minor_per_noc, minor_per_noc),
         enabled = coalesce(p_enabled, enabled),
         rate_note = coalesce(p_rate_note, rate_note),
         purchase_mode = case when coalesce(p_enabled, enabled) then purchase_mode else 'off' end,
         updated_by = v_actor
   where code = p_code returning * into v_row;
  if not found then raise exception 'No market %.', p_code using errcode = 'no_data_found'; end if;
  return v_row;
end $$;

create or replace function public.noc_admin_record_approval(
  p_scope text, p_market text, p_approver_name text, p_approver_role text, p_document_ref text, p_notes text default null)
returns public.noc_compliance_approvals
language plpgsql
security definer
set search_path = public
as $$
declare v_actor uuid := public.noc_require_admin(); v_row public.noc_compliance_approvals;
begin
  insert into public.noc_compliance_approvals
    (scope, market, approver_name, approver_role, document_ref, notes, recorded_by)
  values (p_scope, p_market, p_approver_name, p_approver_role, p_document_ref, p_notes, v_actor)
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.noc_admin_revoke_approval(p_id uuid, p_reason text)
returns public.noc_compliance_approvals
language plpgsql
security definer
set search_path = public
as $$
declare v_actor uuid := public.noc_require_admin(); v_row public.noc_compliance_approvals;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Say why the approval is revoked.' using errcode = 'check_violation';
  end if;
  update public.noc_compliance_approvals
     set revoked_at = now(), revoked_by = v_actor, revoke_reason = p_reason
   where id = p_id returning * into v_row;
  if not found then raise exception 'No such approval.' using errcode = 'no_data_found'; end if;
  return v_row;
end $$;

-- 'live' additionally needs the approval id; the table trigger checks it.
create or replace function public.noc_admin_set_purchase_mode(p_market text, p_mode text, p_approval uuid default null)
returns public.noc_markets
language plpgsql
security definer
set search_path = public
as $$
declare v_actor uuid := public.noc_require_admin(); v_row public.noc_markets;
begin
  if p_mode not in ('off', 'sandbox', 'live') then
    raise exception 'Mode must be off, sandbox or live.' using errcode = 'check_violation';
  end if;
  update public.noc_markets
     set purchase_mode = p_mode,
         launch_approval_id = case when p_mode = 'live' then p_approval else null end,
         updated_by = v_actor
   where code = p_market returning * into v_row;
  if not found then raise exception 'No market %.', p_market using errcode = 'no_data_found'; end if;
  return v_row;
end $$;

create or replace function public.noc_admin_update_programme(
  p_rewards_enabled boolean default null,
  p_settlement_enabled boolean default null,
  p_spend_order public.noc_credit_class[] default null,
  p_require_distinct_approver boolean default null)
returns public.noc_programme
language plpgsql
security definer
set search_path = public
as $$
declare v_actor uuid := public.noc_require_admin(); v_row public.noc_programme;
begin
  update public.noc_programme
     set rewards_enabled = coalesce(p_rewards_enabled, rewards_enabled),
         settlement_enabled = coalesce(p_settlement_enabled, settlement_enabled),
         spend_order = coalesce(p_spend_order, spend_order),
         adjustment_require_distinct_approver = coalesce(p_require_distinct_approver, adjustment_require_distinct_approver),
         updated_by = v_actor
   where id returning * into v_row;
  return v_row;
end $$;

revoke all on function public.noc_admin_update_market(text, bigint, boolean, text) from public, anon;
revoke all on function public.noc_admin_record_approval(text, text, text, text, text, text) from public, anon;
revoke all on function public.noc_admin_revoke_approval(uuid, text) from public, anon;
revoke all on function public.noc_admin_set_purchase_mode(text, text, uuid) from public, anon;
revoke all on function public.noc_admin_update_programme(boolean, boolean, public.noc_credit_class[], boolean) from public, anon;
grant execute on function public.noc_admin_update_market(text, bigint, boolean, text) to authenticated;
grant execute on function public.noc_admin_record_approval(text, text, text, text, text, text) to authenticated;
grant execute on function public.noc_admin_revoke_approval(uuid, text) to authenticated;
grant execute on function public.noc_admin_set_purchase_mode(text, text, uuid) to authenticated;
grant execute on function public.noc_admin_update_programme(boolean, boolean, public.noc_credit_class[], boolean) to authenticated;

-- Reward rules: admins edit through the table (RLS) — the audit trigger
-- records who. Amount NULL stays "refused".
drop policy if exists noc_reward_rules_admin on public.noc_reward_rules;
create policy noc_reward_rules_admin on public.noc_reward_rules for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant update on public.noc_reward_rules to authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- ADMIN READS
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.noc_admin_wallet(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_actor uuid := public.noc_require_admin(); v_classes jsonb;
begin
  select coalesce(jsonb_object_agg(c::text, public.noc_class_balance(p_user, c)), '{}'::jsonb)
    into v_classes from unnest(enum_range(null::public.noc_credit_class)) c;
  return jsonb_build_object(
    'user', (select jsonb_build_object('id', u.id, 'email', u.email, 'name', u.name, 'plan', u.plan)
               from public.users u where u.id = p_user),
    'balance', coalesce((select balance from public.credit_wallets where user_id = p_user), 0),
    'available', public.credit_available(p_user),
    'classes', v_classes,
    'transactions', coalesce((select jsonb_agg(t order by t.created_at desc) from (
        select ct.id, ct.type, ct.amount, ct.balance_after, ct.source, ct.reference, ct.description,
               ct.created_at, ct.price_snapshot, ct.rate_snapshot,
               (select jsonb_agg(jsonb_build_object('class', l.credit_class, 'amount', l.amount))
                  from public.noc_ledger_lines l join public.noc_accounts a on a.id = l.account_id
                 where l.transaction_id = ct.id and a.kind = 'wallet') as lines
          from public.credit_transactions ct where ct.user_id = p_user
         order by ct.created_at desc limit 100) t), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(o order by o.created_at desc)
                          from public.noc_purchase_orders o where o.user_id = p_user), '[]'::jsonb),
    'adjustments', coalesce((select jsonb_agg(r order by r.requested_at desc)
                               from public.noc_adjustment_requests r where r.user_id = p_user), '[]'::jsonb));
end $$;

revoke all on function public.noc_admin_wallet(uuid) from public, anon;
grant execute on function public.noc_admin_wallet(uuid) to authenticated;

create or replace function public.noc_admin_find_users(p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_actor uuid := public.noc_require_admin();
begin
  return coalesce((select jsonb_agg(x) from (
    select u.id, u.email, u.name as name, u.plan, coalesce(w.balance, 0) as balance
      from public.users u left join public.credit_wallets w on w.user_id = u.id
     where p_query is not null and length(btrim(p_query)) >= 2
       and (u.email ilike '%' || btrim(p_query) || '%' or u.name ilike '%' || btrim(p_query) || '%')
     order by u.email limit 20) x), '[]'::jsonb);
end $$;

revoke all on function public.noc_admin_find_users(text) from public, anon;
grant execute on function public.noc_admin_find_users(text) to authenticated;

/*
 * The four numbers finance asks for, kept apart:
 *   CASH        money received for NOC (live), from verified orders; test
 *               payments shown separately and never added in.
 *   ISSUANCE    NOC created, by class (bought, included, promotional,
 *               reward), plus adjustments.
 *   REDEMPTION  NOC spent, by class and by pillar, net of usage refunds.
 *   REVENUE     redeemed PURCHASED NOC × the average live price per NOC
 *               (cash ÷ purchased NOC issued, all time). Free classes earn
 *               no revenue. Stated as an estimate because a NOC is not
 *               traced to the pack it came from.
 * Plus the outstanding liability: purchased NOC not yet spent.
 */
create or replace function public.noc_admin_report(p_from timestamptz default null, p_to timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.noc_require_admin();
  v_from timestamptz := coalesce(p_from, '-infinity'::timestamptz);
  v_to   timestamptz := coalesce(p_to, 'infinity'::timestamptz);
  v_cash jsonb; v_issue jsonb; v_redeem jsonb; v_pillar jsonb; v_other jsonb;
  v_live_cash numeric; v_live_noc numeric; v_avg numeric; v_redeemed_purchased numeric;
  v_outstanding jsonb;
begin
  select jsonb_build_object(
    'live_received_minor', coalesce(sum(paid_minor) filter (where status in ('fulfilled','refunded') and provider_domain = 'live'), 0),
    'live_orders', count(*) filter (where status in ('fulfilled','refunded') and provider_domain = 'live'),
    'live_refunded_orders', count(*) filter (where status = 'refunded' and provider_domain = 'live'),
    'live_refunded_minor', coalesce(sum(price_minor) filter (where status = 'refunded' and provider_domain = 'live'), 0),
    'test_received_minor', coalesce(sum(paid_minor) filter (where status in ('fulfilled','refunded') and provider_domain = 'test'), 0),
    'test_orders', count(*) filter (where status in ('fulfilled','refunded') and provider_domain = 'test'),
    'mismatched_orders', count(*) filter (where status = 'mismatch'),
    'open_orders', count(*) filter (where status = 'initiated'),
    'currency', 'NGN')
    into v_cash
    from public.noc_purchase_orders
   where coalesce(paid_at, created_at) >= v_from and coalesce(paid_at, created_at) < v_to;

  select coalesce(jsonb_object_agg(k, s), '{}'::jsonb) into v_issue from (
    select (t.type::text || ':' || l.credit_class::text) k, sum(l.amount) s
      from public.noc_ledger_lines l
      join public.noc_accounts a on a.id = l.account_id and a.kind = 'wallet'
      join public.credit_transactions t on t.id = l.transaction_id
     where t.type in ('purchase','subscription_grant','promotional_grant','admin_adjustment')
       and t.created_at >= v_from and t.created_at < v_to
     group by 1) x;

  select coalesce(jsonb_object_agg(k, s), '{}'::jsonb) into v_redeem from (
    select l.credit_class::text k, -sum(l.amount) s
      from public.noc_ledger_lines l
      join public.noc_accounts a on a.id = l.account_id and a.kind = 'wallet'
      join public.credit_transactions t on t.id = l.transaction_id
     where t.type in ('usage','refund') and t.created_at >= v_from and t.created_at < v_to
     group by 1) x;

  select coalesce(jsonb_object_agg(k, s), '{}'::jsonb) into v_pillar from (
    select coalesce(t.price_snapshot ->> 'pillar', ca.pillar, 'unknown') k, -sum(t.amount) s
      from public.credit_transactions t
      left join public.credit_actions ca on ca.slug = t.source
     where t.type in ('usage','refund') and t.created_at >= v_from and t.created_at < v_to
     group by 1) x;

  select coalesce(jsonb_object_agg(k, s), '{}'::jsonb) into v_other from (
    select (t.type::text || ':' || l.credit_class::text) k, sum(l.amount) s
      from public.noc_ledger_lines l
      join public.noc_accounts a on a.id = l.account_id and a.kind = 'wallet'
      join public.credit_transactions t on t.id = l.transaction_id
     where t.type in ('expiration','reversal') and t.created_at >= v_from and t.created_at < v_to
     group by 1) x;

  -- Average live price per purchased NOC, all time.
  select coalesce(sum(o.paid_minor), 0), coalesce(sum(o.credits + o.bonus_credits), 0)
    into v_live_cash, v_live_noc
    from public.noc_purchase_orders o
   where o.status in ('fulfilled','refunded') and o.provider_domain = 'live';
  v_avg := case when v_live_noc > 0 then v_live_cash / v_live_noc else null end;
  v_redeemed_purchased := coalesce((v_redeem ->> 'purchased')::numeric, 0);

  select coalesce(jsonb_object_agg(a.credit_class::text, s), '{}'::jsonb) into v_outstanding from (
    select a.credit_class, sum(l.amount) s
      from public.noc_ledger_lines l join public.noc_accounts a on a.id = l.account_id and a.kind = 'wallet'
     group by a.credit_class) a;

  return jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'cash', v_cash,
    'issuance', v_issue,
    'redemption', jsonb_build_object('by_class', v_redeem, 'by_pillar', v_pillar),
    'expiry_and_reversals', v_other,
    'revenue', jsonb_build_object(
      'recognised_minor', case when v_avg is null then 0 else round(v_redeemed_purchased * v_avg) end,
      'avg_minor_per_purchased_noc', round(v_avg, 4),
      'basis', case when v_avg is null
        then 'No live purchases yet, so no NOC revenue. Allowance, promotional, reward and sandbox redemptions earn none.'
        else 'Redeemed purchased NOC × average live price per purchased NOC (estimate).' end),
    'outstanding', jsonb_build_object(
      'by_class', v_outstanding,
      'purchased_liability_minor', case when v_avg is null then 0
        else round(coalesce((v_outstanding ->> 'purchased')::numeric, 0) * v_avg) end),
    'integrity', jsonb_build_object(
      'unbalanced_entries', (select count(*) from (select transaction_id from public.noc_ledger_lines
                                                    group by transaction_id having sum(amount) <> 0) z),
      'wallets_off_ledger', (select count(*) from public.credit_wallets w
                              where w.balance <> (select coalesce(sum(l.amount), 0) from public.noc_ledger_lines l
                                                   join public.noc_accounts a on a.id = l.account_id
                                                  where a.kind = 'wallet' and a.user_id = w.user_id)),
      'paid_not_fulfilled', (select count(*) from public.noc_purchase_orders o
                               join public.payment_intents pi on pi.reference = o.reference
                              where pi.status = 'paid' and o.status <> 'fulfilled' and o.status <> 'refunded')));
end $$;

revoke all on function public.noc_admin_report(timestamptz, timestamptz) from public, anon;
grant execute on function public.noc_admin_report(timestamptz, timestamptz) to authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- MEDIA-OWNER SETTLEMENT — built, switched OFF
-- ════════════════════════════════════════════════════════════════════════
--
-- When a business spends NOC on a third-party billboard, part of the value
-- belongs to the media owner. These tables accrue that share and batch it
-- for payout. Nothing here moves money: a payout is a person paying a
-- partner and recording the reference.
--
-- OFF twice over: noc_programme.settlement_enabled is false, and it cannot
-- become true without a recorded settlement approval (noc_programme_guard).
-- Every function below refuses while it is off.

create table if not exists public.noc_settlement_agreements (
  id                uuid primary key default gen_random_uuid(),
  media_owner_id    uuid not null references public.media_owners(id) on delete restrict,
  -- Basis points of the redeemed NOC face value owed to the owner. NULL =
  -- not agreed = nothing accrues.
  revenue_share_bps integer check (revenue_share_bps is null or revenue_share_bps between 0 and 10000),
  currency          text not null default 'NGN',
  payout_reference  text,
  status            text not null default 'draft' check (status in ('draft', 'active', 'suspended', 'ended')),
  contract_ref      text,
  created_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  approved_by       uuid references public.users(id) on delete set null,
  approved_at       timestamptz
);

create table if not exists public.noc_settlement_batches (
  id              uuid primary key default gen_random_uuid(),
  agreement_id    uuid not null references public.noc_settlement_agreements(id) on delete restrict,
  period_start    date not null,
  period_end      date not null,
  total_minor     bigint not null default 0,
  status          text not null default 'draft' check (status in ('draft', 'approved', 'paid', 'void')),
  approved_by     uuid references public.users(id) on delete set null,
  approved_at     timestamptz,
  paid_reference  text,
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  check (period_end >= period_start)
);

create table if not exists public.noc_settlement_accruals (
  id              uuid primary key default gen_random_uuid(),
  agreement_id    uuid not null references public.noc_settlement_agreements(id) on delete restrict,
  transaction_id  uuid not null unique references public.credit_transactions(id) on delete restrict,
  noc_amount      integer not null check (noc_amount > 0),
  gross_minor     bigint not null check (gross_minor >= 0),
  share_bps       integer not null check (share_bps between 0 and 10000),
  owner_minor     bigint not null check (owner_minor >= 0),
  status          text not null default 'accrued' check (status in ('accrued', 'batched', 'paid', 'void')),
  batch_id        uuid references public.noc_settlement_batches(id),
  created_at      timestamptz not null default now()
);

alter table public.noc_settlement_agreements enable row level security;
alter table public.noc_settlement_batches    enable row level security;
alter table public.noc_settlement_accruals   enable row level security;
drop policy if exists noc_settlement_agreements_admin on public.noc_settlement_agreements;
create policy noc_settlement_agreements_admin on public.noc_settlement_agreements for select to authenticated using (public.is_admin());
drop policy if exists noc_settlement_batches_admin on public.noc_settlement_batches;
create policy noc_settlement_batches_admin on public.noc_settlement_batches for select to authenticated using (public.is_admin());
drop policy if exists noc_settlement_accruals_admin on public.noc_settlement_accruals;
create policy noc_settlement_accruals_admin on public.noc_settlement_accruals for select to authenticated using (public.is_admin());
grant select on public.noc_settlement_agreements, public.noc_settlement_batches, public.noc_settlement_accruals to authenticated;

create or replace function public.noc_settlement_require_on()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce((select settlement_enabled from public.noc_programme where id), false) then
    raise exception 'Media-owner settlement is switched off. It needs a recorded settlement approval before it can be enabled.'
      using errcode = 'feature_not_supported';
  end if;
end $$;
revoke all on function public.noc_settlement_require_on() from public, anon, authenticated;

-- Accrue the owner's share of one usage entry (called when a NOC spend on a
-- third-party placement settles).
create or replace function public.noc_settlement_accrue(p_txn uuid, p_agreement uuid)
returns public.noc_settlement_accruals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agr public.noc_settlement_agreements;
  v_txn public.credit_transactions;
  v_row public.noc_settlement_accruals;
  v_gross bigint;
begin
  perform public.noc_settlement_require_on();
  if auth.role() <> 'service_role' and not public.is_admin() then
    raise exception 'Settlement accrues server-side only.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_agr from public.noc_settlement_agreements where id = p_agreement;
  if not found or v_agr.status <> 'active' or v_agr.revenue_share_bps is null then
    raise exception 'That agreement is not active with an agreed share.' using errcode = 'restrict_violation';
  end if;
  select * into v_txn from public.credit_transactions where id = p_txn;
  if not found or v_txn.type <> 'usage' then
    raise exception 'Only a usage entry accrues settlement.' using errcode = 'restrict_violation';
  end if;
  v_gross := abs(v_txn.amount) * coalesce((v_txn.rate_snapshot ->> 'minor_per_noc')::bigint, 0);
  insert into public.noc_settlement_accruals
    (agreement_id, transaction_id, noc_amount, gross_minor, share_bps, owner_minor)
  values (p_agreement, p_txn, abs(v_txn.amount), v_gross, v_agr.revenue_share_bps,
          (v_gross * v_agr.revenue_share_bps) / 10000)
  on conflict (transaction_id) do nothing
  returning * into v_row;
  if v_row.id is null then
    select * into v_row from public.noc_settlement_accruals where transaction_id = p_txn;
  end if;
  return v_row;
end $$;

create or replace function public.noc_admin_settlement_batch(p_agreement uuid, p_start date, p_end date)
returns public.noc_settlement_batches
language plpgsql
security definer
set search_path = public
as $$
declare v_actor uuid := public.noc_require_admin(); v_row public.noc_settlement_batches;
begin
  perform public.noc_settlement_require_on();
  insert into public.noc_settlement_batches (agreement_id, period_start, period_end)
  values (p_agreement, p_start, p_end) returning * into v_row;
  update public.noc_settlement_accruals
     set status = 'batched', batch_id = v_row.id
   where agreement_id = p_agreement and status = 'accrued'
     and (created_at at time zone 'Africa/Lagos')::date between p_start and p_end;
  update public.noc_settlement_batches
     set total_minor = (select coalesce(sum(owner_minor), 0) from public.noc_settlement_accruals where batch_id = v_row.id)
   where id = v_row.id returning * into v_row;
  return v_row;
end $$;

revoke all on function public.noc_settlement_accrue(uuid, uuid) from public, anon, authenticated;
grant execute on function public.noc_settlement_accrue(uuid, uuid) to service_role;
revoke all on function public.noc_admin_settlement_batch(uuid, date, date) from public, anon;
grant execute on function public.noc_admin_settlement_batch(uuid, date, date) to authenticated;

-- ── Self-check ───────────────────────────────────────────────────────────
do $check$
declare n integer;
begin
  select count(*) into n from public.noc_reward_rules where enabled or amount is not null;
  assert n = 0, 'reward rules must ship off and unpriced';
  assert not (select settlement_enabled from public.noc_programme where id), 'settlement must ship off';
  assert not (select rewards_enabled from public.noc_programme where id), 'rewards must ship off';
end $check$;
