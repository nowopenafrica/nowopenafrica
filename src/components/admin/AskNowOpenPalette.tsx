import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, CornerDownLeft, Sparkles, ArrowUpRight, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { NOWOPEN_ORG_ID, seedMembers, type WorkforceMember } from '../../lib/workforce';
import type { WorkItem } from '../../lib/work';
import type { ApprovalRequest } from '../../lib/approvals';
import { askNowOpen, type AskItem } from '../../lib/askNowOpen';

// Ask NowOpen — a command palette over the OS ledgers. Press ⌘K / Ctrl+K in
// the Admin Creator to open it, type a question ("who is blocked?", "what
// needs sign-off?", "how healthy is the OS?") and jump straight to the section
// that holds the answer. Every answer is derived from the real ledgers — a
// question with nothing behind it gets an honest line, never a guess.

interface PaletteData {
  members: WorkforceMember[];
  items: WorkItem[];
  approvals: ApprovalRequest[];
  snapshots: { health: number; snapshot_date?: string; derived_at?: string }[];
}

export default function AskNowOpenPalette({
  open,
  onClose,
  onOpenSection,
}: {
  open: boolean;
  onClose: () => void;
  onOpenSection: (id: string) => void;
}) {
  const { user } = useAuth();
  // Stable identity so a fresh context object every render (common in tests
  // and hot reload) doesn't restart the fetch loop.
  const currentUser = useMemo(
    () => (user?.id ? { id: user.id, email: user.email } : undefined),
    [user?.id, user?.email],
  );
  const [data, setData] = useState<PaletteData | null>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [wf, wi, ap, sn] = await Promise.all([
          supabase.from('os_workforce').select('*').eq('org_id', NOWOPEN_ORG_ID),
          supabase.from('os_work_items').select('*').eq('org_id', NOWOPEN_ORG_ID),
          supabase.from('os_approvals').select('*').eq('org_id', NOWOPEN_ORG_ID),
          supabase.from('os_snapshots').select('health, snapshot_date').eq('org_id', NOWOPEN_ORG_ID).order('snapshot_date', { ascending: false }),
        ]);
        const rows = (wf.data ?? []) as WorkforceMember[];
        if (wf.error || rows.length === 0) throw new Error('os_workforce unavailable');
        if (cancelled) return;
        setData({
          members: rows,
          items: (wi.data ?? []) as WorkItem[],
          approvals: (ap.data ?? []) as ApprovalRequest[],
          snapshots: (sn.data ?? []) as { health: number; snapshot_date?: string }[],
        });
      } catch {
        if (!cancelled) {
          toast('Ask NowOpen is on the demo roster for this session.', { id: 'ask-fallback' });
          setData({ members: seedMembers(currentUser), items: [], approvals: [], snapshots: [] });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, currentUser]);

  const results = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const all = askNowOpen(
      { members: data.members, items: data.items, approvals: data.approvals, snapshots: data.snapshots },
      query,
    );
    const filtered = all.filter((i) =>
      i.kind !== 'go' || !q || i.title.toLowerCase().includes(q) || i.detail.toLowerCase().includes(q),
    );
    return filtered.slice(0, 12);
  }, [data, query]);

  useEffect(() => { setActiveIndex(0); }, [query, results.length]);

  const activate = useCallback((item: AskItem) => {
    if (item.runQuery) { setQuery(item.runQuery); return; }
    if (item.sectionId) { onOpenSection(item.sectionId); onClose(); }
  }, [onOpenSection, onClose]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter' && results[activeIndex]) { e.preventDefault(); activate(results[activeIndex]); }
  };

  if (!open) return null;

  const kindChip: Record<AskItem['kind'], string> = {
    ask: 'Answer',
    suggest: 'Ask',
    go: 'Go to',
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 p-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Ask NowOpen palette"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-gray-800 shadow-2xl overflow-hidden"
        onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <Search size={16} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask NowOpen — who is blocked? what needs sign-off?"
            aria-label="Ask NowOpen"
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
          />
          {loading && <Loader2 size={14} className="animate-spin text-gray-400 shrink-0" />}
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-gray-400 dark:text-gray-500">
              No answer and no matching section yet — ask it differently.
            </p>
          )}
          {results.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => activate(item)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`w-full text-left px-3 py-2 rounded-lg flex items-start gap-3 transition ${i === activeIndex ? 'bg-purple-50 dark:bg-purple-900/30' : ''}`}
            >
              <span className={`mt-1 shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${
                item.kind === 'go'
                  ? 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700'
                  : item.kind === 'suggest'
                    ? 'text-purple-600 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/40'
                    : 'text-emerald-600 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40'
              }`}>
                {item.kind === 'suggest' ? <Sparkles size={9} className="mr-1" /> : null}
                {kindChip[item.kind]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-gray-900 dark:text-white truncate">{item.title}</span>
                <span className="block text-[11px] text-gray-500 dark:text-gray-400 truncate">{item.detail}</span>
              </span>
              {item.kind === 'go' && <ArrowUpRight size={13} className="mt-1 shrink-0 text-gray-400" />}
              {i === activeIndex && <CornerDownLeft size={13} className="mt-1 shrink-0 text-gray-400" />}
            </button>
          ))}
        </div>

        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700 text-[10px] text-gray-400 dark:text-gray-500 flex items-center justify-between">
          <span>Esc to close · ↑↓ to move · Enter to jump</span>
          <span className="font-semibold text-purple-500">⌘K</span>
        </div>
      </div>
    </div>
  );
}
