-- Provenance for the content a profile shows, not just the fields it holds.
--
-- WHY THIS IS THE FOUNDATION, AND WHY NOTHING SHOULD GENERATE CONTENT BEFORE IT
--
-- `business_evidence` already records where a FIELD came from — 19,564 rows of
-- it — and `business_change_proposals` already gates a field change behind a
-- human. Neither covers the things a profile is actually made of:
-- `business_services`, `business_products` and `business_gallery` carry no
-- provenance whatsoever.
--
-- So a suggested service written into `business_services` today would be
-- indistinguishable from one the owner typed, and `Public can view business
-- services` is `USING (true)` — it would be publicly visible the instant it was
-- written. Every trust rule the enrichment brief sets out ("suggested until
-- confirmed", "never a false claim", "claiming is not verifying") is
-- unenforceable until these columns exist. This migration adds nothing that
-- generates content; it makes generated content *possible to tell apart*.
--
-- WHAT THE BACKFILL SAYS, AND HOW IT WAS DECIDED
--
-- MEASURED 2026-09-14, not assumed:
--
--   534 services across 226 businesses — unclaimed, `imported_authorized`
--     9 services across   1 business   — claimed, `user_created`
--
-- The 534 arrived through the CSV importer and read like it ("VW", "cultural
-- programming", "LCCI member directory listing."). Marking those
-- `owner_confirmed` because they happen to sit in an owner-editable table
-- would be the exact fabrication this system exists to prevent. They are
-- `source_derived` and require confirmation. The 9 on a claimed business are
-- `owner_confirmed`.
--
-- NOTHING DISAPPEARS. `published` defaults true and every existing row keeps
-- it, so the public sees precisely what it saw before this ran.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. THE VOCABULARY
-- ═══════════════════════════════════════════════════════════════════════

/*
 * One status set for every kind of profile content, so a reviewer learns it
 * once. It deliberately mirrors the words `business_evidence.status` and
 * `businesses.data_confidence` already use rather than inventing a third
 * dialect for the same idea.
 */
do $vocab$
begin
  if not exists (select 1 from pg_type where typname = 'content_provenance') then
    create type public.content_provenance as enum (
      'owner_confirmed',  -- the business said so
      'source_derived',   -- a named source said so; still needs confirming
      'suggested',        -- a category template proposed it; nobody has said so
      'illustrative',     -- stands in for the real thing and must say so
      'pending_review',   -- generated, awaiting a human
      'rejected',         -- a human said no. Never publishable
      'outdated'          -- was true once; superseded
    );
  end if;
end
$vocab$;

comment on type public.content_provenance is
  'Where a piece of profile content came from and how far it may be trusted. "suggested" and "pending_review" are never publicly visible; "illustrative" is visible only with a label.';

-- ═══════════════════════════════════════════════════════════════════════
-- 2. THE COLUMNS
-- ═══════════════════════════════════════════════════════════════════════

/*
 * WRITTEN OUT THREE TIMES, ON PURPOSE.
 *
 * The obvious version is a DO block looping over the table names with
 * `execute format('alter table public.%I ...')`. It was written that way first
 * and it was wrong: `scripts/check-schema-drift.mjs` parses these files to
 * learn what the schema should contain, and a table name hidden behind a
 * format placeholder is a table it cannot see. The loop silently removed all
 * nine of these columns from drift detection — the exact class of "fails
 * silently at runtime" problem that script exists to catch — and it also
 * registered a phantom table named "" as missing.
 *
 * Repetition that a tool can read beats cleverness it cannot.
 */

alter table public.business_services
  add column if not exists content_status        public.content_provenance not null default 'owner_confirmed',
  add column if not exists source_type           text,
  add column if not exists source_name           text,
  add column if not exists source_url            text,
  add column if not exists requires_confirmation boolean not null default false,
  -- `published` is the switch the public read uses. Generated content lands
  -- false and only a human flips it, so a bad run is invisible, not embarrassing.
  add column if not exists published             boolean not null default true,
  add column if not exists generated_at          timestamptz,
  add column if not exists reviewed_at           timestamptz,
  add column if not exists reviewed_by           uuid references auth.users(id) on delete set null,
  add column if not exists enrichment_version    integer;

alter table public.business_products
  add column if not exists content_status        public.content_provenance not null default 'owner_confirmed',
  add column if not exists source_type           text,
  add column if not exists source_name           text,
  add column if not exists source_url            text,
  add column if not exists requires_confirmation boolean not null default false,
  add column if not exists published             boolean not null default true,
  add column if not exists generated_at          timestamptz,
  add column if not exists reviewed_at           timestamptz,
  add column if not exists reviewed_by           uuid references auth.users(id) on delete set null,
  add column if not exists enrichment_version    integer;

alter table public.business_gallery
  add column if not exists content_status        public.content_provenance not null default 'owner_confirmed',
  add column if not exists source_type           text,
  add column if not exists source_name           text,
  add column if not exists source_url            text,
  add column if not exists requires_confirmation boolean not null default false,
  add column if not exists published             boolean not null default true,
  add column if not exists generated_at          timestamptz,
  add column if not exists reviewed_at           timestamptz,
  add column if not exists reviewed_by           uuid references auth.users(id) on delete set null,
  add column if not exists enrichment_version    integer;

create index if not exists business_services_provenance_idx
  on public.business_services (business_id, published, content_status);
create index if not exists business_products_provenance_idx
  on public.business_products (business_id, published, content_status);
create index if not exists business_gallery_provenance_idx
  on public.business_gallery (business_id, published, content_status);

comment on column public.business_services.content_status is
  'Where this service came from. Only owner_confirmed, source_derived and illustrative are ever shown publicly, and only when published is true.';
comment on column public.business_services.requires_confirmation is
  'True when nobody running the business has confirmed this. Drives the "confirm availability with the business" label.';

-- ═══════════════════════════════════════════════════════════════════════
-- 3. THE HONEST BACKFILL
-- ═══════════════════════════════════════════════════════════════════════

/*
 * Idempotent by construction: it only touches rows still sitting on the column
 * default with no source recorded, so a re-run cannot relabel anything a human
 * has since reviewed.
 */
update public.business_services s
   set content_status = 'source_derived',
       source_type = 'admin_import',
       source_name = 'CSV import',
       requires_confirmation = true
  from public.businesses b
 where b.id = s.business_id
   and s.source_type is null
   and s.content_status = 'owner_confirmed'
   and b.data_status = 'imported_authorized'
   and b.claim_status <> 'claimed';

update public.business_products p
   set content_status = 'source_derived',
       source_type = 'admin_import',
       source_name = 'CSV import',
       requires_confirmation = true
  from public.businesses b
 where b.id = p.business_id
   and p.source_type is null
   and p.content_status = 'owner_confirmed'
   and b.data_status = 'imported_authorized'
   and b.claim_status <> 'claimed';

update public.business_gallery g
   set content_status = 'source_derived',
       source_type = 'admin_import',
       requires_confirmation = true
  from public.businesses b
 where b.id = g.business_id
   and g.source_type is null
   and g.content_status = 'owner_confirmed'
   and b.data_status = 'imported_authorized'
   and b.claim_status <> 'claimed';

-- ═══════════════════════════════════════════════════════════════════════
-- 4. THE PUBLIC READ, NARROWED
-- ═══════════════════════════════════════════════════════════════════════

/*
 * Was `USING (true)` on services and products: the public saw every row the
 * moment it was written. With generated content arriving, that is the
 * difference between "a suggestion awaiting review" and "a claim NowOpen made
 * about a real business".
 *
 * Existing rows are unaffected — they are all published and none is rejected.
 */
drop policy if exists "Public can view business services" on public.business_services;
create policy "Public can view business services" on public.business_services
  for select to anon, authenticated
  using (published and content_status not in ('rejected', 'pending_review', 'suggested', 'outdated'));

drop policy if exists "Public can view business products" on public.business_products;
create policy "Public can view business products" on public.business_products
  for select to anon, authenticated
  using (published and content_status not in ('rejected', 'pending_review', 'suggested', 'outdated'));

/*
 * The gallery keeps its scheduling clause — a scheduled item is not due yet,
 * which is a different question from whether it is trustworthy — and gains the
 * same provenance gate.
 */
drop policy if exists "Public can view due gallery items" on public.business_gallery;
create policy "Public can view due gallery items" on public.business_gallery
  for select to anon, authenticated
  using (
    (scheduled_for is null or scheduled_for <= now())
    and published
    and content_status not in ('rejected', 'pending_review', 'suggested', 'outdated')
  );

-- ═══════════════════════════════════════════════════════════════════════
-- 5. OWNER CONTENT IS NOT OVERWRITABLE BY A MACHINE
-- ═══════════════════════════════════════════════════════════════════════

/**
 * Refuse to downgrade owner-confirmed content to a guess.
 *
 * The brief's rule — "never replace verified content with lower-confidence
 * generated content" — is the kind that holds right up until one enrichment
 * run has a bug at 3am. Enforced here so it cannot depend on every future
 * caller remembering it.
 *
 * An owner (or staff) may still change their own content however they like:
 * the guard only blocks a move FROM owner_confirmed TO a machine-generated
 * state, which is never something a person means to do.
 */
create or replace function public.guard_content_provenance()
returns trigger
language plpgsql
as $fn$
begin
  if OLD.content_status = 'owner_confirmed'
     and NEW.content_status in ('suggested', 'pending_review', 'illustrative')
  then
    raise exception
      'Refusing to replace owner-confirmed content with generated content (% -> %). Mark it outdated instead.',
      OLD.content_status, NEW.content_status
      using errcode = '42501';
  end if;
  return NEW;
end;
$fn$;

do $trig$
declare t text;
begin
  foreach t in array array['business_services', 'business_products', 'business_gallery']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_provenance_guard', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.guard_content_provenance()',
      t || '_provenance_guard', t);
  end loop;
end
$trig$;
