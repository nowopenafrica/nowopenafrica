-- OS-6 — launch control: every feature launch on one board. A launch carries
-- the standard checklist (design, QA, marketing, videos, emails, docs, release
-- notes, rollout) as a boolean array that admins tick off, and its status is
-- derived from those ticks — never stored, so the board is always honest.
-- Same tenant shape as the rest of the OS. The 3 rows the section used to
-- hardcode are seeded here; the section reads them live and falls back to its
-- bundled copy only when the DB is unreachable.

CREATE TABLE IF NOT EXISTS os_launches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES os_orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  area text NOT NULL DEFAULT 'Unassigned',
  target text NOT NULL DEFAULT 'TBA',
  -- One boolean per checklist item, in the same order as LAUNCH_CHECKLIST.
  checklist_done boolean[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, name)
);

ALTER TABLE os_launches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read launches" ON os_launches;
CREATE POLICY "Admins read launches" ON os_launches
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins write launches" ON os_launches;
CREATE POLICY "Admins write launches" ON os_launches
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update launches" ON os_launches;
CREATE POLICY "Admins update launches" ON os_launches
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete launches" ON os_launches;
CREATE POLICY "Admins delete launches" ON os_launches
  FOR DELETE TO authenticated USING (public.is_admin());

-- Seed: the launches Launch Control used to hardcode. Idempotent.
INSERT INTO os_launches (org_id, name, area, target, checklist_done)
SELECT o.id, s.name, s.area, s.target, s.checklist_done
FROM (VALUES
  ('AI Video Studio', 'Product · Media', 'Aug 2026', ARRAY[true, true, true, true, true, true, true]),
  ('Verified Badge', 'Trust & Safety', 'Mar 2026', ARRAY[true, true, true, true, true, true, true]),
  ('Restaurant Week 2026', 'Growth · Campaigns', 'Sep 2026', ARRAY[true, false, false, false, false, false, false])
) AS s(name, area, target, checklist_done)
JOIN os_orgs o ON o.slug = 'nowopen-africa'
ON CONFLICT (org_id, name) DO NOTHING;

CREATE INDEX IF NOT EXISTS os_launches_org_idx ON os_launches (org_id, created_at);
