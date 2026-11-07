-- "Is this your business?" — matching a signed-in person to an unclaimed listing.
--
-- ── WHAT THIS IS FOR ─────────────────────────────────────────────────────
--
-- NowOpen Radar discovers businesses before their owners arrive. Measured
-- 2026-10-06: 3,208 of 3,210 listings have no owner. The acquisition thesis is
-- that an owner eventually signs up and finds their business already here —
-- but nothing connected the two, so they would sign up, see an empty dashboard
-- and be invited to create a listing that already existed.
--
-- This closes that gap. It does not claim anything; it asks a question.
--
-- ── IT MATCHES ON VERIFIED CHANNELS ONLY ─────────────────────────────────
--
-- The obvious implementation matches public.users.email / .phone. Those are
-- PROFILE fields the person edits freely, which would turn this into a probe:
-- set your profile phone to a number, reload, and learn which listing carries
-- it — repeat down a list.
--
-- So it matches auth.users.email and auth.users.phone, and only where GoTrue
-- has confirmed them (email_confirmed_at / phone_confirmed_at). You cannot
-- assert an address you do not control, so you cannot fish with one.
--
-- Nothing disclosed here is private: the matched listing is already published
-- with that contact detail on it. The point of the verified-channel rule is
-- not secrecy, it is that the match should mean something.
--
-- ── IT IS A PROMPT, NOT AN ENTITLEMENT ───────────────────────────────────
--
-- A match grants nothing. Claiming still goes through business_claims and its
-- review, exactly as it does from the business page. This function only
-- decides whether to ASK somebody, and the asking is phrased as a question.
--
-- ── WHAT IT DELIBERATELY DOES NOT MATCH ON ───────────────────────────────
--
-- Name similarity, website domain, or location. Measured on this data, those
-- signals are wrong: 37 groups of listings share a domain and almost all are
-- brand families — 16 Hilton properties, 9 Riu hotels, 7 Hyatt, 4 National
-- Museums. Matching on a domain would offer somebody at Hilton the chance to
-- claim fifteen hotels they have nothing to do with.

create or replace function public.claimable_for_me()
returns table (
  id            uuid,
  name          text,
  location      text,
  category      text,
  image_url     text,
  -- Which channel matched, so the UI can say "we matched your email" rather
  -- than leaving somebody wondering why this appeared.
  matched_on    text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_phone text;
begin
  if v_uid is null then return; end if;

  /*
   * Confirmed channels only. A NULL confirmation means the person asserted the
   * address but never proved it, and an unproven assertion must not match.
   */
  select lower(au.email), regexp_replace(coalesce(au.phone, ''), '\D', '', 'g')
    into v_email, v_phone
    from auth.users au
   where au.id = v_uid
     and au.email_confirmed_at is not null;

  -- Phone separately: a person may have confirmed one and not the other.
  if not exists (
    select 1 from auth.users au where au.id = v_uid and au.phone_confirmed_at is not null
  ) then
    v_phone := null;
  end if;

  if (v_email is null or v_email = '') and (v_phone is null or length(v_phone) < 10) then
    return;
  end if;

  return query
  select b.id, b.name, b.location, b.category, b.image_url,
         case
           when v_email is not null and lower(coalesce(b.email, '')) = v_email then 'email'
           else 'phone'
         end as matched_on
    from public.businesses b
   where
     -- Unclaimed on both the ownership column and the status, because they are
     -- set at different moments and either one alone has been wrong before.
     b.user_id is null
     and coalesce(b.claim_status, 'unclaimed') <> 'claimed'
     and (
       (v_email is not null and v_email <> '' and lower(coalesce(b.email, '')) = v_email)
       or
       (v_phone is not null and length(v_phone) >= 10
        and regexp_replace(coalesce(b.phone, ''), '\D', '', 'g') = v_phone)
     )
     -- Somebody who already asked about this listing should not be asked again.
     and not exists (
       select 1 from public.business_claims c
        where c.business_id = b.id and c.user_id = v_uid
     )
   order by b.name
   -- A handful. If the match is this broad something is wrong with the signal,
   -- and a wall of "is this yours?" is not a question anybody answers.
   limit 5;
end $$;

comment on function public.claimable_for_me() is
  'Unclaimed listings whose email or phone matches the CALLER''s GoTrue-confirmed contact details. Takes no user id — acts on auth.uid(). A prompt to ask a question, never an entitlement: claiming still goes through business_claims review.';

revoke all on function public.claimable_for_me() from public, anon;
grant execute on function public.claimable_for_me() to authenticated;
