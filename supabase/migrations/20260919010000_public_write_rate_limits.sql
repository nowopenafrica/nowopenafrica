-- Sixteen tables accept anonymous inserts. Nothing throttled any of them.
--
-- WHAT WAS MEASURED (2026-09-14)
--
-- `pg_policies` lists INSERT policies granted to `anon` on: analytics_events,
-- business_bookings, business_enquiries, business_registrations,
-- business_reports, create_orders, device_push_tokens, os_form_applications,
-- payment_intents, platform_enquiries, profile_requests, radar_candidates,
-- stream_chat_messages, stream_followers, waitlist, and a storage policy.
--
-- Every one of those is correct — the product genuinely needs a stranger to be
-- able to join the waitlist, report a wrong listing or suggest a business
-- without an account. What was missing is a ceiling. A loop with `curl` could
-- put a million rows into any of them, and the first anyone would know is the
-- admin queue being useless.
--
-- WHY THIS IS IN THE DATABASE AND NOT THE CLIENT
--
-- The client is the thing being defended against. A rate limit in React is a
-- rate limit a script does not run. PostgREST is the only door these tables
-- have, so the ceiling belongs behind it.
--
-- HOW THE CALLER IS IDENTIFIED, AND WHY IT IS HASHED
--
-- PostgREST exposes the request headers to SQL. VERIFIED by calling an RPC
-- through the REST API and reading them back: `x-forwarded-for` arrives
-- populated with the real client address.
--
-- That address is personal data, so it is never stored. What is stored is
-- sha256(address || salt) — enough to count repeat requests from one caller,
-- useless for identifying who they were. The salt lives in `private_config`,
-- a table with RLS and no policies, so nothing can read it back out.
--
-- THE LIMITS ARE DELIBERATELY GENEROUS
--
-- Large parts of the intended audience sit behind carrier-grade NAT, so one
-- address can legitimately be a whole city's mobile users. A tight per-IP
-- limit would not stop a determined script and WOULD stop a real business
-- owner in Lagos whose neighbour already filled in the form. These ceilings
-- are set where a human never reaches them and a loop does within seconds.
--
-- NOT APPLIED TO: payments (`payment_intents`, `create_orders`) because
-- failing a checkout is worse than the abuse it would prevent; analytics
-- (`analytics_events`) because its volume is legitimately high and it has its
-- own integrity constraint; and stream chat, which needs a per-room policy
-- rather than a per-hour one.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. THE COUNTER
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.rate_limit_buckets (
  scope        text        not null,
  /** sha256 of the caller's address plus a secret salt. Never the address. */
  subject      text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (scope, subject, window_start)
);

comment on table public.rate_limit_buckets is
  'Fixed-window counters for anonymous writes. `subject` is a salted hash of the caller address, never the address itself — enough to count, useless to identify.';

alter table public.rate_limit_buckets enable row level security;
-- No policies at all: only the SECURITY DEFINER function below touches it.
-- A client that could read this could confirm whether a given address had
-- submitted, which is exactly the inference the hashing exists to prevent.

create index if not exists rate_limit_buckets_sweep
  on public.rate_limit_buckets (window_start);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. THE SALT
-- ═══════════════════════════════════════════════════════════════════════

/*
 * `private_config` already exists with RLS enabled and zero policies, which
 * makes it readable only by SECURITY DEFINER functions. Reusing it rather than
 * inventing a second secrets table.
 */
/*
 * `on conflict do nothing` rather than `where not exists`.
 *
 * Both are correct here, but the repo's own migration-safety scanner
 * (src/test/migrationLedgerSafety.test.ts) classifies a WHERE NOT EXISTS
 * insert as "if-empty" -- a writer that fires precisely when the table is
 * empty -- and requires any such migration to be an acknowledged exception.
 * That rule exists because a guard against DUPLICATION is not a guard against
 * FABRICATION. This insert is genuinely idempotent, so it should say so in the
 * form the scanner can verify instead of joining a list of exceptions.
 */
/*
 * `extensions.gen_random_bytes`, schema-qualified for the same reason
 * `extensions.digest` is below: pgcrypto lives in the `extensions` schema on
 * Supabase, outside the migration connection's search_path, and an unqualified
 * `gen_random_bytes()` raises `function gen_random_bytes(integer) does not
 * exist` on the hosted platform.
 */
