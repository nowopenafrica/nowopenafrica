/*
  # Resolve a NOA- reference to a listing

  The click-to-chat message carries NOA-XXXXXXXX, the first eight hex
  characters of the listing id. The webhook has to turn that back into a
  business.

  MEASURED 2026-10-10: the first attempt filtered `ilike('id', '7b73a46e%')`
  through PostgREST. `businesses.id` is a uuid, the pattern never matched, and
  the webhook stored the inbound message with business_id NULL and no error at
  all. The reference had parsed perfectly; only the lookup failed, and nothing
  on the row said so. Caught by probing the live endpoint rather than trusting
  it.

  The cast belongs in SQL, where it works:

  ## Exactly one, or none

  Eight hex characters is 4.3 billion values against 4,000 listings, so a
  collision is vanishingly unlikely -- but "unlikely" is not "impossible", and
  attaching an owner's message to the wrong business is not a recoverable
  mistake. Two matches returns nothing.
*/
create or replace function public.business_by_reference(p_reference text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.businesses
  where left(replace(id::text, '-', ''), 8) = lower(regexp_replace(coalesce(p_reference, ''), '^NOA-', '', 'i'))
    -- Two candidates means we do not know which listing is meant.
    and (select count(*) from public.businesses b2
         where left(replace(b2.id::text, '-', ''), 8) = lower(regexp_replace(coalesce(p_reference, ''), '^NOA-', '', 'i'))) = 1
  limit 1;
$$;

comment on function public.business_by_reference is
  'Turns a NOA-XXXXXXXX click-to-chat reference back into a business id. Returns NULL when the prefix is absent, unknown, or matches more than one listing.';

revoke all on function public.business_by_reference(text) from public, anon, authenticated;
