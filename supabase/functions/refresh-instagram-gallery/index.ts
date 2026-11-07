/**
 * Bringing new Instagram posts into the listings that already show them.
 *
 * ── WHY A POLL AND NOT A SUBSCRIPTION ────────────────────────────────────
 *
 * Meta publishes fifteen Instagram webhook fields — comments, live_comments,
 * mentions, story_insights and the messaging family — and NOT ONE fires when
 * an account publishes a post or a reel. Verified against
 * developers.facebook.com/docs/instagram-platform/webhooks on 2026-10-09.
 *
 * There is therefore nothing to subscribe to. The only sanctioned way to
 * learn about a new post is to ask through the official API, which is what
 * this does, on a schedule, for the accounts whose listings already carry an
 * Instagram gallery.
 *
 * The realtime half lives in the database: a row landing in business_gallery
 * is replicated to every open listing page, which updates with no refresh.
 * New posts therefore appear by themselves — within the polling interval,
 * not within a second of going up. The UI says exactly that.
 *
 * ── WHY IT ASKS ABOUT SO FEW ACCOUNTS AT A TIME ──────────────────────────
 *
 * MEASURED 2026-10-09: 261 businesses hold an Instagram handle. Asking about
 * all of them every fifteen minutes would be a thousand calls an hour against
 * an app-level quota, which is both rude and self-defeating — Meta throttles,
 * and then nobody's gallery updates. BATCH is small and the order is
 * least-recently-asked, so every account comes round in turn.
 *
 * A rate limit stops the run immediately rather than spending the remaining
 * budget on calls that cannot succeed.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

import { lookupInstagramBusiness, normalizeHandle } from "../_shared/discovery/instagram.ts";
import { newPermalinks, galleryRow } from "../_shared/instagramGallery.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-automation-key",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const automationSecret = Deno.env.get("AUTOMATION_SECRET") ?? "";

/** Accounts asked about per run. Small on purpose — see the note above. */
const BATCH = 15;
/** Courtesy pause between lookups, as the manual batch extractor uses. */
const DELAY_MS = 1200;

interface Target {
  id: string;
  handle: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  /*
   * Fail CLOSED. An automation endpoint without its secret must refuse, not
   * run unauthenticated — this one writes to real businesses' galleries.
   */
  if (!automationSecret) return json({ ok: false, reason: "AUTOMATION_SECRET is not set." }, 503);
  if ((req.headers.get("x-automation-key") ?? "") !== automationSecret) {
    return json({ ok: false, reason: "Not authorised." }, 403);
  }

  const db = createClient(supabaseUrl, serviceKey);

  /*
   * Only businesses whose listing ALREADY shows an Instagram gallery.
   *
   * This is deliberately not "every business with a handle". A gallery that
   * exists was put there when the candidate was reviewed and published, which
   * is the moment somebody looked at the account and accepted it. Adding
   * posts to a listing that has never shown any would be publishing new
   * content about a business on the strength of a handle alone.
   */
  const { data: galleried, error: gErr } = await db
    .from("business_gallery")
    .select("business_id")
    .eq("source_type", "instagram")
    .limit(1000);
  if (gErr) return json({ ok: false, reason: `gallery read failed: ${gErr.message}` }, 500);

  const eligible = [...new Set((galleried ?? []).map((r) => r.business_id as string))];
  if (eligible.length === 0) return json({ ok: true, considered: 0, asked: 0, added: 0 });

  const { data: rows, error: bErr } = await db
    .from("businesses")
    .select("id, social_links")
    .in("id", eligible.slice(0, 1000));
  if (bErr) return json({ ok: false, reason: `businesses read failed: ${bErr.message}` }, 500);

  const targets: Target[] = [];
  for (const b of rows ?? []) {
    const raw = (b.social_links as Record<string, unknown> | null)?.instagram;
    const handle = normalizeHandle(typeof raw === "string" ? raw : null);
    if (handle) targets.push({ id: b.id as string, handle });
  }
  if (targets.length === 0) return json({ ok: true, considered: eligible.length, asked: 0, added: 0 });

  /*
   * Least-recently-asked first, reusing the handle ledger as the clock.
   *
   * `instagram_handle_checks.last_checked_at` already means "when did we last
   * ask Instagram about this handle", which is exactly the question here. A
   * handle with no row has never been asked and goes first.
   */
  const { data: checks } = await db
    .from("instagram_handle_checks")
    .select("handle, last_checked_at")
    .in("handle", targets.map((t) => t.handle).slice(0, 1000));

  const lastAsked = new Map<string, number>();
  for (const c of checks ?? []) {
    const t = Date.parse(String(c.last_checked_at ?? ""));
    if (!Number.isNaN(t)) lastAsked.set(String(c.handle), t);
  }
  targets.sort((a, b) => (lastAsked.get(a.handle) ?? 0) - (lastAsked.get(b.handle) ?? 0));

  const slice = targets.slice(0, BATCH);
  let added = 0;
  let asked = 0;
  let throttled = false;
  const perBusiness: Array<{ handle: string; added: number; outcome: string }> = [];

  for (const [i, target] of slice.entries()) {
    const result = await lookupInstagramBusiness(target.handle);
    asked += 1;

    let outcome = "extracted";
    if (!result.ok) {
      /*
       * A rate limit says nothing about the account and must never be
       * recorded as though it did — see the note in
       * src/lib/instagramHandleChecks.ts. It stops the run.
       */
      if (result.reason === "rate_limited") { throttled = true; outcome = "rate_limited"; }
      else if (result.reason === "not_found") outcome = "not_business";
      else outcome = "error";
    } else {
      const fetched = (result.profile.media ?? []).map((m) => m.permalink);

      /*
       * Everything this listing already holds, not just the Instagram rows:
       * an owner may have pasted the same post in by hand, and adding it a
       * second time would show one photograph twice.
       */
      const { data: have } = await db
        .from("business_gallery")
        .select("image_url")
        .eq("business_id", target.id)
        .limit(1000);

      const fresh = newPermalinks(fetched, (have ?? []).map((r) => r.image_url as string));
      if (fresh.length > 0) {
        const { error: insErr } = await db
          .from("business_gallery")
          .insert(fresh.map((url) => galleryRow(target.id, url)));
        if (insErr) outcome = "error";
        else added += fresh.length;
      }
      perBusiness.push({ handle: target.handle, added: fresh.length, outcome });
    }

    /*
     * Record the attempt either way, so the queue rotates.
     *
     * `check_count` is deliberately NOT sent: an upsert writes the columns it
     * is given, so including it would reset the count to 1 on every refresh
     * and destroy the tally the batch extractor keeps. Omitted, the insert
     * path takes the column default and the update path leaves it alone.
     */
    await db.from("instagram_handle_checks").upsert({
      handle: target.handle,
      outcome,
      reason: result.ok ? null : `gallery refresh: ${result.reason}`,
      last_checked_at: new Date().toISOString(),
      list_source: "gallery refresh",
    }, { onConflict: "handle", ignoreDuplicates: false });

    if (throttled) break;
    if (i < slice.length - 1) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  return json({
    ok: true,
    considered: targets.length,
    asked,
    added,
    throttled,
    businesses: perBusiness.filter((b) => b.added > 0),
  });
});
