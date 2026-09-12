-- "UNKNOWN" is not a phone number — stop it at the door.
--
-- WHAT WAS MEASURED (live, 2026-09-08)
--
--   whatsapp = 'UNKNOWN'   257 of 271 businesses
--   website  = 'UNKNOWN'    85 of 271
--   everything else         clean (no N/A, NONE, TBD, dashes anywhere)
--
-- Imported from a CSV where the column existed but the answer did not. Three
-- consequences, all live right now:
--
-- 1. 85 PROFILES SHOW A BROKEN WEBSITE LINK.
--
--    BusinessDetail renders `href={business.website}` unvalidated, so the
--    anchor points at the relative path "UNKNOWN" — a visitor who clicks
--    "Website" lands on a not-found page inside NowOpen. A business we are
--    trying to help looks broken, on our page, because of our data.
--
-- 2. 195 BUSINESSES ARE SCORED AS REACHABLE WHEN NOBODY CAN REACH THEM.
--
--    `listing_score` awards 25 points for a contact via
--    COALESCE(phone, whatsapp, email), and 'UNKNOWN' is a non-empty string,
--    so it satisfies that. 195 businesses have NO phone and NO email and are
--    credited for a contact anyway. A further 5 points come from
--    website = 'UNKNOWN'.
--
-- 3. 26 OF THOSE CLEAR THE INDEXABILITY BAR ON THE STRENGTH OF IT.
--
--    isIndexableProfile requires listing_score >= 40. Twenty-six profiles
--    pass only because the placeholder bought them 25 or 30 points, so
--    NowOpen is asking Google to index business pages that carry no way to
--    contact the business.
--
-- WHY A TRIGGER, AND IN THE DATABASE
--
-- The values do not all arrive through the importer: `radar_publish_candidate`
-- inserts businesses inside a SECURITY DEFINER function, an owner types into
-- the business form, and an edge function may write later. A check in one
-- client is a check the other three walk past.
--
-- It NULLS the value rather than rejecting the write. A CHECK constraint would
-- turn "the spreadsheet said UNKNOWN" into a failed import an admin cannot
-- interpret; nulling is what the data means — we do not know this field.
--
-- WHAT IT DOES NOT TOUCH
--
-- `name`, `category` and `location`. Those are required, a business really can
-- be called something short, and blanking one would break the row rather than
-- clean it. The importer already validates them.
--
-- THIS FILE CHANGES NO EXISTING ROW. Repairing the 342 values already stored
-- is a separate migration, because rewriting production data is a decision
-- and not a side effect of adding a guard.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. IS THIS VALUE A PLACEHOLDER?
-- ═══════════════════════════════════════════════════════════════════════

/*
 * Returns NULL for a value that carries no information, otherwise the trimmed
 * value.
 *
 * The list is what a person types into a spreadsheet cell they cannot fill in.
 * Deliberately WHOLE-VALUE matches only, never a substring: "Unknown
 * Pleasures Records" is a real business name, and a field that merely contains
 * one of these words is left alone.
 */
create or replace function public.blank_if_placeholder(p_value text)
returns text
language sql
immutable
set search_path to 'public'
as $fn$
  select case
    when p_value is null then null
    when btrim(p_value) = '' then null
    when upper(btrim(p_value)) in (
      'UNKNOWN', 'UNKNOW', 'UNKOWN',
      'N/A', 'NA', 'N.A', 'N.A.', 'NONE', 'NIL', 'NULL', 'NAN',
      'TBD', 'TBA', 'TO BE ADDED', 'TO BE CONFIRMED',
      'NOT AVAILABLE', 'NOT APPLICABLE', 'NOT PROVIDED', 'NOT SPECIFIED',
      'NO WEBSITE', 'NO PHONE', 'NO EMAIL', 'NO ADDRESS', 'NO DATA',
      'COMING SOON', 'PENDING', 'MISSING', 'BLANK', 'EMPTY'
    ) then null
    -- Runs of punctuation, and all-zero numbers.
    when btrim(p_value) ~ '^[-_.,;:?*#/]+$' then null
    when btrim(p_value) ~ '^0+$' then null
    else btrim(p_value)
  end;
$fn$;

comment on function public.blank_if_placeholder is
  'NULL for a value that carries no information (UNKNOWN, N/A, TBD, runs of punctuation, all zeros), otherwise the trimmed value. Whole-value matches only: "Unknown Pleasures Records" is a real name.';

-- ═══════════════════════════════════════════════════════════════════════
-- 2. THE DOOR
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.scrub_business_placeholders()
returns trigger
language plpgsql
set search_path to 'public'
as $fn$
begin
  /*
   * Every field `listing_score` counts, plus the link fields that render as
   * anchors. Those are exactly the fields where a placeholder does damage: it
   * either earns points the business has not earned, or it becomes a link
   * that goes nowhere.
   */
  new.phone         := public.blank_if_placeholder(new.phone);
  new.whatsapp      := public.blank_if_placeholder(new.whatsapp);
  new.email         := public.blank_if_placeholder(new.email);
  new.website       := public.blank_if_placeholder(new.website);
  new.address       := public.blank_if_placeholder(new.address);
  new.description   := public.blank_if_placeholder(new.description);
  new.about         := public.blank_if_placeholder(new.about);
  new.opening_hours := public.blank_if_placeholder(new.opening_hours);
  new.hours         := public.blank_if_placeholder(new.hours);
  new.image_url     := public.blank_if_placeholder(new.image_url);
  new.logo_url      := public.blank_if_placeholder(new.logo_url);
  return new;
end;
$fn$;

comment on function public.scrub_business_placeholders is
  'Nulls placeholder values on write. In the database rather than a client because businesses are also written by radar_publish_candidate, the owner form and edge functions — a check in one client is a check the others walk past.';

drop trigger if exists scrub_business_placeholders on public.businesses;
create trigger scrub_business_placeholders
  before insert or update on public.businesses
  for each row execute function public.scrub_business_placeholders();

-- The same junk arrives through the candidate queue, and a reviewer should not
-- be shown "UNKNOWN" as though it were a phone number they are approving.
create or replace function public.scrub_candidate_placeholders()
returns trigger
language plpgsql
set search_path to 'public'
as $fn$
begin
  new.phone    := public.blank_if_placeholder(new.phone);
  new.whatsapp := public.blank_if_placeholder(new.whatsapp);
  new.email    := public.blank_if_placeholder(new.email);
  new.website  := public.blank_if_placeholder(new.website);
  new.address  := public.blank_if_placeholder(new.address);
  return new;
end;
$fn$;

drop trigger if exists scrub_candidate_placeholders on public.radar_candidates;
create trigger scrub_candidate_placeholders
  before insert or update on public.radar_candidates
  for each row execute function public.scrub_candidate_placeholders();
