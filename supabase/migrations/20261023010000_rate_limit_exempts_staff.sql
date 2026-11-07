/*
  # A signed-in admin running an admin tool is not a member of the public

  MEASURED 2026-10-09 on the live buckets:

    scope             window_start        hits
    radar_candidate   2026-10-09 11:00    40   ← ceiling
    radar_candidate   2026-10-09 13:00    40   ← ceiling

  Twice in one afternoon, an operator running the Instagram batch extractor in
  the admin console was cut off with

    "Too many submissions from this connection. Please wait a little and try
     again, or contact us if you need to add several at once."

  — which is addressed to a stranger pasting spam into a public form, and was
  being shown to the person who runs the platform, using the tool built for
  exactly this. The batch can be handed 1,000 handles; the database stopped it
  at 40 an hour. "Contact us" is, in this case, themselves.

  ── WHAT CHANGES, AND WHAT DELIBERATELY DOES NOT ──────────────────────────

  The ONLY change is one branch: `is_staff()` returns without counting.

  The nine public ceilings are untouched. They are what stops an anonymous
  script filling `radar_candidates`, and nothing here weakens them: an
  anonymous caller, and an ordinary signed-in user, are both still counted and
  still stopped. The threat model was never "an admin doing their job".

  ── WHY is_staff() IS SAFE HERE, WHEN current_user WOULD NOT BE ───────────

  `is_staff()` resolves `auth.uid()` — the subject of the caller's JWT —
  against `public.users.role`. It cannot be reached by an anonymous caller,
  who has no uid, and it cannot be spoofed without a signed token.

  `current_user` would be catastrophic for the same purpose: this is a
  SECURITY DEFINER function, so `current_user` is the OWNER for every caller,
  and a guard on it would exempt the entire world and silently remove rate
  limiting from nine public tables. That is a trap this codebase has already
  met once; the existing service_role branch guards on auth.role() for the
  same reason.

  Narrower than "any authenticated user" on purpose: a logged-in visitor
  filing business reports is still public for this purpose. Staff means
  role IN ('admin', 'editor'), which is the set that can reach the admin
  console at all.

  The body below is the live definition copied whole; only the staff branch
  is added.
*/

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
   * auth.role(), never current_user: this is a SECURITY DEFINER function, so
   * current_user is the owner for every caller and guarding on it would
   * exempt the entire world and silently remove rate limiting from nine
   * public tables.
   */
  if auth.role() = 'service_role' then
    return;
  end if;

  /*
   * NEITHER IS A SIGNED-IN MEMBER OF STAFF.
   *
   * THE ONLY LINE THIS MIGRATION ADDS. Someone operating the admin console is
   * doing deliberate, attributable work with tools built for volume -- a
   * 1,000-handle Instagram batch is a legitimate afternoon, not an attack.
   *
   * is_staff() reads auth.uid() from the caller's JWT, so an anonymous caller
   * can never satisfy it. Ordinary signed-in users are NOT exempt.
   */
  if public.is_staff() then
    return;
  end if;

  -- The first address in x-forwarded-for is the client; the rest are proxies.
  v_addr := split_part(
    coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''),
    ',', 1);
  v_addr := nullif(btrim(v_addr), '');

  if v_addr is null then
    return;   -- unidentifiable caller: fail open rather than block everyone.
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
