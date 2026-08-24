import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Search, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { NOWOPEN_ORG_ID } from '../../lib/workforce';
import {
  KB_CATEGORIES, KNOWLEDGE_SEED,
  filterKnowledge, searchKnowledge, summarizeKnowledge,
  type KnowledgeDoc, type KbCategory, type KnowledgeSource,
} from '../../lib/knowledge';

// The Internal Knowledge Base (#19) — everything the team knows, documented
// and searchable: brand, engineering, marketing, design, growth, legal,
// finance and support SOPs. The SOPs are seeded into os_knowledge and read
// live; human sign-offs from the Approvals Hub are synced back as 'decision'
// docs, so approved work becomes institutional memory. When the migration
// hasn't been applied the section falls back to the bundled seed and says so.

export default function KnowledgeBase() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<KbCategory | 'All'>('All');
  const [source, setSource] = useState<'all' | KnowledgeSource>('all');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('os_knowledge')
        .select('*')
        .eq('org_id', NOWOPEN_ORG_ID);
      const rows = (data ?? []) as KnowledgeDoc[];
      if (error || rows.length === 0) throw new Error('os_knowledge unavailable');
      setDocs(rows);
      setUsingFallback(false);
    } catch {
      setDocs(KNOWLEDGE_SEED);
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => summarizeKnowledge(docs), [docs]);

  const filtered = useMemo(() => {
    const byCategory = filterKnowledge(docs, { category: category === 'All' ? 'all' : category, source });
    return searchKnowledge(byCategory, query);
  }, [docs, category, source, query]);

  const categories: readonly (KbCategory | 'All')[] = useMemo(() => ['All', ...KB_CATEGORIES], []);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 text-white flex items-center justify-center shrink-0">
            <BookOpen size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Knowledge base</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {summary.total} docs across {KB_CATEGORIES.length} areas — search by keyword or browse by topic. Sign-offs from the Approvals Hub are synced here.
            </p>
          </div>
        </div>
        <div className="relative mt-4">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the docs…"
            className="flex items-center w-full pl-9 pr-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px]" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {categories.map((c) => (
            <button key={c} onClick={() => setCategory(c)}
              className={`inline-flex items-center px-3 .5 rounded-lg text-xs font-semibold border transition ${category === c ? 'border-transparent text-white bg-purple-600' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'} min-h-[44px]`}>
              {c}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">Source:</span>
          {(['all', 'sop', 'decision', 'manual'] as const).map((s) => (
            <button key={s} onClick={() => setSource(s)}
              className={`inline-flex items-center px-2 rounded-md text-[10px] font-semibold border transition ${source === s ? 'border-transparent text-white bg-slate-600' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'} min-h-[44px]`}>
              {s === 'all' ? 'All' : s === 'sop' ? 'SOP' : s === 'decision' ? 'Decisions' : 'Manual'}
            </button>
          ))}
          {summary.decisions > 0 && (
            <span className="ml-auto text-[10px] font-semibold text-purple-500 dark:text-purple-400">{summary.decisions} decision{summary.decisions === 1 ? '' : 's'} synced from approvals</span>
          )}
        </div>
      </div>

      {usingFallback && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
          Demo knowledge base — the os_knowledge migration isn't applied in this project yet. You're seeing the bundled SOPs; once it runs, docs come from the database and approvals sync here.
        </div>
      )}

      <div className="space-y-2.5">
        {!loading && filtered.length === 0 && <p className="text-sm text-gray-400 py-8 text-center">No docs match “{query}”. Add one to the knowledge base.</p>}
        {filtered.map((d) => (
          <div key={d.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
            <button onClick={() => setOpen(open === d.id ? null : d.id)} className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-900/40 transition">
              <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300 shrink-0">{d.category}</span>
              {d.source !== 'sop' && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0 ${d.source === 'decision' ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                  {d.source === 'decision' ? 'Decision' : 'Manual'}
                </span>
              )}
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
