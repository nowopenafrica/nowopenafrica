-- OS-7 — partnership CRM: investors, media, government, creators, agencies,
-- sponsors and universities moved through a proposal → negotiation → active →
-- alumni pipeline. Stage is stored as the truth here (a partner moves when a
-- deal actually moves), and the summary counts are derived from it. Same
-- tenant shape as the rest of the OS. The rows the section used to keep in
-- localStorage are seeded; the section reads them live and falls back to its
-- bundled copy only when the DB is unreachable.

CREATE TABLE IF NOT EXISTS os_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES os_orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL,
  note text NOT NULL DEFAULT '',
  stage text NOT NULL DEFAULT 'Proposal'
    CHECK (stage IN ('Proposal', 'Negotiation', 'Active', 'Alumni')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, name),
  CONSTRAINT os_partners_type_check
    CHECK (type IN ('Investor', 'Media', 'Government', 'Creator', 'Agency', 'Sponsor', 'University'))
);

ALTER TABLE os_partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read partners" ON os_partners;
CREATE POLICY "Admins read partners" ON os_partners
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins write partners" ON os_partners;
CREATE POLICY "Admins write partners" ON os_partners
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update partners" ON os_partners;
CREATE POLICY "Admins update partners" ON os_partners
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete partners" ON os_partners;
CREATE POLICY "Admins delete partners" ON os_partners
  FOR DELETE TO authenticated USING (public.is_admin());

-- Seed: the partnership pipeline, one partner per stage so the board reads
-- like a real funnel. Idempotent.
INSERT INTO os_partners (org_id, name, type, note, stage)
SELECT o.id, s.name, s.type, s.note, s.stage
FROM (VALUES
  ('Aurora Growth Fund', 'Investor', 'Late-stage funding conversations for the Creator Studio.', 'Proposal'),
  ('TechCabal', 'Media', 'Co-announce the Restaurant Week 2026 launch together.', 'Negotiation'),
  ('Lagos Business School', 'University', 'Creator economy case study — joint research sprint.', 'Active'),
  ('Magnet Agency', 'Agency', 'Past campaigns with our creator network.', 'Alumni')
) AS s(name, type, note, stage)
JOIN os_orgs o ON o.slug = 'nowopen-africa'
ON CONFLICT (org_id, name) DO NOTHING;

CREATE INDEX IF NOT EXISTS os_partners_org_idx ON os_partners (org_id, stage, created_at);
