/*
  # Mark the invented creative services as samples

  MEASURED 2026-10-14 against the LIVE site, not the dev server:
  https://www.nowopenafrica.com/media renders eighteen creative studios with
  ratings from 4.4 to 4.9, 1,152 reviews between them and 2,396 clients
  served. `media_reviews` holds ZERO rows. Every one of the eighteen has a
  NULL user_id and was created on 2026-09-12, within the same day.

  They are invented. Names, prices up to N3,994,328, ratings and client
  counts.

  ## Why this was believed to be fixed

  Media.tsx carries a comment stating the samples are "gated to DEV" and that
  the section "reads empty in production on purpose". That was true of the
  GENERATOR and never of the READER: the page does
  `from('media_services').select('*')` with no filter, and dev and production
  share one Supabase project, so a dev session that wrote samples put them in
  front of the public permanently.

  A claim that outlived its facts, which is the failure this codebase keeps
  meeting. The gate now lives in the DATA, where the reader cannot miss it.

  ## Why a flag and not a DELETE

  Deleting eighteen production rows is irreversible and unnecessary. The flag
  hides them from the public marketplace while leaving them inspectable, and
  it gives every future seed a place to declare itself. Nothing is lost; the
  page simply stops asserting things that are not true.
*/

alter table public.media_services
  add column if not exists is_sample boolean not null default false;

comment on column public.media_services.is_sample is
  'Seeded demonstration data. Never served to the public marketplace - these carry invented names, prices and ratings.';

/*
  The eighteen. Identified by what makes them samples rather than by id, so
  this is re-runnable and so the rule is legible: nobody owns them, and no
  real creator listing arrives without an owner.
*/
update public.media_services
   set is_sample = true
 where user_id is null
   and is_sample = false;

/*
  A real listing belongs to somebody. This stops the next seed from quietly
  becoming public the way these did - an ownerless row can exist, but only as
  a declared sample.
*/
alter table public.media_services
  drop constraint if exists media_services_ownerless_rows_are_samples;
alter table public.media_services
  add constraint media_services_ownerless_rows_are_samples
  check (user_id is not null or is_sample);

create index if not exists media_services_public_idx
  on public.media_services (created_at desc)
  where is_sample = false;
