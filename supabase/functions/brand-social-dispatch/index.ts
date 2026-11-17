// brand-social-dispatch
// ---------------------
// Hands an APPROVED post for NowOpen Africa's own accounts to Zoho, through
// Zoho Flow. Zoho Social has no public API (checked 2026-10-28); Flow's Zoho
// Social actions ("Draft post", "Schedule post") are the supported route, and
// a Flow webhook trigger is how anything outside Zoho starts them.
//
// Three actions, one function:
//   status   (admin)   — is the Flow webhook configured? Nothing secret returned.
//   dispatch (admin)   — send one approved post, every channel, to Flow.
//   callback (Flow)    — Flow reports back after its Zoho action ran, keyed by
//                        the dispatch_key we sent. Authenticated by a shared
//                        secret header; fails closed if the secret is unset.
//
// What "sent" means here, precisely: Zoho Flow ACCEPTED the request (HTTP 2xx).
// Flow answers before its Zoho action runs, so acceptance is not proof that a
// draft exists. zoho_confirmed_at is set only by the callback. The admin screen
// shows the two separately and never calls a post published.
//
// Safety:
//   * Approval is checked here, on the server, against the database row: the
//     post must be 'approved' with approved_by set. The browser is not asked.
//   * The checks the screen showed are run again from the shared rules file.
//   * Claim-then-send: content flips approved → sending with a conditional
//     update, so two clicks (or two tabs) cannot send the same post twice.
//   * An answer we cannot read (timeout, network error) is marked UNCERTAIN and
//     never retried automatically: Flow may well have received it, and a blind
//     retry would put a second draft in Zoho.
//   * The daily ceiling per channel counts what this tool sent and what the
//     team entered from Zoho by hand.

// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  CHANNEL_RULES, checkVariant, isBlocked, lagosDay, trackedUrl, formatLagos,
  type ChannelId,
} from "../_shared/brandSocial.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  // x-application-name: the site's Supabase client sends it on every call, and
  // a preflight that does not allow it blocks the request before it is made.
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-application-name, x-flow-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const FLOW_WEBHOOK_URL = Deno.env.get("ZOHO_FLOW_WEBHOOK_URL") ?? "";
const FLOW_CALLBACK_SECRET = Deno.env.get("ZOHO_FLOW_CALLBACK_SECRET") ?? "";
const MAX_ATTEMPTS = 3;
const FLOW_TIMEOUT_MS = 15_000;

const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/** True when the caller's own JWT belongs to an admin. Asked of the database, as them. */
async function callerIsAdmin(req: Request): Promise<{ ok: boolean; userId?: string }> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return { ok: false };
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: u, error: ue } = await asCaller.auth.getUser();
  if (ue || !u.user) return { ok: false };
  const { data, error } = await asCaller.rpc("is_admin");
  return { ok: !error && data === true, userId: u.user.id };
}

/** Constant-time comparison, so the callback secret cannot be guessed by timing. */
function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function lagosWallClock(iso: string | null): string | null {
  if (!iso) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")} ${String(Number(g("hour")) % 24).padStart(2, "0")}:${g("minute")}`;
}

