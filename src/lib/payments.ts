// Payment provider integration.
//
// Paystack inline checkout runs entirely client-side with a PUBLIC key —
// set VITE_PAYSTACK_PUBLIC_KEY in .env to activate live payments (cards,
// bank transfer, mobile money and USSD are all handled inside Paystack's
// widget). Until a key is configured, checkouts are captured as payment
// intents ('lead') so launch-day demand isn't lost.
//
// IMPORTANT for go-live: verify transactions server-side (Paystack
// /transaction/verify with the SECRET key, e.g. in a Supabase edge
// function) before fulfilling — the client callback alone is not proof
// of payment.

export const PAYSTACK_PUBLIC_KEY: string | undefined = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;

export const paymentsLive = Boolean(PAYSTACK_PUBLIC_KEY);

/** Currencies Paystack can charge directly; anything else falls back to USD. */
export const PAYSTACK_CURRENCIES = ['NGN', 'GHS', 'ZAR', 'KES', 'USD'];

export interface PaymentMethod {
  id: 'card' | 'mobile_money' | 'bank_transfer' | 'intl_card';
  label: string;
  description: string;
  provider: 'paystack' | 'stripe';
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'card', label: 'Debit / Credit Card', description: 'Visa, Mastercard, Verve', provider: 'paystack' },
  { id: 'mobile_money', label: 'Mobile Money', description: 'M-Pesa, MTN MoMo, Airtel Money', provider: 'paystack' },
  { id: 'bank_transfer', label: 'Bank Transfer', description: 'Instant pay-by-transfer & USSD', provider: 'paystack' },
  { id: 'intl_card', label: 'International Card', description: 'Billed in USD', provider: 'stripe' },
];

let paystackScriptPromise: Promise<void> | null = null;

function loadPaystackScript(): Promise<void> {
  if (paystackScriptPromise) return paystackScriptPromise;
  paystackScriptPromise = new Promise((resolve, reject) => {
    if ((window as any).PaystackPop) return resolve();
    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v2/inline.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      paystackScriptPromise = null;
      reject(new Error('Could not load the Paystack checkout script'));
    };
    document.head.appendChild(script);
  });
  return paystackScriptPromise;
}

export interface PaystackChargeOptions {
  email: string;
  /** Amount in MAJOR units of `currency` (e.g. 5000 for ₦5,000) */
  amount: number;
  currency: string;
  reference: string;
  onSuccess: (reference: string) => void;
  onCancel: () => void;
}

export async function launchPaystackCheckout(opts: PaystackChargeOptions): Promise<void> {
  if (!PAYSTACK_PUBLIC_KEY) throw new Error('Paystack public key not configured');
  await loadPaystackScript();
  const PaystackPop = (window as any).PaystackPop;
  const popup = new PaystackPop();
  popup.newTransaction({
    key: PAYSTACK_PUBLIC_KEY,
    email: opts.email,
    amount: Math.round(opts.amount * 100), // minor units
    currency: opts.currency,
    reference: opts.reference,
    onSuccess: (transaction: { reference: string }) => opts.onSuccess(transaction.reference),
    onCancel: opts.onCancel,
  });
}

export function makeReference(kind: string): string {
  return `nowopen-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface VerifyPaymentResult {
  verified: boolean;
  message: string;
}

/** Server-side confirmation that a Paystack charge actually succeeded — the
 * client-side widget's onSuccess callback is not proof of payment on its
 * own (a manipulated client could fire it without ever paying), so this
 * must be called before a checkout is treated as complete. */
export async function verifyPayment(reference: string): Promise<VerifyPaymentResult> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const response = await fetch(`${supabaseUrl}/functions/v1/verify-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseAnonKey}` },
    body: JSON.stringify({ reference }),
  });
  return response.json();
}
