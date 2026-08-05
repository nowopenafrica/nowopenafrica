import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getClientIp, isRateLimited } from "../_shared/rateLimit.ts";

// Creates a Paystack transaction server-side (with the SECRET key) and returns
// the hosted-checkout `authorization_url` for the mobile app to open in a
// WebView. It also records the payment_intent so verify-payment / the webhook
// can reconcile it later using the same `reference`.
//
// Amount validation happens on the client's chosen amount, but the source of
// truth for confirmation is still the recorded amount_local (see verify-payment).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
const PAYSTACK_CURRENCIES = ["NGN", "GHS", "ZAR", "KES", "USD"];

interface InitRequest {
  email: string;
  amount: number; // major units of `currency`
  currency: string;
  reference: string;
  callbackUrl?: string;
  channels?: string[];
  // Metadata mirrored into payment_intents so the row is complete at creation.
  kind?: string;
  itemId?: string | null;
  itemTitle?: string;
  amountUsd?: number;
  method?: string;
  name?: string | null;
  userId?: string | null;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  if (isRateLimited(getClientIp(req), RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return jsonResponse({ error: "Too many requests — please wait a moment." }, 429);
  }
  if (!PAYSTACK_SECRET_KEY) {
    return jsonResponse({ error: "Payments are not configured yet." }, 503);
  }

  try {
    const body = (await req.json()) as InitRequest;
    const { email, amount, currency, reference } = body;

    if (!email || !amount || !currency || !reference) {
      return jsonResponse({ error: "Missing required fields." }, 400);
    }
    if (!PAYSTACK_CURRENCIES.includes(currency.toUpperCase())) {
      return jsonResponse({ error: `Unsupported currency: ${currency}` }, 400);
    }

    // Record the intent as 'initiated' BEFORE calling Paystack so verify /
    // webhook always have a row keyed by this reference to reconcile against.
    await supabase.from("payment_intents").insert({
      kind: body.kind ?? "subscription",
      item_id: body.itemId ?? null,
      item_title: body.itemTitle ?? "NowOpen checkout",
      amount_usd: body.amountUsd ?? amount,
      currency: currency.toUpperCase(),
      amount_local: Math.round(amount * 100) / 100,
      method: body.method ?? "card",
      email: email.trim().toLowerCase(),
      name: body.name ?? null,
      status: "initiated",
      provider: "paystack",
      reference,
      user_id: body.userId ?? null,
    });

    const psRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        amount: Math.round(amount * 100), // minor units
        currency: currency.toUpperCase(),
        reference,
        callback_url: body.callbackUrl,
        channels: body.channels,
      }),
    });
    const psBody = await psRes.json();

    if (!psRes.ok || !psBody?.data?.authorization_url) {
      console.error("Paystack initialize failed:", psRes.status, JSON.stringify(psBody));
      return jsonResponse({ error: psBody?.message || "Could not start the payment." }, 502);
    }

    return jsonResponse({
      authorization_url: psBody.data.authorization_url,
      access_code: psBody.data.access_code,
      reference: psBody.data.reference ?? reference,
    });
  } catch (error) {
    console.error("initialize-transaction error:", error);
    return jsonResponse({ error: "An error occurred while starting your payment." }, 500);
  }
});
