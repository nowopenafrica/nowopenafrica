import { useMemo, useState } from 'react';
import { BookOpen, Search, ChevronDown } from 'lucide-react';

// The Internal Knowledge Base (#19) — everything the team knows, documented
// and searchable: brand, engineering, marketing, design, growth, legal,
// finance and support SOPs. Each entry expands to the playbook.

interface Doc {
  id: string;
  category: 'Brand' | 'Engineering' | 'Marketing' | 'Design' | 'Growth' | 'Legal' | 'Finance' | 'Support';
  title: string;
  summary: string;
  body: string[];
  tags: string[];
}

const CATEGORIES: Doc['category'][] = ['Brand', 'Engineering', 'Marketing', 'Design', 'Growth', 'Legal', 'Finance', 'Support'];

const DOCS: Doc[] = [
  { id: 'd1', category: 'Brand', title: 'Brand voice', summary: 'How NowOpen talks — friendly, concrete, never corporate.', tags: ['voice', 'copy', 'tone'], body: [
    'Write like a helpful colleague: short sentences, plain words, no jargon.',
    'Lead with the concrete benefit, then the detail.',
    'Use "you" for the business owner and "we" for NowOpen.',
    'One emoji max in social copy; none in product UI.',
  ] },
  { id: 'd2', category: 'Brand', title: 'Logo & mark usage', summary: 'The mark, clearspace and when to use the gradient.', tags: ['logo', 'mark', 'usage'], body: [
    'The NowOpen mark is the single source of truth — never redraw or recolor it.',
    'Keep clearspace of half the mark height on every side.',
    'Use the purple→blue gradient for primary surfaces and CTAs.',
    'On dark backgrounds use the white mark; on light, the full-color mark.',
  ] },
  { id: 'd3', category: 'Engineering', title: 'Deploy checklist', summary: 'What to run before shipping any change.', tags: ['deploy', 'qa', 'release'], body: [
    'Run tsc --noEmit and the full test suite — both must be green.',
    'Smoke-check the touched routes on the dev server.',
    'Update the Launch Control board with the checklist status.',
    'Draft release notes in the same PR.',
  ] },
  { id: 'd4', category: 'Engineering', title: 'Local-first data rules', summary: 'Why some data lives in localStorage and how to scan it.', tags: ['localstorage', 'data', 'pipeline'], body: [
    'Per-business Studio tools write to nowopen_publisher_*, nowopen_videos_*, nowopen_campaigns_* keys.',
    'The admin Creator scans those via scanPipelineLocal so the internal views always reflect real activity.',
    'New local stores must keep the nowopen_ prefix and be JSON.',
  ] },
  { id: 'd5', category: 'Marketing', title: 'Campaign launch playbook', summary: 'The 7-day run-up to any platform campaign.', tags: ['campaign', 'launch', 'playbook'], body: [
    'Day 1: choose the industry packs from the Video Template Library.',
    'Day 2: create assets in the Creative Studio.',
    'Day 3: publish the first teaser post.',
    'Day 5: email the list and open the marketplace.',
    'Day 7: go live and track in the Analytics War Room.',
  ] },
  { id: 'd6', category: 'Marketing', title: 'The content cadence', summary: 'The weekly posting rhythm we recommend businesses.', tags: ['content', 'cadence', 'social'], body: [
    'Post 3x a week: one offer, one proof (photo/review), one story.',
    'Schedule a week ahead so nothing goes dark on weekends.',
    'Every post carries a hook in the first two words.',
  ] },
  { id: 'd7', category: 'Design', title: 'Design tokens', summary: 'Where colours, type and spacing live.', tags: ['design', 'tokens', 'styleguide'], body: [
    'The Design System section is the living source of truth — update it, not a screenshot.',
    'Spacing runs on the 4px grid; 8–24px for most gaps.',
    'Cards use a 1px border; modals use shadow-lg.',
  ] },
  { id: 'd8', category: 'Design', title: 'Template standards', summary: 'What every template card must include.', tags: ['templates', 'standards'], body: [
    'An emoji, a tier (free/pro), duration in days and channels.',
    'A one-sentence description that sells the outcome.',
    'A colour palette pulled from the industry data, never hardcoded.',
  ] },
  { id: 'd9', category: 'Growth', title: 'Onboarding review', summary: 'The approval queue SOP.', tags: ['onboarding', 'approval', 'sop'], body: [
    'Check verification docs, registrations and enquiries daily.',
    'Approve businesses whose docs match their profile category.',
    'Escalate anything that looks like fraud to the trust channel.',
  ] },
  { id: 'd10', category: 'Growth', title: 'Partnership pipeline', summary: 'How we move a partner from proposal to active.', tags: ['partners', 'crm', 'pipeline'], body: [
    'Proposal: agree the shared goal in one sentence.',
    'Negotiation: scope, timing and who owns what.',
    'Active: launch a campaign pack together and track it.',
    'Alumni: keep warm — alumni partners re-engage fastest.',
  ] },
  { id: 'd11', category: 'Legal', title: 'Privacy & data handling', summary: 'What the team may store and share.', tags: ['privacy', 'legal', 'data'], body: [
    'Never paste customer data into external AI tools.',
    'Only the admin console may read full user records.',
    'Platform enquiries are visible to admins only (RLS).',
  ] },
  { id: 'd12', category: 'Finance', title: 'Reading the revenue board', summary: 'What the Command Center money numbers mean.', tags: ['revenue', 'finance', 'dashboard'], body: [
    'Revenue today = paid payment_intents created today.',
    'Pending = unpaid intents, not revenue yet.',
    'Currency is stored per intent — always show the local symbol.',
  ] },
  { id: 'd13', category: 'Support', title: 'Enquiry first response', summary: 'The SLA and tone for every platform enquiry.', tags: ['support', 'enquiry', 'sla'], body: [
    'Reply within 4 working hours.',
    'Open with their name and what they asked about.',
    'Answer in the same channel they used, then log to Community Management.',
  ] },
  { id: 'd14', category: 'Support', title: 'Verification support', summary: 'Helping a business through the verified badge.', tags: ['support', 'verification'], body: [
    'Walk them through the required documents one by one.',
    'Explain the badge improves search and trust signals.',
    'If a doc is rejected, tell them exactly why and what to resubmit.',
  ] },
];

