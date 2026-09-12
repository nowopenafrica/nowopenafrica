/*
  # The whole workforce runs

  Four agents out of eighteen had an implementation and a schedule; the other
  fourteen sat in the roster as names with no clock, so most of the company
  silently never worked. This closes that gap:

    1. reconciles `missing_hours` with the availability model (20260911000000),
    2. puts all fourteen remaining roles on the schedule,
    3. gives every role its facts, from real tables only.

  ## What `missing_hours` means now

  After 20260911000000 an unclaimed business with no recorded hours carries
  `availability_mode = 'default_24_7'` and renders "Open now · Open 24 hours ·
  platform default" — it CAN answer "are you open", honestly, and the public
  state machine in src/lib/openingHours.ts treats it as open. Counting those
  rows as "cannot say whether they are open" made the Chief of Staff brief
  contradict the very pages it reports on (tens of thousands of default-24/7
  listings flagged as un-answerable). A listing counts as missing hours only
  when the state machine really would render `unknown`:

    - no hours text, and
    - not `default_24_7` (always open by platform default), and
    - not a confirmed 24/7 business (`is_24_hours` AND `is_24_hours_confirmed`).

  The predicate below mirrors publicOpenState() branch-for-branch, so the brief
  and the pages cannot disagree again.

  Re-runnable throughout.
*/

/* ---------------------------------------------------------------- 1. facts */

/*
  platform_facts(): identical to 20260901030000 except `missing_hours` follows
  the availability model. The console brief and the scheduled brief read the
  same number from the same function.
*/
CREATE OR REPLACE FUNCTION public.platform_facts()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  SELECT jsonb_build_object(
    'listings_public',    (SELECT count(*) FROM public.businesses WHERE is_listable),
    'listings_total',     (SELECT count(*) FROM public.businesses),
    'claimed',            (SELECT count(*) FROM public.businesses WHERE claim_status = 'claimed'),
    'verified',           (SELECT count(*) FROM public.businesses WHERE verification_status = 'verified'),
    'missing_hours',      (SELECT count(*) FROM public.businesses
                            WHERE is_listable
                              AND coalesce(nullif(btrim(coalesce(opening_hours, hours, '')), ''), NULL) IS NULL
                              AND NOT (availability_mode = 'default_24_7' AND NOT coalesce(is_24_hours_confirmed, false))
                              AND NOT (coalesce(is_24_hours, false) AND coalesce(is_24_hours_confirmed, false))),
    'claims_pending',     (SELECT count(*) FROM public.business_claims WHERE status = 'pending'),
    'reports_open',       (SELECT count(*) FROM public.business_reports WHERE status = 'open'),
    'review_queue',       (SELECT count(*) FROM public.radar_candidates WHERE status IN ('pending','review')),
    'offers_running',     (SELECT count(*) FROM public.business_offers
                            WHERE coalesce(active, true)
                              AND (starts_at IS NULL OR starts_at <= now())
                              AND (ends_at   IS NULL OR ends_at   >= now())),
    'founding_claimed',   (SELECT count(*) FROM public.founding_members)
  ) INTO r;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_facts() FROM public;
GRANT EXECUTE ON FUNCTION public.platform_facts() TO authenticated;

/* ------------------------------------------------------- 2. the clock */

INSERT INTO public.workforce_schedule (agent_key, interval_min, notes) VALUES
  ('strategy-director',   1440, 'Five launch KPIs and the quarter: is the plan measurable?'),
  ('research-analyst',    1440, 'Market and competitor intelligence pipeline.'),
  ('seo-manager',         1440, 'Discoverability: description and geo coverage, rich-result readiness.'),
  ('social-director',      720, 'Content calendar health and publishing cadence.'),
  ('content-manager',      720, 'Copy coverage: scheduled captions, work items, sign-offs.'),
  ('comms-director',      1440, 'The approval gate on anything public, and decisions recorded to the knowledge base.'),
  ('creative-director',   1440, 'Media asset rights, the review queue and takedown honouring.'),
  ('copywriter',           720, 'Does every public page have a story it can tell?'),
  ('production-manager',  1440, 'Video pipeline: approved assets moving to published.'),
  ('post-supervisor',     1440, 'QA gate: nothing renders before it is checked.'),
  ('sales-director',       360, 'Profile requests, orders awaiting a quote, and the prospect funnel.'),
  ('operations-director',  360, 'Workflow health: blocked work, failed queues, approvals.'),
  ('finance-analyst',     1440, 'Order and checkout pipeline; founding numbers issued.'),
  ('product-manager',     1440, 'Launch readiness and roadmap blockers.')
ON CONFLICT (agent_key) DO NOTHING;

/* ------------------------------------------------------------------ 3. facts */

