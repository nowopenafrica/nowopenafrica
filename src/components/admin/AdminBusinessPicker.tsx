import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Search, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Business } from '../../types';
import { scanLocalPipeline, type PipelineCounts } from '../../lib/adminCreator';

// Shared by the internal modules: fetch the platform's businesses (admins can
// read every row) + the real social publish log, expose the counts and let
// each department render its own stat strip and its own tool for the selected
// business. Keeps the picker UI in one place instead of one per module.

export interface BusinessPickerMeta {
  businesses: Business[];
  published: number;
  local: PipelineCounts;
  loading: boolean;
  error: boolean;
}

interface Props {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Rendered above the picker with live data (stat strips). */
  strip?: (meta: BusinessPickerMeta) => ReactNode;
  /** Rendered below the picker for the currently selected business. */
  tool?: (selected: Business | null) => ReactNode;
}

export default function AdminBusinessPicker({ selectedId, onSelect, strip, tool }: Props) {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [published, setPublished] = useState(0);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const local = useMemo(() => scanLocalPipeline(), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bizRes, logRes] = await Promise.all([
        supabase.from('businesses').select('*').order('created_at', { ascending: false }),
        supabase.from('social_publish_log').select('status'),
      ]);
      if (bizRes.error) throw bizRes.error;
      const rows = bizRes.data as Business[] | null;
      setBusinesses(rows ?? []);
      setPublished((logRes.data ?? []).filter((l) => l.status === 'ok' || l.status === 'simulated').length);
      setError(false);
      if (!selectedId) onSelect(rows?.[0]?.id ?? null);
    } catch {
      setError(true);
      setBusinesses([]);
    } finally {
      setLoading(false);
    }
  }, [onSelect, selectedId]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return businesses;
    return businesses.filter((b) =>
      b.name.toLowerCase().includes(q) || (b.category ?? '').toLowerCase().includes(q));
  }, [businesses, query]);

  const selected = businesses.find((b) => String(b.id) === selectedId) ?? null;
  const meta: BusinessPickerMeta = { businesses, published, local, loading, error };

  return (
    <div className="space-y-5">
      {strip?.(meta)}

      {error && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          Could not load the business list — check the backend connection.
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Working with</h3>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-2"><Loader2 className="animate-spin" size={16} /> Loading businesses…</div>
        ) : businesses.length === 0 ? (
          <p className="text-sm text-gray-500">No businesses on the platform yet.</p>
        ) : (
          <>
            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or category…"
                className="flex items-center w-full pl-9 pr-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px]"
              />
            </div>
            <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
              {filtered.map((b) => (
                <button key={b.id} onClick={() => onSelect(String(b.id))}
                  className={`w-full flex items-center gap-3 px-3 rounded-lg text-sm text-left transition ${String(b.id) === selectedId ? 'bg-purple-600 text-white' : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'} min-h-[44px]`}>
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${String(b.id) === selectedId ? 'bg-white/20 text-white' : 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300'}`}>
                    {b.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{b.name}</span>
                    <span className={`block text-[11px] truncate ${String(b.id) === selectedId ? 'text-white/70' : 'text-gray-400'}`}>
                      {b.category ?? 'Business'}{b.verified ? ' · verified' : ''}
                    </span>
                  </span>
                  {String(b.id) === selectedId && <ArrowRight size={15} className="ml-auto shrink-0" />}
                </button>
              ))}
              {filtered.length === 0 && <p className="text-sm text-gray-400 py-2">No businesses match “{query}”.</p>}
            </div>
          </>
        )}
      </div>

      {tool?.(selected)}
    </div>
  );
}
