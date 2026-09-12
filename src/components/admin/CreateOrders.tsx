import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Download, PackageOpen, RefreshCw } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { ARTWORK_BUCKET } from '../../lib/create/artwork';
import { orderTrackPath } from '../../lib/create/reference';

/**
 * The queue behind NowOpen Create's order button.
 *
 * The estimate the customer saw sits beside the price we actually get back, so
 * the gap between the two is visible per order. That gap is the whole point:
 * the catalogue is priced off a competitor's shelf today, and these rows are
 * how it stops being. Enough of them and every SKU can carry a real number.
 */

const STATUSES = ['new', 'quoting', 'quoted', 'accepted', 'in_production', 'delivered', 'cancelled'] as const;
type Status = typeof STATUSES[number];

const TONE: Record<Status, string> = {
  new: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  quoting: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  quoted: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
  accepted: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  in_production: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200',
  delivered: 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

interface Row {
  id: string;
  reference: string;
  product: string;
  quantity: number | null;
  spec: string;
  estimate_total: number;
  estimate_basis: string;
  quoted_total: number | null;
  quote_note: string | null;
  artwork_path: string | null;
  artwork_name: string | null;
  contact: string;
  business_name: string | null;
  note: string | null;
  status: Status;
  created_at: string;
}

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;

export default function CreateOrders() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('create_orders')
        .select('id,reference,product,quantity,spec,estimate_total,estimate_basis,quoted_total,quote_note,artwork_path,artwork_name,contact,business_name,note,status,created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setRows((data as Row[]) ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const patch = async (id: string, changes: Partial<Row>) => {
    setBusy(id);
    const { error } = await supabase
      .from('create_orders')
      .update({ ...changes, handled_at: new Date().toISOString() })
      .eq('id', id);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    setRows((r) => r.map((row) => (row.id === id ? { ...row, ...changes } : row)));
  };

  /**
   * The artwork is in a private bucket and stays there. A signed URL expires in
   * five minutes: long enough to open it, short enough that a link pasted into
   * a chat is dead by the time anyone else clicks it.
   */
  const openArtwork = async (path: string) => {
    const { data, error } = await supabase.storage.from(ARTWORK_BUCKET).createSignedUrl(path, 300);
    if (error || !data?.signedUrl) { toast.error('Could not open that file.'); return; }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const open = rows.filter((r) => r.status === 'new' || r.status === 'quoting').length;

  if (loading) return <p className="text-sm text-gray-500">Loading orders…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Create orders</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Configured on the Create page. Put the real price in “Real price” and move the order to
            “quoted” — the customer sees both numbers, and your note, on their tracking page, and
            accepts it there. The estimate beside it is what they were shown.
          </p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full ${open > 0 ? TONE.new : TONE.cancelled}`}>
          {open} to price
        </span>
        <button onClick={() => void load()}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
          <PackageOpen size={32} className="mx-auto text-gray-300 dark:text-gray-600" />
          <p className="mt-2 text-sm text-gray-500">
            No orders yet. The configurator is on the Create page — pick anything that is not free.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-[14rem] flex-1">
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {r.product}{r.quantity ? ` × ${r.quantity}` : ''}
                  </p>
                  <a
                    href={orderTrackPath(r.reference)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono tracking-wider text-pink-600 hover:underline"
                    title="Open what the customer sees"
                  >
                    {r.reference}
                  </a>
                  <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">{r.spec}</p>
                  {r.artwork_path && (
                    <button
                      onClick={() => void openArtwork(r.artwork_path as string)}
                      className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:text-pink-600"
                    >
                      <Download size={13} /> {r.artwork_name ?? 'Artwork'}
                    </button>
                  )}
                  <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 font-mono">{r.contact}</p>
                  {r.business_name && <p className="text-xs text-gray-500">{r.business_name}</p>}
                  {r.note && <p className="mt-1 text-xs text-gray-600 dark:text-gray-400 italic">“{r.note}”</p>}
                  <p className="mt-1 text-[11px] text-gray-400">{new Date(r.created_at).toLocaleString()}</p>
                </div>

                <div className="text-right">
                  <p className="text-xs text-gray-500">
                    {r.estimate_basis === 'indicative' ? 'Estimate shown' : 'Quoted price shown'}
                  </p>
                  <p className="font-bold text-gray-900 dark:text-white tabular-nums">{naira(r.estimate_total)}</p>
                  <label className="mt-2 block text-[11px] text-gray-500">Real price</label>
                  <input
                    type="number"
                    defaultValue={r.quoted_total ?? ''}
                    onBlur={(e) => {
                      const v = e.target.value === '' ? null : Number(e.target.value);
                      if (v !== (r.quoted_total ?? null)) void patch(r.id, { quoted_total: v });
                    }}
                    className="w-32 min-h-[38px] px-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-right"
                    placeholder="—"
                  />
                  {r.quoted_total != null && r.estimate_total > 0 && (
                    <p className={`mt-1 text-[11px] ${r.quoted_total > r.estimate_total ? 'text-red-600' : 'text-green-600'}`}>
                      {r.quoted_total > r.estimate_total ? '+' : ''}
                      {Math.round(((r.quoted_total - r.estimate_total) / r.estimate_total) * 100)}% vs estimate
                    </p>
                  )}
                  {/* The customer sees this beside the number. A price that
                      moved with no explanation is a price people argue with. */}
                  <textarea
                    defaultValue={r.quote_note ?? ''}
                    rows={2}
                    maxLength={500}
                    onBlur={(e) => {
                      const v = e.target.value.trim() || null;
                      if (v !== (r.quote_note ?? null)) void patch(r.id, { quote_note: v });
                    }}
                    placeholder="Why this price (shown to them)"
                    className="mt-2 w-44 px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs text-left"
                  />
                </div>

                <div className="flex flex-col items-end gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${TONE[r.status]}`}>{r.status.replace('_', ' ')}</span>
                  <select
                    value={r.status}
                    disabled={busy === r.id}
                    onChange={(e) => void patch(r.id, { status: e.target.value as Status })}
                    className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm"
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
