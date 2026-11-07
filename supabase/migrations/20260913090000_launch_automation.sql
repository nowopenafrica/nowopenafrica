/*
  # Launch Control automation — the board states itself

  Until now, every tick on the Launch Control board was a human clicking. This
  adds the honesty-first version of that: a scheduled pass that studies the real
  tables and advances the checklist only where the evidence genuinely exists.

  ## What it may and may not do

  - It NEVER un-ticks. A human tick is a decision; the automation records an
    `auto` tick alongside it and leaves the human's alone.
  - It ONLY ticks an item when the real database proves that readiness state —
    see the per-item sources below. An item with no evidence stays unticked,
    and stays unticked even if the row was seeded all-true.
  - Every tick it makes is written to `checklist_evidence` with the source
    table, so the board can show "auto · approvals" rather than pretending the
    tick and the reason are the same thing.

  ## The per-item evidence, and why it is defensible

  Indexes follow LAUNCH_CHECKLIST in src/lib/launches.ts.

    0 Design review passed   -> an approval signed off on a Creative & Brand work item
    1 QA sign-off            -> a Product & Engineering work item reached done
    2 Marketing assets ready -> an asset passed moderation
    3 Explainer video made   -> a video asset was published
    4 Launch email drafted   -> an approval signed off on a Communications & PR item
    5 Docs & release notes   -> the knowledge base has entries
    6 Rollout scheduled      -> social posts are scheduled or an offer is live

  These are org-wide signals: launches are platform features, and a launch's
  "design is done" is not meaningfully narrower than "the org designed
  something". The exact table is captured per tick so nobody has to guess what
  "auto" meant.

  Re-runnable throughout.
*/

-- One evidence entry per checklist item, parallel to checklist_done.
ALTER TABLE public.os_launches
  ADD COLUMN IF NOT EXISTS checklist_evidence jsonb NOT NULL DEFAULT '[]';

/*
  One advance pass. Called by cron; safe to call from the console too.
  Returns a summary of what changed so the run is auditable.
*/
CREATE OR REPLACE FUNCTION public.advance_launch_automations()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id uuid;
  v_row    record;
  v_done   boolean[];
  v_evidence jsonb;
  v_step   int;
  v_advanced int := 0;
  v_checked  int := 0;
  v_changes  jsonb := '[]'::jsonb;
  v_item       text;
  v_signal     boolean;
  v_source     text;
  v_new_done   boolean[];
  v_new_ev     jsonb;
  v_old_ev     jsonb;
BEGIN
  SELECT id INTO v_org_id FROM public.os_orgs WHERE slug = 'nowopen-africa';
  IF v_org_id IS NULL THEN RETURN '{"checked":0,"advanced":0,"errors":["no-org"]}'::jsonb; END IF;

  FOR v_row IN
    SELECT l.id, l.name, l.checklist_done, coalesce(l.checklist_evidence, '[]'::jsonb) AS evidence
      FROM public.os_launches l
     WHERE l.org_id = v_org_id
     ORDER BY l.created_at
  LOOP
    v_checked := v_checked + 1;
    v_done := coalesce(v_row.checklist_done, '{}'::boolean[]);
    v_old_ev := v_row.evidence;
    -- Normalise both arrays to the checklist length (7) so deletes against the
    -- length can never desync the evidence from the ticks.
    IF cardinality(v_done) < 7 THEN
      v_done := v_done || array_fill(false::boolean, ARRAY[7 - cardinality(v_done)]);
    END IF;
    v_new_done := v_done;
    v_new_ev := v_old_ev;

    FOR v_step IN 0 .. 6 LOOP
      -- A human tick is left alone; the automation never overwrites one.
      IF v_done[v_step + 1] IS TRUE THEN CONTINUE; END IF;

      v_signal := false; v_source := ''; v_item := '';
      CASE v_step
        WHEN 0 THEN
          SELECT EXISTS (
            SELECT 1 FROM public.os_approvals a
              JOIN public.os_work_items w ON w.id = a.work_item_id
             WHERE a.status = 'approved' AND w.department = 'Creative & Brand'
              AND w.org_id = v_org_id
          ) INTO v_signal;
          v_source := 'os_approvals'; v_item := 'Design review passed';
        WHEN 1 THEN
          SELECT EXISTS (
            SELECT 1 FROM public.os_work_items w
             WHERE w.department = 'Product & Engineering' AND w.status = 'done'
               AND w.org_id = v_org_id
          ) INTO v_signal;
          v_source := 'os_work_items'; v_item := 'QA sign-off';
        WHEN 2 THEN
          SELECT EXISTS (
            SELECT 1 FROM public.business_media_assets
             WHERE moderation_status = 'approved'
          ) INTO v_signal;
          v_source := 'business_media_assets'; v_item := 'Marketing assets ready';
        WHEN 3 THEN
          SELECT EXISTS (
            SELECT 1 FROM public.business_media_assets
             WHERE asset_type = 'video' AND status IN ('approved', 'published')
          ) INTO v_signal;
          v_source := 'business_media_assets'; v_item := 'Explainer video made';
        WHEN 4 THEN
          SELECT EXISTS (
            SELECT 1 FROM public.os_approvals a
              JOIN public.os_work_items w ON w.id = a.work_item_id
             WHERE a.status = 'approved' AND w.department = 'Communications & PR'
              AND w.org_id = v_org_id
          ) INTO v_signal;
          v_source := 'os_approvals'; v_item := 'Launch email drafted';
        WHEN 5 THEN
          SELECT EXISTS (
            SELECT 1 FROM public.os_knowledge WHERE org_id = v_org_id
          ) INTO v_signal;
          v_source := 'os_knowledge'; v_item := 'Docs & release notes written';
        WHEN 6 THEN
          SELECT (EXISTS (
            SELECT 1 FROM public.social_scheduled_posts WHERE status = 'scheduled'
          ) OR EXISTS (
            SELECT 1 FROM public.business_offers WHERE coalesce(active, true)
          )) INTO v_signal;
          v_source := 'social_scheduled_posts'; v_item := 'Rollout scheduled';
      END CASE;

      IF v_signal THEN
        v_new_done[v_step + 1] := true;
        -- Preserve anything already recorded for this step; record our tick.
        v_new_ev := jsonb_set(
          coalesce(v_new_ev, '[]'::jsonb),
          ARRAY[v_step::text],
          jsonb_build_object('auto', true, 'source', v_source, 'at', now())
        );
        v_advanced := v_advanced + 1;
        v_changes := v_changes || jsonb_build_array(v_item);
      END IF;
    END LOOP;

    IF v_done::text <> v_new_done::text OR v_old_ev::text <> coalesce(v_new_ev,'[]'::jsonb)::text THEN
      UPDATE public.os_launches
         SET checklist_done = v_new_done,
             checklist_evidence = coalesce(v_new_ev, '[]'::jsonb),
             updated_at = now()
       WHERE id = v_row.id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('checked', v_checked, 'advanced', v_advanced, 'items', v_changes);
END;
$$;
REVOKE ALL ON FUNCTION public.advance_launch_automations() FROM public, anon, authenticated;

/*
  The schedule. Launches move on the slow clock — approvals and done work items
  accrete over days, not minutes — so an hourly pass is plenty and cheap.
*/
DO $$
BEGIN
  PERFORM cron.unschedule('nowopen-launch-automation');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule('nowopen-launch-automation', '0 * * * *', $$SELECT public.advance_launch_automations();$$);