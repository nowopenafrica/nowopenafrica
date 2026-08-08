-- OS-10 — campaign factory: platform-wide campaigns as a live ledger.
-- A platform campaign (Africa is NowOpen, Restaurant Week, Tailor Week) moves
-- through idea → planning → in_build → live → wrapped, with its focus, audience,
-- channels and run window. Same tenant shape as the rest of the OS; the section
-- reads them live and falls back to its bundled seed only when the DB is
-- unreachable. Performance is derived from real platform data, never seeded.

CREATE TABLE IF NOT EXISTS os_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES os_orgs(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  focus text NOT NULL DEFAULT '',
  audience text NOT NULL DEFAULT '',
  channels text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'idea'
    CHECK (status IN ('idea', 'planning', 'in_build', 'live', 'wrapped')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, slug)
);

ALTER TABLE os_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read campaigns" ON os_campaigns;
CREATE POLICY "Admins read campaigns" ON os_campaigns
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins write campaigns" ON os_campaigns;
CREATE POLICY "Admins write campaigns" ON os_campaigns
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update campaigns" ON os_campaigns;
CREATE POLICY "Admins update campaigns" ON os_campaigns
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete campaigns" ON os_campaigns;
CREATE POLICY "Admins delete campaigns" ON os_campaigns
  FOR DELETE TO authenticated USING (public.is_admin());

-- Seed: the platform campaigns the section promised in its blurb, mirroring
-- the Restaurant Week 2026 launch already on os_launches. Idempotent.
INSERT INTO os_campaigns (org_id, slug, name, focus, audience, channels, status, starts_at, ends_at)
SELECT o.id, s.slug, s.name, s.focus, s.audience, s.channels, s.status, s.starts_at, s.ends_at
FROM (VALUES
  ('africa-is-nowopen', 'Africa is NowOpen', 'Open every African business on the map', 'Business owners across Africa', ARRAY['Social', 'Email', 'SMS', 'Press'], 'live', '2026-01-15T09:00:00Z', NULL),
  ('restaurant-week-2026', 'Restaurant Week 2026', 'The biggest restaurant run of the year', 'Restaurants in Nigeria', ARRAY['Social', 'WhatsApp', 'Email'], 'in_build', '2026-09-14T09:00:00Z', '2026-09-20T09:00:00Z'),
  ('tailor-week-2026', 'Tailor Week', 'Fashion and tailoring, platform-wide', 'Fashion businesses', ARRAY['Social', 'Email'], 'planning', '2026-11-02T09:00:00Z', NULL)
) AS s(slug, name, focus, audience, channels, status, starts_at, ends_at)
JOIN os_orgs o ON o.slug = 'nowopen-africa'
ON CONFLICT (org_id, slug) DO NOTHING;

CREATE INDEX IF NOT EXISTS os_campaigns_org_idx ON os_campaigns (org_id, status, starts_at);
