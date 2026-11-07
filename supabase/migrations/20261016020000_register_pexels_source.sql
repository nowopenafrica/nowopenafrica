-- Register Pexels, so stock-image provenance stops being silently discarded.
--
-- ── THE BUG ──────────────────────────────────────────────────────────────
--
-- MEASURED 2026-10-06, from a live enrichment run:
--
--   "evidence insert failed: insert or update on table \"business_evidence\"
--    violates foreign key constraint \"business_evidence_source_id_fkey\""
--
-- business_evidence.source_id REFERENCES radar_sources(key), and the
-- enrichment attributes a stock cover image to the source `pexels` — which was
-- never registered. Eighteen sources are, that one is not.
--
-- The failure is worse than it looks. The evidence insert fails, but the job
-- carries on and the image IS applied (the same run reported
-- `auto_applied: 1`). So the picture reaches the listing while the record of
-- WHERE IT CAME FROM is thrown away — the exact inversion of what a provenance
-- system is for. Registering the source fixes the trail; it does not start
-- anything new.
--
-- ── WHY IT IS REGISTERED INACTIVE ────────────────────────────────────────
--
-- `active = true` is refused by the table's own CHECK unless
-- redistribution AND competing_dataset are both 'permitted'. The Pexels
-- licence does not permit either: it forbids selling unmodified copies and
-- forbids using the photos to build a competing or similar service.
--
-- That is the registry working as designed, and the honest record is
-- `active = false` with the restriction written down. The foreign key only
-- requires the row to EXIST, so provenance is captured either way — the flag
-- says this is not a source to go discovering from, which is true.
--
-- ── A QUESTION THIS DOES NOT ANSWER ──────────────────────────────────────
--
-- Whether a stock photograph should appear on a real business's listing at all
-- is a product decision, not a schema one. It is not a picture of that
-- business. The code marks the candidate `exact:false` and routes it as a
-- proposal, but the run above auto-applied one. Flagged for the operator
-- rather than changed here.

insert into public.radar_sources (
  key, name, kind, source_type, access_method, auth_type,
  licence, documentation_url, api_endpoint,
  compliance_status, active,
  automated_access, bulk_extraction, redistribution, competing_dataset,
  image_reuse_allowed, contact_storage_allowed,
  attribution_required, attribution_text,
  authorised_by, notes
) values (
  'pexels',
  'Pexels',
  'media_library',
  'open_data',
  'api',
  'api_key',
  'Pexels License — https://www.pexels.com/license/ — free to use and modify, '
    || 'no attribution required. PROHIBITED: selling unmodified copies, and using '
    || 'the photos to build a competing or similar service.',
  'https://www.pexels.com/api/documentation/',
  'https://api.pexels.com/v1/search',
  -- Usable for what it is used for, with the restrictions recorded.
  'approved_with_restrictions',
  -- Cannot be true: the CHECK requires redistribution AND competing_dataset to
  -- be 'permitted', and the Pexels licence permits neither. This is also
  -- correct on its own terms — Pexels is a media library, not a source of
  -- businesses to discover.
  false,
  'permitted',
  -- Pulling the library wholesale is exactly what the licence forbids.
  'prohibited',
  'prohibited',
  'prohibited',
  'permitted',
  -- A stock library holds no business contact details.
  'prohibited',
  false,
  null,
  'Founder, NowOpen Africa (2026-10-06) — Pexels License reviewed at '
    || 'pexels.com/license. No agreement required for use; registered so image '
    || 'provenance is recorded rather than discarded by a failing foreign key.',
  'Stock cover imagery for listings with no photograph of their own. NOT a '
    || 'discovery source — it knows nothing about businesses. Every candidate '
    || 'it produces is marked exact:false, because the photograph is not of '
    || 'that business; whether such an image belongs on a real listing at all '
    || 'is an open product question.'
)
on conflict (key) do nothing;

do $v$
declare v_active boolean;
begin
  select active into v_active from public.radar_sources where key = 'pexels';
  assert v_active is not null, 'pexels was not registered';
  assert v_active = false, 'pexels must not be active — it is not a discovery source';

  -- The point of the exercise: evidence can now record where an image came from.
  assert exists (select 1 from public.radar_sources where key = 'pexels'),
    'the foreign key target is still missing';
  raise notice 'pexels registered (inactive); image provenance will now persist';
end $v$;
