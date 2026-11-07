-- First-party sources may be active without claiming crawl permissions.
--
-- THE BUG, MEASURED 2026-09-15
--
-- Every candidate filed by the manual extraction tool failed at publication with
--
--     Nothing published — Source manual_extraction is not authorised for publication
--
-- radar_publish_candidate() refuses when the source row is not `active`, and
-- manual_extraction could not be made active, because of this CHECK:
--
--     active = false
--     OR (automated_access = 'permitted' AND bulk_extraction = 'permitted'
--         AND competing_dataset = 'permitted' AND redistribution = 'permitted'
--         AND licence <> '' AND authorised_by <> '')
--
-- manual_extraction honestly records automated_access = 'prohibited' and
-- bulk_extraction = 'prohibited', because that is what the tool does: one page,
-- opened by a person, no crawling and no link following. Answering those two
-- questions truthfully is precisely what locked it out.
--
-- WHAT THE COMPARISON SHOWED
--
--   admin_import         active  auto=permitted   bulk=permitted
--   business_submission  active  auto=permitted   bulk=permitted
--   public_suggestion    active  auto=permitted   bulk=permitted
--   manual_extraction    BLOCKED auto=prohibited  bulk=prohibited
--
-- A CSV an administrator uploads and a form a business owner fills in involve
-- no automated access to anybody's site. Those three rows say "permitted"
-- because the constraint demanded it to let them work — four permissions
-- recorded against questions nobody was ever asked. The register was carrying a
-- misstatement in order to function.
--
-- THE CORRECTION
--
-- `automated_access` and `bulk_extraction` describe how NowOpen reaches a THIRD
-- PARTY's data. For first-party intake — a form, a CSV, a page a person opened
-- and attested rights for at import — no third party is being accessed, so
-- there is no permission to hold and 'prohibited' is a statement of restraint
-- rather than a missing right.
--
-- The rights that ARE engaged still apply in full, to every source: may the
-- data be redistributed, may it sit in a competing dataset, under what licence,
-- authorised by whom. Those four remain required for any source to be active.
--
-- WHY ACTIVATING THIS CANNOT START A CRAWLER
--
-- discovery-worker filters campaign sources through SUPPORTED_SOURCES =
-- {wikidata, openstreetmap, official_website} BEFORE it ever queries
-- radar_sources. manual_extraction has no adapter and is not in that set, so no
-- automated run can dispatch it whatever `active` says. `active` here means
-- only "candidates from this source may be published by an admin".

alter table public.radar_sources
  drop constraint if exists radar_sources_active_requires_rights;

alter table public.radar_sources
  add constraint radar_sources_active_requires_rights check (
    active = false
    OR (
      -- Engaged by every source, first-party or not.
      competing_dataset = 'permitted'
      AND redistribution = 'permitted'
      AND licence IS NOT NULL AND btrim(licence) <> ''
      AND authorised_by IS NOT NULL AND btrim(authorised_by) <> ''
      AND (
        -- First-party intake: nobody else's site is being reached, so the two
        -- crawl permissions do not apply and must not be invented.
        access_method IN ('manual', 'csv_upload', 'form', 'email')
        -- Everything that does reach a third party still needs both, in full.
        OR (automated_access = 'permitted' AND bulk_extraction = 'permitted')
      )
    )
  );

-- Now the three first-party rows can say what is actually true. This is a
-- correction of a misstatement, not a loosening: none of them ever performed
-- automated or bulk access, and recording 'prohibited' makes the compliance
-- register answerable to an auditor.
update public.radar_sources
   set automated_access = 'prohibited',
       bulk_extraction  = 'prohibited'
 where access_method in ('manual', 'csv_upload', 'form', 'email')
   and (automated_access = 'permitted' or bulk_extraction = 'permitted');

-- And the tool's own source can publish. Rights for each individual import are
-- attested by the operator at the moment of import — the extract screen makes
-- them tick a box saying so, and the reason is written onto the candidate —
-- which is why the licence column reads "depends entirely on the page read".
update public.radar_sources
   set active = true,
       authorised_by = coalesce(nullif(btrim(authorised_by), ''), 'NowOpen admin'),
       compliance_status = 'approved_with_restrictions',
       notes = coalesce(nullif(btrim(notes), '') || ' ', '')
         || 'Active for PUBLICATION only. No adapter exists and the key is absent from '
         || 'discovery-worker SUPPORTED_SOURCES, so no automated run can dispatch it. '
         || 'Per-import rights are attested by the operator on the extract screen.'
 where key = 'manual_extraction';
