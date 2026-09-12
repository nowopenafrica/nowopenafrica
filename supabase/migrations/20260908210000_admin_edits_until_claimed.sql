-- An unclaimed listing is ours to maintain. A claimed one is theirs.
--
-- WHAT THIS ADDS
--
-- Admins can now edit a business profile from the console — 269 of the 271
-- listings are unclaimed imports, and until today nobody could fix a phone
-- number or add opening hours to one without opening the SQL editor. The
-- console offered verify, status, trust and delete, and no way to change a
-- single detail.
--
-- This trigger is the other half of that: the moment an owner holds a profile,
-- the console stops being able to rewrite it.
--
-- WHY THE DATABASE AND NOT JUST THE BUTTON
--
-- `canEditBusinessProfile` hides the button, and RLS still says an admin may
-- update any row — so the rule would live only in a React component. A
-- business's own words are exactly the thing that should not depend on which
-- screen somebody happens to use.
--
-- WHAT IS PROTECTED, AND WHAT IS NOT
--
-- CONTENT only: the name, the story, the contact details, the pictures, the
-- socials — everything a business says about itself. Moderation is untouched:
-- an admin can still suspend a listing, change its lifecycle, set verification
-- and trust, adjust a plan, and approve a deletion on a claimed business.
--
-- The column list is EXPLICIT rather than "everything except moderation". The
-- other way round is more thorough and fails worse: a moderation column added
-- next year would be silently protected, and an admin would meet a refusal
-- doing their job. A content column added next year is simply not covered
-- until somebody adds it here, which is a smaller loss.
--
-- WHO IS ALLOWED THROUGH
--
--   the owner            always — it is their page
--   service_role,        allowed: they already bypass RLS everywhere, and a
--   the SQL editor,      support fix made this way has a named person and a
--   a migration          query behind it rather than a console button
--   anon / authenticated must be the owner
--
-- IT RAISES rather than silently reverting, which is deliberate and different
-- from the verification guards next to it. Those defend against an owner
-- fiddling with a badge, where quietly ignoring the change is kindest. Here
-- the actor is an admin doing something they believe is their job — telling
-- them "saved" and changing nothing would be a lie, and they would repeat it.

create or replace function public.guard_claimed_profile_edits()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  -- Unclaimed: NowOpen maintains it, so anything goes (RLS still decides who).
  if old.user_id is null and coalesce(old.claim_status, 'unclaimed') <> 'claimed' then
    return new;
  end if;

  -- The owner, editing their own page.
  if auth.uid() is not null and auth.uid() = old.user_id then
    return new;
  end if;

  -- Not a web request. See the header.
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return new;
  end if;

  if (
    new.name, new.username, new.description, new.about, new.tagline, new.story,
    new.mission, new.vision, new.why_us, new.core_values, new.faqs, new.team,
    new.credentials, new.policies, new.social_links, new.languages,
    new.payment_methods, new.phone, new.whatsapp, new.email, new.website,
    new.address, new.location, new.category, new.secondary_categories,
    new.subcategory, new.image_url, new.logo_url, new.opening_hours, new.hours,
    new.service_area, new.business_type, new.employees, new.founded_year,
    new.timezone, new.primary_cta, new.secondary_cta
  ) is distinct from (
    old.name, old.username, old.description, old.about, old.tagline, old.story,
    old.mission, old.vision, old.why_us, old.core_values, old.faqs, old.team,
    old.credentials, old.policies, old.social_links, old.languages,
    old.payment_methods, old.phone, old.whatsapp, old.email, old.website,
    old.address, old.location, old.category, old.secondary_categories,
    old.subcategory, old.image_url, old.logo_url, old.opening_hours, old.hours,
    old.service_area, old.business_type, old.employees, old.founded_year,
    old.timezone, old.primary_cta, old.secondary_cta
  ) then
    raise exception
      'This profile has been claimed by its owner. Only they can change its details.'
      using errcode = '42501',
            hint = 'Moderation still works: status, verification, trust and plan are unaffected.';
  end if;

  return new;
end;
$fn$;

comment on function public.guard_claimed_profile_edits is
  'A claimed business owns its own words. Refuses content edits by anyone but the owner, while leaving moderation columns (status, verification, trust, plan, lifecycle) editable by admins.';

drop trigger if exists guard_claimed_profile_edits on public.businesses;
create trigger guard_claimed_profile_edits
  before update on public.businesses
  for each row execute function public.guard_claimed_profile_edits();
