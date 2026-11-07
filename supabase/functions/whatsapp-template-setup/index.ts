// Submits the NowOpen welcome message to Meta for template approval.
//
// ── WHY THIS IS A FUNCTION AND NOT A CONFIG LINE ─────────────────────────
//
// The onboarding ledger records "WHATSAPP_WELCOME_TEMPLATE env not set", which
// reads like a one-line fix. It is not. WhatsApp will not let you send a
// message to somebody outside an open 24-hour window unless the exact wording
// has been approved by Meta in advance. So the env var can only ever name a
// template that already exists and is APPROVED.
//
// Pointing it at one of Meta's samples WOULD clear the error — and would send
// "Hello World", or a Jasper's Market grocery advert, to a real business owner
// who just signed up. Clearing a check that way is worse than leaving it red.
//
// This submits the real thing instead. The copy is the platform's own welcome
// wording (the same text send-onboarding previews), rewritten into Meta's
// placeholder format.
//
// It messages nobody. Approval is Meta's decision and takes minutes to hours.

import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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
const GRAPH = "https://graph.facebook.com/v20.0";

const TOKEN = Deno.env.get("WHATSAPP_TOKEN");
const WABA_ID = Deno.env.get("WHATSAPP_WABA_ID");

/** Versioned: Meta templates are immutable once approved, so a copy change
 *  means a new name, never an edit in place. */
export const TEMPLATE_NAME = "nowopen_welcome_v1";
export const TRANSACTIONAL_NAME = "nowopen_listing_live_v2";

/*
 * The welcome message, in Meta's format.
 *
 * {{1}} owner's first name, {{2}} business name, {{3}} profile link — the
 * order the existing pipeline already passes them in. Meta's rules: a body may
 * not begin or end with a placeholder, and two may not sit adjacent.
 */
const BODY =
  "Hi {{1}}, welcome to NowOpen Africa! 🎉\n\n"
  + "Your business — {{2}} — is now live on NowOpen.\n\n"
  + "Here's how to get the most out of your profile:\n"
  + "• Open now — mark your business open and appear on the map\n"
  + "• Make it yours — add your photos, services, hours and contact details\n"
  + "• Catch every lead — enquiries and booking requests land in your dashboard\n"
  + "• Share it — send your link or Smart QR so customers can find you anywhere\n"
  + "• Grow in Studio — turn your profile into business cards, flyers and reels\n\n"
  + "Tap to open your business: {{3}}\n\n"
  + "Reply here anytime if you need a hand — a real person reads it. 💬";

/*
 * The transactional variant, written to be what it claims to be.
 *
 * v1 was submitted as UTILITY and Meta classified it MARKETING, because it
 * lists what else the platform can do — "grow in Studio", "turn your profile
 * into flyers and reels". That reads as promotion, and Meta was right.
 *
 * The consequence is not just price: a MARKETING template may only go to
 * people who opted in to marketing, and creating a listing is consent to be
 * told the listing exists, not consent to be sold to. So this version states
 * the fact and the link and stops. No tips, no features, no invitation to buy
 * anything. If Meta still calls this MARKETING, the honest conclusion is that
 * a welcome message needs a marketing opt-in at signup — not that the copy
 * needs another trim.
 */
const TRANSACTIONAL_BODY =
  "Hi {{1}}, your NowOpen Africa listing for {{2}} is now live.\n\n"
  + "View or update it here: {{3}}\n\n"
  + "Reply to this message if anything on the listing is wrong.";

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

  if (!TOKEN || !WABA_ID) {
    return json({
      ok: false, reason: "WHATSAPP_TOKEN and WHATSAPP_WABA_ID must both be set.",
      missing: [!TOKEN && "WHATSAPP_TOKEN", !WABA_ID && "WHATSAPP_WABA_ID"].filter(Boolean),
    }, 200);
  }

  const body = await req.json().catch(() => null) as { preview?: boolean; variant?: "transactional" } | null;

  // Preview mode shows exactly what would be submitted, without submitting.
  /*
   * Which wording to submit. "transactional" is the v2 above; the default
   * stays v1 so an existing caller is not silently switched.
   */
  const transactional = body?.variant === "transactional";
  const name = transactional ? TRANSACTIONAL_NAME : TEMPLATE_NAME;
  const text = transactional ? TRANSACTIONAL_BODY : BODY;
  const example = transactional
    ? [["Ada", "Ada Fabrics", "www.nowopenafrica.com/b/ada-fabrics"]]
    : [["Ada", "Ada Fabrics", "www.nowopenafrica.com/b/ada-fabrics"]];

  if (body?.preview) {
    return json({ ok: true, preview: true, name, language: "en", body: text });
  }

  const res = await fetch(`${GRAPH}/${WABA_ID}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      language: "en",
      /*
       * UTILITY: this is sent because the person just created an account, not
       * as promotion. Meta re-categorises if it disagrees, and its decision —
       * not ours — determines the pricing and the rules that apply.
       */
      category: "UTILITY",
      components: [{
        type: "BODY",
        text,
        // Meta requires a worked example for every placeholder.
        example: { body_text: example },
      }],
    }),
  });

  const out = await res.json().catch(() => null) as
    { id?: string; status?: string; category?: string; error?: { message?: string; error_user_msg?: string } } | null;

  if (!res.ok) {
    return json({
      ok: false, stage: "submit",
      // Meta's own words: the rejection reason is specific and actionable.
      reason: out?.error?.error_user_msg ?? out?.error?.message ?? `Graph ${res.status}`,
    }, 200);
  }

  return json({
    ok: true,
    name,
    id: out?.id ?? null,
    status: out?.status ?? "PENDING",
    category: out?.category ?? null,
    note: "Submitted to Meta. It must reach APPROVED before WHATSAPP_WELCOME_TEMPLATE is set to it — "
      + "a pending template sends nothing.",
  });
});