export default function KnowledgeBase() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Doc['category'] | 'All'>('All');
  const [open, setOpen] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DOCS.filter((d) =>
      (category === 'All' || d.category === category) &&
      (!q || d.title.toLowerCase().includes(q) || d.summary.toLowerCase().includes(q) || d.tags.some((t) => t.includes(q))));
  }, [query, category]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 text-white flex items-center justify-center shrink-0">
            <BookOpen size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Knowledge base</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{DOCS.length} docs across {CATEGORIES.length} areas — search by keyword or browse by topic.</p>
          </div>
        </div>
        <div className="relative mt-4">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the docs…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(['All', ...CATEGORIES] as const).map((c) => (
            <button key={c} onClick={() => setCategory(c)}
              className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${category === c ? 'border-transparent text-white bg-purple-600' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2.5">
        {filtered.length === 0 && <p className="text-sm text-gray-400 py-8 text-center">No docs match “{query}”. Add one to the knowledge base.</p>}
        {filtered.map((d) => (
          <div key={d.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
            <button onClick={() => setOpen(open === d.id ? null : d.id)} className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-900/40 transition">
              <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300 shrink-0">{d.category}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-gray-900 dark:text-white">{d.title}</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">{d.summary}</span>
              </span>
              <ChevronDown size={15} className={`text-gray-400 shrink-0 transition-transform ${open === d.id ? 'rotate-180' : ''}`} />
            </button>
            {open === d.id && (
              <div className="px-5 pb-4 pt-0 border-t border-gray-100 dark:border-gray-800">
                <ul className="mt-3 space-y-2">
                  {d.body.map((line, i) => (
                    <li key={i} className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed flex gap-2"><span className="text-purple-500 shrink-0">•</span>{line}</li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {d.tags.map((t) => <span key={t} className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-[10px] font-semibold text-gray-500 dark:text-gray-400">#{t}</span>)}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
