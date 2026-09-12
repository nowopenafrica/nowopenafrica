/*
  # Business Intelligence — owner sync-preference auto-apply

  Turns business_sync_preferences into behaviour. The engine WRITES proposals;
  whether one is applied is authority, and that authority is the owner's —
  this migration is the single place where an owner's stored `auto_apply_*`
  flags and `approval_threshold` can approve a proposal WITHOUT a person in
  the review loop.

  DESIGN

  - `_apply_proposal_write(uuid)` is the ONE write core (business row + the
    hours metadata + superseding the field's older evidence). The staff
    applier and the auto applier both hand it the proposal id AFTER each has
    done its own authorisation. Extracting the write keeps two authorised
    paths from drifting apart — a drift here would mean one path edits the
    business without the other's rules.
  - `_apply_proposal_write` holds no authority of its own and grants nothing
    to PUBLIC: it is reachable only by the service role, or by a definer
    chain that already checked something (staff, owner prefs). The staff
    applier is REPLACED so it delegates here instead of inlining a second
    copy of the write.
  - `auto_apply_due_proposals(uuid)` is the owner-authorised applier. For
    each pending proposal it consults the owner's flags (field family →
    column), the confidence bar (`approval_threshold`), the evidence rule the
    staff applier enforces, and the writable-field allowlist, then applies.
    Nothing applies unless the OWNER set a flag; every flag defaults to
    ask-first. The single override: an owner who set `confirm_24_hours` has
    ALREADY asserted the business is open 24/7, so a proposal whose value
    matches that assertion applies without the hours flag or the confidence
    bar — the authority is the owner's own claim, not the source's score.
  - The executor (service role, held by the edge function) calls this once
    per business at the end of a live run; it is idempotent (approving moves
    rows out of `status = 'pending'`, which is also the queue the dedupe
    index guards).

  Re-runnable throughout.
*/

-- The write core. NO authorisation here — callers authorise, this writes.
CREATE OR REPLACE FUNCTION public._apply_proposal_write(p_proposal uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v record; v_field text; v_statement text;
BEGIN
  SELECT * INTO v FROM public.business_change_proposals WHERE id = p_proposal;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such proposal'; END IF;

  -- Allowed fields only, enforced here rather than mirrored twice (the set
  -- lives with the importer; social_links is the engine's own jsonb add).
  IF v.field_name NOT IN ('description','category','address','location','phone','whatsapp','email',
                          'website','logo_url','image_url','opening_hours','tagline','about','story',
                          'mission','vision','subcategory','business_type','employees','service_area',
                          'timezone','founded_year','social_links')
  THEN RAISE EXCEPTION 'field % is not writable through proposals', v.field_name; END IF;

  -- social_links is jsonb and MERGES so one run never wipes a platform an
  -- owner added afterwards.
  IF v.field_name = 'social_links' THEN
    UPDATE public.businesses
       SET social_links = coalesce(social_links, '{}'::jsonb) || v.proposed_value::jsonb,
           updated_at = now()
     WHERE id = v.business_id;
  ELSE
    v_field := quote_ident(v.field_name);
    v_statement := format('update public.businesses set %s = $1, updated_at = now() where id = $2', v_field);
    EXECUTE v_statement USING v.proposed_value, v.business_id;
  END IF;

  -- Real hours also record WHERE they came from and that they are timed, so a
  -- 24/7-only source cannot be mistaken for owner confirmation.
  IF v.field_name = 'opening_hours' THEN
    UPDATE public.businesses
       SET hours_source = coalesce(v.source_id, 'source'),
           hours_source_url = v.source_url,
           hours_last_verified = now(),
           availability_confirmation = 'timed',
           is_24_hours = (v.proposed_value ~ '24\s*/\s*7|24 *hours|always open')
     WHERE id = v.business_id;
  END IF;

  -- This field's other evidence is now history, not current.
  UPDATE public.business_evidence
     SET superseded_at = now()
   WHERE business_id = v.business_id AND field_name = v.field_name AND id <> v.evidence_id;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public._apply_proposal_write(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public._apply_proposal_write(uuid) TO service_role;

-- The staff applier, REPLACED so it authorises and delegates. The behaviour is
-- identical to the original: staff gate, approved + evidence re-check, stamps
-- the reviewer, then delegates the actual write to the shared core.
CREATE OR REPLACE FUNCTION public.apply_business_change_proposal(p_proposal uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record;
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'Staff only'; END IF;
  SELECT * INTO v FROM public.business_change_proposals WHERE id = p_proposal;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such proposal'; END IF;
  IF v.status <> 'approved' THEN RAISE EXCEPTION 'proposal is not approved'; END IF;
  IF v.evidence_id IS NULL THEN RAISE EXCEPTION 'proposal has no evidence and cannot be applied'; END IF;

  UPDATE public.business_change_proposals
     SET reviewed_by = auth.uid(), reviewed_at = now(), note = 'Applied by engine', status = 'approved'
   WHERE id = p_proposal;

  RETURN public._apply_proposal_write(p_proposal);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_business_change_proposal(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_business_change_proposal(uuid) TO authenticated;

-- The owner-authorized applier. Service role only: called by the executor
-- edge function after a live run.
CREATE OR REPLACE FUNCTION public.auto_apply_due_proposals(p_business uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pref record;
  v record;
  v_flag boolean;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_pref FROM public.business_sync_preferences WHERE business_id = p_business;
  IF NOT FOUND OR v_pref.sync_enabled = false THEN RETURN 0; END IF;

  FOR v IN
    SELECT id, field_name, proposed_value, confidence, source_id, source_url, evidence_id
      FROM public.business_change_proposals
     WHERE business_id = p_business AND status = 'pending'
     ORDER BY confidence DESC
  LOOP
    -- Which owner flag governs this field family?
    IF v.field_name = 'opening_hours' THEN v_flag := v_pref.auto_apply_hours;
    ELSIF v.field_name IN ('logo_url','image_url') THEN v_flag := v_pref.auto_apply_source_images;
    ELSE v_flag := v_pref.auto_apply_discovery_fields;
    END IF;

    -- The owner confirmed 24/7: a proposal whose value says exactly that is
    -- the owner's own claim, so it applies without the flag or the bar.
    IF v.field_name = 'opening_hours'
       AND v_pref.confirm_24_hours
       AND v.proposed_value ~* '24\s*/\s*7|24[\s-]*hours|always open'
    THEN
      IF v.evidence_id IS NULL THEN CONTINUE; END IF;
      UPDATE public.business_change_proposals
         SET status = 'approved', reviewed_at = now(), auto_applied = true,
             note = 'Auto-applied by owner preference'
       WHERE id = v.id;
      PERFORM public._apply_proposal_write(v.id);
      v_count := v_count + 1;
      CONTINUE;
    END IF;

    IF NOT v_flag THEN CONTINUE; END IF;                 -- owner didn't opt this family in
    IF v.confidence < v_pref.approval_threshold THEN CONTINUE; END IF; -- wouldn't clear their bar
    IF v.evidence_id IS NULL THEN CONTINUE; END IF;      -- same evidence rule as staff

    UPDATE public.business_change_proposals
       SET status = 'approved', reviewed_at = now(), auto_applied = true,
           note = 'Auto-applied by owner preference'
     WHERE id = v.id;

    PERFORM public._apply_proposal_write(v.id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.auto_apply_due_proposals(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.auto_apply_due_proposals(uuid) TO service_role;