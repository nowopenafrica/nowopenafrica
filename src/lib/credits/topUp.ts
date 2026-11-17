/**
 * The one NOC top-up flow, shared by the header credit chip and NocCheckout.
 *
 *   noc_start_purchase (the database prices the order and creates the
 *   payment intent) → Paystack popup with THAT amount and reference →
 *   verify-payment (asks Paystack, credits the wallet exactly once).
 *
 * After a verified top-up it fires NOC_BALANCE_EVENT so every balance on the
 * page (header chip, wallet, checkout) re-reads at once.
 */
import { launchPaystackCheckout, verifyPayment } from '../payments';
import { startPurchase } from './noc';

/** Fired on window whenever this tab changed the caller's NOC balance. */
export const NOC_BALANCE_EVENT = 'noc:balance-changed';

export function announceBalanceChanged(): void {
  try { window.dispatchEvent(new Event(NOC_BALANCE_EVENT)); } catch { /* non-browser */ }
}

export interface TopUpOutcome {
  status: 'credited' | 'not_verified' | 'cancelled';
  message: string;
}

export async function runTopUp(packSlug: string): Promise<TopUpOutcome> {
  const order = await startPurchase(packSlug);
  return new Promise<TopUpOutcome>((resolve, reject) => {
    launchPaystackCheckout({
      email: order.email,
      amount: order.amountMinor / 100,
      currency: order.currency,
      reference: order.reference,
      onSuccess: async (ref) => {
        try {
          const v = await verifyPayment(ref);
          if (v.verified) announceBalanceChanged();
          resolve({ status: v.verified ? 'credited' : 'not_verified', message: v.message });
        } catch (e) {
          reject(e);
        }
      },
      onCancel: () => resolve({ status: 'cancelled', message: 'Top-up cancelled. Nothing was charged.' }),
    }).catch(reject);
  });
}

/**
 * "Low" means the balance cannot cover the dearest action on sale today —
 * a reading of credit_actions, not a threshold typed here. Returns false when
 * nothing is priced, so an empty catalogue never nags anyone.
 */
export function isLowBalance(available: number, liveCosts: number[]): boolean {
  if (liveCosts.length === 0) return false;
  return available < Math.max(...liveCosts);
}
