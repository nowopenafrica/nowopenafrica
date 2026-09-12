import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, CheckCircle2, Loader2, Search } from 'lucide-react';

import { supabase } from '../lib/supabase';
import { applySeo } from '../lib/seo';
import { track } from '../lib/telemetry';
import { isOrderReference, normaliseOrderReference, orderTrackPath } from '../lib/create/reference';

/**
 * Where a Create order goes to be seen again.
 *
 * An order is placed without an account, on purpose — asking someone to
 * register before they can say what they want to buy is the friction the whole
 * page exists to remove. The cost of that is there is no dashboard to come back
 * to, so this page is the dashboard: one reference, one order.
 *
 * It reads through create_order_status(), a definer function, because the
 * orders table has no public SELECT and must not get one. What comes back is
 * the job, the price and where it has got to — never the contact details, and
 * never anything about any other order.
 *
 * It is noindex. The reference is a bearer token; a search engine that
 * discovers one has published somebody's order.
 */

interface OrderView {
  reference: string;
  product: string;
  quantity: number | null;
  spec: string;
  status: string;
  estimate_total: number;
  estimate_basis: string;
  quoted_total: number | null;
  quote_note: string | null;
  has_artwork: boolean;
  created_at: string;
  accepted_at: string | null;
}

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;

/**
 * What each state means to the customer, in their words rather than ours.
 * 'quoting' and 'quoted' are different things to us; to them the difference is
 * whether there is a number to look at yet.
 */
const STAGES: { key: string; label: string; says: string }[] = [
  { key: 'new', label: 'Received', says: 'We have your specification. We are getting it priced.' },
  { key: 'quoting', label: 'Being priced', says: 'With a production partner for a real price.' },
  { key: 'quoted', label: 'Priced', says: 'Here is the price. Nothing is charged until you accept it.' },
  { key: 'accepted', label: 'Accepted', says: 'You accepted. We are getting it made.' },
  { key: 'in_production', label: 'In production', says: 'Being produced now.' },
  { key: 'delivered', label: 'Delivered', says: 'Done.' },
];

