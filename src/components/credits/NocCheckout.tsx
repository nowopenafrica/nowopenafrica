/**
 * The unified NOC checkout: what something costs in NOC and in naira, side
 * by side, what the customer has, and — when they are short — a top-up that
 * covers the gap.
 *
 * Every number comes from noc_quote / noc_start_purchase. The component never
 * prices anything and never decides whether a top-up is allowed: when the
 * market's purchase mode is off it says so and offers nothing to click.
 *
 * Spending is the caller's job (`onUse`), because the charge must happen in
 * the edge function that does the work — see supabase/functions/_shared/credits.ts.
 *
 * NGN amounts here are the actual charge in the market currency
 * (formatMinor), not a display conversion, so they are not passed through
 * useCurrency().format, which converts from USD.
 */
import { useCallback, useEffect, useState } from 'react';
import { Coins, Loader2, Lock } from 'lucide-react';
import { formatMinor } from '../../lib/create/money';
import { paymentsLive } from '../../lib/payments';
import { NOC_BALANCE_EVENT, runTopUp } from '../../lib/credits/topUp';
import {
  fetchQuote, formatNoc, nocValue, perNocMinor, topUpClosedMessage, type NocPack, type NocQuote,
} from '../../lib/credits/noc';

export interface NocCheckoutProps {
  /** credit_actions.slug */
  action: string;
  /** Run the paid action. Shown only when the balance covers it. */
  onUse?: () => Promise<void> | void;
  useLabel?: string;
  /** Called after a top-up is verified and credited. */
  onToppedUp?: () => void;
  className?: string;
}

export default function NocCheckout({ action, onUse, useLabel, onToppedUp, className = '' }: NocCheckoutProps) {
  const [quote, setQuote] = useState<NocQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pack, setPack] = useState<string | null>(null);
  const [busy, setBusy] = useState<'use' | 'topup' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const q = await fetchQuote(action);
      setQuote(q);
      setPack((prev) => prev ?? q.suggestedPack?.slug ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the price.');
    }
  }, [action]);

  useEffect(() => {
    void load();
    const reload = () => { void load(); };
    window.addEventListener(NOC_BALANCE_EVENT, reload);
    return () => window.removeEventListener(NOC_BALANCE_EVENT, reload);
  }, [load]);

  if (error) return <div className={`rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 ${className}`}>{error}</div>;
  if (!quote) {
    return (
      <div className={`flex items-center gap-2 rounded-xl border border-gray-200 p-4 text-sm text-gray-500 ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin" /> Loading price…
      </div>
    );
  }
  if (!quote.ok) {
    return (
      <div className={`rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600 ${className}`}>
        {quote.name ?? 'This'} is not available yet.
      </div>
    );
  }

  const currency = quote.currency ?? 'NGN';
  const shortfall = quote.shortfall ?? 0;
  const packs = quote.packs ?? [];
  const chosen: NocPack | undefined = packs.find((p) => p.slug === pack) ?? quote.suggestedPack ?? undefined;
  const closed = topUpClosedMessage(quote.purchaseMode, quote.canTopUp) ?? (!paymentsLive ? 'Top-ups are not open yet.' : null);

  const use = async () => {
    if (!onUse) return;
    setBusy('use');
    try { await onUse(); await load(); } finally { setBusy(null); }
  };

  const topUp = async () => {
    if (!chosen) return;
    setBusy('topup');
    setNotice(null);
    try {
      const r = await runTopUp(chosen.slug);
      setNotice(r.message);
      await load();
      if (r.status === 'credited') onToppedUp?.();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not start the top-up.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-4 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-900 ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">{quote.name}</div>
          <div className="mt-1 text-gray-500">Value {nocValue(quote.noc ?? 0, quote.minorPerNoc ?? 0, currency)}</div>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-1 text-lg font-bold text-gray-900 dark:text-gray-100">
            <Coins className="h-4 w-4" /> {formatNoc(quote.noc ?? 0)}
          </div>
        </div>
      </div>

      {quote.signedIn ? (
        <div className="mt-3 flex justify-between border-t border-gray-100 pt-3 text-gray-600 dark:border-gray-800 dark:text-gray-300">
          <span>Your balance</span>
          <span className="font-medium">{formatNoc(quote.available ?? 0)}</span>
        </div>
      ) : (
        <p className="mt-3 border-t border-gray-100 pt-3 text-gray-500 dark:border-gray-800">Sign in to see your balance.</p>
      )}

      {quote.signedIn && shortfall === 0 && onUse && (
        <button
          type="button"
          onClick={use}
          disabled={busy !== null}
          className="mt-3 w-full rounded-lg bg-gray-900 px-4 py-2.5 font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-900"
          style={{ minHeight: 44 }}
        >
          {busy === 'use' ? 'Working…' : useLabel ?? `Use ${formatNoc(quote.noc ?? 0)}`}
        </button>
      )}

      {quote.signedIn && shortfall > 0 && (
        <div className="mt-3 rounded-lg bg-amber-50 p-3 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          You need {formatNoc(shortfall)} more.
          {closed ? (
            <p className="mt-2 flex items-center gap-1.5 text-amber-800 dark:text-amber-300"><Lock className="h-3.5 w-3.5" /> {closed}</p>
          ) : (
            <div className="mt-3 space-y-2">
              {packs.map((p) => (
                <label key={p.slug} className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-amber-200 bg-white px-3 py-2 text-gray-800 dark:border-amber-900 dark:bg-gray-900 dark:text-gray-200">
                  <span className="flex items-center gap-2">
                    <input type="radio" name={`noc-pack-${action}`} checked={chosen?.slug === p.slug} onChange={() => setPack(p.slug)} />
                    {p.name} · {formatNoc(p.credits)}
                  </span>
                  <span className="text-right">
                    <span className="font-semibold">{formatMinor(p.priceMinor, p.currency)}</span>
                    {perNocMinor(p) !== null && <span className="block text-xs text-gray-500">{formatMinor(perNocMinor(p)!, p.currency)} per NOC</span>}
                  </span>
                </label>
              ))}
              <button
                type="button"
                onClick={topUp}
                disabled={!chosen || busy !== null}
                className="w-full rounded-lg bg-amber-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60"
                style={{ minHeight: 44 }}
              >
                {busy === 'topup' ? 'Opening Paystack…' : chosen ? `Top up ${formatMinor(chosen.priceMinor, chosen.currency)}` : 'Choose a pack'}
              </button>
              {quote.purchaseMode === 'sandbox' && (
                <p className="text-xs">Test mode: use a Paystack test card. Test top-ups are kept apart from real ones.</p>
              )}
            </div>
          )}
        </div>
      )}

      {notice && <p className="mt-3 text-gray-600 dark:text-gray-300" role="status">{notice}</p>}
      <p className="mt-3 text-xs text-gray-400">NOC can only be spent on NowOpen. It can't be transferred or cashed out.</p>
    </div>
  );
}
