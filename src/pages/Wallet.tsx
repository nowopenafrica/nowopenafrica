/**
 * /wallet — the signed-in customer's NOC wallet: balance by class, what NOC
 * buys (priced from credit_actions, with the naira value beside it), top-up
 * packs when the market is open, and recent movements.
 *
 * Everything shown is read from the database; the page holds no prices.
 */
import { useCallback, useEffect, useState } from 'react';
import { Coins, Lock } from 'lucide-react';
import { fetchCreditActions, isActionLive, type CreditAction } from '../lib/credits/catalogue';
import {
  fetchHistory, fetchWalletSummary, formatNoc, nocValue, NOC_CLASS_LABELS, NOC_CLASS_ORDER, NOC_TYPE_LABELS,
  topUpClosedMessage, type NocHistoryRow, type NocWalletSummary,
} from '../lib/credits/noc';
import { formatLocalDate } from '../lib/dates';
import NocCheckout from '../components/credits/NocCheckout';

export default function Wallet() {
  const [summary, setSummary] = useState<NocWalletSummary | null>(null);
  const [actions, setActions] = useState<CreditAction[]>([]);
  const [history, setHistory] = useState<NocHistoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [topUpFor, setTopUpFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, a, h] = await Promise.all([fetchWalletSummary(), fetchCreditActions(), fetchHistory()]);
      setSummary(s);
      setActions(a.filter(isActionLive));
      setHistory(h);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your wallet.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (error) return <main className="mx-auto max-w-3xl px-4 py-10 text-red-700">{error}</main>;
  if (!summary) return <main className="mx-auto max-w-3xl px-4 py-10 text-gray-500">Loading your wallet…</main>;

  const { market } = summary;
  const closed = topUpClosedMessage(market.purchaseMode, summary.canTopUp);
  const shownClasses = NOC_CLASS_ORDER.filter((c) => summary.classes[c] > 0 || c === 'purchased' || c === 'included');

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">NowOpen Credits</h1>
      <p className="mt-1 text-sm text-gray-500">NOC pays for AI and promotion tools across Discover, Create and Promote.</p>

      <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-sm text-gray-500">Available</div>
            <div className="flex items-center gap-2 text-3xl font-bold text-gray-900 dark:text-gray-100">
              <Coins className="h-6 w-6" /> {formatNoc(summary.available)}
            </div>
            {summary.held > 0 && <div className="mt-1 text-xs text-gray-500">{formatNoc(summary.held)} held for work in progress</div>}
          </div>
          {market.minorPerNoc > 0 && (
            <div className="text-right text-sm text-gray-500">
              Worth {nocValue(summary.available, market.minorPerNoc, market.currency)}
              <div className="text-xs">at {nocValue(1, market.minorPerNoc, market.currency)} per NOC</div>
            </div>
          )}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4 sm:grid-cols-3 dark:border-gray-800">
          {shownClasses.map((c) => (
            <div key={c}>
              <dt className="text-xs text-gray-500">{NOC_CLASS_LABELS[c]}</dt>
              <dd className="font-semibold text-gray-900 dark:text-gray-100">{formatNoc(summary.classes[c])}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-gray-400">
          Free credits are used before bought ones. NOC can only be spent on NowOpen: it can't be transferred, withdrawn or exchanged.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">What NOC buys</h2>
        {actions.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Nothing is priced in NOC yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-700 dark:bg-gray-900">
            {actions.map((a) => (
              <li key={a.slug} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">{a.name}</div>
                    {a.description && <div className="text-xs text-gray-500">{a.description}</div>}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-semibold text-gray-900 dark:text-gray-100">{formatNoc(a.creditCost ?? 0)}</div>
                    <div className="text-xs text-gray-500">{nocValue(a.creditCost ?? 0, market.minorPerNoc, market.currency)}</div>
                  </div>
                </div>
                {summary.available < (a.creditCost ?? 0) && (
                  <button type="button" className="mt-2 text-xs font-medium text-amber-700 underline" onClick={() => setTopUpFor(topUpFor === a.slug ? null : a.slug)}>
                    {topUpFor === a.slug ? 'Hide' : 'Not enough NOC — see top-ups'}
                  </button>
                )}
                {topUpFor === a.slug && <NocCheckout action={a.slug} className="mt-3" onToppedUp={load} />}
              </li>
            ))}
          </ul>
        )}
        {closed && (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-gray-500"><Lock className="h-4 w-4" /> {closed}</p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Recent activity</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No activity yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white text-sm dark:divide-gray-800 dark:border-gray-700 dark:bg-gray-900">
            {history.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">{NOC_TYPE_LABELS[h.type] ?? h.type}</div>
                  <div className="text-xs text-gray-500">{formatLocalDate(h.createdAt)}{h.description ? ` · ${h.description}` : ''}</div>
                </div>
                <div className={`shrink-0 font-semibold ${h.amount > 0 ? 'text-emerald-700' : 'text-gray-700 dark:text-gray-300'}`}>
                  {h.amount > 0 ? '+' : '−'}{formatNoc(Math.abs(h.amount))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

    </main>
  );
}
