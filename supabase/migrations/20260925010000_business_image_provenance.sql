-- Where a business's cover image came from, recorded rather than assumed.
--
-- MEASURED ON PRODUCTION, 2026-09-16
--
--   unclaimed businesses with a cover image          3,050
--   whose cover is a Pexels stock photograph         3,049
--   whose cover is the business's own picture            1
--
-- Every one of those 3,049 is a real, named African business — clinics,
-- schools, hotels — showing a stock photograph with nothing anywhere saying so.
-- A visitor looking at "Sanofi Primary Health Clinic" sees a photograph of a
-- clinic that is not theirs, on a page that otherwise presents itself as the
-- record of that business.
--
-- That is the misleading-gallery-image failure this platform has ruled out in
-- writing, at a scale of three thousand. Nothing here deletes those images —
-- an empty card is worse for a directory that is trying to be useful, and the
-- pictures are correctly licensed — but the platform has to be able to SAY
-- which is which, and today it cannot, because nothing records it.
--
-- WHAT THIS DOES NOT DO
--
-- It does not decide the product question. It gives the schema the vocabulary
-- to tell the truth; the profile and card renderers then label a stock cover,
-- and the backfill replaces one with the business's own picture wherever the
-- business publishes one.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'image_source') then
    create type public.image_source as enum (
      -- The business's own picture, taken from the website it publishes.
      'business',
      -- Uploaded by the person who claimed the profile.
      'owner',
      -- A licensed stock photograph standing in for a category. NEVER to be
      -- presented as a picture of this business.
      'stock',
      -- Present before this column existed and not yet classified.
      'unknown'
    );
  end if;
end $$;

alter table public.businesses
  add column if not exists image_source public.image_source not null default 'unknown',
  add column if not exists logo_source  public.image_source not null default 'unknown',
  -- The page the picture was taken from, so a claim about its origin is
  -- checkable rather than a label somebody typed.
  add column if not exists image_source_url text,
  add column if not exists logo_source_url text,
  add column if not exists image_checked_at timestamptz;

comment on column public.businesses.image_source is
  'Where image_url came from. ''stock'' must be labelled wherever it is shown.';

-- Classify what is already there. images.pexels.com is stock by definition;
-- anything else present is the business''s own until something says otherwise,
-- and `image_checked_at` stays null so the backfill knows it has not looked.
update public.businesses
   set image_source = case
         when coalesce(trim(image_url), '') = '' then 'unknown'
         when image_url ilike '%images.pexels.com%' then 'stock'
         else 'business'
       end::public.image_source
 where image_source = 'unknown';

update public.businesses
   set logo_source = case
         when coalesce(trim(logo_url), '') = '' then 'unknown'
         when logo_url ilike '%images.pexels.com%' then 'stock'
         else 'business'
       end::public.image_source
 where logo_source = 'unknown';

-- The backfill's work queue: an unclaimed business whose cover is stock or
-- missing, that publishes a website we could read instead.
create index if not exists idx_businesses_image_backfill
  on public.businesses (image_source, claim_status)
  where image_source in ('stock', 'unknown');
