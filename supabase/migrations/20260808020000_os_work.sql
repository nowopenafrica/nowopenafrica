-- OS-2 — the work layer: projects, tasks and goals assigned to the team.
-- Every row belongs to an org (tenant-shaped), tracks honest status, and can
-- point at a workforce member. Seeded with the first NowOpen work items — the
-- ones that move the five launch KPIs. Admin-only, same pattern as os_workforce.

CREATE TABLE IF NOT EXISTS os_work_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES os_orgs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('project', 'task', 'goal')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 140),
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'waiting', 'blocked', 'done', 'cancelled')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  department text NOT NULL CHECK (department IN (
    'Founder Office', 'Strategy & BI', 'Marketing & Growth', 'Social Media',
    'Communications & PR', 'Creative & Brand', 'Production', 'Post Production',
    'Sales & Business Development', 'Operations', 'Finance',
    'Product & Engineering', 'Customer Success', 'Trust & Safety'
  )),
  assignee_id uuid REFERENCES os_workforce(id) ON DELETE SET NULL,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_at timestamptz,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, title)
);

ALTER TABLE os_work_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read work items" ON os_work_items;
CREATE POLICY "Admins read work items" ON os_work_items
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins write work items" ON os_work_items;
CREATE POLICY "Admins write work items" ON os_work_items
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update work items" ON os_work_items;
CREATE POLICY "Admins update work items" ON os_work_items
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete work items" ON os_work_items;
CREATE POLICY "Admins delete work items" ON os_work_items
  FOR DELETE TO authenticated USING (public.is_admin());

INSERT INTO os_work_items (org_id, kind, title, status, priority, department, assignee_id, due_at, description)
SELECT o.id, s.kind, s.title, s.status, s.priority, s.department, w.id, s.due_at, s.description
FROM (VALUES
  ('project', 'Africa is NowOpen — campaign build', 'in_progress', 'high', 'Marketing & Growth', 'growth-director', now() + interval '10 days', 'Landing page, creative assets, ads and launch email for the platform campaign.'),
  ('task', 'August social content calendar', 'in_progress', 'medium', 'Social Media', 'social-director', now() + interval '5 days', 'Calendar, captions and scheduled posts across every NowOpen channel.'),
  ('project', 'Ship the OS work layer', 'todo', 'high', 'Product & Engineering', 'product-manager', now() + interval '21 days', 'Projects, tasks and goals assigned to the team — this board.'),
  ('task', 'Draft Q3 strategy brief', 'blocked', 'high', 'Strategy & BI', 'strategy-director', now() + interval '3 days', 'Blocked on market data from the Research Analyst.'),
  ('goal', 'Verify 10 new businesses this week', 'in_progress', 'high', 'Trust & Safety', 'trust-safety-agent', now() + interval '7 days', 'Trust metric: verification turnaround stays under 24 hours.'),
  ('task', 'Monthly finance report', 'waiting', 'medium', 'Finance', 'finance-analyst', now() + interval '12 days', 'Revenue, expenses and cash flow summary for human approval.')
) AS s(kind, title, status, priority, department, agent_key, due_at, description)
JOIN os_orgs o ON o.slug = 'nowopen-africa'
JOIN os_workforce w ON w.org_id = o.id AND w.agent_key = s.agent_key
ON CONFLICT (org_id, title) DO NOTHING;

CREATE INDEX IF NOT EXISTS os_work_items_org_idx ON os_work_items (org_id, status);
CREATE INDEX IF NOT EXISTS os_work_items_assignee_idx ON os_work_items (org_id, assignee_id);
