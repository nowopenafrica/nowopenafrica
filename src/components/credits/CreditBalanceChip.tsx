/**
 * Header credit balance: sits after the currency selector for signed-in
 * users. Shows available NOC, flags a low balance, and opens a small panel
 * with the breakdown, top-up packs (only when the market's purchase mode lets
 * this account buy) and links to the wallet and the price list.
 *
 * Every figure is read from the database (noc_wallet_summary, credit_actions,
 * credit_packages); nothing here prices or decides anything. It re-reads when
 * the panel opens, when the tab regains focus, and on NOC_BALANCE_EVENT.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Coins, Loader2, Lock, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { paymentsLive } from '../../lib/payments';
import { formatMinor } from '../../lib/create/money';
import { fetchCreditActions, fetchCreditPackages, isActionLive, isPackageForSale, totalCredits, type CreditPackage } from '../../lib/credits/catalogue';
import { fetchWalletSummary, formatNoc, nocValue, NOC_CLASS_LABELS, NOC_CLASS_ORDER, topUpClosedMessage, type NocWalletSummary } from '../../lib/credits/noc';
import { isLowBalance, NOC_BALANCE_EVENT, runTopUp } from '../../lib/credits/topUp';

export default function CreditBalanceChip({ className = '' }: { className?: string }) {
  const { user } = useAuth();
  const [summary, setSummary] = useState<NocWalletSummary | null>(null);
  const [costs, setCosts] = useState<number[]>([]);
  const [packs, setPacks] = useState<CreditPackage[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [s, actions, allPacks] = await Promise.all([fetchWalletSummary(), fetchCreditActions(), fetchCreditPackages()]);
      setSummary(s);
      setCosts(actions.filter(isActionLive).map((a) => a.creditCost ?? 0));
      setPacks(allPacks.filter((p) => isPackageForSale(p) && p.currency === s.market.currency));
      setFailed(false);
    } catch {
      // Shown as "—" with a retry rather than a false 0.
      setFailed(true);
    }
  }, [user]);

  useEffect(() => {
    if (!user) { setSummary(null); return; }
    void load();
    const onFocus = () => { void load(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener(NOC_BALANCE_EVENT, onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(NOC_BALANCE_EVENT, onFocus);
    };
  }, [user, load]);

  // Close on outside click and Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!user) return null;

  const low = summary ? isLowBalance(summary.available, costs) : false;
  const closed = summary ? (topUpClosedMessage(summary.market.purchaseMode, summary.canTopUp) ?? (!paymentsLive ? 'Top-ups are not open yet.' : null)) : null;
  const label = failed ? '—' : summary ? summary.available.toLocaleString('en-NG') : '…';

  const topUp = async (slug: string) => {
    setBusy(slug);
    setNotice(null);
    try {
      const r = await runTopUp(slug);
      setNotice(r.message);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not start the top-up.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); if (!open) void load(); }}
        className={`relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold transition ${
          low
            ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
            : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800'
        }`}
        style={{ minHeight: 36 }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={summary ? `Credits: ${formatNoc(summary.available)} available${low ? ', running low' : ''}. Open to top up.` : 'Credits'}
        title={low ? 'Your credits are running low' : 'Your NowOpen Credits'}
      >
        <Coins size={15} aria-hidden="true" />
        <span className="tabular-nums">{label}</span>
        {low && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-gray-900" aria-hidden="true" />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="NowOpen Credits"
          // Phones: pinned under the header with 16px gutters. Wider: anchored
          // to the chip. Explicit px because the root font is under 16px.
          className="fixed left-[16px] right-[16px] top-[60px] z-50 sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[320px] rounded-xl border border-gray-200 bg-white p-4 text-sm shadow-xl dark:border-gray-700 dark:bg-gray-900"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs text-gray-500">Available credits</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{summary ? formatNoc(summary.available) : label}</div>
              {summary && summary.market.minorPerNoc > 0 && (
                <div className="text-xs text-gray-500">
                  Worth {nocValue(summary.available, summary.market.minorPerNoc, summary.market.currency)} · {nocValue(1, summary.market.minorPerNoc, summary.market.currency)} per NOC
                </div>
              )}
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-gray-400 hover:text-gray-700" aria-label="Close">
              <X size={16} />
            </button>
          </div>

          {failed && (
            <p className="mt-3 text-red-700">Couldn't load your balance. <button type="button" className="underline" onClick={() => void load()}>Try again</button></p>
          )}

          {summary && (
            <>
              {low && (
                <p className="mt-3 rounded-lg bg-amber-50 p-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  Running low: you can't cover every AI action right now.
                </p>
              )}
              {summary.held > 0 && <p className="mt-2 text-xs text-gray-500">{formatNoc(summary.held)} held for work in progress.</p>}
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-gray-100 pt-3 dark:border-gray-800">
                {NOC_CLASS_ORDER.filter((c) => summary.classes[c] > 0).map((c) => (
                  <div key={c} className="contents">
                    <dt className="text-gray-500">{NOC_CLASS_LABELS[c]}</dt>
                    <dd className="text-right font-medium text-gray-900 dark:text-gray-100">{formatNoc(summary.classes[c])}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
                <div className="mb-2 font-semibold text-gray-900 dark:text-white">Top up</div>
                {closed ? (
                  <p className="flex items-center gap-1.5 text-gray-500"><Lock size={14} aria-hidden="true" /> {closed}</p>
                ) : packs.length === 0 ? (
                  <p className="text-gray-500">No packs on sale right now.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {packs.map((p) => (
                      <li key={p.slug}>
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void topUp(p.slug)}
                          className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:hover:bg-gray-800"
                          style={{ minHeight: 44 }}
                        >
                          <span>{p.name} · {formatNoc(totalCredits(p))}</span>
                          <span className="font-semibold">
                            {busy === p.slug ? <Loader2 size={14} className="animate-spin" /> : formatMinor(p.priceMinor ?? 0, p.currency)}
                          </span>
                        </button>
                      </li>
                    ))}
                    {summary.market.purchaseMode === 'sandbox' && (
                      <li className="text-xs text-gray-500">Test mode: use a Paystack test card. Test top-ups are kept apart from real ones.</li>
                    )}
                  </ul>
                )}
                {notice && <p className="mt-2 text-gray-600 dark:text-gray-300" role="status">{notice}</p>}
              </div>
            </>
          )}

          <div className="mt-3 flex justify-between border-t border-gray-100 pt-3 text-sm dark:border-gray-800">
            <Link to="/wallet" onClick={() => setOpen(false)} className="font-medium text-blue-700 hover:underline dark:text-blue-400">Wallet & history</Link>
            <Link to="/pricing#ai-credits" onClick={() => setOpen(false)} className="text-gray-600 hover:underline dark:text-gray-400">What credits buy</Link>
          </div>
          <p className="mt-2 text-[11px] text-gray-400">NOC can only be spent on NowOpen. It can't be transferred or cashed out.</p>
        </div>
      )}
    </div>
  );
}
