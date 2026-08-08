-- OS-3 — the approvals hub: agent-finished work queued for a human to sign off.
-- Same tenant shape as the rest of the OS. A row references the work item being
-- approved and the workforce member who requested the decision (their assignee).
-- Approving/rejecting is done by the admin console, which also moves the work
-- item and the requesting agent back onto the ledger — the decision itself lives
-- here, so the queue is honest: only rows with status 'pending' are waiting.

CREATE TABLE IF NOT EXISTS os_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES os_orgs(id) ON DELETE CASCADE,
  work_item_id uuid NOT NULL REFERENCES os_work_items(id) ON DELETE CASCADE,
  -- The agent requesting sign-off (usually the work item's assignee).
  requested_by uuid REFERENCES os_workforce(id) ON DELETE SET NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  -- One decision per work item; a rejection can be re-requested by updating
  -- the same row back to 'pending'.
  UNIQUE (org_id, work_item_id)
);

ALTER TABLE os_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read approvals" ON os_approvals;
CREATE POLICY "Admins read approvals" ON os_approvals
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins write approvals" ON os_approvals;
CREATE POLICY "Admins write approvals" ON os_approvals
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update approvals" ON os_approvals;
CREATE POLICY "Admins update approvals" ON os_approvals
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete approvals" ON os_approvals;
CREATE POLICY "Admins delete approvals" ON os_approvals
  FOR DELETE TO authenticated USING (public.is_admin());

-- Seed: the first work items that need a human sign-off before they count as
-- done. The requester is derived from the work item's assignee — the agent who
-- produced the work — not invented.
INSERT INTO os_approvals (org_id, work_item_id, requested_by, reason)
SELECT o.id, w.id, w.assignee_id, a.reason
FROM (VALUES
  ('Monthly finance report', 'Revenue, expenses and cash flow summary for human approval.'),
  ('Draft Q3 strategy brief', 'Strategy must be signed off before it becomes the quarterly plan.'),
  ('August social content calendar', 'Public posts go live only after a human approves the calendar.')
) AS a(title, reason)
JOIN os_orgs o ON o.slug = 'nowopen-africa'
JOIN os_work_items w ON w.org_id = o.id AND w.title = a.title
ON CONFLICT (org_id, work_item_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS os_approvals_org_idx ON os_approvals (org_id, status);
CREATE INDEX IF NOT EXISTS os_approvals_work_item_idx ON os_approvals (org_id, work_item_id);
