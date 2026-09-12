-- AutoAcquire §8 — field-level provenance, and the status values §12 is missing.
--
-- WHY THIS IS THE MOST IMPORTANT MIGRATION IN THE ACQUISITION ENGINE
--
-- Today provenance is per RECORD: `businesses.source_name`, `source_url`,
-- `source_license`. That answers "where did this row come from" and cannot
-- answer the question that actually matters:
--
--     "Why do we believe this phone number?"
--
-- Without a per-field answer there is no way to distinguish a phone read from
-- a business's own website from one a model inferred from a name — and §10
-- forbids ever presenting the second as the first. An acquisition engine that
-- cannot separate them will eventually publish a guess as a fact, and nobody
-- will be able to tell which facts are guesses.
--
-- SAFETY
--
-- Entirely additive. One new table, two new CHECK values on existing columns,
-- one new column. No existing row changes meaning, and nothing is backfilled:
-- a business with no evidence rows is a business we have not yet recorded
-- evidence for, which is the truth about every row in the table today.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. THE EVIDENCE TABLE
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.business_evidence (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,

  -- Which field this is evidence for. Free text rather than an enum: the
  -- field list belongs to the application (UPDATABLE_FIELDS in
  -- src/lib/imports/matchExisting.ts), and a database enum would need a
  -- migration every time a field is added.
  field_name    text not null,

  -- The value as observed. Kept even when the business row later changes, so
  -- a correction can be compared against what the source actually said.
  field_value   text,

  source_id     text references public.radar_sources(key) on delete set null,
  source_url    text,
  source_type   text,

  -- 0-100. NOT a probability — a deterministic score from the extraction
  -- method and the source tier (§11), so two operators reading the same
  -- evidence reach the same number.
  confidence    integer not null default 0 check (confidence between 0 and 100),

  observed_at   timestamptz not null default now(),

  /*
   * HOW the value was obtained. This is the field that makes §10 enforceable:
   * `ai_inferred` can never be displayed as confirmed, and the distinction
   * has to be recorded at the moment of extraction because it cannot be
   * recovered afterwards.
   */
  extraction_method text not null check (extraction_method in (
    'structured_data',   -- schema.org / JSON-LD on the page
    'dom_extraction',    -- parsed from markup
    'regex',             -- pattern matched from text
    'api',               -- an authorised provider returned it as a field
    'owner_submitted',   -- the business told us
    'admin_entered',     -- a person on our side typed it
    'csv_import',        -- an admin's file
    'ai_extracted',      -- a model read the page and returned this field
    'ai_inferred'        -- a model produced it WITHOUT direct page support
  )),

  /*
   * §11's source hierarchy, as data. `ai_inferred` is deliberately its own
   * lowest tier and must never be rendered as "verified".
   */
  status text not null check (status in (
    'owner_confirmed',
    'admin_verified',
    'source_confirmed',
    'multiple_sources',
    'single_source',
    'ai_inferred',
    'disputed',
    'superseded'
  )),

  -- Hash of the raw evidence (the fetched bytes, or the CSV cell), so the same
  -- observation is not recorded twice and a claim can be traced to what was
  -- actually seen.
  evidence_hash text,

  created_at timestamptz not null default now()
);

-- One observation per (business, field, source, hash). A re-run of the same
-- extraction updates rather than accumulating identical rows.
create unique index if not exists business_evidence_unique_observation
  on public.business_evidence (business_id, field_name, coalesce(source_id, ''), coalesce(evidence_hash, ''));

-- The read the profile page makes: every field's best evidence for one business.
create index if not exists business_evidence_business_field_idx
  on public.business_evidence (business_id, field_name, confidence desc);

-- The read §31's learning loop makes: how accurate has each source been?
create index if not exists business_evidence_source_idx
  on public.business_evidence (source_id, status, observed_at desc);

comment on table public.business_evidence is
  'Field-level provenance. Answers "why do we believe this?" per field, which record-level source_url cannot. extraction_method ai_inferred must never be displayed as confirmed (AutoAcquire §10).';

-- ═══════════════════════════════════════════════════════════════════════
-- 2. RLS — evidence is readable with the business, writable by staff only
-- ═══════════════════════════════════════════════════════════════════════

