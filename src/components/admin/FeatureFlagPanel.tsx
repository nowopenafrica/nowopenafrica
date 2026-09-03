import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Power, AlertTriangle, RefreshCw } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { invalidateFlags } from '../../hooks/useFeatureFlags';
import { KILL_SWITCH_ORDER, CONSEQUENCE, type FlagKey } from '../../lib/featureFlags';

/**
 * Admin → kill switches.
 *
 * Built for the ten minutes when something is going wrong in front of real
 * customers: ordered by how much damage each switch stops, each one saying in
 * plain words what a customer will see, and no confirmation dialog between the
 * operator and the off switch. Turning a feature off is reversible; the delay
 * while somebody reads a modal is not.
 *
 * A flag hides a surface. It is not a permission — RLS is still what stops a
 * client that ignores the flag, and nothing here should ever be relied on for
 * that.
 */
interface Row {
  key: FlagKey;
  enabled: boolean;
  label: string;
  description: string | null;
  updated_at: string | null;
}

export default function FeatureFlagPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('feature_flags')
      .select('key,enabled,label,description,updated_at');
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    const byKey = new Map((data as Row[] ?? []).map((r) => [r.key, r]));
    // Ordered by consequence, not alphabetically — see KILL_SWITCH_ORDER.
    setRows(KILL_SWITCH_ORDER.map((k) => byKey.get(k)).filter(Boolean) as Row[]);
  }, []);

  useEffect(() => { void load().catch(() => setLoading(false)); }, [load]);

  const toggle = async (row: Row) => {
    setBusy(row.key);
    const { error } = await supabase.rpc('set_feature_flag', {
      p_key: row.key, p_enabled: !row.enabled,
    });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    invalidateFlags();
    setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, enabled: !r.enabled } : r)));
    toast.success(`${row.label} ${row.enabled ? 'turned off' : 'turned back on'}`);
  };

  if (loading) {
    return <p className="flex items-center gap-2 text-sm text-gray-500 py-8">
      <Loader2 size={16} className="animate-spin" /> Loading switches…
    </p>;
  }

  const off = rows.filter((r) => !r.enabled);

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Kill switches</h2>
          <p className="text-[12px] text-gray-500 dark:text-gray-400 max-w-2xl">
            Turn one surface off instead of taking the platform down. A switch hides a
            feature — it is not a permission, and it does not change who can access what.
          </p>
        </div>
        <button onClick={() => void load()} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-gray-600 dark:text-gray-300">
          <RefreshCw size={13} /> Refresh
        </button>
      </header>

      {off.length > 0 && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200">
          <strong>{off.length} switched off:</strong> {off.map((r) => r.label).join(', ')}.
          Anything left off is a feature customers cannot use.
        </div>
      )}

      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.key}
              className={`rounded-xl border p-4 ${r.enabled
                ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                : 'border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-900/15'}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  {r.label}
                  {!r.enabled && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                      <AlertTriangle size={10} /> OFF
                    </span>
                  )}
                </p>
                {r.description && (
                  <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">{r.description}</p>
                )}
                {/* What a customer will see — the thing worth knowing while
                    deciding whether to press it. */}
                <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-1.5">
                  <span className="font-semibold">Turning this off:</span> {CONSEQUENCE[r.key]}
                </p>
              </div>
              <button
                onClick={() => void toggle(r)}
                disabled={busy === r.key}
                aria-pressed={r.enabled}
                className={`inline-flex items-center gap-2 px-4 min-h-[40px] rounded-lg text-sm font-bold shrink-0 disabled:opacity-50 ${
                  r.enabled
                    ? 'border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20'
                    : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'}`}
              >
                {busy === r.key ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
                {r.enabled ? 'Turn off' : 'Turn back on'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
