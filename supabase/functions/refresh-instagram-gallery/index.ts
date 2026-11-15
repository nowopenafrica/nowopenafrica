/**
 * Bringing new Instagram posts into business galleries.
 *
 * ── WHY A POLL AND NOT A SUBSCRIPTION ────────────────────────────────────
 *
 * Meta publishes fifteen Instagram webhook fields — comments, live_comments,
 * mentions, story_insights and the messaging family — and NOT ONE fires when
 * an account publishes a post or a reel. Verified against
 * developers.facebook.com/docs/instagram-platform/webhooks on 2026-10-09 and
 * again against the fields matrix on 2026-11-15.
 *
 * There is therefore nothing to subscribe to. The only sanctioned way to
 * learn about a new post is to ask through the official API, which is what
 * this does, on a schedule.
 *
 * The realtime half lives in the database: a row landing in business_gallery
 * is replicated to every open listing page, which updates with no refresh.
 * New posts therefore appear by themselves — within the polling interval,
 * not within a second of going up. The UI says exactly that.
 *
 * ── TWO KINDS OF WORK, ONE BUDGET ────────────────────────────────────────
 *
 * 1. Owner requests (instagram_sync_requests). The owner of a claimed
 *    business set or changed their handle; the trigger queued a request and
 *    poked this function with { mode: "requests" }. These go first, at most
 *    MAX_REQUESTS_PER_RUN, and respect the handle ledger.
 * 2. The rotation. Every business in instagram_gallery_refresh_pool(), least
 *    recently asked first. Scheduled runs only.
 *
 * Both draw on BATCH lookups per run and both stop dead on a rate limit.
 *
 * ── WHY IT ASKS ABOUT SO FEW ACCOUNTS AT A TIME ──────────────────────────
 *
 * business_discovery runs on NowOpen's own token, so every handle shares one
 * app-level budget, and total_time binds long before call_count (see
 * src/lib/instagramQuota.ts). BATCH is small and the order is
 * least-recently-asked, so every account comes round in turn.
 *
 * ── THE POOL USED TO BE 88 BUSINESSES ────────────────────────────────────
 *
 * Until 2026-11-15 the pool came from business_gallery.select(business_id)
 * .limit(1000). With 17,888 Instagram rows that returned 88 businesses of
 * 360, and the other 272 were never refreshed. The pool is now a SQL
 * function with no row cap.
 */

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { lookupInstagramBusiness, normalizeHandle } from "../_shared/discovery/instagram.ts";
import { newPermalinks, galleryRow } from "../_shared/instagramGallery.ts";
import {
  MAX_REQUESTS_PER_RUN,
  decideRequest,
  isStaleWorking,
  requestOutcome,
  type LookupReason,
} from "../_shared/instagramOwnerSync.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-automation-key",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const automationSecret = Deno.env.get("AUTOMATION_SECRET") ?? "";

/** Accounts asked about per run, requests and rotation together. */
const BATCH = 15;
/** Courtesy pause between lookups, as the manual batch extractor uses. */
const DELAY_MS = 1200;

interface Target {
  id: string;
  handle: string;
}

type SyncResult =
  | { ok: true; postsAdded: number; insertFailed: boolean }
  | { ok: false; reason: LookupReason; message: string };

/**
 * One lookup, its gallery rows and its ledger entry.
 *
 * Shared by owner requests and the rotation so both write exactly the same
 * rows (galleryRow) with the same dedupe (newPermalinks).
 */
async function syncOne(db: SupabaseClient, target: Target, listSource: string): Promise<SyncResult> {
  const result = await lookupInstagramBusiness(target.handle);

  let sync: SyncResult;
  let outcome = "extracted";
  if (!result.ok) {
    /*
     * A rate limit says nothing about the account and must never be
     * recorded as though it did — see src/lib/instagramHandleChecks.ts.
     */
    if (result.reason === "rate_limited") outcome = "rate_limited";
    else if (result.reason === "not_found") outcome = "not_business";
    else outcome = "error";
    sync = { ok: false, reason: result.reason, message: result.message };
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
    let insertFailed = false;
    if (fresh.length > 0) {
      const { error: insErr } = await db
        .from("business_gallery")
        .insert(fresh.map((url) => galleryRow(target.id, url)));
      if (insErr) { insertFailed = true; outcome = "error"; }
    }
    sync = { ok: true, postsAdded: insertFailed ? 0 : fresh.length, insertFailed };
  }

  /*
   * Record the attempt either way, so the rotation moves on.
   *
   * `check_count` is deliberately NOT sent: an upsert writes the columns it
   * is given, so including it would reset the count to 1 on every refresh
   * and destroy the tally the batch extractor keeps.
   */
  await db.from("instagram_handle_checks").upsert({
    handle: target.handle,
    outcome,
    reason: result.ok ? null : `${listSource}: ${result.reason}`,
    last_checked_at: new Date().toISOString(),
    list_source: listSource,
  }, { onConflict: "handle", ignoreDuplicates: false });

  return sync;
}

