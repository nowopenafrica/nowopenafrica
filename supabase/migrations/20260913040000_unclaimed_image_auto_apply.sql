/*
  # Business Intelligence — platform-authorised images for unclaimed businesses

  For an UNCLAIMED business there is no owner to ask, so the platform is the
  authoriser: every unclaimed listing gets a licensed cover/logo until it is
  claimed. This layering REPLACES auto_apply_due_proposals (same signature, so
  CREATE OR REPLACE is a true replace) with one narrow override on top of
  20260912020000:

    - a pending logo_url/image_url proposal for an UNCLAIMED business applies
      when its confidence clears the PLATFORM bar (60), regardless of the
      stored approval_threshold.
    - an unclaimed business with no preferences row is treated as a platform
      decision: sync on, source images on, discovery fields off, bar 60.
    - CLAIMED businesses keep the owner gate exactly as before (default bar 80
      keeps a 60-confidence stock placeholder pending until the owner decides).
    - everything else is untouched and re-pinned here: the evidence rule, the
      field-family flags, the 24/7 owner override, and the single write core.

  Builds only on objects created by earlier migrations, so it is re-runnable.
*/

CREATE OR REPLACE FUNCTION public.auto_apply_due_proposals(p_business uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pref public.business_sync_preferences;
  v record;
  v_flag boolean;
  v_claim text;
  v_count integer := 0;
BEGIN
  SELECT claim_status INTO v_claim FROM public.businesses WHERE id = p_business;
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT * INTO v_pref FROM public.business_sync_preferences WHERE business_id = p_business;
  IF NOT FOUND THEN
    -- No preferences row. An unclaimed business belongs to nobody, so the
    -- platform IS the authoriser — but only for clearly-licensed images, at
    -- the platform's bar; everything else stays off. A claimed business with
    -- no row gets nothing at all.
    IF v_claim = 'unclaimed' THEN
      v_pref.sync_enabled := true;
      v_pref.auto_apply_hours := false;
      v_pref.auto_apply_source_images := true;
      v_pref.auto_apply_discovery_fields := false;
      v_pref.notify_on_change := false;
      v_pref.approval_threshold := 60;
      v_pref.confirm_24_hours := false;
    ELSE
      RETURN 0;
    END IF;
  END IF;
  IF v_pref.sync_enabled = false THEN RETURN 0; END IF;

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

    IF NOT v_flag THEN CONTINUE; END IF;

    -- The PLATFORM sets the bar for its own stock images on unclaimed
    -- businesses (60) — there is no owner to raise it. Claimed businesses
    -- keep the owner's stored bar, so a 60-confidence stock placeholder sits
    -- pending for review there.
    IF v.field_name IN ('logo_url','image_url') AND v_claim = 'unclaimed' THEN
      IF v.confidence < 60 THEN CONTINUE; END IF;
    ELSE
      IF v.confidence < v_pref.approval_threshold THEN CONTINUE; END IF;
    END IF;

    IF v.evidence_id IS NULL THEN CONTINUE; END IF;

    UPDATE public.business_change_proposals
       SET status = 'approved', reviewed_at = now(), auto_applied = true,
           note = CASE WHEN v_claim = 'unclaimed'
                  THEN 'Auto-applied by platform (unclaimed listing)'
                  ELSE 'Auto-applied by owner preference' END
     WHERE id = v.id;

    PERFORM public._apply_proposal_write(v.id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.auto_apply_due_proposals(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.auto_apply_due_proposals(uuid) TO service_role;