async function dispatch(contentId: string) {
  if (!FLOW_WEBHOOK_URL) {
    return json({
      ok: false,
      error: "Zoho Flow is not connected yet. Nothing was sent. Set ZOHO_FLOW_WEBHOOK_URL once the Flow is built.",
    }, 409);
  }

  const { data: settings, error: se } = await admin.from("brand_social_settings").select("*").eq("id", true).maybeSingle();
  if (se || !settings) return json({ ok: false, error: "Could not read the social settings." }, 500);
  if (settings.autonomy_mode === "draft") {
    return json({ ok: false, error: "Draft mode is on: posts are planned here but nothing is sent. Switch to Approval mode to send." }, 409);
  }

  // Claim. Only an approved post with a recorded approver can be taken.
  const { data: claimed, error: ce } = await admin
    .from("brand_social_content")
    .update({ status: "sending" })
    .eq("id", contentId)
    .eq("status", "approved")
    .not("approved_by", "is", null)
    .select("*")
    .maybeSingle();
  if (ce) return json({ ok: false, error: `Could not claim the post: ${ce.message}` }, 500);
  if (!claimed) {
    return json({ ok: false, error: "This post is not approved (or is already being sent). Nothing was sent." }, 409);
  }

  const [{ data: variants }, { data: channels }, { data: campaign }] = await Promise.all([
    admin.from("brand_social_variants").select("*").eq("content_id", contentId),
    admin.from("brand_social_channels").select("*"),
    claimed.campaign_id
      ? admin.from("brand_social_campaigns").select("slug").eq("id", claimed.campaign_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const channelById = new Map((channels ?? []).map((c: any) => [c.id, c]));
  const slug = (campaign as any)?.slug ?? "always-on";

  // What is already on each channel's calendar for that Lagos day.
  const day = claimed.planned_at ? lagosDay(claimed.planned_at) : lagosDay(new Date());
  const dayStart = new Date(`${day}T00:00:00+01:00`).toISOString();
  const dayEnd = new Date(new Date(dayStart).getTime() + 86_400_000).toISOString();
  const [{ data: sameDay }, { data: external }] = await Promise.all([
    admin.from("brand_social_variants")
      .select("channel, content_id, brand_social_content!inner(planned_at, status)")
      .in("dispatch_status", ["sending", "sent"])
      .gte("brand_social_content.planned_at", dayStart).lt("brand_social_content.planned_at", dayEnd),
    admin.from("brand_social_external_posts").select("channel").gte("posted_at", dayStart).lt("posted_at", dayEnd),
  ]);
  const countOn = (ch: string) =>
    (sameDay ?? []).filter((r: any) => r.channel === ch && r.content_id !== contentId).length
    + (external ?? []).filter((r: any) => r.channel === ch).length;

  const results: any[] = [];
  for (const v of variants ?? []) {
    if (v.dispatch_status === "sent") { results.push({ channel: v.channel, ok: true, skipped: "already sent" }); continue; }
    if (v.last_error?.startsWith("UNCERTAIN")) {
      results.push({ channel: v.channel, ok: false, error: "Previous attempt is uncertain. Check Zoho drafts before sending again." });
      continue;
    }
    const ch = channelById.get(v.channel);
    // Channels on the direct route are published by brand-social-publish at the
    // planned time. Sending them to Zoho as well would post them twice.
    if (ch?.publish_route === "meta_direct" || ch?.publish_route === "direct") {
      results.push({ channel: v.channel, ok: true, skipped: "published directly at the planned time" });
      continue;
    }
    const fail = async (msg: string) => {
      await admin.from("brand_social_variants").update({ dispatch_status: "failed", last_error: msg }).eq("id", v.id);
      results.push({ channel: v.channel, ok: false, error: msg });
    };

    if (!ch || !ch.connected || !ch.active) { await fail("This channel is not active."); continue; }
    // Zoho Flow's Draft post needs Zoho's own id for the channel. Never guess one.
    if (!ch.zoho_channel_id) { await fail("This channel has no Zoho channel id yet, so Zoho would not know where to put it."); continue; }
    if (v.attempts >= MAX_ATTEMPTS) { await fail(`Stopped after ${MAX_ATTEMPTS} attempts.`); continue; }

    const checks = checkVariant({
      channel: v.channel as ChannelId, caption: v.caption, mediaUrl: claimed.media_url, destinationUrl: claimed.destination_url,
    });
    if (isBlocked(checks)) {
      await admin.from("brand_social_variants").update({ checks }).eq("id", v.id);
      await fail(`Blocked by the checks: ${checks.filter((c) => c.severity === "block").map((c) => c.message).join(" ")}`);
      continue;
    }
    if (countOn(v.channel) >= settings.daily_limit_per_channel) {
      await fail(`${CHANNEL_RULES[v.channel as ChannelId].label} already has ${settings.daily_limit_per_channel} posts on ${day}.`);
      continue;
    }

    const link = trackedUrl(claimed.destination_url, v.channel as ChannelId, slug, claimed.code);
    const rule = CHANNEL_RULES[v.channel as ChannelId];
    const caption = link && !rule.linkNotClickable && !v.caption.includes(link) ? `${v.caption}\n\n${link}` : v.caption;

    await admin.from("brand_social_variants")
      .update({ dispatch_status: "sending", attempts: v.attempts + 1, tracked_url: link, checks, last_error: null })
      .eq("id", v.id);

    const payload = {
      dispatch_key: v.dispatch_key,
      content_code: claimed.code,
      action: settings.zoho_action,           // 'draft' or 'schedule'
      channel: v.channel,
      channel_label: rule.label,
      handle: ch.handle,
      zoho_channel_id: ch.zoho_channel_id,
      caption,
      link,
      media_url: claimed.media_url,
      scheduled_at_utc: claimed.planned_at,
      scheduled_at_lagos: lagosWallClock(claimed.planned_at),
      timezone: "Africa/Lagos",
      callback_url: `${SUPABASE_URL}/functions/v1/brand-social-dispatch`,
    };

    let outcome: { ok: boolean; uncertain?: boolean; error?: string; ref?: string | null };
    try {
      const res = await fetch(FLOW_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(FLOW_TIMEOUT_MS),
      });
      const text = await res.text();
      let ref: string | null = null;
      try { const b = JSON.parse(text); ref = b?.id ?? b?.post_id ?? b?.request_id ?? null; } catch { /* Flow often replies with plain text */ }
      outcome = res.ok ? { ok: true, ref } : { ok: false, error: `Zoho Flow answered ${res.status}: ${text.slice(0, 200)}` };
    } catch (e) {
      outcome = { ok: false, uncertain: true, error: `UNCERTAIN: no clear answer from Zoho Flow (${(e as Error).name}). It may have arrived. Check Zoho drafts before sending again.` };
    }

    if (outcome.ok) {
      await admin.from("brand_social_variants")
        .update({ dispatch_status: "sent", sent_at: new Date().toISOString(), zoho_reference: outcome.ref ?? null })
        .eq("id", v.id);
      results.push({ channel: v.channel, ok: true });
    } else {
      await fail(outcome.error ?? "Unknown error");
    }
  }

  const allOk = results.length > 0 && results.every((r) => r.ok);
  await admin.from("brand_social_content").update({ status: allOk ? "sent" : "failed" }).eq("id", contentId);
  return json({ ok: allOk, code: claimed.code, planned: formatLagos(claimed.planned_at), results });
}

async function callback(req: Request) {
  if (!FLOW_CALLBACK_SECRET) return json({ ok: false, error: "Callback is not configured." }, 503);
  if (!sameSecret(req.headers.get("X-Flow-Secret") ?? "", FLOW_CALLBACK_SECRET)) return json({ ok: false, error: "Forbidden." }, 403);
  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }
  const key = String(body?.dispatch_key ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(key)) return json({ ok: false, error: "Missing dispatch_key." }, 400);

  const update: Record<string, unknown> = { zoho_confirmed_at: new Date().toISOString() };
  const ref = body?.zoho_post_id ?? body?.post_id ?? null;
  if (ref) update.zoho_reference = String(ref).slice(0, 200);
  const { data, error } = await admin.from("brand_social_variants")
    .update(update).eq("dispatch_key", key).eq("dispatch_status", "sent").select("id").maybeSingle();
  if (error) return json({ ok: false, error: error.message }, 500);
  if (!data) return json({ ok: false, error: "No sent post with that key." }, 404);
  return json({ ok: true });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "POST only." }, 405);

  // Flow's callback carries the shared secret and no user session.
  if (req.headers.has("X-Flow-Secret")) return callback(req);

  const caller = await callerIsAdmin(req);
  if (!caller.ok) return json({ ok: false, error: "Admins only." }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }

  if (body?.action === "status") {
    return json({ ok: true, flowConfigured: Boolean(FLOW_WEBHOOK_URL), callbackConfigured: Boolean(FLOW_CALLBACK_SECRET) });
  }
  if (body?.action === "dispatch") {
    const id = String(body?.content_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ ok: false, error: "Missing content_id." }, 400);
    return dispatch(id);
  }
  return json({ ok: false, error: "Unknown action." }, 400);
});
