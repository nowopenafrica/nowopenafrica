/*
  # NowOpen OS — organizations + workforce directory (OS-1)

  The tenant boundary for NowOpen OS. Every OS entity carries an org_id so the
  internal company (NowOpen Africa) can be the first tenant and the same schema
  can later power NowOpen Business OS for vendors without a rewrite.

  `os_workforce` is the People + AI directory: every human or AI agent in the
  company, their department, their work status, and what they're working on.
  For AI agents, status is derived by the frontend from the real ledger
  (automation_log, tasks) — the seed only sets a starting "active" state.

  Internal-first access control: only admins (public.is_admin()) read/write the
  workforce, matching the existing admin console policy.
*/

-- ---------------------------------------------------------------------------
-- 1. Organizations (the tenant root)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS os_orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE os_orgs ENABLE ROW LEVEL SECURITY;

-- Admins can read orgs; writes happen via migration seed / service role.
DROP POLICY IF EXISTS "Admins read orgs" ON os_orgs;
CREATE POLICY "Admins read orgs" ON os_orgs
  FOR SELECT TO authenticated USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. Workforce directory
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS os_workforce (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES os_orgs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('human', 'ai')),
  name text NOT NULL,
  title text NOT NULL,
  department text NOT NULL CHECK (department IN (
    'Founder Office', 'Strategy & BI', 'Marketing & Growth', 'Social Media',
    'Communications & PR', 'Creative & Brand', 'Production', 'Post Production',
    'Sales & Business Development', 'Operations', 'Finance',
    'Product & Engineering', 'Customer Success', 'Trust & Safety'
  )),
  -- Canonical lowercase status; the lib enforces the per-kind allowed sets.
  status text NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'working', 'waiting', 'blocked', 'awaiting-approval',
    'off-schedule', 'error', 'clocked-in', 'in-meeting', 'on-break',
    'away', 'clocked-out'
  )),
  current_work text,
  -- Humans link to their auth profile; AI agents carry a stable key the
  -- automation engine / frontend can resolve against.
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  agent_key text,
  kpis jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, name)
);

ALTER TABLE os_workforce ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read workforce" ON os_workforce;
CREATE POLICY "Admins read workforce" ON os_workforce
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins write workforce" ON os_workforce;
CREATE POLICY "Admins write workforce" ON os_workforce
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update workforce" ON os_workforce;
CREATE POLICY "Admins update workforce" ON os_workforce
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete workforce" ON os_workforce;
CREATE POLICY "Admins delete workforce" ON os_workforce
  FOR DELETE TO authenticated USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. Seed — NowOpen Africa org + the AI team
-- ---------------------------------------------------------------------------
INSERT INTO os_orgs (id, slug, name)
VALUES ('00000000-0000-4000-8000-00000000a001', 'nowopen-africa', 'NowOpen Africa')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO os_workforce (org_id, kind, name, title, department, status, agent_key, current_work)
VALUES
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Chief of Staff', 'Chief of Staff', 'Founder Office', 'active', 'chief-of-staff', 'Synthesizes the daily brief for the founder; tracks priorities, blockers and approvals.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Strategy Director', 'Strategy Director', 'Strategy & BI', 'active', 'strategy-director', 'Watches the market and the five launch KPIs; drafts the quarterly plan.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Research Analyst', 'Research Analyst', 'Strategy & BI', 'active', 'research-analyst', 'Gathers market and competitor intelligence for the strategy and growth teams.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Growth Director', 'Growth Director', 'Marketing & Growth', 'active', 'growth-director', 'Plans acquisition experiments that move profile impressions, signups and leads.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'SEO Manager', 'SEO Manager', 'Marketing & Growth', 'active', 'seo-manager', 'Owns discoverability: on-page SEO, sitemaps and search console feedback.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Social Director', 'Social Director', 'Social Media', 'active', 'social-director', 'Runs the content calendar and publishing across every NowOpen channel.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Content Manager', 'Content Manager', 'Social Media', 'active', 'content-manager', 'Turns briefs into posts, series and engagement; keeps every channel on voice.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Communications Director', 'Communications Director', 'Communications & PR', 'active', 'comms-director', 'Drafts announcements and press material; anything public goes through human approval.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Creative Director', 'Creative Director', 'Creative & Brand', 'active', 'creative-director', 'Owns the NowOpen look: campaign concepts, design direction and the design system.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Copywriter', 'Copywriter', 'Creative & Brand', 'active', 'copywriter', 'Writes marketing, landing-page, email and campaign copy in the NowOpen voice.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Production Manager', 'Production Manager', 'Production', 'active', 'production-manager', 'Turns concepts into scripts, storyboards, shot lists and production plans.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Post Supervisor', 'Post Supervisor', 'Post Production', 'active', 'post-supervisor', 'Checks every video before delivery: captions, ratio versions, colour and sound.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Sales Director', 'Sales Director', 'Sales & Business Development', 'active', 'sales-director', 'Scores prospects, prepares proposals and tracks the partnership pipeline.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Operations Director', 'Operations Director', 'Operations', 'active', 'operations-director', 'Runs daily operations: SOPs, vendors, service delivery and internal workflows.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Finance Analyst', 'Finance Analyst', 'Finance', 'active', 'finance-analyst', 'Tracks revenue, expenses and cash flow; prepares monthly finance reporting for approval.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Product Manager', 'Product Manager', 'Product & Engineering', 'active', 'product-manager', 'Owns the roadmap, gathers feedback and keeps launches on track.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Customer Success Manager', 'Customer Success Manager', 'Customer Success', 'active', 'customer-success-manager', 'Onboards businesses and watches for drop-off; nudges owners before they churn.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Trust & Safety Agent', 'Trust & Safety Agent', 'Trust & Safety', 'active', 'trust-safety-agent', 'Reviews verification and flags suspicious activity; enforcement escalates to a human.')
ON CONFLICT (org_id, name) DO NOTHING;

CREATE INDEX IF NOT EXISTS os_workforce_org_idx ON os_workforce (org_id);
CREATE INDEX IF NOT EXISTS os_workforce_department_idx ON os_workforce (org_id, department);
