// Charging credits from inside an edge function.
//
// ── WHY THE CHARGE LIVES HERE AND NOT IN THE BROWSER ─────────────────────
//
// src/lib/credits/wallet.ts can call credit_charge, and the deduction it makes
// is real — the RPC acts on auth.uid() and the database enforces the balance.
// But nothing would stop somebody calling the edge function directly and
// skipping the charge entirely. The generation is what costs money, so the
// charge belongs in the same function that performs it.
//
// ── CHECK FIRST, CHARGE AFTER ────────────────────────────────────────────
//
// `canAfford` runs before the model call and `chargeFor` runs after it
// succeeds. Both halves matter:
//
//   · charging first means a provider timeout costs the customer money for
//     nothing, and we would owe them a refund for every failed request;
//   · charging only afterwards, with no check, lets somebody with one credit
//     fire a hundred generations before the first one settles.
//
// For anything expensive enough that the gap matters — image, video — use the
// reservation functions instead (credit_reserve / credit_reservation_consume),
// which hold the money for the duration. This pair is for cheap, fast actions
// where a reservation round trip would cost more than the credit does.
//
// ── IMPORTANT: THIS IS IN _shared ────────────────────────────────────────
//
// _shared is bundled at DEPLOY time. Editing this file changes nothing until
// every function that imports it is redeployed.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

/** A client acting as the signed-in caller, so auth.uid() is them. */
export function callerClient(authHeader: string): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
}

export interface AffordResult {
  ok: boolean;
  /** What the action costs, when it could be determined. */
  cost: number | null;
  /** What the caller can spend right now. */
  available: number | null;
  /** Why not, in words a customer should read. */
  message?: string;
}

/**
 * Can this caller afford the action?
 *
 * A refusal says the numbers, because "insufficient credits" with no figures
 * leaves somebody unable to tell whether they are one credit short or fifty.
 */
export async function canAfford(db: SupabaseClient, action: string): Promise<AffordResult> {
  const costQ = await db.rpc("credit_cost_of", { p_slug: action });
  if (costQ.error) {
    /*
     * credit_cost_of raises when the action is unknown, switched off, or
     * UNPRICED — and unpriced means refused, not free. Passing the database's
     * message through is deliberate: it names which of those it was.
     */
    return { ok: false, cost: null, available: null, message: costQ.error.message };
  }
  const cost = Number(costQ.data ?? 0);
  if (cost === 0) return { ok: true, cost: 0, available: null };

  const availQ = await db.rpc("credit_available");
  if (availQ.error) {
    return { ok: false, cost, available: null, message: availQ.error.message };
  }
  const available = Number(availQ.data ?? 0);

  if (available < cost) {
    return {
      ok: false, cost, available,
      message: `You need ${cost} credit${cost === 1 ? "" : "s"} for this and you have ${available}.`,
    };
  }
  return { ok: true, cost, available };
}

/**
 * Charge for work that has already succeeded.
 *
 * `reference` is the idempotency key — pass something stable for the request
 * and a retried call charges once.
 *
 * Returns whether the charge landed. A caller that has ALREADY delivered the
 * work should log a false and still return the work: taking back a generated
 * profile because the ledger write failed would be the worse outcome, and the
 * reference means a later retry cannot double-charge.
 */
export async function chargeFor(
  db: SupabaseClient,
  action: string,
  opts: { reference?: string; businessId?: string } = {},
): Promise<{ charged: boolean; message?: string }> {
  const { error } = await db.rpc("credit_charge", {
    p_action: action,
    p_reference: opts.reference ?? null,
    p_business: opts.businessId ?? null,
  });
  if (error) return { charged: false, message: error.message };
  return { charged: true };
}