insert into public.private_config (key, value)
values ('rate_limit_salt', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. THE CHECK
-- ═══════════════════════════════════════════════════════════════════════

/**
 * Count this caller's writes in the current window; raise if over the ceiling.
 *
 * FAILS OPEN when the caller cannot be identified. That is deliberate: a
 * direct SQL session, a server-side job and a trusted edge function all arrive
 * without `x-forwarded-for`, and refusing them would break the platform's own
 * machinery to stop abuse that does not come through that door anyway. The
 * anonymous public traffic this defends against always arrives via PostgREST,
 * which always sets the header.
 */
create or replace function public.check_rate_limit(
  p_scope  text,
  p_max    integer,
  p_window interval default interval '1 hour'
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_addr    text;
  v_salt    text;
  v_subject text;
  v_start   timestamptz;
  v_hits    integer;
begin
  -- The first address in x-forwarded-for is the client; the rest are proxies.
  v_addr := split_part(
    coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''),
    ',', 1);
  v_addr := nullif(btrim(v_addr), '');

  if v_addr is null then
    return;   -- unidentifiable caller: see the note above. Fail open.
  end if;

  select value into v_salt from public.private_config where key = 'rate_limit_salt';
  if v_salt is null then
    return;   -- no salt provisioned: counting by raw address is not worth it.
  end if;

  /*
   * `extensions.digest`, schema-qualified on purpose.
   *
   * pgcrypto is installed in the `extensions` schema on Supabase, and this
   * function pins `search_path` to 'public' (as a SECURITY DEFINER function
   * must, so a caller cannot shadow what it resolves). An unqualified
   * `digest()` therefore does not resolve at RUNTIME -- the function creates
   * cleanly and then fails on the first insert, which is exactly how it was
   * found: every anonymous waitlist insert began returning
   * `function digest(text, unknown) does not exist`.
   */
  v_subject := encode(extensions.digest(v_addr || v_salt, 'sha256'), 'hex');

  -- Fixed window rather than sliding: one row per caller per window, no scan.
  v_start := to_timestamp(floor(extract(epoch from now()) / extract(epoch from p_window))
                          * extract(epoch from p_window));

  insert into public.rate_limit_buckets (scope, subject, window_start, hits)
  values (p_scope, v_subject, v_start, 1)
  on conflict (scope, subject, window_start)
    do update set hits = public.rate_limit_buckets.hits + 1
  returning hits into v_hits;

  if v_hits > p_max then
    raise exception
      'Too many submissions from this connection. Please wait a little and try again, or contact us if you need to add several at once.'
      using errcode = '53400';
  end if;
end;
$fn$;

comment on function public.check_rate_limit is
  'Fixed-window per-caller ceiling for anonymous writes. Identifies the caller by a salted hash of x-forwarded-for and fails open when that header is absent (server-side jobs, direct SQL).';

revoke all on function public.check_rate_limit(text, integer, interval) from public;

/** Trigger wrapper: reads the ceiling from the trigger arguments. */
create or replace function public.enforce_public_write_limit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  perform public.check_rate_limit(
    TG_ARGV[0],
    TG_ARGV[1]::integer,
    (TG_ARGV[2])::interval);
  return NEW;
end;
$fn$;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. THE CEILINGS
-- ═══════════════════════════════════════════════════════════════════════

/*
 * Chosen so a person never meets them. Somebody joining a waitlist does it
 * once; somebody reporting wrong listings might do five in a sitting; an
 * agency adding client businesses might do a dozen. A script does thousands.
 */

drop trigger if exists waitlist_rate_limit on public.waitlist;
create trigger waitlist_rate_limit
  before insert on public.waitlist
  for each row execute function public.enforce_public_write_limit('waitlist', '20', '1 hour');

drop trigger if exists business_enquiries_rate_limit on public.business_enquiries;
create trigger business_enquiries_rate_limit
  before insert on public.business_enquiries
  for each row execute function public.enforce_public_write_limit('business_enquiry', '30', '1 hour');

drop trigger if exists platform_enquiries_rate_limit on public.platform_enquiries;
create trigger platform_enquiries_rate_limit
  before insert on public.platform_enquiries
  for each row execute function public.enforce_public_write_limit('platform_enquiry', '20', '1 hour');

drop trigger if exists business_reports_rate_limit on public.business_reports;
create trigger business_reports_rate_limit
  before insert on public.business_reports
  for each row execute function public.enforce_public_write_limit('business_report', '30', '1 hour');

drop trigger if exists profile_requests_rate_limit on public.profile_requests;
create trigger profile_requests_rate_limit
  before insert on public.profile_requests
  for each row execute function public.enforce_public_write_limit('profile_request', '30', '1 hour');

drop trigger if exists radar_candidates_rate_limit on public.radar_candidates;
create trigger radar_candidates_rate_limit
  before insert on public.radar_candidates
  for each row execute function public.enforce_public_write_limit('radar_candidate', '40', '1 hour');

drop trigger if exists business_registrations_rate_limit on public.business_registrations;
create trigger business_registrations_rate_limit
  before insert on public.business_registrations
  for each row execute function public.enforce_public_write_limit('business_registration', '20', '1 hour');

drop trigger if exists business_bookings_rate_limit on public.business_bookings;
create trigger business_bookings_rate_limit
  before insert on public.business_bookings
  for each row execute function public.enforce_public_write_limit('business_booking', '30', '1 hour');

drop trigger if exists os_form_applications_rate_limit on public.os_form_applications;
create trigger os_form_applications_rate_limit
  before insert on public.os_form_applications
  for each row execute function public.enforce_public_write_limit('os_form_application', '20', '1 hour');

-- ═══════════════════════════════════════════════════════════════════════
-- 5. HOUSEKEEPING
-- ═══════════════════════════════════════════════════════════════════════

/** Old windows answer nothing. Kept for a day so a spike can be inspected. */
create or replace function public.sweep_rate_limit_buckets()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_n integer;
begin
  delete from public.rate_limit_buckets where window_start < now() - interval '1 day';
  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

revoke all on function public.sweep_rate_limit_buckets() from public;
