// NowOpen OS — knowledge layer (pure, no React / Supabase I/O).
//
// Everything the team knows, documented and searchable: brand, engineering,
// marketing, design, growth, legal, finance and support SOPs. The Internal
// Knowledge Base section reads os_knowledge from Supabase and falls back to
// KNOWLEDGE_SEED (clearly labelled) until the migration is applied. 'sop'
// docs are the standing playbooks; 'decision' docs are human sign-offs synced
// from os_approvals, so approved work becomes institutional memory.

import { NOWOPEN_ORG_ID } from './workforce';

export const KB_CATEGORIES = ['Brand', 'Engineering', 'Marketing', 'Design', 'Growth', 'Legal', 'Finance', 'Support'] as const;
export type KbCategory = (typeof KB_CATEGORIES)[number];

export type KnowledgeSource = 'sop' | 'decision' | 'manual';

export interface KnowledgeDoc {
  id: string;
  org_id: string;
  category: KbCategory;
  title: string;
  summary: string;
  body: string[];
  tags: string[];
  source: KnowledgeSource;
  linked_work_item_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface KnowledgeSummary {
  total: number;
  sops: number;
  decisions: number;
  manual: number;
  byCategory: Record<string, number>;
  bySource: Record<string, number>;
}

export function summarizeKnowledge(docs: KnowledgeDoc[]): KnowledgeSummary {
  const byCategory: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  let sops = 0;
  let decisions = 0;
  let manual = 0;
  for (const d of docs) {
    byCategory[d.category] = (byCategory[d.category] ?? 0) + 1;
    bySource[d.source] = (bySource[d.source] ?? 0) + 1;
    if (d.source === 'sop') sops += 1;
    else if (d.source === 'decision') decisions += 1;
    else manual += 1;
  }
  return { total: docs.length, sops, decisions, manual, byCategory, bySource };
}

export interface KnowledgeFilters {
  category: 'all' | KbCategory;
  source: 'all' | KnowledgeSource;
}

export function filterKnowledge(docs: KnowledgeDoc[], filters: KnowledgeFilters): KnowledgeDoc[] {
  return docs.filter((d) => {
    if (filters.category !== 'all' && d.category !== filters.category) return false;
    if (filters.source !== 'all' && d.source !== filters.source) return false;
    return true;
  });
}

/** Case-insensitive match across title, summary and tags. */
export function searchKnowledge(docs: KnowledgeDoc[], query: string): KnowledgeDoc[] {
  const q = query.trim().toLowerCase();
  if (!q) return docs;
  return docs.filter((d) =>
    d.title.toLowerCase().includes(q) ||
    d.summary.toLowerCase().includes(q) ||
    d.tags.some((t) => t.includes(q)));
}

/** The 8 KB categories map the 20 work departments onto the docs' home areas,
 *  so a decision lands where a teammate would look for it. */
export function departmentToKbCategory(department: string): KbCategory {
  switch (department) {
    case 'Creative & Brand':
    case 'Product Design':
    case 'Motion Design': return 'Brand';
    case 'Product & Engineering': return 'Engineering';
    case 'Marketing & Growth':
    case 'Social Media':
    case 'Communications & PR':
    case 'Email & Customer Communications': return 'Marketing';
    case 'Production':
    case 'Post Production': return 'Design';
    case 'Finance': return 'Finance';
    case 'Operations':
    case 'Customer Success':
    case 'Trust & Safety':
    case 'Community & Culture': return 'Support';
    case 'Founder Office':
    case 'Strategy & BI':
    case 'Sales & Business Development':
    case 'Partnerships':
    case 'Data & Analytics':
    default: return 'Growth';
  }
}

/** Build the 'decision' doc that ApprovalsHub writes to os_knowledge when a
 *  human signs off. Pure, so both the DB insert and the fallback path use the
 *  same shape. The title carries the short approval ref, keeping the
 *  UNIQUE (org_id, title) contract safe across re-requests. */
export function decisionDoc(input: {
  approvalId: string;
  status: 'approved' | 'rejected';
  workTitle: string;
  department: string;
  workItemId?: string | null;
  note?: string | null;
}): Pick<KnowledgeDoc, 'category' | 'title' | 'summary' | 'body' | 'tags' | 'source' | 'linked_work_item_id'> {
  const short = input.approvalId.slice(-6);
  const approved = input.status === 'approved';
  const note = input.note?.trim();
  const rejectBody = note
    ? [
        `${input.workTitle} was sent back by a human.`,
        'The work item returns to the Work Board as in progress.',
        `Reviewer note: ${note}`,
        `Decision recorded on os_approvals (#${short}).`,
      ]
    : [
        `${input.workTitle} was sent back by a human.`,
        'The work item returns to the Work Board as in progress.',
        `Decision recorded on os_approvals (#${short}).`,
      ];
  return {
    category: departmentToKbCategory(input.department),
    // The short approval ref makes the title unique per sign-off, so re-requests
    // (reject → re-request → reject again) never clash on UNIQUE (org_id, title).
    title: `${input.workTitle} — ${approved ? 'approved' : 'sent back'} · #${short}`,
    summary: approved
      ? 'Sign-off recorded: the work item was approved and moved to done.'
      : note
        ? `Sign-off recorded: the work item was sent back with a note — ${note}`
        : 'Sign-off recorded: the work item was sent back to the board for revision.',
    body: approved
      ? [
          `${input.workTitle} was approved by a human.`,
          'The work item is now done on the Work Board.',
          `Decision recorded on os_approvals (#${short}).`,
        ]
      : rejectBody,
    tags: ['decision', approved ? 'approved' : 'rejected', input.department.toLowerCase().replace(/[^a-z0-9]+/g, '-')],
    source: 'decision',
    linked_work_item_id: input.workItemId ?? null,
  };
}

// The 14 SOPs the Internal Knowledge Base section used to hardcode, mirrored
// by the 20260808040000_os_knowledge seed. The component uses these as the
// honest dev/fallback state until the migration is applied. Keep in sync with
// the SQL seed.
export const KNOWLEDGE_SEED: KnowledgeDoc[] = [
  { id: 'seed-kb-0', org_id: NOWOPEN_ORG_ID, category: 'Brand', title: 'Brand voice', summary: 'How NowOpen talks — friendly, concrete, never corporate.', tags: ['voice', 'copy', 'tone'], source: 'sop', body: [
    'Write like a helpful colleague: short sentences, plain words, no jargon.',
    'Lead with the concrete benefit, then the detail.',
    'Use "you" for the business owner and "we" for NowOpen.',
    'One emoji max in social copy; none in product UI.',
  ] },
  { id: 'seed-kb-1', org_id: NOWOPEN_ORG_ID, category: 'Brand', title: 'Logo & mark usage', summary: 'The mark, clearspace and when to use the gradient.', tags: ['logo', 'mark', 'usage'], source: 'sop', body: [
    'The NowOpen mark is the single source of truth — never redraw or recolor it.',
    'Keep clearspace of half the mark height on every side.',
    'Use the purple→blue gradient for primary surfaces and CTAs.',
    'On dark backgrounds use the white mark; on light, the full-color mark.',
  ] },
  { id: 'seed-kb-2', org_id: NOWOPEN_ORG_ID, category: 'Engineering', title: 'Deploy checklist', summary: 'What to run before shipping any change.', tags: ['deploy', 'qa', 'release'], source: 'sop', body: [
    'Run tsc --noEmit and the full test suite — both must be green.',
    'Smoke-check the touched routes on the dev server.',
    'Update the Launch Control board with the checklist status.',
    'Draft release notes in the same PR.',
  ] },
  { id: 'seed-kb-3', org_id: NOWOPEN_ORG_ID, category: 'Engineering', title: 'Local-first data rules', summary: 'Why some data lives in localStorage and how to scan it.', tags: ['localstorage', 'data', 'pipeline'], source: 'sop', body: [
    'Per-business Studio tools write to nowopen_publisher_*, nowopen_videos_*, nowopen_campaigns_* keys.',
    'The admin Creator scans those via scanPipelineLocal so the internal views always reflect real activity.',
    'New local stores must keep the nowopen_ prefix and be JSON.',
  ] },
  { id: 'seed-kb-4', org_id: NOWOPEN_ORG_ID, category: 'Marketing', title: 'Campaign launch playbook', summary: 'The 7-day run-up to any platform campaign.', tags: ['campaign', 'launch', 'playbook'], source: 'sop', body: [
    'Day 1: choose the industry packs from the Video Template Library.',
    'Day 2: create assets in the Creative Studio.',
    'Day 3: publish the first teaser post.',
    'Day 5: email the list and open the marketplace.',
    'Day 7: go live and track in the Analytics War Room.',
  ] },
  { id: 'seed-kb-5', org_id: NOWOPEN_ORG_ID, category: 'Marketing', title: 'The content cadence', summary: 'The weekly posting rhythm we recommend businesses.', tags: ['content', 'cadence', 'social'], source: 'sop', body: [
    'Post 3x a week: one offer, one proof (photo/review), one story.',
    'Schedule a week ahead so nothing goes dark on weekends.',
    'Every post carries a hook in the first two words.',
  ] },
  { id: 'seed-kb-6', org_id: NOWOPEN_ORG_ID, category: 'Design', title: 'Design tokens', summary: 'Where colours, type and spacing live.', tags: ['design', 'tokens', 'styleguide'], source: 'sop', body: [
    'The Design System section is the living source of truth — update it, not a screenshot.',
    'Spacing runs on the 4px grid; 8–24px for most gaps.',
    'Cards use a 1px border; modals use shadow-lg.',
  ] },
  { id: 'seed-kb-7', org_id: NOWOPEN_ORG_ID, category: 'Design', title: 'Template standards', summary: 'What every template card must include.', tags: ['templates', 'standards'], source: 'sop', body: [
    'An emoji, a tier (free/pro), duration in days and channels.',
    'A one-sentence description that sells the outcome.',
    'A colour palette pulled from the industry data, never hardcoded.',
  ] },
  { id: 'seed-kb-8', org_id: NOWOPEN_ORG_ID, category: 'Growth', title: 'Onboarding review', summary: 'The approval queue SOP.', tags: ['onboarding', 'approval', 'sop'], source: 'sop', body: [
    'Check verification docs, registrations and enquiries daily.',
    'Approve businesses whose docs match their profile category.',
    'Escalate anything that looks like fraud to the trust channel.',
  ] },
  { id: 'seed-kb-9', org_id: NOWOPEN_ORG_ID, category: 'Growth', title: 'Partnership pipeline', summary: 'How we move a partner from proposal to active.', tags: ['partners', 'crm', 'pipeline'], source: 'sop', body: [
    'Proposal: agree the shared goal in one sentence.',
    'Negotiation: scope, timing and who owns what.',
    'Active: launch a campaign pack together and track it.',
    'Alumni: keep warm — alumni partners re-engage fastest.',
  ] },
  { id: 'seed-kb-10', org_id: NOWOPEN_ORG_ID, category: 'Legal', title: 'Privacy & data handling', summary: 'What the team may store and share.', tags: ['privacy', 'legal', 'data'], source: 'sop', body: [
    'Never paste customer data into external AI tools.',
    'Only the admin console may read full user records.',
    'Platform enquiries are visible to admins only (RLS).',
  ] },
  { id: 'seed-kb-11', org_id: NOWOPEN_ORG_ID, category: 'Finance', title: 'Reading the revenue board', summary: 'What the Command Center money numbers mean.', tags: ['revenue', 'finance', 'dashboard'], source: 'sop', body: [
    'Revenue today = paid payment_intents created today.',
    'Pending = unpaid intents, not revenue yet.',
    'Currency is stored per intent — always show the local symbol.',
  ] },
  { id: 'seed-kb-12', org_id: NOWOPEN_ORG_ID, category: 'Support', title: 'Enquiry first response', summary: 'The SLA and tone for every platform enquiry.', tags: ['support', 'enquiry', 'sla'], source: 'sop', body: [
    'Reply within 4 working hours.',
    'Open with their name and what they asked about.',
    'Answer in the same channel they used, then log to Community Management.',
  ] },
  { id: 'seed-kb-13', org_id: NOWOPEN_ORG_ID, category: 'Support', title: 'Verification support', summary: 'Helping a business through the verified badge.', tags: ['support', 'verification'], source: 'sop', body: [
    'Walk them through the required documents one by one.',
    'Explain the badge improves search and trust signals.',
    'If a doc is rejected, tell them exactly why and what to resubmit.',
  ] },
];
