/*
  # Business Intelligence RLS for editors

  The Business Intelligence area (/admin/business-intelligence) is now an
  editor-accessible console section (the embedded `business-intel` tab and the
  standalone page both admit admin + editor). The frontend gate is only half the
  boundary — the database is the other, and the live project's "Staff" policies
  on the BI tables were written as `is_admin()`. An editor session therefore
  rendered the section but every query came back empty.

  These tables are read and written by the BI tabs (Overview, Campaigns,
  Sources, Review, Conflicts, Manual extract, Compliance). Widening the "Staff"
  policies from is_admin() to is_staff() lets an editor see and work the
  discovery pipeline while everything an editor must not touch — accounts,
  payments, verification, moderation, deletion — stays on is_admin() elsewhere.

  Deliberately NOT changed:
    - feature_flags: reads are already public, and flipping the kill switches
      stays an admin decision.
    - claimreach_suppressions: already is_staff().
*/

-- radar_candidates ------------------------------------------------------
DROP POLICY IF EXISTS "Staff read candidates" ON public.radar_candidates;
CREATE POLICY "Staff read candidates" ON public.radar_candidates
  FOR SELECT TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS "Staff manage candidates" ON public.radar_candidates;
CREATE POLICY "Staff manage candidates" ON public.radar_candidates
  FOR UPDATE TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff add candidates" ON public.radar_candidates;
CREATE POLICY "Staff add candidates" ON public.radar_candidates
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

-- radar_config ----------------------------------------------------------
DROP POLICY IF EXISTS "Staff read radar config" ON public.radar_config;
CREATE POLICY "Staff read radar config" ON public.radar_config
  FOR SELECT TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS "Staff manage radar config" ON public.radar_config;
CREATE POLICY "Staff manage radar config" ON public.radar_config
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- radar_sources ---------------------------------------------------------
DROP POLICY IF EXISTS "Staff read radar sources" ON public.radar_sources;
CREATE POLICY "Staff read radar sources" ON public.radar_sources
  FOR SELECT TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS "Staff manage radar sources" ON public.radar_sources;
CREATE POLICY "Staff manage radar sources" ON public.radar_sources
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- radar_candidate_evidence ----------------------------------------------
DROP POLICY IF EXISTS "Staff read candidate evidence" ON public.radar_candidate_evidence;
CREATE POLICY "Staff read candidate evidence" ON public.radar_candidate_evidence
  FOR SELECT TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS "Staff manage candidate evidence" ON public.radar_candidate_evidence;
CREATE POLICY "Staff manage candidate evidence" ON public.radar_candidate_evidence
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- business_discovery_campaigns ------------------------------------------
DROP POLICY IF EXISTS "Staff read discovery campaigns" ON public.business_discovery_campaigns;
CREATE POLICY "Staff read discovery campaigns" ON public.business_discovery_campaigns
  FOR SELECT TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS "Staff manage discovery campaigns" ON public.business_discovery_campaigns;
CREATE POLICY "Staff manage discovery campaigns" ON public.business_discovery_campaigns
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- business_discovery_runs -----------------------------------------------
DROP POLICY IF EXISTS "Staff read discovery runs" ON public.business_discovery_runs;
CREATE POLICY "Staff read discovery runs" ON public.business_discovery_runs
  FOR SELECT TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS "Staff manage discovery runs" ON public.business_discovery_runs;
CREATE POLICY "Staff manage discovery runs" ON public.business_discovery_runs
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());