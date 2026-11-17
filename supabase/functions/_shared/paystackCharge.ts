// Does a Paystack charge pay for what NowOpen recorded? Pure, no imports, so
// the same file is tested by Vitest (src/test/paystackCharge.test.ts) and
// bundled into verify-payment and paystack-webhook.
//
// ── WHY BOTH PATHS NEED IT ───────────────────────────────────────────────
//
// Paystack saying "success" proves it charged *something* for a reference.
// The inline checkout takes its amount from the browser, so a tampered page
// can pay ₦50 against a reference NowOpen priced at ₦150,000. verify-payment
// already compared the two; until 2026-11-16 the webhook did not, so
// registering the webhook would have turned any underpayment into a full
// purchase. Both now call this.
//
// ── IMPORTANT: THIS IS IN _shared ────────────────────────────────────────
//
// _shared is bundled at deploy time: redeploy verify-payment AND
// paystack-webhook after editing it.

export interface PaystackCharge {
  status?: string | null;
  /** Minor units (kobo), as Paystack reports it. */
  amount?: number | null;
  currency?: string | null;
  /** "test" for test-key charges, "live" for real money. */
  domain?: string | null;
}

export interface ChargeVerdict {
  ok: boolean;
  reason?: "not_successful" | "amount" | "currency" | "domain";
  detail?: string;
}

/**
 * `expectedMinor` is what NowOpen recorded when checkout started — for NOC
 * orders the database priced it, never the browser.
 *
 * A tolerance of 2 minor units matches verify-payment's long-standing rule
 * for the older checkouts, whose amount_local is a converted decimal. NOC
 * orders are integers end to end and pass `tolerance: 0`.
 */
export function checkCharge(
  charge: PaystackCharge | null | undefined,
  expectedMinor: number,
  expectedCurrency: string,
  opts: { tolerance?: number } = {},
): ChargeVerdict {
  const tolerance = opts.tolerance ?? 2;
  if (!charge || String(charge.status ?? "").toLowerCase() !== "success") {
    return { ok: false, reason: "not_successful", detail: `status ${charge?.status ?? "missing"}` };
  }
  const amount = Number(charge.amount);
  if (!Number.isFinite(amount) || !Number.isFinite(expectedMinor) || Math.abs(amount - expectedMinor) > tolerance) {
    return { ok: false, reason: "amount", detail: `paid ${charge.amount}, expected ${expectedMinor}` };
  }
  if (String(charge.currency ?? "").toUpperCase() !== String(expectedCurrency ?? "").toUpperCase()) {
    return { ok: false, reason: "currency", detail: `paid in ${charge.currency}, expected ${expectedCurrency}` };
  }
  const domain = String(charge.domain ?? "").toLowerCase();
  if (domain !== "test" && domain !== "live") {
    return { ok: false, reason: "domain", detail: `unknown domain ${charge.domain ?? "missing"}` };
  }
  return { ok: true };
}

/** NowOpen's recorded amount (major units, maybe a decimal) as minor units. */
export function toMinor(amountMajor: number | string | null | undefined): number {
  return Math.round(Number(amountMajor) * 100);
}

/** A NOC order's reference, as noc_start_purchase mints it. */
export function isNocReference(reference: string | null | undefined): boolean {
  return /^noc-[0-9a-f]{32}$/.test(String(reference ?? ""));
}
