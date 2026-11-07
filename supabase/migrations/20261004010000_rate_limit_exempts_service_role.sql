-- The discovery worker was throttling itself.
--
-- ── MEASURED 2026-09-23 ──────────────────────────────────────────────────
--
-- First real discovery run, against Wikidata:
--
--   rowsRead  215
--   staged     40
--   error     "Too many submissions from this connection. Please wait a
--              little and try again, or contact us if you need to add
--              several at once."
--
-- That message is NowOpen's own anti-abuse limiter, written for anonymous
-- public submissions — somebody pasting into /add-business fifty times. The
-- discovery worker is not that. It is our own server-side automation holding
-- the service-role key, running on a schedule we set, staging into a review
-- queue a human still has to approve.
--
-- Because the limiter keys on x-forwarded-for and the worker has an address
-- like anybody else, it counted our automation as a stranger and refused 175
-- of 215 records. Worse, it did so *quietly enough to look like success*: the
-- run reported `ok: true` and `partially_succeeded`, so the only evidence was
-- a health string nobody had to read.
--
-- ── WHY auth.role(), NOT current_user ────────────────────────────────────
--
-- This is a SECURITY DEFINER function, so `current_user` is the function's
-- OWNER — postgres — for every caller, anonymous ones included. Guarding on it
-- would exempt everybody and silently remove the limiter from all nine public
-- tables. `auth.role()` reads the verified JWT claim, which is what actually
-- distinguishes the caller.
--
-- ── WHAT IS DELIBERATELY NOT EXEMPTED ────────────────────────────────────
--
-- `anon` and `authenticated` stay limited exactly as before. The service-role
-- key never reaches a browser — it lives only in edge function environments —
-- so exempting it widens nothing a visitor can reach. If that key ever leaks,
-- a rate limit is not the control that saves us.

--
-- ── A NOTE ON HOW THIS MIGRATION WAS WRITTEN ─────────────────────────────
--
-- The first draft of this file reconstructed the function's tail from a
-- truncated read and invented a table called `rate_limit_hits`. The real one
-- is `rate_limit_buckets`, and the window maths differed too. Applying it
-- would have created cleanly and then failed on the first insert — taking out
-- anonymous writes on all nine rate-limited tables, with the same signature as
-- the pgcrypto bug the comments below already record.
--
-- The body beneath is the live definition, copied whole. The ONLY change is
-- the service_role exemption at the top.

create or replace function public.check_rate_limit(
  p_scope text,
  p_max integer,
  p_window interval default '01:00:00'::interval
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_addr    text;
  v_salt    text;
  v_subject text;
  v_start   timestamptz;
  v_hits    integer;
begin
  /*
   * OUR OWN AUTOMATION IS NOT A MEMBER OF THE PUBLIC.
   *
   * THE ONLY LINE THIS MIGRATION ADDS. auth.role(), never current_user: this
   * is a SECURITY DEFINER function, so current_user is the owner for every
   * caller and guarding on it would exempt the entire world and silently
   * remove rate limiting from nine public tables.
   */
  if auth.role() = 'service_role' then
    return;
  end if;

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
$function$;
