-- OS-9 — press room: the news timeline as a live press-and-coverage ledger.
-- A press item is a press release or a piece of coverage, with the outlet,
-- its status (draft / scheduled / published) and when it went live. The three
-- stories the section used to hardcode are seeded here, tied to the same real
-- launches that sit on os_launches. Same tenant shape as the rest of the OS;
-- the section reads them live and falls back to its bundled copy only when
-- the DB is unreachable.

CREATE TABLE IF NOT EXISTS os_press (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES os_orgs(id) ON DELETE CASCADE,
  headline text NOT NULL,
  outlet text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'release'
    CHECK (kind IN ('release', 'coverage')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'published')),
  published_at timestamptz,
  url text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, headline)
);

ALTER TABLE os_press ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read press" ON os_press;
CREATE POLICY "Admins read press" ON os_press
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins write press" ON os_press;
CREATE POLICY "Admins write press" ON os_press
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update press" ON os_press;
CREATE POLICY "Admins update press" ON os_press
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete press" ON os_press;
CREATE POLICY "Admins delete press" ON os_press
  FOR DELETE TO authenticated USING (public.is_admin());

-- Seed: the stories the press room used to hardcode, matching the launches
-- already on os_launches. Idempotent.
INSERT INTO os_press (org_id, headline, outlet, kind, status, published_at, url, summary)
SELECT o.id, s.headline, s.outlet, s.kind, s.status, s.published_at, s.url, s.summary
FROM (VALUES
  ('NowOpen Africa launches the AI Video Studio', 'NowOpen Africa', 'release', 'published', '2026-08-01T09:00:00Z', 'https://www.nowopen.africa/press/ai-video-studio', 'Businesses now turn one idea into a full video campaign — script, voiceover, captions and export — without leaving the platform.'),
  ('Restaurant Week returns for its biggest run', 'Restaurant Week', 'coverage', 'published', '2026-06-15T09:00:00Z', 'https://www.nowopen.africa/press/restaurant-week-2026', 'Hundreds of restaurants across Nigeria served record footfall through the platform''s launch-week playbook.'),
  ('Verified badge rolls out nationwide', 'NowOpen Africa', 'release', 'published', '2026-03-10T09:00:00Z', 'https://www.nowopen.africa/press/verified-badge', 'Document-based verification now protects the trusted signal behind every NowOpen profile.')
) AS s(headline, outlet, kind, status, published_at, url, summary)
JOIN os_orgs o ON o.slug = 'nowopen-africa'
ON CONFLICT (org_id, headline) DO NOTHING;

CREATE INDEX IF NOT EXISTS os_press_org_idx ON os_press (org_id, status, published_at);