const pause = () => new Promise((r) => setTimeout(r, DELAY_MS));

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

  let mode: "all" | "requests" = "all";
  try {
    const body = await req.json();
    if (body && body.mode === "requests") mode = "requests";
  } catch { /* an empty body is the scheduled call */ }

  const db = createClient(supabaseUrl, serviceKey);
  let budget = BATCH;
  let throttled = false;
  let lookupsMade = 0;

  // ── 1. Owner requests ────────────────────────────────────────────────────
  const { data: queued, error: qErr } = await db
    .from("instagram_sync_requests")
    .select("id, business_id, handle, status, processed_at")
    .in("status", ["pending", "working"])
    .order("requested_at", { ascending: true })
    .limit(20);
  if (qErr) return json({ ok: false, reason: `request read failed: ${qErr.message}` }, 500);

  const requests: Array<{ handle: string; status: string; added: number }> = [];
  const busy = new Set<string>();   // businesses a request is handling: the rotation skips them

  for (const r of queued ?? []) {
    busy.add(r.business_id as string);
    if (requests.length >= MAX_REQUESTS_PER_RUN || budget <= 0 || throttled) continue;
    // Another run holds it, unless that run evidently died.
    if (r.status === "working" && !isStaleWorking(r.processed_at as string | null)) continue;

    /*
     * Claim it. Only the run whose update matches the row's current status
     * gets it back, so a poke and a scheduled run arriving together cannot
     * both sync one business (which would insert each post twice).
     */
    const { data: claimed } = await db
      .from("instagram_sync_requests")
      .update({ status: "working", processed_at: new Date().toISOString() })
      .eq("id", r.id)
      .eq("status", r.status)
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    const handle = normalizeHandle(r.handle as string);
    const { data: ledger } = await db
      .from("instagram_handle_checks")
      .select("outcome, last_checked_at")
      .eq("handle", handle ?? "")
      .maybeSingle();

    const decision = decideRequest(ledger);
    if (!handle || !decision.ask) {
      await db.from("instagram_sync_requests").update({
        status: "not_business",
        processed_at: new Date().toISOString(),
        note: decision.ask ? "Not a usable Instagram handle." : decision.note,
      }).eq("id", r.id);
      requests.push({ handle: r.handle as string, status: "not_business", added: 0 });
      continue;
    }

    if (lookupsMade > 0) await pause();
    const sync = await syncOne(db, { id: r.business_id as string, handle }, "owner request");
    lookupsMade += 1;
    budget -= 1;

    const out = requestOutcome(sync);
    await db.from("instagram_sync_requests").update({
      status: out.status,
      processed_at: out.status === "pending" ? null : new Date().toISOString(),
      posts_added: out.status === "done" ? out.postsAdded : 0,
      note: out.note,
    }).eq("id", r.id);
    requests.push({ handle, status: out.status, added: out.status === "done" ? out.postsAdded : 0 });

    if (!sync.ok && sync.reason === "rate_limited") throttled = true;
  }

  if (mode === "requests" || throttled || budget <= 0) {
    return json({ ok: true, mode, requests, asked: lookupsMade, throttled });
  }

  // ── 2. The rotation ──────────────────────────────────────────────────────
  /*
   * Paged: PostgREST caps an RPC's result at 1,000 rows exactly as it capped
   * the old table read, and the pool will pass that as businesses join. The
   * function orders by business_id, so the pages do not overlap.
   */
  const pool: Array<{ business_id: string; instagram: string | null }> = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error: pErr } = await db
      .rpc("instagram_gallery_refresh_pool")
      .range(from, from + 999);
    if (pErr) return json({ ok: false, reason: `pool read failed: ${pErr.message}`, requests }, 500);
    pool.push(...((page ?? []) as typeof pool));
    if (!page || page.length < 1000) break;
  }

  const targets: Target[] = [];
  const seen = new Set<string>();
  for (const b of pool) {
    if (busy.has(b.business_id)) continue;
    const handle = normalizeHandle(b.instagram);
    // One lookup per handle, even if two listings name the same account.
    if (handle && !seen.has(handle)) { seen.add(handle); targets.push({ id: b.business_id, handle }); }
  }

  /*
   * Least-recently-asked first, reusing the handle ledger as the clock.
   * Read in pages: the pool is larger than PostgREST's 1,000-row cap.
   */
  const lastAsked = new Map<string, number>();
  const handles = targets.map((t) => t.handle);
  for (let i = 0; i < handles.length; i += 500) {
    const { data: checks } = await db
      .from("instagram_handle_checks")
      .select("handle, last_checked_at")
      .in("handle", handles.slice(i, i + 500));
    for (const c of checks ?? []) {
      const t = Date.parse(String(c.last_checked_at ?? ""));
      if (!Number.isNaN(t)) lastAsked.set(String(c.handle), t);
    }
  }
  targets.sort((a, b) => (lastAsked.get(a.handle) ?? 0) - (lastAsked.get(b.handle) ?? 0));

  let added = 0;
  const perBusiness: Array<{ handle: string; added: number }> = [];
  for (const target of targets.slice(0, budget)) {
    if (lookupsMade > 0) await pause();
    const sync = await syncOne(db, target, "gallery refresh");
    lookupsMade += 1;
    if (sync.ok && sync.postsAdded > 0) {
      added += sync.postsAdded;
      perBusiness.push({ handle: target.handle, added: sync.postsAdded });
    }
    if (!sync.ok && sync.reason === "rate_limited") { throttled = true; break; }
  }

  return json({
    ok: true,
    mode,
    requests,
    considered: targets.length,
    asked: lookupsMade,
    added,
    throttled,
    businesses: perBusiness,
  });
});
