import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getClientIp, isRateLimited } from "../_shared/rateLimit.ts";
import { activatePlanFromIntent } from "../_shared/planActivation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

// Service role, deliberately — this updates payment_intents.status, which
// RLS restricts to admins for regular clients (correct: nobody should be
// able to mark their own payment "paid" by calling the table directly).
// This function earns that write by actually verifying with Paystack below.
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");

interface VerifyRequest {
  reference: string;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (isRateLimited(getClientIp(req), RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return jsonResponse({ verified: false, message: "Too many requests — please wait a moment." }, 429);
  }

  if (!PAYSTACK_SECRET_KEY) {
    // Not a hard error for the caller: checkout still works as a pre-launch
    // "lead" capture (see lib/payments.ts) until this secret is configured.
    return jsonResponse({ verified: false, message: "Payment verification is not configured yet." }, 503);
  }

  try {
    const { reference } = (await req.json()) as VerifyRequest;
    if (!reference || typeof reference !== "string") {
      return jsonResponse({ verified: false, message: "Missing payment reference." }, 400);
    }

    const { data: intent, error: intentError } = await supabase
      .from("payment_intents")
      .select("id, amount_local, currency, status, kind, item_id, item_title, amount_usd, user_id")
      .eq("reference", reference)
      .maybeSingle();

    if (intentError || !intent) {
      return jsonResponse({ verified: false, message: "Unknown payment reference." }, 404);
    }

    // Idempotent — the webhook can beat this call to the punch. Still make
    // sure the plan is granted (activatePlanFromIntent no-ops if it already is).
    if (intent.status === "paid") {
      await activatePlanFromIntent(supabase, { ...intent, reference });
      return jsonResponse({ verified: true, message: "Payment already confirmed." });
    }

    const psRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    });
    const psBody = await psRes.json();

    if (!psRes.ok || !psBody?.data) {
      console.error("Paystack verify call failed:", psRes.status, JSON.stringify(psBody));
      return jsonResponse({ verified: false, message: "Could not reach Paystack to verify this payment." }, 502);
    }

    const tx = psBody.data;
    // Paystack reporting "success" only proves it charged *something* — the
    // real check is against what WE recorded when checkout started, since a
    // tampered client-side amount would still show as a successful charge
    // from Paystack's point of view.
    const expectedMinorUnits = Math.round(Number(intent.amount_local) * 100);
    const amountMatches = Math.abs(tx.amount - expectedMinorUnits) <= 2; // small rounding tolerance
    const currencyMatches = String(tx.currency).toUpperCase() === String(intent.currency).toUpperCase();

    if (tx.status === "success" && amountMatches && currencyMatches) {
      await supabase.from("payment_intents").update({
        status: "paid",
        updated_at: new Date().toISOString(),
        verified_via: "client",
      }).eq("id", intent.id);
      // If this was a plan subscription, grant it on the account now.
      await activatePlanFromIntent(supabase, { ...intent, reference });
      return jsonResponse({ verified: true, message: "Payment confirmed." });
    }

    if (tx.status === "success") {
      console.error(`Amount/currency mismatch for ${reference}: expected ${expectedMinorUnits} ${intent.currency}, Paystack reports ${tx.amount} ${tx.currency}`);
      return jsonResponse({ verified: false, message: "We couldn't confirm the payment amount — no charge was recorded as complete." }, 409);
    }

    await supabase.from("payment_intents").update({
      status: "failed",
      updated_at: new Date().toISOString(),
      verified_via: "client",
    }).eq("id", intent.id);
    return jsonResponse({ verified: false, message: "This payment was not successful." });
  } catch (error) {
    console.error("verify-payment error:", error);
    return jsonResponse({ verified: false, message: "An error occurred while verifying your payment." }, 500);
  }
});
