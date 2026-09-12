-- ClaimReach §22 — make the suppression check fail CLOSED, and answerable in one call.
--
-- TWO PROBLEMS WITH THE FUNCTION SHIPPED IN 20260908160000, FOUND WHILE
-- BUILDING THE DRY RUN THAT USES IT.
--
-- 1. IT FAILED OPEN.
--
--    `claimreach_is_suppressed` was SECURITY INVOKER over a table whose RLS
--    policy admits staff only. So the answer depended on who asked:
--
--      staff          sees the rows  →  correct answer
--      service_role   bypasses RLS   →  correct answer
--      anon / a signed-in customer   →  sees no rows → ALWAYS FALSE
--
--    False means "not suppressed, go ahead". A future caller — an edge
--    function using the anon key, a client-side check, a worker somebody
--    writes next year — would be told that every person who opted out is
--    contactable, and the check would look like it was working. This is the
--    worst failure shape available to a consent mechanism: silent, plausible,
--    and wrong in the direction that reaches a real person's phone.
--
--    Fixed by making it SECURITY DEFINER (so the answer never depends on the
--    caller's visibility) and then REFUSING a caller who has no business
--    asking. A web caller must be staff; a non-web role — service_role, or a
--    person in the SQL editor — is trusted, because it already bypasses RLS
--    everywhere else and pretending otherwise buys nothing.
--
--    The refusal is deliberately an exception rather than a false: a caller
--    who cannot get an answer must fail, not proceed. §28's gate treats
--    "unknown" as a blocker for exactly the same reason.
--
--    WHO THE CALLER IS, read from the JWT and NOT from `current_user`.
--    Inside a SECURITY DEFINER function `current_user` is the function's
--    OWNER, so a guard written against it is always satisfied — the first
--    version of this migration used it and, tested as both `anon` and
--    `authenticated`, refused nobody. `auth.role()` reads the request's own
--    claim, which is the thing being asked about. A call with no JWT at all
--    (service_role over a direct connection, or a person in the SQL editor)
--    is a database session that can already read the table.
--
-- 2. IT COULD ONLY BE ASKED ONE CONTACT AT A TIME.
--
--    The dry run evaluates every unclaimed business on the platform — 269
--    today, with up to three contact routes each. That is 800 round trips to
--    answer one question, so a console built on it would either be unusably
--    slow or would skip the check for most rows. The batch form below answers
--    the whole set in one call, with the SAME semantics, so nothing has to
--    reimplement the matching rules in TypeScript and drift from them.
--
-- SAFETY
--
-- Additive and reversible. No table changes, no data written. Replaces one
-- function body and adds one function.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. THE SINGLE-CONTACT CHECK, FAILING CLOSED
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.claimreach_is_suppressed(
  p_contact text,
  p_channel text default 'any'
)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
begin
  -- A web caller must be staff. See the header: auth.role(), not current_user.
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_staff() then
    raise exception 'claimreach_is_suppressed: staff only'
      using errcode = '42501';
  end if;

  return exists (
    select 1
      from public.claimreach_suppressions s
     where s.contact = btrim(lower(p_contact))
       and (s.channel = 'any' or p_channel = 'any' or s.channel = p_channel)
       and (s.expires_at is null or s.expires_at > now())
  );
end;
$fn$;

comment on function public.claimreach_is_suppressed is
  'ClaimReach §22. True when this contact must not be messaged. Compares against the normalised, lower-cased contact — callers must normalise before storing, or a suppression will silently fail to match. SECURITY DEFINER and staff-only: a caller who may not ask gets an error rather than "false", because "false" would mean "go ahead".';

-- ═══════════════════════════════════════════════════════════════════════
-- 2. THE BATCH FORM
-- ═══════════════════════════════════════════════════════════════════════

/*
 * Which of these contacts are suppressed?
 *
 * Returns only the suppressed ones, and returns them as the caller spelled
 * them — so a client can match the answer back to its own list without
 * re-normalising and getting it subtly different. Absent from the result means
 * "not suppressed" for the channel asked about, which is the only inference
 * the caller may draw.
 */
create or replace function public.claimreach_suppressed_contacts(
  p_contacts text[],
  p_channel text default 'any'
)
returns table (contact text)
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_staff() then
    raise exception 'claimreach_suppressed_contacts: staff only'
      using errcode = '42501';
  end if;

  return query
    select c.raw
      from unnest(coalesce(p_contacts, array[]::text[])) as c(raw)
     where exists (
       select 1
         from public.claimreach_suppressions s
        where s.contact = btrim(lower(c.raw))
          and (s.channel = 'any' or p_channel = 'any' or s.channel = p_channel)
          and (s.expires_at is null or s.expires_at > now())
     );
end;
$fn$;

comment on function public.claimreach_suppressed_contacts is
  'ClaimReach §22, batched for the dry run. Given contacts, returns the subset that must not be messaged on this channel, spelled as the caller passed them. Same matching rules as claimreach_is_suppressed, in one round trip, so no client reimplements them.';