export default function OrderStatus() {
  const { reference } = useParams<{ reference: string }>();
  const navigate = useNavigate();

  const [typed, setTyped] = useState('');
  const [order, setOrder] = useState<OrderView | null>(null);
  const [loading, setLoading] = useState(Boolean(reference));
  const [missing, setMissing] = useState(false);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => applySeo({
    title: 'Your Create order · NowOpen Africa',
    description: 'Check the status of a NowOpen Create order using its reference.',
    path: reference ? orderTrackPath(reference) : '/order',
    // A reference in a search result is a published order.
    robots: 'noindex, nofollow',
  }), [reference]);

  const load = useCallback(async (ref: string) => {
    setLoading(true);
    setMissing(false);
    const { data, error } = await supabase.rpc('create_order_status', { p_reference: ref });
    setLoading(false);
    const row = Array.isArray(data) ? (data[0] as OrderView | undefined) : undefined;
    if (error || !row) { setOrder(null); setMissing(true); return; }
    setOrder(row);
  }, []);

  useEffect(() => { if (reference) void load(reference); }, [reference, load]);

  const lookup = () => {
    const ref = normaliseOrderReference(typed);
    if (!isOrderReference(ref)) { toast.error('That does not look like a reference. It reads NOC-XXXXX-XXXXX.'); return; }
    navigate(orderTrackPath(ref));
  };

  const accept = async () => {
    if (!order) return;
    setAccepting(true);
    const { data, error } = await supabase.rpc('accept_create_order', { p_reference: order.reference });
    setAccepting(false);
    if (error || data !== true) { toast.error('That could not be accepted. Refresh and try again.'); return; }
    track('create_order_accepted', { reference: order.reference, total: order.quoted_total ?? 0 });
    toast.success('Accepted. We are getting it made.');
    void load(order.reference);
  };

  // ── No reference in the URL: let somebody type the one they wrote down ────
  if (!reference) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16">
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">Track a Create order</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Enter the reference we gave you when you placed it. It reads like NOC-8H3KM-2QW9T.
        </p>
        <div className="mt-4 flex gap-2">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') lookup(); }}
            aria-label="Order reference"
            placeholder="NOC-…"
            className="flex-1 min-h-[48px] px-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm tracking-widest uppercase"
          />
          <button onClick={lookup} className="inline-flex items-center gap-1.5 min-h-[48px] px-5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-bold">
            <Search size={16} /> Find it
          </button>
        </div>
        <p className="mt-6 text-sm text-gray-600 dark:text-gray-400">
          Lost it? <Link to="/contact" className="font-semibold text-pink-600 hover:underline">Tell us what you ordered</Link> and we will find it.
        </p>
      </div>
    );
  }

  if (loading) {
    return <div className="max-w-lg mx-auto px-4 py-24 text-center text-gray-500"><Loader2 className="mx-auto animate-spin" /></div>;
  }

  if (missing || !order) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">We cannot find that order</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Check the reference — it is easy to mistype. If it still does not work, it may have been
          placed under a different one.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link to="/order" className="min-h-[46px] inline-flex items-center px-5 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-semibold">
            Try another reference
          </Link>
          <Link to="/media" className="min-h-[46px] inline-flex items-center px-5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold">
            Back to Create
          </Link>
        </div>
      </div>
    );
  }

  const cancelled = order.status === 'cancelled';
  const estimate = order.estimate_basis === 'indicative';
  const priced = order.quoted_total != null;

  // Work that was already at a real price is not waiting to be priced. Showing
  // "Being priced" on an order whose price is settled invents a delay that is
  // not happening — unless it genuinely is sitting in one of those states.
  const stages = STAGES
    .filter((s) => estimate || order.status === s.key || (s.key !== 'quoting' && s.key !== 'quoted'))
    // Same reason: a settled price is not being got.
    .map((s) => (s.key === 'new' && !estimate
      ? { ...s, says: 'We have your order. We will confirm it and start the work.' }
      : s));
  const stageIndex = stages.findIndex((s) => s.key === order.status);

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 sm:py-14">
      <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Your Create order</p>
      <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">{order.product}</h1>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{order.spec}</p>
      <p className="mt-2 text-sm font-mono tracking-widest text-gray-500">{order.reference}</p>

      {/* Where it has got to. */}
      <div className="mt-7 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        {cancelled ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            This order was cancelled. Nothing was charged.
          </p>
        ) : (
          <ol className="space-y-3">
            {stages.map((s, i) => {
              const reached = i <= stageIndex;
              const current = i === stageIndex;
              return (
                <li key={s.key} className="flex gap-3">
                  <span className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center ${
                    reached ? 'border-green-600 bg-green-600' : 'border-gray-300 dark:border-gray-600'
                  }`}>
                    {reached && <CheckCircle2 size={12} className="text-white" />}
                  </span>
                  <div>
                    <p className={`text-sm font-bold ${reached ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>
                      {s.label}
                    </p>
                    {current && <p className="text-xs text-gray-600 dark:text-gray-400">{s.says}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* The price. Both numbers, always — hiding the estimate once a real
          price lands would look like the price had simply changed. */}
      <div className="mt-5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-5">
        <div className="flex justify-between gap-4 text-sm">
          <span className="text-gray-600 dark:text-gray-400">
            {estimate ? 'Estimate you were shown' : 'Price you were shown'}
          </span>
          <span className="tabular-nums text-gray-700 dark:text-gray-300">{naira(order.estimate_total)}</span>
        </div>
        {priced && (
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 flex justify-between gap-4 items-baseline">
            <span className="font-bold text-gray-900 dark:text-white">Your price</span>
            <span className="text-2xl font-extrabold text-gray-900 dark:text-white tabular-nums">
              {naira(order.quoted_total as number)}
            </span>
          </div>
        )}
        {order.quote_note && (
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{order.quote_note}</p>
        )}
        {!priced && (
          <p className="mt-2 text-xs text-gray-500">
            {estimate
              ? 'This was a market estimate. We are getting the job priced properly and will put the real number here.'
              : 'We will confirm and start the work.'}
          </p>
        )}
        {order.has_artwork && (
          <p className="mt-2 text-xs text-gray-500">Your artwork is attached to this order.</p>
        )}
      </div>

      {order.status === 'quoted' && priced && (
        <button
          onClick={() => void accept()}
          disabled={accepting}
          className="mt-5 w-full min-h-[52px] rounded-xl bg-pink-600 text-white font-bold hover:bg-pink-700 transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {accepting && <Loader2 size={17} className="animate-spin" />}
          Accept {naira(order.quoted_total as number)} and go ahead
        </button>
      )}

      {order.accepted_at && (
        <p className="mt-4 text-sm text-green-700 dark:text-green-400 font-semibold">
          Accepted on {new Date(order.accepted_at).toLocaleDateString()}.
        </p>
      )}

      <div className="mt-8 flex flex-wrap gap-3 text-sm">
        <Link to="/media" className="inline-flex items-center gap-1 font-semibold text-pink-600 hover:underline">
          Order something else <ArrowRight size={14} />
        </Link>
        <Link to="/contact" className="font-semibold text-gray-600 dark:text-gray-400 hover:underline">
          Ask us about this order
        </Link>
      </div>
    </div>
  );
}
