// "Does email actually send?" — answered by sending one, to yourself.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────
//
// ClaimReach, onboarding and every notification share one sender, and until
// now nothing could tell an operator whether it worked. The screens said
// "no email provider key is configured", which was true when it was typed and
// quietly stopped being true the day a key was set. A claim that nothing is
// watching goes stale; a check does not.
//
// ── THE ONE CONSTRAINT THAT KEEPS THIS SAFE ──────────────────────────────
//
// It sends ONLY to the authenticated caller's own address. Not to a parameter,
// not to a business, not to a list. That is deliberate: a staff-only endpoint
// that posts arbitrary mail from our verified domain is a spam vector and an
// authority-laundering one. Sending to yourself answers the question fully and
// cannot be aimed at anybody else.
//
// It reports the provider's own words. `resend 403` is not an answer an
// operator can act on; "The nowopenafrica.com domain is not verified" is.

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendEmail, emailShell, BRAND_ORIGIN } from "../_shared/notify.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// supabase-js sends x-application-name; an allow-list missing it fails the
// preflight and the request never leaves the browser.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-application-name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const STAFF = new Set(["admin", "editor", "business_curator"]);

/** What the sender would use. Read here so the UI can show it before sending. */
const FROM = Deno.env.get("RESEND_FROM") ?? "NowOpen Africa <hello@nowopenafrica.com>";
const KEY_PRESENT = Boolean(Deno.env.get("RESEND_API_KEY"));

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const auth = req.headers.get("Authorization") ?? "";
  const asCaller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: me, error: meErr } = await asCaller.auth.getUser();
  if (meErr || !me?.user) return json({ ok: false, reason: "Sign in first." }, 401);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: actor } = await admin.from("users").select("role").eq("id", me.user.id).maybeSingle();
  if (!STAFF.has((actor as { role?: string } | null)?.role ?? "")) {
    return json({ ok: false, reason: "Staff only." }, 403);
  }

  /*
   * Probe mode: report configuration WITHOUT sending.
   *
   * The admin screen used to hardcode "email is not configured", which was
   * true when it was typed and false the day a key was set. A screen that
   * asks gets it right on both days.
   */
  const body = await req.json().catch(() => null) as { probe?: boolean } | null;
  if (body?.probe) {
    return json({
      ok: true, probe: true,
      providerConfigured: KEY_PRESENT,
      from: FROM,
      canSendTo: me.user.email ?? null,
    });
  }

  /*
   * The recipient is the caller's own verified address, taken from the JWT.
   * Never from the request body — see the note at the top.
   */
  const to = me.user.email;
  if (!to) {
    return json({
      ok: false, stage: "recipient",
      reason: "Your account has no email address, so there is nowhere to send the test.",
    }, 200);
  }

  if (!KEY_PRESENT) {
    return json({
      ok: false, stage: "provider", providerConfigured: false, from: FROM,
      reason: "No RESEND_API_KEY is set on this project, so nothing was sent.",
    }, 200);
  }

  const stamp = new Date().toISOString();
  const result = await sendEmail(
    to,
    `NowOpen email self-test · ${stamp}`,
    emailShell("Email is working", `
      <p>This is a self-test sent from the NowOpen admin. It confirms three things:</p>
      <ul>
        <li>the provider key is valid</li>
        <li><code>${FROM}</code> is an accepted sending identity</li>
        <li>mail from this platform reaches a real inbox</li>
      </ul>
      <p style="color:#64748b;font-size:13px">Requested by ${to} at ${stamp}.
      Nobody else received this. <a href="${BRAND_ORIGIN}">${BRAND_ORIGIN}</a></p>
    `),
  );

  if (!result.ok) {
    return json({
      ok: false, stage: "send", from: FROM, to, providerConfigured: true,
      reason: result.error ?? "The provider refused the message.",
      // The provider's own sentence. Usually names the exact fix.
      providerMessage: result.providerMessage ?? null,
    }, 200);
  }

  return json({
    ok: true, from: FROM, to, sentAt: stamp,
    reason: `Sent to ${to}. If it arrives, sending works end to end.`,
  });
});
