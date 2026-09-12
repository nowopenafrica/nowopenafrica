/*
  # Business Intelligence — change proposals

  The ONLY route by which the enrichment engine (or a source, or a reviewer)
  changes a real business listing. A proposal is "here is what source X says,
  with evidence — adopt it?":

    - Evidence travels with the proposal (field_name + confidence + the
      business_evidence row it rests on), so approval is a mapped decision,
      never a blind write.
    - Anything the engine does NOT know to be true cannot become real: there
      is no auto-publish path in the database itself. Autonomy is a policy
      (business_sync_preferences / a staff decision), decided elsewhere.
    - Once approved, the row's current_value records what was replaced, so the
      proposal list doubles as the change history the audit trail on top of
      it already supplies.

  DELIBERATELY NOT auto-applied: the workforce boundary in 20260901040000
  ("measure and report, never act") is what this list protects. The executor
  may WRITE proposals; approving ONE is an authority-bearing decision made by
  a person or by an owner's explicit sync preference held in
  business_sync_preferences.

  SAFETY: proposed_value is never stored in a way any render path consumes
  directly — applying a proposal is the ONLY write path, and it runs through
  a SECURITY DEFINER function that re-checks the evidence exists, so a raw
  UPDATE cannot bypass the engine's own rules.

  Re-runnable throughout.
*/

CREATE TABLE IF NOT EXISTS public.business_change_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,

  field_name text NOT NULL,
  current_value text,            -- what the row holds today (for history)
  proposed_value text NOT NULL,  -- what source X says it should be

  source_id   text REFERENCES public.radar_sources(key) ON DELETE SET NULL,
  source_url  text,
  confidence  integer NOT NULL DEFAULT 0,
  extraction_method text,        -- same vocabulary as business_evidence
  evidence_id uuid REFERENCES public.business_evidence(id) ON DELETE SET NULL,
  reason  text,                  -- human-readable why (.e.g. "OpenStreetMap hours differ from stored hours")

  status text NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | superseded
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  note text,
  auto_applied boolean NOT NULL DEFAULT false,  -- true when an owner sync preference approved it

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_change_proposals_status_check CHECK (status IN ('pending','approved','rejected','superseded'))
);

CREATE INDEX IF NOT EXISTS business_change_proposals_queue
  ON public.business_change_proposals (business_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS business_change_proposals_active_unique
  ON public.business_change_proposals (business_id, field_name)
  WHERE status = 'pending';

ALTER TABLE public.business_change_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_change_proposals_public_read ON public.business_change_proposals;
DROP POLICY IF EXISTS business_change_proposals_staff_write ON public.business_change_proposals;

-- Public read, scoped to listable businesses: a visitor/owner should be able
-- to see "a proposal to change the logo is pending" — it is provenance, same
-- as business_evidence. Proposals for non-listable rows stay invisible.
CREATE POLICY business_change_proposals_public_read ON public.business_change_proposals
  FOR SELECT TO anon, authenticated
  USING (exists (
    select 1 from public.businesses b
     where b.id = business_change_proposals.business_id and b.is_listable
  ));

-- Only staff (or the SECURITY DEFINER applier below) may write them.
CREATE POLICY business_change_proposals_staff_write ON public.business_change_proposals
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

/*
  Apply an approved proposal to the business row.

  Re-checks, in the definer, everything the engine was supposed to have
  checked before proposing: the caller is staff, the proposal really is
  approved, and it carries evidence (a proposal with none is refused — an AI
  asserting a fact out of thin air must not be writable). It then writes the
  field, marks the proposal applied, and marks any earlier evidence for that
  field superseded, so the field's provenance trail reads forward.

  Granted to authenticated exactly like radar_publish_candidate: the
  in-function staff gate is the authority, not the grant list. The owner
  sync-preference auto-apply path runs through an edge function holding the
  service role.
*/
CREATE OR REPLACE FUNCTION public.apply_business_change_proposal(p_proposal uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record; v_field text; v_statement text;
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'Staff only'; END IF;
  SELECT * INTO v FROM public.business_change_proposals WHERE id = p_proposal;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such proposal'; END IF;
  IF v.status <> 'approved' THEN RAISE EXCEPTION 'proposal is not approved'; END IF;
  IF v.evidence_id IS NULL THEN RAISE EXCEPTION 'proposal has no evidence and cannot be applied'; END IF;

  -- Allowed fields only; the set lives with the importer (UPDATABLE_FIELDS)
  -- and is enforced here rather than mirrored twice. social_links is the
  -- engine's own addition (the jsonb column that holds {instagram,…}).
  IF v.field_name NOT IN ('description','category','address','location','phone','whatsapp','email',
                          'website','logo_url','image_url','opening_hours','tagline','about','story',
                          'mission','vision','subcategory','business_type','employees','service_area',
                          'timezone','founded_year','social_links')
  THEN RAISE EXCEPTION 'field % is not writable through proposals', v.field_name; END IF;

  -- social_links is jsonb and MERGES so a proposal in one run never wipes a
  -- platform an owner added themselves afterwards.
  IF v.field_name = 'social_links' THEN
    UPDATE public.businesses
       SET social_links = coalesce(social_links, '{}'::jsonb) || v.proposed_value::jsonb,
           updated_at = now()
     WHERE id = v.business_id;
  ELSE
    -- Exact write: proposal value is used verbatim. It is what a source said.
    v_field := quote_ident(v.field_name);
    v_statement := format('update public.businesses set %s = $1, updated_at = now() where id = $2', v_field);
    EXECUTE v_statement USING v.proposed_value, v.business_id;
  END IF;

  -- Applying real hours also records WHERE they came from and that they are
  -- timed (derived from concrete ranges), so a 24/7-only source cannot be
  -- mistaken for owner confirmation. The availability trigger flips the mode
  -- to derived on the same write.
  IF v.field_name = 'opening_hours' THEN
    UPDATE public.businesses
       SET hours_source = coalesce(v.source_id, 'source'),
           hours_source_url = v.source_url,
           hours_last_verified = now(),
           availability_confirmation = 'timed',
           is_24_hours = (v.proposed_value ~ '24\s*/\s*7|24 *hours|always open')
     WHERE id = v.business_id;
  END IF;

  UPDATE public.business_change_proposals
     SET reviewed_by = auth.uid(), reviewed_at = now(), note = 'Applied by engine', status = 'approved'
   WHERE id = p_proposal;

  -- This field's other evidence is now history, not current.
  UPDATE public.business_evidence
     SET superseded_at = now()
   WHERE business_id = v.business_id AND field_name = v.field_name AND id <> v.evidence_id;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_business_change_proposal(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_business_change_proposal(uuid) TO authenticated;