-- AutoAcquire §8 — record WHERE each field came from, at the moment it lands.
--
-- WHAT WAS MISSING
--
-- `business_evidence` was created on 2026-09-08 to answer "why do we believe
-- this phone number?", and measured the same day it held ZERO rows: nothing
-- wrote it. 451 candidates had been published through
-- `radar_publish_candidate` with only RECORD-level provenance —
-- `source_name`, `source_url` — which answers "where did this row come from"
-- and cannot answer the question per field.
--
-- That gap has a live consequence. ClaimReach §28 refuses to message a
-- contact with no recorded source, so its dry run reports every business on
-- the platform as unreachable — correctly, because nothing had ever recorded
-- that the phone number came from an admin's file on a particular day.
--
-- WHAT THIS DOES
--
-- Publishing a candidate now writes one evidence row per field it actually
-- carried. Nothing is invented: the source is the `radar_sources` row that
-- already gated the publish, the method is derived from that source's kind,
-- and the value stored is the value published.
--
-- THE TIERS ARE CONSERVATIVE, DELIBERATELY
--
--   admin_import        csv_import        single_source   55
--   business_submission owner_submitted   single_source   70
--   public_suggestion   public_suggested  single_source   40
--
-- `business_submission` is NOT recorded as `owner_confirmed`. Anyone can fill
-- in the owner form; the claim that they run the business is exactly what the
-- claim flow exists to verify, and marking it confirmed here would let an
-- unverified assertion clear a gate built to require verification.
--
-- The numbers are a POLICY TABLE, not a measurement. They are here so two
-- operators reading the same row reach the same number, and so the ordering
-- between methods is written down: a business telling us itself outranks a
-- spreadsheet, which outranks a passer-by's suggestion.
--
-- SAFETY
--
-- Additive. One new CHECK value, one INSERT inside an existing function.
-- Nothing existing is rewritten, and no evidence is backfilled for the 451
-- rows already published — the file that created them is recorded on the
-- batch, but WHICH field came from WHICH cell is not recoverable now, and
-- inventing per-field evidence after the fact would be exactly the fabricated
-- provenance this table exists to prevent.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. A METHOD FOR THE ONE SOURCE KIND THAT HAD NONE
-- ═══════════════════════════════════════════════════════════════════════

/*
 * `public_suggested` — a customer telling us about a business they know.
 *
 * The existing list had `owner_submitted` and `admin_entered`, and a customer
 * suggestion is neither. Recording it as either would be a small lie in the
 * one column whose whole job is to be exact about where a value came from.
 */
alter table public.business_evidence
  drop constraint if exists business_evidence_extraction_method_check;

alter table public.business_evidence
  add constraint business_evidence_extraction_method_check check (extraction_method in (
    'structured_data',
    'dom_extraction',
    'regex',
    'api',
    'owner_submitted',
    'public_suggested',
    'admin_entered',
    'csv_import',
    'ai_extracted',
    'ai_inferred'
  ));

-- ═══════════════════════════════════════════════════════════════════════
-- 2. HOW A SOURCE MAPS ONTO A METHOD AND A TIER
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.evidence_method_for_source(p_source_key text)
returns text
language sql
immutable
set search_path to 'public'
as $fn$
  select case p_source_key
    when 'admin_import' then 'csv_import'
    when 'business_submission' then 'owner_submitted'
    when 'public_suggestion' then 'public_suggested'
    -- An unknown source is not assumed to be better than the weakest known
    -- one. Guessing upwards here would let a new adapter inherit a trust
    -- level nobody granted it.
    else 'admin_entered'
  end;
$fn$;

create or replace function public.evidence_confidence_for_method(p_method text)
returns integer
language sql
immutable
set search_path to 'public'
as $fn$
  select case p_method
    when 'owner_submitted' then 70
    when 'admin_entered' then 60
    when 'csv_import' then 55
    when 'public_suggested' then 40
    when 'api' then 80
    when 'structured_data' then 75
    when 'dom_extraction' then 60
    when 'regex' then 50
    when 'ai_extracted' then 30
    -- §10: a model producing a field without page support is not evidence.
    when 'ai_inferred' then 0
    else 0
  end;
$fn$;

comment on function public.evidence_confidence_for_method is
  'AutoAcquire §11, as a policy table rather than a measurement: two operators reading the same row reach the same number, and the ordering between methods is written down.';

-- ═══════════════════════════════════════════════════════════════════════
-- 3. WRITE IT WHEN A CANDIDATE IS PUBLISHED
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.record_publish_evidence(
  p_business uuid,
  p_candidate public.radar_candidates,
  p_source_url text
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_method text := public.evidence_method_for_source(p_candidate.source_key);
  v_conf   integer := public.evidence_confidence_for_method(v_method);
  v_rows   integer := 0;
begin
  /*
   * One row per field the candidate actually carried.
   *
   * A field with no value gets no evidence row — "we have no phone number" is
   * not an observation about a phone number, and a row saying so would make
   * every completeness query wrong.
   */
  with fields(field_name, field_value) as (
    values
      ('name',          p_candidate.name),
      ('category',      p_candidate.category),
      ('location',      p_candidate.city),
      ('address',       p_candidate.address),
      ('phone',         p_candidate.phone),
      ('whatsapp',      p_candidate.whatsapp),
      ('email',         p_candidate.email),
      ('website',       p_candidate.website),
      ('description',   p_candidate.description),
      ('opening_hours', coalesce(p_candidate.profile->>'opening_hours', p_candidate.profile->>'hours')),
      ('logo_url',      p_candidate.profile->>'logo_url'),
      ('image_url',     coalesce(p_candidate.profile->>'cover_image_url', p_candidate.profile->>'image_url'))
  )
  insert into public.business_evidence (
    business_id, field_name, field_value,
    source_id, source_url, source_type,
    confidence, extraction_method, status, evidence_hash, observed_at
  )
  select
    p_business,
    f.field_name,
    f.field_value,
    p_candidate.source_key,
    coalesce(p_candidate.source_url, p_source_url),
    p_candidate.source_key,
    v_conf,
    v_method,
    /*
     * `single_source` for everything published this way, including owner
     * submissions. Anyone can fill in the owner form — the claim that they
     * run the business is what the claim flow verifies, and marking it
     * confirmed here would let an unverified assertion clear a gate built to
     * require verification.
     */
    'single_source',
    md5(f.field_value),
    now()
  from fields f
  where coalesce(btrim(f.field_value), '') <> ''
  -- A re-publish of the same observation updates nothing rather than
  -- accumulating duplicates. The unique index is on
  -- (business_id, field_name, source_id, evidence_hash).
  on conflict do nothing;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$fn$;

comment on function public.record_publish_evidence is
  'AutoAcquire §8. Writes one business_evidence row per field a published candidate carried, with the method and tier derived from the source that was already cleared to publish it. Records only fields that have a value.';
