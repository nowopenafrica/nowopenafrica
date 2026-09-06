import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Inbox, RefreshCw } from 'lucide-react';

import { supabase } from '../../lib/supabase';

/**
 * The queue behind "Send us your business name."
 *
 * This exists because a form nobody works is worse than no form: it collects
 * an owner's expectation and returns nothing. Every request here is a person
 * waiting to hear back.
 *
 * The statuses are the actual job, in order — someone sent it, we reached them,
 * we are building, it is live. `declined` is there so a request can be closed
 * honestly rather than left in `new` forever to keep the number down.
 */

const STATUSES = ['new', 'contacted', 'building', 'live', 'declined'] as const;
type Status = typeof STATUSES[number];

const TONE: Record<Status, string> = {
  new: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  contacted: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  building: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
  live: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  declined: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

interface Row {
  id: string;
  business_name: string;
  contact: string;
  note: string | null;
  source: string | null;
  status: Status;
  created_at: string;
}

export default function ProfileRequests() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profile_requests')
        .select('id,business_name,contact,note,source,status,created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setRows((data as Row[]) ?? []);
    } catch {
      // An un-applied migration or a non-staff session should render an empty
      // panel, not take the console down.
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const setStatus = async (id: string, status: Status) => {
    setBusy(id);
    const { error } = await supabase
      .from('profile_requests')
      .update({ status, handled_at: new Date().toISOString() })
      .eq('id', id);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    setRows((r) => r.map((row) => (row.id === id ? { ...row, status } : row)));
  };

  const open = rows.filter((r) => r.status === 'new').length;

  if (loading) return <p className="text-sm text-gray-500">Loading requests…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Profile requests</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Owners who sent their business name from the homepage. Each one is a person waiting to hear back.
          </p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full ${open > 0 ? TONE.new : TONE.declined}`}>
          {open} waiting
        </span>
        <button onClick={() => void load()}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
          <Inbox size={32} className="mx-auto text-gray-300 dark:text-gray-600" />
          <p className="mt-2 text-sm text-gray-500">
            No requests yet. The form is on the homepage under “The directory is being built”.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          {rows.map((r) => (
            <li key={r.id} className="p-4 flex flex-wrap items-center gap-3">
              <div className="min-w-[12rem] flex-1">
                <p className="font-semibold text-gray-900 dark:text-white">{r.business_name}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 font-mono">{r.contact}</p>
                {r.note && <p className="mt-1 text-xs text-gray-500">{r.note}</p>}
                <p className="mt-1 text-[11px] text-gray-400">
                  {new Date(r.created_at).toLocaleString()}{r.source ? ` · ${r.source}` : ''}
                </p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${TONE[r.status]}`}>{r.status}</span>
              <select
                value={r.status}
                disabled={busy === r.id}
                onChange={(e) => void setStatus(r.id, e.target.value as Status)}
                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm"
              >
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
