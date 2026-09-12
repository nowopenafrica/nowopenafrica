import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { verifyPayment } from '../../lib/payments';

/**
 * Checkouts that reached Paystack and never came back.
 *
 * THE GAP THIS CLOSES
 *
 * A payment can complete at Paystack and never be recorded here. The client
 * calls `verify-payment` when the customer returns from checkout — but if they
 * close the tab, lose signal, or the browser is killed mid-redirect, that call
 * never happens. The webhook exists precisely to catch that case, and the
 * evidence says it is not firing: both `paid` rows in production carry
 * `verified_via = 'client'`, and the webhook's own update would have
 * overwritten that to `'webhook'`. So it has never delivered — almost
 * certainly because the endpoint is not registered in the Paystack dashboard.
 *
 * Until it is, nothing reconciles. Four intents have sat at `initiated` since
 * July, and nobody can say whether those customers paid, because nothing ever
 * asks Paystack again.
 *
 * WHAT THIS DOES
 *
 * Lists every intent stuck at `initiated` and lets an admin re-run the
 * existing verification for it. That function is already the right one to
 * call: it queries Paystack with the secret key server-side, checks the amount
 * and currency against what NowOpen recorded at checkout, and is idempotent —
 * so re-running it is safe, and grants the plan if the charge did succeed.
 *
 * This is a safety net, not the fix. **Registering the webhook is the fix**,
 * and it is a Paystack dashboard setting, not code.
 *
 * A note on what "stuck" means: intents younger than the grace period are
 * excluded, because a customer who is still on the Paystack page is not stuck
 * — they are mid-payment, and re-verifying them would just report a failure
 * that has not happened yet.
 */

/** Below this age an `initiated` intent is probably still in progress. */
const GRACE_MINUTES = 30;

interface Intent {
  id: string;
  reference: string | null;
  kind: string | null;
  item_title: string | null;
  amount_usd: number | null;
  amount_local: number | null;
  currency: string | null;
  method: string | null;
  email: string | null;
  created_at: string;
}

type Outcome = 'paid' | 'not-paid' | 'error';

export default function StuckPayments() {
  const [rows, setRows] = useState<Intent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { outcome: Outcome; message: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const cutoff = new Date(Date.now() - GRACE_MINUTES * 60_000).toISOString();
    const { data, error } = await supabase
      .from('payment_intents')
      .select('id,reference,kind,item_title,amount_usd,amount_local,currency,method,email,created_at')
      .eq('status', 'initiated')
      // A `lead` has no reference: the customer never reached Paystack, so
      // there is nothing to reconcile. Only intents that got that far matter.
      .not('reference', 'is', null)
      .lt('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setRows((data ?? []) as Intent[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const recheck = async (intent: Intent) => {
    if (!intent.reference) return;
    setBusy(intent.id);
    try {
      const res = await verifyPayment(intent.reference);
      const outcome: Outcome = res.verified ? 'paid' : 'not-paid';
      setResults((r) => ({ ...r, [intent.id]: { outcome, message: res.message } }));
      if (res.verified) {
        toast.success('Paystack confirms this was paid — the plan has been granted.');
        // It is no longer stuck, so drop it from the list.
        setRows((r) => r.filter((x) => x.id !== intent.id));
      } else {
        toast(res.message || 'Paystack does not report a successful charge.');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not reach the verifier';
      setResults((r) => ({ ...r, [intent.id]: { outcome: 'error', message } }));
      toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  const ageOf = (iso: string) => {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    if (days >= 1) return `${days} day${days === 1 ? '' : 's'} ago`;
    const hours = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000));
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Unresolved checkouts</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Reached Paystack and never confirmed. Re-checking asks Paystack directly — it is
            safe to repeat, and grants the plan if the charge did go through.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-800 dark:text-gray-200"
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/*
        The real fix, said plainly and every time this panel is opened. A tool
        that quietly compensates for a missing webhook lets the missing webhook
        become permanent.
      */}
      <div className="mt-4 flex gap-2.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-900/15 p-3.5">
        <AlertTriangle size={17} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-amber-900 dark:text-amber-200">
          <strong>This is a safety net, not the fix.</strong> Every confirmed payment on record
          was verified by the customer returning from checkout, never by webhook — which means
          the Paystack webhook is not delivering. Register{' '}
          <code className="text-xs">/functions/v1/paystack-webhook</code> in the Paystack
          dashboard and a closed tab stops costing anyone their plan.
        </p>
      </div>

      {loading ? (
        <div className="mt-4 space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-gray-100 dark:bg-gray-700 animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-5 text-sm text-gray-600 dark:text-gray-400">
          Nothing unresolved. Every checkout that reached Paystack has been settled one way or
          the other.
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {rows.map((r) => {
            const result = results[r.id];
            return (
              <div
                key={r.id}
                className="rounded-xl border border-gray-200 dark:border-gray-700 p-3.5 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                    {r.item_title || r.kind || 'Checkout'}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
                    {r.amount_local != null && r.currency
                      ? `${r.currency} ${Number(r.amount_local).toLocaleString()}`
                      : r.amount_usd != null ? `$${r.amount_usd}` : 'amount unknown'}
                    {r.method ? ` · ${r.method.replace(/_/g, ' ')}` : ''}
                    {' · '}{ageOf(r.created_at)}
                    {r.email ? ` · ${r.email}` : ''}
                  </div>
                  {result && (
                    <div className={`mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium ${
                      result.outcome === 'paid'
                        ? 'text-green-700 dark:text-green-400'
                        : result.outcome === 'error'
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-gray-600 dark:text-gray-400'
                    }`}>
                      {result.outcome === 'paid' ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                      {result.message}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => void recheck(r)}
                  disabled={busy === r.id}
                  className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
                >
                  <RefreshCw size={15} className={busy === r.id ? 'animate-spin' : ''} />
                  {busy === r.id ? 'Checking…' : 'Re-check with Paystack'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
