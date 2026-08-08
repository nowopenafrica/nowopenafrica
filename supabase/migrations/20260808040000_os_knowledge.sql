-- OS-4 — the knowledge base sync: every SOP the team follows lives in one
-- table, and human sign-offs recorded on os_approvals are written back here
-- as 'decision' docs so approved work becomes institutional memory.
-- Same tenant shape as the rest of the OS. Seeds are the 14 SOPs the Internal
-- Knowledge Base section used to hardcode; the section now reads them live
-- and falls back to its bundled copy only when the DB is unreachable.

CREATE TABLE IF NOT EXISTS os_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES os_orgs(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('Brand', 'Engineering', 'Marketing', 'Design', 'Growth', 'Legal', 'Finance', 'Support')),
  title text NOT NULL,
  summary text NOT NULL,
  body text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  -- 'sop' = the standing playbooks, 'decision' = a sign-off synced from
  -- os_approvals, 'manual' = written by an admin.
  source text NOT NULL DEFAULT 'sop' CHECK (source IN ('sop', 'decision', 'manual')),
  -- For 'decision' docs: the work item that was approved or sent back.
  linked_work_item_id uuid REFERENCES os_work_items(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, title)
);

ALTER TABLE os_knowledge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read knowledge" ON os_knowledge;
CREATE POLICY "Admins read knowledge" ON os_knowledge
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins write knowledge" ON os_knowledge;
CREATE POLICY "Admins write knowledge" ON os_knowledge
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update knowledge" ON os_knowledge;
CREATE POLICY "Admins update knowledge" ON os_knowledge
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete knowledge" ON os_knowledge;
CREATE POLICY "Admins delete knowledge" ON os_knowledge
  FOR DELETE TO authenticated USING (public.is_admin());

-- Seed: the 14 SOPs the Internal Knowledge Base section renders by default.
-- Idempotent — re-running on an existing install leaves admin-written docs alone.
INSERT INTO os_knowledge (org_id, category, title, summary, body, tags)
SELECT o.id, s.category, s.title, s.summary, s.body, s.tags
FROM (VALUES
  ('Brand', 'Brand voice', 'How NowOpen talks — friendly, concrete, never corporate.', ARRAY[
    'Write like a helpful colleague: short sentences, plain words, no jargon.',
    'Lead with the concrete benefit, then the detail.',
    'Use "you" for the business owner and "we" for NowOpen.',
    'One emoji max in social copy; none in product UI.'], ARRAY['voice', 'copy', 'tone']),
  ('Brand', 'Logo & mark usage', 'The mark, clearspace and when to use the gradient.', ARRAY[
    'The NowOpen mark is the single source of truth — never redraw or recolor it.',
    'Keep clearspace of half the mark height on every side.',
    'Use the purple→blue gradient for primary surfaces and CTAs.',
    'On dark backgrounds use the white mark; on light, the full-color mark.'], ARRAY['logo', 'mark', 'usage']),
  ('Engineering', 'Deploy checklist', 'What to run before shipping any change.', ARRAY[
    'Run tsc --noEmit and the full test suite — both must be green.',
    'Smoke-check the touched routes on the dev server.',
    'Update the Launch Control board with the checklist status.',
    'Draft release notes in the same PR.'], ARRAY['deploy', 'qa', 'release']),
  ('Engineering', 'Local-first data rules', 'Why some data lives in localStorage and how to scan it.', ARRAY[
    'Per-business Studio tools write to nowopen_publisher_*, nowopen_videos_*, nowopen_campaigns_* keys.',
    'The admin Creator scans those via scanPipelineLocal so the internal views always reflect real activity.',
    'New local stores must keep the nowopen_ prefix and be JSON.'], ARRAY['localstorage', 'data', 'pipeline']),
  ('Marketing', 'Campaign launch playbook', 'The 7-day run-up to any platform campaign.', ARRAY[
    'Day 1: choose the industry packs from the Video Template Library.',
    'Day 2: create assets in the Creative Studio.',
    'Day 3: publish the first teaser post.',
    'Day 5: email the list and open the marketplace.',
    'Day 7: go live and track in the Analytics War Room.'], ARRAY['campaign', 'launch', 'playbook']),
  ('Marketing', 'The content cadence', 'The weekly posting rhythm we recommend businesses.', ARRAY[
    'Post 3x a week: one offer, one proof (photo/review), one story.',
    'Schedule a week ahead so nothing goes dark on weekends.',
    'Every post carries a hook in the first two words.'], ARRAY['content', 'cadence', 'social']),
  ('Design', 'Design tokens', 'Where colours, type and spacing live.', ARRAY[
    'The Design System section is the living source of truth — update it, not a screenshot.',
    'Spacing runs on the 4px grid; 8–24px for most gaps.',
    'Cards use a 1px border; modals use shadow-lg.'], ARRAY['design', 'tokens', 'styleguide']),
  ('Design', 'Template standards', 'What every template card must include.', ARRAY[
    'An emoji, a tier (free/pro), duration in days and channels.',
    'A one-sentence description that sells the outcome.',
    'A colour palette pulled from the industry data, never hardcoded.'], ARRAY['templates', 'standards']),
  ('Growth', 'Onboarding review', 'The approval queue SOP.', ARRAY[
    'Check verification docs, registrations and enquiries daily.',
    'Approve businesses whose docs match their profile category.',
    'Escalate anything that looks like fraud to the trust channel.'], ARRAY['onboarding', 'approval', 'sop']),
  ('Growth', 'Partnership pipeline', 'How we move a partner from proposal to active.', ARRAY[
    'Proposal: agree the shared goal in one sentence.',
    'Negotiation: scope, timing and who owns what.',
    'Active: launch a campaign pack together and track it.',
    'Alumni: keep warm — alumni partners re-engage fastest.'], ARRAY['partners', 'crm', 'pipeline']),
  ('Legal', 'Privacy & data handling', 'What the team may store and share.', ARRAY[
    'Never paste customer data into external AI tools.',
    'Only the admin console may read full user records.',
    'Platform enquiries are visible to admins only (RLS).'], ARRAY['privacy', 'legal', 'data']),
  ('Finance', 'Reading the revenue board', 'What the Command Center money numbers mean.', ARRAY[
    'Revenue today = paid payment_intents created today.',
    'Pending = unpaid intents, not revenue yet.',
    'Currency is stored per intent — always show the local symbol.'], ARRAY['revenue', 'finance', 'dashboard']),
  ('Support', 'Enquiry first response', 'The SLA and tone for every platform enquiry.', ARRAY[
    'Reply within 4 working hours.',
    'Open with their name and what they asked about.',
    'Answer in the same channel they used, then log to Community Management.'], ARRAY['support', 'enquiry', 'sla']),
  ('Support', 'Verification support', 'Helping a business through the verified badge.', ARRAY[
    'Walk them through the required documents one by one.',
    'Explain the badge improves search and trust signals.',
    'If a doc is rejected, tell them exactly why and what to resubmit.'], ARRAY['support', 'verification'])
) AS s(category, title, summary, body, tags)
JOIN os_orgs o ON o.slug = 'nowopen-africa'
ON CONFLICT (org_id, title) DO NOTHING;

CREATE INDEX IF NOT EXISTS os_knowledge_org_idx ON os_knowledge (org_id, category);
CREATE INDEX IF NOT EXISTS os_knowledge_source_idx ON os_knowledge (org_id, source);
