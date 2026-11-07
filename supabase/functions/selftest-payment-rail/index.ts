/**
 * Does the payment rail actually work, end to end?
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * MEASURED ON PRODUCTION, 2026-09-22:
 *
 *   payment_intents, all time                    15
 *   status = 'paid'                               2   ($50)
 *   verified_via = 'webhook'                      0
 *   verified_via = 'client'                       2
 *
 * Not one payment has ever been confirmed by the server. The webhook's code is
 * sound — HMAC-SHA512, idempotent updates, fail-closed on a missing secret, and
 * it answers 401 to an unsigned delivery — but sound code that has never run is
 * not a working rail, and "we have a webhook" is exactly the kind of claim this
 * platform keeps discovering to be hollow.
 *
 * Nothing could test it from outside, either: signing a delivery needs
 * PAYSTACK_SECRET_KEY, which lives only in the function environment. So the
 * test has to run WHERE the secret is. This function signs a delivery with the
 * project's own key, posts it to the live webhook, and checks the database
 * actually changed.
 *
 * ── IT MUST NOT FABRICATE REVENUE ────────────────────────────────────────
 *
 * The whole point of the rail is to record money. A self-test that leaves a
 * "paid" row behind would put revenue in the table that nobody paid — the one
 * thing this system must never do. So:
 *
 *   · amount_usd is 0 and `kind` is 'selftest', so the row is never money
 *   · the reference is prefixed 'selftest-' and is unmistakable
 *   · every row it creates is deleted before it returns, including on failure
 *   · it asserts afterwards that nothing of its own survives
 *
 * ── WHAT IT PROVES, AND WHAT IT CANNOT ───────────────────────────────────
 *
 * PROVES: a correctly signed charge.success flips an intent to paid with
 * verified_via='webhook'; a delivery with a bad signature changes nothing.
 *
 * CANNOT PROVE: that Paystack is configured to CALL the endpoint. That is a
 * setting in the Paystack dashboard and the reason the count above is zero.
 * This function deliberately reports that distinction rather than blurring it.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const automationSecret = Deno.env.get("AUTOMATION_SECRET") ?? "";
const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-automation-key",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

/** The same HMAC the webhook verifies with — SHA-512, hex, as Paystack sends. */
async function sign(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  /*
   * FAIL CLOSED. This function creates rows in the payments table; an
   * unsecured version of it would be a way for anybody to write there.
   */
  if (!automationSecret) return json({ ok: false, reason: "AUTOMATION_SECRET is not set." }, 503);
  if ((req.headers.get("x-automation-key") ?? "") !== automationSecret) {
    return json({ ok: false, reason: "Not authorised." }, 403);
  }
  if (!paystackSecret) {
    return json({ ok: false, reason: "PAYSTACK_SECRET_KEY is not set — the rail cannot work at all." }, 503);
  }

  const db = createClient(supabaseUrl, serviceKey);
  const webhookUrl = `${supabaseUrl}/functions/v1/paystack-webhook`;
  const stamp = crypto.randomUUID();
  const goodRef = `selftest-good-${stamp}`;
  const badRef = `selftest-bad-${stamp}`;
  const checks: Array<{ name: string; pass: boolean; detail: string }> = [];

  const seed = async (reference: string) => {
    const { error } = await db.from("payment_intents").insert({
      kind: "selftest",
      item_title: "Payment rail self-test — not a purchase",
      amount_usd: 0,
      amount_local: 0,
      currency: "NGN",
      status: "initiated",
      provider: "paystack",
      reference,
      email: "selftest@nowopenafrica.invalid",
    });
    return error?.message ?? null;
  };

  const statusOf = async (reference: string) => {
    const { data } = await db
      .from("payment_intents")
      .select("status, verified_via")
      .eq("reference", reference)
      .maybeSingle();
    return data as { status: string; verified_via: string | null } | null;
  };

  try {
    const seedErr = (await seed(goodRef)) ?? (await seed(badRef));
    if (seedErr) return json({ ok: false, reason: `could not create test intents: ${seedErr}` }, 500);

    // ── 1. A correctly signed charge.success must confirm the payment ────
    const goodBody = JSON.stringify({ event: "charge.success", data: { reference: goodRef } });
    const goodRes = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-paystack-signature": await sign(goodBody, paystackSecret),
      },
      body: goodBody,
    });
    const afterGood = await statusOf(goodRef);
    checks.push({
      name: "signed charge.success is accepted",
      pass: goodRes.status === 200,
      detail: `HTTP ${goodRes.status}`,
    });
    checks.push({
      name: "intent is marked paid",
      pass: afterGood?.status === "paid",
      detail: `status=${afterGood?.status ?? "(row gone)"}`,
    });
    checks.push({
      name: "confirmation is attributed to the webhook, not the client",
      pass: afterGood?.verified_via === "webhook",
      detail: `verified_via=${afterGood?.verified_via ?? "null"}`,
    });

    // ── 2. A forged delivery must change nothing ────────────────────────
    //
    // The negative half, and the one that matters most: a rail that confirms
    // payments nobody made is worse than one that confirms none.
    const badBody = JSON.stringify({ event: "charge.success", data: { reference: badRef } });
    const badRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-paystack-signature": "0".repeat(128) },
      body: badBody,
    });
    const afterBad = await statusOf(badRef);
    checks.push({
      name: "forged signature is rejected",
      pass: badRes.status === 401,
      detail: `HTTP ${badRes.status}`,
    });
    checks.push({
      name: "forged delivery left the intent untouched",
      pass: afterBad?.status === "initiated" && afterBad?.verified_via === null,
      detail: `status=${afterBad?.status}, verified_via=${afterBad?.verified_via ?? "null"}`,
    });

    // ── 3. Replaying the same event must not double-count ───────────────
    const replayRes = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-paystack-signature": await sign(goodBody, paystackSecret),
      },
      body: goodBody,
    });
    const afterReplay = await statusOf(goodRef);
    checks.push({
      name: "a replayed delivery is idempotent",
      pass: replayRes.status === 200 && afterReplay?.status === "paid",
      detail: `HTTP ${replayRes.status}, status=${afterReplay?.status}`,
    });
  } finally {
    /*
     * ALWAYS, including after a failure above. A self-test that dies halfway
     * and leaves a row reading `paid` in the payments table has done more
     * damage than the bug it was looking for.
     */
    await db.from("payment_intents").delete().like("reference", `selftest-%${stamp}`);
  }

  const { count: leftover } = await db
    .from("payment_intents")
    .select("id", { count: "exact", head: true })
    .like("reference", "selftest-%");
  checks.push({
    name: "no test rows left in the payments table",
    pass: (leftover ?? 0) === 0,
    detail: `${leftover ?? 0} remaining`,
  });

  const passed = checks.every((c) => c.pass);
  return json({
    ok: passed,
    summary: passed
      ? "The webhook processes real deliveries correctly. Whether Paystack CALLS it is a dashboard setting this cannot test."
      : "The payment rail did not behave correctly. See checks.",
    webhookUrl,
    checks,
  }, passed ? 200 : 500);
});
