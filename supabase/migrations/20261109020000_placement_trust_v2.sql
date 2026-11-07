-- Placement trust view, v2: say who confirmed, read the confirmed period
-- against today, and stop claiming things nobody recorded.
--
-- WHAT CHANGED (public.placement_trust only; nothing else is touched)
--
--   I1  confirmed_by_name / confirmation_method (new columns). The name is the
--       owner the confirmation itself names (placement_availability.
--       confirmed_by_owner), not the placement's linked owner. v1 offered only
--       owner_name, and the page wrote "confirmed ... by {owner_name}" even for
--       an admin or phone check the owner never made. owner_name stays, for
--       showing who owns the placement.
--   I2  The confirmed period now counts. "today" is the Lagos calendar day,
--       (now() AT TIME ZONE 'Africa/Lagos')::date, never the UTC date.
--         available    -> confirmed_available only once period_from <= today
--                         and period_to is null or >= today;
--                         'available_from' (new value) while period_from is
--                         still in the future, with period_from exposed (new
--                         column). An available row with no period_from is
--                         not claimed as available now.
--         booked / unavailable / maintenance
--                      -> stand only while period_to is null or >= today.
--         anything past its period, or past valid_until
--                      -> requires_confirmation, and none of its detail
--                         (dates, method, who) is shown.
--   M6  price_basis is NULL when the placement has no 'pricing' field-source
--       row. v1 coalesced it to 'source_listed', so an owner's own typed price
--       read as a "published rate card".
--   M7  owner_name / owner_website (and confirmed_by_name) are NULL for an
--       owner whose verification is 'rejected', as media_owners_public
--       already does.
--
-- WHY A NEW MIGRATION: 20261109010000_placement_trust.sql is applied and is
-- not edited. CREATE OR REPLACE VIEW keeps every v1 column, in v1 order and
-- type, and only appends the three new ones; availability_valid_until stays
-- although no page reads it.
--
-- Idempotent: CREATE OR REPLACE VIEW plus the same REVOKE ALL / GRANT SELECT
-- as v1 (re-asserted, so a re-run or a widened default grant ends the same).
-- The view still runs with the owner's rights (no security_invoker), which
-- is how anon reads the answer without reading the private tables; it still
-- names its columns and selects no contact or note.
--
-- HOW TO VERIFY (controller, after the founder's go-ahead): run
-- scripts/check-placement-trust.sql (BEGIN ... ROLLBACK), whose checks
-- confirmed_by_names_the_confirming_owner, future_period_is_available_from,
-- lapsed_period_requires_confirmation, rejected_owner_name_hidden and
-- price_basis_null_without_source exercise this file.
--
-- Line comments only: Postgres block comments nest.

CREATE OR REPLACE VIEW public.placement_trust AS
SELECT
  a.id AS advert_id,
  CASE a.lifecycle
    WHEN 'partner_verified' THEN 'partner_verified'
    WHEN 'partner_supplied' THEN 'partner_supplied'
    ELSE 'source_listed'
  END AS trust_label,
  s.availability AS availability,
  CASE WHEN s.availability <> 'requires_confirmation' THEN c.confirmed_at END AS availability_confirmed_at,
  CASE WHEN s.availability <> 'requires_confirmation' THEN c.valid_until END AS availability_valid_until,
  CASE WHEN s.availability <> 'requires_confirmation' THEN c.period_to END AS period_to,
  CASE WHEN o.verification <> 'rejected' THEN o.name END AS owner_name,
  CASE WHEN o.verification <> 'rejected' THEN o.website END AS owner_website,
  fs.basis AS price_basis,
  fs.as_of AS price_as_of,
  CASE WHEN s.availability <> 'requires_confirmation' THEN c.period_from END AS period_from,
  CASE WHEN s.availability <> 'requires_confirmation' AND cb.verification <> 'rejected' THEN cb.name END AS confirmed_by_name,
  CASE WHEN s.availability <> 'requires_confirmation' THEN c.method END AS confirmation_method
FROM public.advertisements a
LEFT JOIN LATERAL (
  SELECT pa.status, pa.confirmed_at, pa.valid_until, pa.period_from, pa.period_to, pa.confirmed_by_owner, pa.method
    FROM public.placement_availability pa
   WHERE pa.advert_id = a.id
   ORDER BY pa.confirmed_at DESC, pa.created_at DESC
   LIMIT 1
) c ON true
CROSS JOIN LATERAL (
  SELECT (now() AT TIME ZONE 'Africa/Lagos')::date AS today
) d
-- The latest confirmation, read against now() (validity) and today (period).
-- The lapse checks come first, so no status survives an ended period.
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN c.valid_until IS NULL OR c.valid_until <= now() THEN 'requires_confirmation'
    WHEN c.period_to IS NOT NULL AND c.period_to < d.today THEN 'requires_confirmation'
    WHEN c.status = 'available' AND c.period_from <= d.today THEN 'confirmed_available'
    WHEN c.status = 'available' AND c.period_from > d.today THEN 'available_from'
    WHEN c.status IN ('booked', 'unavailable', 'maintenance') THEN c.status
    ELSE 'requires_confirmation'
  END AS availability
) s
LEFT JOIN public.media_owners o ON o.id = a.owner_id
LEFT JOIN public.media_owners cb ON cb.id = c.confirmed_by_owner
LEFT JOIN public.placement_field_source fs ON fs.advert_id = a.id AND fs.field = 'pricing'
WHERE a.lifecycle NOT IN ('rejected', 'archived');

COMMENT ON VIEW public.placement_trust IS
  'Public trust state per placement. Availability is the latest confirmation read against now() and the Lagos day, so it lapses without a job. A future period reads available_from. confirmed_by_name is the owner the confirmation names, never the linked owner by default. Rejected and archived placements are excluded.';

REVOKE ALL ON public.placement_trust FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.placement_trust TO anon, authenticated;
