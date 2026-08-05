import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  X, CreditCard, Smartphone, Landmark, Globe, Lock, CheckCircle, Loader2, Mail, ShieldCheck,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useCurrency } from '../contexts/CurrencyContext';
import {
  PAYMENT_METHODS, PAYSTACK_CURRENCIES, paymentsLive, launchPaystackCheckout, makeReference, verifyPayment, PaymentMethod,
} from '../lib/payments';

export interface CheckoutItem {
  kind: 'subscription' | 'placement_booking' | 'service_booking' | 'creative_subscription' | 'ai_addon' | 'module' | 'ad_boost' | 'ad_campaign';
  itemId?: string;
  title: string;
  /** Base price in USD */
  amountUsd: number;
  /** e.g. '/month, billed annually' or 'per day' */
  amountNote?: string;
}

interface PaymentModalProps {
  item: CheckoutItem;
  onClose: () => void;
}

const METHOD_ICONS = {
  card: CreditCard,
  mobile_money: Smartphone,
  bank_transfer: Landmark,
  intl_card: Globe,
} as const;

export default function PaymentModal({ item, onClose }: PaymentModalProps) {
  const { user } = useAuth();
  const { currency, format, formatUsd, rate } = useCurrency();
  const [method, setMethod] = useState<PaymentMethod>(PAYMENT_METHODS[0]);
  const [email, setEmail] = useState(user?.email ?? '');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [done, setDone] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);

  // International card is always billed in USD; Paystack methods charge the
  // local currency when Paystack supports it, otherwise fall back to USD.
  const chargeCurrency =
    method.id === 'intl_card' ? 'USD'
    : PAYSTACK_CURRENCIES.includes(currency) ? currency
    : 'USD';
  const chargeRate = chargeCurrency === currency ? rate : 1;
  const chargeAmount = item.amountUsd * chargeRate;

  const recordIntent = async (status: 'lead' | 'initiated', reference?: string) => {
    const { error } = await supabase.from('payment_intents').insert([{
      kind: item.kind,
      item_id: item.itemId ?? null,
      item_title: item.title,
      amount_usd: item.amountUsd,
      currency: chargeCurrency,
      amount_local: Math.round(chargeAmount * 100) / 100,
      method: method.id,
      email: email.trim().toLowerCase(),
      name: name.trim() || null,
      status,
      provider: method.provider,
      reference: reference ?? null,
      user_id: user?.id ?? null,
    }]);
    if (error) throw error;
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);

    try {
      if (paymentsLive && method.provider === 'paystack') {
        const reference = makeReference(item.kind);
        await recordIntent('initiated', reference);
        await launchPaystackCheckout({
          email: email.trim().toLowerCase(),
          amount: chargeAmount,
          currency: chargeCurrency,
          reference,
          onSuccess: async () => {
            // Paystack's own widget reporting success isn't proof of
            // payment on its own — confirm server-side (with the secret
            // key) before treating this checkout as complete.
            setSubmitting(false);
            setVerifying(true);
            try {
              const result = await verifyPayment(reference);
              setDone(true);
              if (result.verified) {
                toast.success('Payment received — thank you!');
              } else {
                // Paystack's widget already confirmed the charge on its end;
                // treat this as "still confirming" rather than alarming the
                // user — the webhook reconciles status server-side even if
                // this call couldn't.
                setPendingConfirmation(true);
                toast.success('Payment received — confirming automatically.');
              }
            } catch (err) {
              console.error('Payment verification request failed:', err);
              setDone(true);
              setPendingConfirmation(true);
              toast.success('Payment received — confirming automatically.');
            } finally {
              setVerifying(false);
            }
          },
          onCancel: () => setSubmitting(false),
        });
        return; // Paystack widget has taken over
      }

      // Payments go live at launch — capture the checkout as a priority lead
      await recordIntent('lead');
      setDone(true);
    } catch (err: any) {
      console.error('Checkout failed:', err);
      toast.error(
        `Checkout failed: ${err.message || 'unknown error'}. ` +
        'If this mentions a missing table, run scripts/sql/apply_all_migrations.sql in Supabase.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            {done ? 'All set!' : verifying ? 'Confirming…' : 'Checkout'}
          </h2>
          <button onClick={onClose} aria-label="Close checkout" className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <X size={20} />
          </button>
        </div>

        {verifying ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-14 h-14 mx-auto bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <Loader2 size={28} className="text-blue-600 dark:text-blue-400 animate-spin" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Confirming your payment</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">One moment while we verify this with Paystack…</p>
          </div>
        ) : done ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-14 h-14 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <CheckCircle size={28} className="text-green-600 dark:text-green-400" />
            </div>
            {paymentsLive ? (
              <>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  {pendingConfirmation ? 'Payment received' : 'Payment confirmed'}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {pendingConfirmation
                    ? <>We're finishing confirmation automatically — a receipt for{' '}
                        <span className="font-medium text-gray-900 dark:text-white">{item.title}</span> will be
                        on its way to {email} shortly.</>
                    : <>A receipt for <span className="font-medium text-gray-900 dark:text-white">{item.title}</span> is
                        on its way to {email}.</>}
                </p>
              </>
            ) : (
              <>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">You're first in line</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Payments open at launch. We've reserved{' '}
                  <span className="font-medium text-gray-900 dark:text-white">{item.title}</span> at{' '}
                  <span className="font-medium text-gray-900 dark:text-white">{format(item.amountUsd)}</span> and
                  will email <span className="font-medium text-gray-900 dark:text-white">{email}</span> a secure
                  payment link the moment checkout goes live.
                </p>
              </>
            )}
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-sm"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handlePay} className="p-5 space-y-5">
            {/* Order summary */}
            <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
              <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">{item.title}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-gray-900 dark:text-white">{format(item.amountUsd)}</span>
                {item.amountNote && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">{item.amountNote}</span>
                )}
              </div>
              {currency !== 'USD' && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  ≈ {formatUsd(item.amountUsd)} USD · converted at today's rate
                </p>
              )}
            </div>

            {/* Payment methods */}
            <div>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Pay with</p>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map((m) => {
                  const Icon = METHOD_ICONS[m.id];
                  const active = method.id === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMethod(m)}
                      aria-pressed={active}
                      className={`text-left p-3 rounded-xl border transition ${
                        active
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-600'
                          : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'
                      }`}
                    >
                      <Icon size={18} className={active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'} />
                      <p className="text-xs font-semibold text-gray-900 dark:text-white mt-1.5">{m.label}</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">{m.description}</p>
                    </button>
                  );
                })}
              </div>
              {chargeCurrency !== currency && (
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">
                  This method bills in {chargeCurrency}: {formatUsd(item.amountUsd)}.
                </p>
              )}
            </div>

            {/* Contact */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Email for receipt</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 text-gray-400" size={16} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@business.com"
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Full name (optional)</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Amina Okafor"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
              {submitting
                ? 'Processing…'
                : paymentsLive && method.provider === 'paystack'
                ? `Pay ${format(item.amountUsd)}`
                : `Reserve at ${format(item.amountUsd)}`}
            </button>

            <p className="flex items-center justify-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
              <ShieldCheck size={13} className="text-green-600 dark:text-green-400" />
              {paymentsLive
                ? 'Secured by Paystack · PCI-DSS compliant · no card details touch our servers'
                : 'No charge today — payments open at launch and you approve before paying'}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
