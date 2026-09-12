/*
  Staff may stage radar candidates.

  Radar's only INSERT policy was the public gate ("Anyone can suggest a
  business"), which pins source_key to 'public_suggestion'. Discovery stages
  Wikidata rows under the admin's own session — source_key 'wikidata', status
  'review', confidence 70 — so a signed-in admin was blocked by RLS with
  "new row violates row-level security policy". Import Center works around the
  same wall because import_batch_to_candidates is SECURITY DEFINER; the direct
  stage path needs a policy of its own.

  Mirrors the two existing staff policies on the table ("Staff read
  candidates", "Staff manage candidates") which both gate on is_admin().
*/
DROP POLICY IF EXISTS "Staff add candidates" ON public.radar_candidates;
CREATE POLICY "Staff add candidates" ON public.radar_candidates
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());