/*
  workforce_facts_for(): now returns facts for all eighteen scheduled agents.
  Same rule as before — each branch is that agent's own evidence, none share a
  failure, and everything is a count over a real table. `missing_hours` in the
  chief-of-staff branch uses the reconciled predicate above.
*/
CREATE OR REPLACE FUNCTION public.workforce_facts_for(p_agent_key text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN CASE p_agent_key
    WHEN 'chief-of-staff'   THEN (SELECT jsonb_build_object(
        'listings_public',  (SELECT count(*) FROM public.businesses WHERE is_listable),
        'listings_total',   (SELECT count(*) FROM public.businesses),
        'claimed',          (SELECT count(*) FROM public.businesses WHERE claim_status = 'claimed'),
        'verified',         (SELECT count(*) FROM public.businesses WHERE verification_status = 'verified'),
        'missing_hours',    (SELECT count(*) FROM public.businesses WHERE is_listable
                              AND coalesce(nullif(btrim(coalesce(opening_hours, hours, '')), ''), NULL) IS NULL
                              AND NOT (availability_mode = 'default_24_7' AND NOT coalesce(is_24_hours_confirmed, false))
                              AND NOT (coalesce(is_24_hours, false) AND coalesce(is_24_hours_confirmed, false))),
        'claims_pending',   (SELECT count(*) FROM public.business_claims WHERE status = 'pending'),
        'reports_open',     (SELECT count(*) FROM public.business_reports WHERE status = 'open'),
        'review_queue',     (SELECT count(*) FROM public.radar_candidates WHERE status IN ('pending','review')),
        'offers_running',   (SELECT count(*) FROM public.business_offers WHERE coalesce(active,true)
                              AND (starts_at IS NULL OR starts_at <= now())
                              AND (ends_at   IS NULL OR ends_at   >= now())),
        'founding_claimed', (SELECT count(*) FROM public.founding_members)))
    WHEN 'trust-safety'     THEN (SELECT jsonb_build_object(
        'reports_open',        (SELECT count(*) FROM public.business_reports WHERE status='open'),
        'reports_over_24h',    (SELECT count(*) FROM public.business_reports WHERE status='open' AND created_at < now() - interval '24 hours'),
        'reports_not_real',    (SELECT count(*) FROM public.business_reports WHERE status='open' AND reason IN ('not_real','impersonation')),
        'reports_closed_claim',(SELECT count(*) FROM public.business_reports WHERE status='open' AND reason='closed'),
        'suspended',           (SELECT count(*) FROM public.businesses WHERE lifecycle_status='suspended'),
        'unverified_public',   (SELECT count(*) FROM public.businesses WHERE is_listable AND verification_status <> 'verified')))
    WHEN 'customer-success' THEN (SELECT jsonb_build_object(
        'claims_pending',     (SELECT count(*) FROM public.business_claims WHERE status='pending'),
        'claims_over_48h',    (SELECT count(*) FROM public.business_claims WHERE status='pending' AND created_at < now() - interval '48 hours'),
        'claimed_incomplete', (SELECT count(*) FROM public.businesses WHERE claim_status='claimed' AND coalesce(listing_score,0) < 60),
        'claimed_no_hours',   (SELECT count(*) FROM public.businesses WHERE claim_status='claimed'
                                AND coalesce(nullif(btrim(coalesce(opening_hours, hours, '')), ''), NULL) IS NULL),
        'owners',             (SELECT count(DISTINCT user_id) FROM public.businesses WHERE user_id IS NOT NULL)))
    WHEN 'growth-director'  THEN (SELECT jsonb_build_object(
        'prospects',        (SELECT count(*) FROM public.businesses WHERE data_status='synthetic_unverified'),
        'listings_public',  (SELECT count(*) FROM public.businesses WHERE is_listable),
        'claimed',          (SELECT count(*) FROM public.businesses WHERE claim_status='claimed'),
        'claims_started',   (SELECT count(*) FROM public.business_claims),
        'review_queue',     (SELECT count(*) FROM public.radar_candidates WHERE status IN ('pending','review')),
        'suggestions_7d',   (SELECT count(*) FROM public.radar_candidates WHERE source_key='public_suggestion' AND created_at > now() - interval '7 days'),
        'founding_claimed', (SELECT count(*) FROM public.founding_members),
        'offers_running',   (SELECT count(*) FROM public.business_offers WHERE coalesce(active,true)
                              AND (starts_at IS NULL OR starts_at <= now())
                              AND (ends_at   IS NULL OR ends_at   >= now()))))
    WHEN 'strategy-director' THEN (SELECT jsonb_build_object(
        'listings_public',   (SELECT count(*) FROM public.businesses WHERE is_listable),
        'claimed',           (SELECT count(*) FROM public.businesses WHERE claim_status='claimed'),
        'verified',          (SELECT count(*) FROM public.businesses WHERE verification_status='verified'),
        'claims_started',    (SELECT count(*) FROM public.business_claims),
        'launches_total',    (SELECT count(*) FROM public.os_launches),
        'launches_ready',    (SELECT count(*) FROM public.os_launches
                               WHERE array_length(checklist_done, 1) > 0
                                 AND NOT (false = ANY(checklist_done))),
        'enrichment_backlog',(SELECT count(*) FROM public.business_enrichment_jobs WHERE status IN ('queued','running')),
        'suggestions_7d',    (SELECT count(*) FROM public.radar_candidates WHERE source_key='public_suggestion' AND created_at > now() - interval '7 days')))
    WHEN 'research-analyst' THEN (SELECT jsonb_build_object(
        'radar_pending',       (SELECT count(*) FROM public.radar_candidates WHERE status IN ('pending','review')),
        'suggestions_7d',      (SELECT count(*) FROM public.radar_candidates WHERE source_key='public_suggestion' AND created_at > now() - interval '7 days'),
        'discovery_7d',        (SELECT count(*) FROM public.radar_candidates WHERE created_at > now() - interval '7 days'),
        'profile_requests_new',(SELECT count(*) FROM public.profile_requests WHERE status='new'),
        'knowledge_7d',        (SELECT count(*) FROM public.os_knowledge WHERE created_at > now() - interval '7 days'),
        'media_assets_discovered',(SELECT count(*) FROM public.business_media_assets WHERE status='discovered')))
    WHEN 'seo-manager'      THEN (SELECT jsonb_build_object(
        'listings_public', (SELECT count(*) FROM public.businesses WHERE is_listable),
        'no_description',  (SELECT count(*) FROM public.businesses WHERE is_listable
                             AND coalesce(nullif(btrim(coalesce(description,'')),''),NULL) IS NULL),
        'no_location',     (SELECT count(*) FROM public.businesses WHERE is_listable
                             AND coalesce(nullif(btrim(coalesce(location,'')),''),NULL) IS NULL),
        'no_website',      (SELECT count(*) FROM public.businesses WHERE is_listable
                             AND coalesce(nullif(btrim(coalesce(website,'')),''),NULL) IS NULL),
        'no_media',        (SELECT count(*) FROM public.businesses WHERE is_listable
                             AND coalesce(nullif(btrim(coalesce(image_url,'')),''),NULL) IS NULL),
        'default_24_7',    (SELECT count(*) FROM public.businesses WHERE is_listable AND availability_mode='default_24_7')))
    WHEN 'social-director'  THEN (SELECT jsonb_build_object(
        'listings_public',  (SELECT count(*) FROM public.businesses WHERE is_listable),
        'posts_scheduled',  (SELECT count(*) FROM public.social_scheduled_posts WHERE status='scheduled'),
        'posts_published_7d',(SELECT count(*) FROM public.social_scheduled_posts WHERE status='published' AND published_at > now() - interval '7 days'),
        'posts_failed',     (SELECT count(*) FROM public.social_scheduled_posts WHERE status='failed'),
        'posts_due_24h',    (SELECT count(*) FROM public.social_scheduled_posts WHERE status='scheduled' AND scheduled_at BETWEEN now() AND now() + interval '24 hours'),
        'social_work_open', (SELECT count(*) FROM public.os_work_items WHERE status NOT IN ('done','cancelled') AND department='Social Media')))
    WHEN 'content-manager'  THEN (SELECT jsonb_build_object(
        'social_work_open',    (SELECT count(*) FROM public.os_work_items WHERE status NOT IN ('done','cancelled') AND department='Social Media'),
        'approvals_pending',   (SELECT count(*) FROM public.os_approvals WHERE status='pending'),
        'posts_scheduled',     (SELECT count(*) FROM public.social_scheduled_posts WHERE status='scheduled'),
        'posts_needing_caption',(SELECT count(*) FROM public.social_scheduled_posts WHERE status='scheduled'
                                  AND coalesce(nullif(btrim(coalesce(caption,'')),''),NULL) IS NULL),
        'posts_failed',        (SELECT count(*) FROM public.social_scheduled_posts WHERE status='failed')))
    WHEN 'comms-director'   THEN (SELECT jsonb_build_object(
        'publication_approvals_pending',(SELECT count(*) FROM public.os_approvals WHERE status='pending'),
        'knowledge_30d',     (SELECT count(*) FROM public.os_knowledge WHERE created_at > now() - interval '30 days')))
    WHEN 'creative-director' THEN (SELECT jsonb_build_object(
        'assets_awaiting_review',(SELECT count(*) FROM public.business_media_assets WHERE moderation_status='pending'),
        'assets_unlicensed', (SELECT count(*) FROM public.business_media_assets WHERE status <> 'removed' AND rights_decision IS NULL),
        'takedowns_unhonoured',(SELECT count(*) FROM public.business_media_assets WHERE status <> 'removed' AND takedown_requested_at IS NOT NULL),
        'assets_published',  (SELECT count(*) FROM public.business_media_assets WHERE status='published')))
    WHEN 'copywriter'       THEN (SELECT jsonb_build_object(
        'listings_public',     (SELECT count(*) FROM public.businesses WHERE is_listable),
        'no_description',      (SELECT count(*) FROM public.businesses WHERE is_listable
                                 AND coalesce(nullif(btrim(coalesce(description,'')),''),NULL) IS NULL),
        'offers_no_description',(SELECT count(*) FROM public.business_offers
                                 WHERE coalesce(active,true)
                                   AND (starts_at IS NULL OR starts_at <= now())
                                   AND (ends_at   IS NULL OR ends_at   >= now())
                                   AND coalesce(nullif(btrim(coalesce(description,'')),''),NULL) IS NULL),
        'posts_needing_caption',(SELECT count(*) FROM public.social_scheduled_posts WHERE status='scheduled'
                                  AND coalesce(nullif(btrim(coalesce(caption,'')),''),NULL) IS NULL)))
    WHEN 'production-manager' THEN (SELECT jsonb_build_object(
        'video_assets_approved', (SELECT count(*) FROM public.business_media_assets WHERE asset_type='video' AND status='approved'),
        'video_assets_published',(SELECT count(*) FROM public.business_media_assets WHERE asset_type='video' AND status='published'),
        'video_assets_pending',  (SELECT count(*) FROM public.business_media_assets WHERE asset_type='video' AND status IN ('discovered','match_confirmed')),
        'production_work_open',  (SELECT count(*) FROM public.os_work_items WHERE status NOT IN ('done','cancelled') AND department='Production')))
    WHEN 'post-supervisor'  THEN (SELECT jsonb_build_object(
        'assets_awaiting_review',(SELECT count(*) FROM public.business_media_assets WHERE moderation_status='pending'),
        'assets_rejected',   (SELECT count(*) FROM public.business_media_assets WHERE moderation_status='rejected')))
    WHEN 'sales-director'   THEN (SELECT jsonb_build_object(
        'prospects',           (SELECT count(*) FROM public.businesses WHERE data_status='synthetic_unverified'),
        'profile_requests_new',(SELECT count(*) FROM public.profile_requests WHERE status='new'),
        'profile_requests_7d', (SELECT count(*) FROM public.profile_requests WHERE created_at > now() - interval '7 days'),
        'orders_open',         (SELECT count(*) FROM public.create_orders WHERE status IN ('new','quoting')),
        'claimed',             (SELECT count(*) FROM public.businesses WHERE claim_status='claimed')))
    WHEN 'operations-director' THEN (SELECT jsonb_build_object(
        'work_blocked',      (SELECT count(*) FROM public.os_work_items WHERE status='blocked'),
        'work_waiting',      (SELECT count(*) FROM public.os_work_items WHERE status='waiting'),
        'approvals_pending', (SELECT count(*) FROM public.os_approvals WHERE status='pending'),
        'orders_open',       (SELECT count(*) FROM public.create_orders WHERE status IN ('new','quoting')),
        'enrichment_failed', (SELECT count(*) FROM public.business_enrichment_jobs WHERE status='failed')))
    WHEN 'finance-analyst'  THEN (SELECT jsonb_build_object(
        'orders_open',     (SELECT count(*) FROM public.create_orders WHERE status IN ('new','quoting')),
        'orders_quoted',   (SELECT count(*) FROM public.create_orders WHERE status='quoted'),
        'orders_delivered',(SELECT count(*) FROM public.create_orders WHERE status='delivered'),
        'orders_cancelled',(SELECT count(*) FROM public.create_orders WHERE status='cancelled'),
        'leads_total',     (SELECT count(*) FROM public.payment_intents),
        'leads_paid',      (SELECT count(*) FROM public.payment_intents WHERE status='paid'),
        'founding_claimed',(SELECT count(*) FROM public.founding_members)))
    WHEN 'product-manager'  THEN (SELECT jsonb_build_object(
        'launches_total',  (SELECT count(*) FROM public.os_launches),
        'launches_ready',  (SELECT count(*) FROM public.os_launches
                             WHERE array_length(checklist_done, 1) > 0
                               AND NOT (false = ANY(checklist_done))),
        'work_items_open', (SELECT count(*) FROM public.os_work_items WHERE status NOT IN ('done','cancelled')),
        'work_blocked',    (SELECT count(*) FROM public.os_work_items WHERE status='blocked'),
        'suggestions_7d',  (SELECT count(*) FROM public.radar_candidates WHERE source_key='public_suggestion' AND created_at > now() - interval '7 days'),
        'listings_public', (SELECT count(*) FROM public.businesses WHERE is_listable)))
    ELSE NULL
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.workforce_facts_for(text) FROM public;