alter table public.business_evidence enable row level security;

drop policy if exists business_evidence_public_read on public.business_evidence;
drop policy if exists business_evidence_staff_write on public.business_evidence;

/*
 * Public READ, and deliberately so: "why do we believe this" is a claim
 * NowOpen makes in public, and a provenance trail nobody can inspect is not a
 * provenance trail. Scoped to listable businesses so it cannot be used to
 * enumerate hidden rows.
 */
create policy business_evidence_public_read on public.business_evidence
  for select to anon, authenticated
  using (exists (
    select 1 from public.businesses b
     where b.id = business_evidence.business_id
       and b.is_listable
  ));

-- Only staff write evidence. A claimant correcting their own listing goes
-- through the correction queue, which records WHO said so — it does not get
-- to assert `owner_confirmed` about itself.
create policy business_evidence_staff_write on public.business_evidence
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ═══════════════════════════════════════════════════════════════════════
-- 3. THE §12 STATUS VALUES THAT ARE MISSING
-- ═══════════════════════════════════════════════════════════════════════

/*
 * claim_rejected / claim_suspended.
 *
 * Without them a rejected claim returns the business to plain `unclaimed`, so
 * the platform forgets it was ever contested and a bad-faith claimant simply
 * tries again with nothing on the record. `claim_suspended` is the state an
 * ownership dispute or takedown actually needs.
 */
alter table public.businesses
  drop constraint if exists businesses_claim_status_check;

alter table public.businesses
  add constraint businesses_claim_status_check check (claim_status in (
    'unclaimed', 'claim_pending', 'claimed', 'claim_rejected', 'claim_suspended'
  ));

/*
 * verification_status: `expired`.
 *
 * `last_verified_at` exists and nothing ages it out, so a 2026 verification
 * would still read "verified" in 2029. Adding the value does not expire
 * anything by itself — that is a policy decision with a duration attached —
 * but without the value there is nowhere for the decision to land.
 */
alter table public.businesses
  drop constraint if exists businesses_verification_status_check;

alter table public.businesses
  add constraint businesses_verification_status_check check (verification_status in (
    'unverified', 'pending', 'verified', 'expired', 'rejected'
  ));

-- ═══════════════════════════════════════════════════════════════════════
-- 4. DATA CONFIDENCE — a second axis, not a rename
-- ═══════════════════════════════════════════════════════════════════════

/*
 * `data_status` describes ORIGIN (synthetic_unverified, imported_authorized,
 * submitted, user_created, admin_curated). §12's data confidence describes
 * CONFIRMATION. They are different questions and a record can be
 * `imported_authorized` while only `partially_confirmed`.
 *
 * data_status is NOT renamed. It feeds the generated `is_listable` column and
 * the sitemap gate, so changing its vocabulary would silently change who is
 * visible on the internet.
 *
 * Defaults to `unconfirmed`, which is the honest starting point for all
 * 2 existing rows and every row an importer will create.
 */
alter table public.businesses
  add column if not exists data_confidence text not null default 'unconfirmed';

alter table public.businesses
  drop constraint if exists businesses_data_confidence_check;

alter table public.businesses
  add constraint businesses_data_confidence_check check (data_confidence in (
    'unconfirmed',
    'source_confirmed',
    'partially_confirmed',
    'owner_confirmed',
    'admin_verified'
  ));

comment on column public.businesses.data_confidence is
  'How well the CONTENT is confirmed. Separate from data_status, which describes where the record came from. Never rename data_status — it feeds the generated is_listable column and the sitemap gate.';

-- ═══════════════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════════════
-- Run these after applying. Each should return what the comment says.

-- 1. The table exists, is empty, and RLS is on.
--    Empty is correct: no evidence has been recorded for any business yet,
--    and backfilling it would be inventing provenance.
-- select relrowsecurity from pg_class where relname = 'business_evidence';
-- select count(*) from business_evidence;                    -- expect 0

-- 2. The new status values are accepted and nothing was reclassified.
-- select claim_status, verification_status, data_confidence, count(*)
--   from businesses group by 1,2,3;                          -- expect all unconfirmed

-- 3. is_listable is unchanged — this migration must not alter visibility.
-- select count(*) from businesses where is_listable;         -- expect 2
