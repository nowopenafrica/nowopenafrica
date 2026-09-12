import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Inbox, RefreshCw } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { SOURCES } from '../../lib/acquisition';

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
 *
 * EVERY NUMBER ON THIS PANEL IS COUNTED FROM A TABLE. There are no targets, no
 * projections and no placeholder figures. Before the campaign runs this shows
 * zeroes, and a zero is the only honest thing it can show — a dashboard that
 * opens with plausible-looking numbers is a dashboard nobody can ever trust
 * again once they find out.
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
  location: string | null;
  contact: string;
  note: string | null;
  source: string | null;
  kind: string | null;
  status: Status;
  created_at: string;
}

interface Funnel {
  requests_new: number;
  requests_contacted: number;
  requests_building: number;
  requests_live: number;
  requests_declined: number;
  nominations_open: number;
  businesses_unclaimed: number;
  businesses_pending: number;
  businesses_claimed: number;
  businesses_verified: number;
}

interface SourceRow { source: string; total: number; live: number }

export default function ProfileRequests() {
  const [rows, setRows] = useState<Row[]>([]);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profile_requests')
        .select('id,business_name,location,contact,note,source,kind,status,created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setRows((data as Row[]) ?? []);

      // One round trip each, and both are staff-gated inside the function
      // rather than here: a count of other people's submissions is not public.
      const [f, s] = await Promise.all([
        supabase.rpc('acquisition_funnel'),
        supabase.rpc('acquisition_by_source'),
      ]);
      setFunnel(Array.isArray(f.data) ? (f.data[0] as Funnel) ?? null : null);
      setSources(Array.isArray(s.data) ? (s.data as SourceRow[]) : []);
    } catch {
      // An un-applied migration or a non-staff session should render an empty
      // panel, not take the console down.
      setRows([]);
      setFunnel(null);
      setSources([]);
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
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Business acquisition</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Send it → we set it up → they claim it. Every request here is a person waiting to
            hear back from a real human.
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

      {funnel && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {[
            ['New requests', funnel.requests_new, 'someone sent it'],
            ['Contacted', funnel.requests_contacted, 'we reached them'],
            ['Being built', funnel.requests_building, 'profile in progress'],
            ['Live', funnel.requests_live, 'page exists'],
            ['Nominations', funnel.nominations_open, 'awaiting review'],
            ['Unclaimed', funnel.businesses_unclaimed, 'waiting for an owner'],
            ['Claim pending', funnel.businesses_pending, 'owner asked'],
            ['Claimed', funnel.businesses_claimed, 'owner has it'],
            ['Verified', funnel.businesses_verified, 'checked by us'],
            ['Declined', funnel.requests_declined, 'closed honestly'],
          ].map(([label, value, note]) => (
            <div key={label as string} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
              <p className="text-2xl font-extrabold text-gray-900 dark:text-white tabular-nums">{value as number}</p>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{label as string}</p>
              <p className="text-[11px] text-gray-500">{note as string}</p>
            </div>
          ))}
        </div>
      )}

      {sources.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <h4 className="font-bold text-sm text-gray-900 dark:text-white">Which surface produced them</h4>
          <p className="mt-0.5 text-xs text-gray-500">
            From <code>?src=</code> on the campaign link, falling back to the referrer. This is the
            whole reason the link has a source on it.
          </p>
          <ul className="mt-3 space-y-1.5">
            {sources.map((s) => (
              <li key={s.source} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 font-semibold text-gray-800 dark:text-gray-200">
                  {s.source}
                  {!(SOURCES as readonly string[]).includes(s.source) && s.source !== 'unknown' && (
                    <span className="ml-1 text-[10px] text-amber-600" title="Not a known source">?</span>
                  )}
                </span>
                <span className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                  <span
                    className="block h-full bg-pink-500"
                    style={{ width: `${Math.round((s.total / Math.max(...sources.map((x) => x.total))) * 100)}%` }}
                  />
                </span>
                <span className="tabular-nums text-gray-700 dark:text-gray-300">{s.total}</span>
                <span className="tabular-nums text-xs text-green-700 dark:text-green-400 w-16 text-right">
                  {s.live} live
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
          <Inbox size={32} className="mx-auto text-gray-300 dark:text-gray-600" />
          <p className="mt-2 text-sm text-gray-500">
            No requests yet. The campaign link is nowopenafrica.com/send-business — put a
            <code>?src=</code> on it (whatsapp, instagram, qr, flyer…) and the breakdown above
            starts telling you which surface actually works.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          {rows.map((r) => (
            <li key={r.id} className="p-4 flex flex-wrap items-center gap-3">
              <div className="min-w-[12rem] flex-1">
                <p className="font-semibold text-gray-900 dark:text-white">
                  {r.business_name}
                  {r.kind === 'nomination' && (
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      nominated
                    </span>
                  )}
                </p>
                {r.location && <p className="text-sm text-gray-600 dark:text-gray-400">{r.location}</p>}
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
