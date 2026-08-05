/*
  # Payment verification support

  Backs the two new edge functions that close the gap already flagged in
  lib/payments.ts: "the client callback alone is not proof of payment."

  - verify-payment: called right after Paystack's inline widget reports
    success, for instant UI feedback. Verifies server-side with the SECRET
    key before trusting it.
  - paystack-webhook: Paystack's own async notification (charge.success /
    charge.failed) — the real source of truth, since it fires even if the
    browser tab closes before the client-side callback would.

  Both run with the service role (bypassing RLS entirely, by design — they
  are trusted server-side code, not user requests), so no new RLS policy is
  needed here. This migration only adds bookkeeping columns.
*/

ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
-- Which path last touched a row — useful when debugging a mismatch between
-- the client-verify pass and the webhook.
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS verified_via text CHECK (verified_via IS NULL OR verified_via IN ('client', 'webhook'));

CREATE INDEX IF NOT EXISTS payment_intents_reference_idx ON payment_intents (reference);
