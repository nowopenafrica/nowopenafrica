import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { activatePlanFromIntent } from "../_shared/planActivation.ts";
import { checkCharge, toMinor } from "../_shared/paystackCharge.ts";
import { fulfilNocPurchase } from "../_shared/nocFulfil.ts";



// Paystack's asynchronous notification — the real source of truth for
// payment status. Complements verify-payment (which runs right after the
// client-side widget reports success, for instant UI feedback): a bank
// transfer or USSD payment can complete minutes after the user closes the
// tab, and this is what catches that. Register this URL in the Paystack
// dashboard: Settings → API Keys & Webhooks → Webhook URL →
// https://<project-ref>.supabase.co/functions/v1/paystack-webhook
//
// verify_jwt is off for this function (see supabase/config.toml) — Paystack
// has no way to attach our Supabase anon key, so JWT verification would
// reject every delivery before this code even runs. The HMAC signature
// check below is what actually authenticates the caller.

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");

async function isValidSignature(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = Array.from(new Uint8Array(sigBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
  // Not constant-time, but this compares two fixed-length hex digests, not a
  // secret against a guess — the timing side-channel isn't meaningful here.
  return computed === signature;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!PAYSTACK_SECRET_KEY) {
    console.error("paystack-webhook: PAYSTACK_SECRET_KEY is not configured");
    return new Response("Not configured", { status: 503 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  if (!(await isValidSignature(rawBody, signature, PAYSTACK_SECRET_KEY))) {
    console.warn("paystack-webhook: rejected a delivery with an invalid signature");
    return new Response("Invalid signature", { status: 401 });
  }

  try {
    const event = JSON.parse(rawBody);
    const reference: string | undefined = event?.data?.reference;

    // Always 200 for anything we can't act on — Paystack retries on
    // non-2xx, and neither a missing reference nor an event type we don't
    // handle will resolve itself on retry.
    if (!reference) return new Response("ok", { status: 200 });

    if (event.event === "charge.success") {
      const { data: intent } = await supabase
        .from("payment_intents")
        .select("kind, item_id, item_title, amount_usd, amount_local, currency, status, user_id")
        .eq("reference", reference)
        .maybeSingle();
      if (!intent) return new Response("ok", { status: 200 });

      // NOC orders: the database compares the charge with the order snapshot
      // and credits exactly once (Paystack retries are replays).
      if (intent.kind === "credits") {
        const result = await fulfilNocPurchase(supabase, reference, event.data, "webhook");
        if (!result.fulfilled) console.error(`paystack-webhook: NOC ${reference} not fulfilled: ${result.reason} ${result.detail ?? ""}`);
        return new Response("ok", { status: 200 });
      }

      /*
       * Every other kind: a signed "success" proves Paystack charged
       * something for this reference, not that it charged what NowOpen
       * recorded. Until 2026-11-16 this branch marked the intent paid without
       * looking, so an underpayment through a tampered checkout would have
       * been accepted the moment the webhook was registered.
       */
      const verdict = checkCharge(event.data, toMinor(intent.amount_local), String(intent.currency));
      if (!verdict.ok) {
        console.error(`paystack-webhook: ${reference} refused (${verdict.reason}): ${verdict.detail}`);
        return new Response("ok", { status: 200 });
      }

      await supabase
        .from("payment_intents")
        .update({ status: "paid", updated_at: new Date().toISOString(), verified_via: "webhook" })
        .eq("reference", reference)
        .neq("status", "paid"); // idempotent — don't clobber a row already confirmed
      // Grant the plan if this charge was a subscription (idempotent).
      await activatePlanFromIntent(supabase, { ...intent, reference });
    } else if (event.event === "charge.failed") {
      await supabase
        .from("payment_intents")
        .update({ status: "failed", updated_at: new Date().toISOString(), verified_via: "webhook" })
        .eq("reference", reference)
        .neq("status", "paid"); // a late "failed" event must never overwrite a real success
    }
  } catch (err) {
    console.error("paystack-webhook: failed to process delivery:", err);
  }

  return new Response("ok", { status: 200 });
});
