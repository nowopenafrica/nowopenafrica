// Fulfilling a NOC (NowOpen Credits) purchase from inside verify-payment or
// paystack-webhook.
//
// The database does the deciding: noc_fulfil_purchase locks the order,
// compares the paid amount, currency and Paystack domain with the order's
// snapshot, marks the intent paid and writes the purchase entry in ONE
// transaction. A replay (the webhook after verify-payment, or Paystack's own
// retries) finds the order fulfilled and returns the same answer.
//
// This file only passes Paystack's figures through. It must never compute a
// credit amount.
//
// _shared is bundled at deploy time: redeploy verify-payment AND
// paystack-webhook after editing it.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { PaystackCharge } from "./paystackCharge.ts";

export interface NocFulfilResult {
  fulfilled: boolean;
  replay?: boolean;
  credits?: number;
  reason?: string;
  detail?: string;
}

export async function fulfilNocPurchase(
  db: SupabaseClient,
  reference: string,
  charge: PaystackCharge,
  via: "client" | "webhook" | "reconcile",
): Promise<NocFulfilResult> {
  const { data, error } = await db.rpc("noc_fulfil_purchase", {
    p_reference: reference,
    p_paid_minor: Number(charge.amount),
    p_paid_currency: String(charge.currency ?? ""),
    p_domain: String(charge.domain ?? ""),
    p_via: via,
  });
  if (error) {
    console.error("noc fulfilment failed for", reference, error.message);
    return { fulfilled: false, reason: "error", detail: error.message };
  }
  return (data ?? { fulfilled: false, reason: "no_answer" }) as NocFulfilResult;
}
