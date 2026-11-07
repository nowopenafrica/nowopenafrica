/**
 * A business adds itself to NowOpen from its Instagram handle. No account.
 *
 * ── WHAT IT DOES ─────────────────────────────────────────────────────────
 *
 * Takes a handle from anybody, looks the account up through Meta's official
 * API, and files what Instagram returns as a candidate in the review queue.
 * It does NOT publish a listing: a person approves it, exactly as with every
 * other inbound source. "Created immediately" means the record exists
 * immediately, not that it is live immediately — publishing a business page
 * about a real company nobody has checked is the one thing this platform is
 * built not to do.
 *
 * ── WHY IT IS SAFE TO LEAVE OPEN ─────────────────────────────────────────
 *
 * `extract-instagram` is staff-gated because it spends the app's Meta budget,
 * MEASURED at 86% of the hour from one admin run. This endpoint does the same
 * kind of work for anonymous callers, so it carries the guards that one does
 * not need:
 *
 *   1. A cheap duplicate check BEFORE any Meta call. Most handles somebody
 *      types are already on NowOpen, and finding that out costs a database
 *      read rather than a lookup.
 *   2. A per-caller limit, counted in `rate_limit_buckets` against a hashed
 *      address — the same table and the same hashing the public write limits
 *      use.
 *   3. A budget ceiling. Public intake stops at 60% of Meta's hour, so the
 *      scheduled gallery refresh and the admin batch can never be starved by
 *      strangers.
 *
 * `check_rate_limit` itself cannot be reused here: it EXEMPTS service_role,
 * which is what this function runs as, so calling it would always pass. The
 * bucket is therefore written directly, with the same scope/subject/window
 * shape so both mechanisms share one table.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

import { lookupInstagramBusiness, normalizeHandle } from "../_shared/discovery/instagram.ts";
import { usageFromHeaders } from "../_shared/quota.ts";
import { decideIntake, windowStart, PER_CALLER_MAX } from "../_shared/intakeGuard.ts";
import { probableDuplicate, tokens } from "../_shared/nameMatch.ts";
import { categoryFromSelfDescription } from "../_shared/selfCategory.ts";

/*
 * `Access-Control-Allow-Methods` is NOT optional here, and leaving it out is
 * how this shipped broken: a POST carrying application/json triggers a
 * preflight, and a browser rejects a preflight that does not name the method.
 * The page reported "Failed to send a request to the Edge Function", which
 * reads like the function is down.
 *
 * curl never catches it — curl does not preflight. A browser is the only test
 * that proves a browser can call this.
 */
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-application-name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

/** Roles that are not members of the public. Mirrors extract-instagram. */
const STAFF = new Set(["admin", "editor", "business_curator"]);

/** Scope name in `rate_limit_buckets`, beside the public write limits. */
const SCOPE = "public_instagram_intake";

/** sha256(address + salt), the same shape `check_rate_limit` stores. */
async function subjectFor(address: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(address + salt);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, reason: "Use POST." }, 405);

  const body = await req.json().catch(() => null) as { handle?: string } | null;
  const handle = normalizeHandle(body?.handle ?? null);
  if (!handle) {
    return json({
      ok: false, stage: "handle",
      reason: "That does not look like an Instagram handle.",
    }, 200);
  }

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  /*
   * ── 1. Already here? ──────────────────────────────────────────────────
   *
   * Before anything is spent. A handle somebody types is far more likely to
   * be a business we already hold than a new one, and answering that costs a
   * database read instead of a Meta call.
   */
  const profileUrl = `https://www.instagram.com/${handle}/`;
  const [listed, filed] = await Promise.all([
    db.from("businesses")
      .select("id,name,username,claim_status")
      .eq("is_listable", true)
      .eq("profile_state", "published")
      .ilike("social_links->>instagram", `%${handle}%`)
      .limit(1),
    db.from("radar_candidates")
      .select("id,status")
      .eq("source_record_id", profileUrl)
      .limit(1),
  ]);

  const existing = (listed.data ?? [])[0];
  if (existing) {
    return json({
      ok: true, outcome: "already_listed",
      business: { id: existing.id, name: existing.name, username: existing.username, claim_status: existing.claim_status },
    });
  }
  if ((filed.data ?? []).length > 0) {
    return json({ ok: true, outcome: "already_filed" });
  }

  /*
   * ── 2. May this caller spend a lookup? ────────────────────────────────
   *
   * The first address in x-forwarded-for is the client; the rest are proxies.
   */
  const address = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const { data: saltRow } = await db.from("private_config").select("value").eq("key", "rate_limit_salt").maybeSingle();
  const salt = (saltRow?.value as string | undefined) ?? "";

  /*
   * IS THE CALLER STAFF?
   *
   * The per-caller limit exists to stop a stranger enumerating accounts. An
   * operator testing the platform is not a stranger, and treating them as one
   * is a mistake this codebase has already made once: the public write limit
   * locked an admin out of their own Instagram batch at 40 rows an hour.
   *
   * The BUDGET ceiling below still applies to everybody, staff included,
   * because that one protects the scheduled jobs from all of us.
   */
  const authHeader = req.headers.get("Authorization") ?? "";
  let isStaff = false;
  if (authHeader && anonKey) {
    const asCaller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: me } = await asCaller.auth.getUser();
    if (me?.user) {
      const { data: actor } = await db.from("users").select("role").eq("id", me.user.id).maybeSingle();
      isStaff = STAFF.has((actor as { role?: string } | null)?.role ?? "");
    }
  }

  const now = new Date();
  const bucketStart = windowStart(now).toISOString();
  let callerHits = 0;
  let subject = "";

  if (address && salt && !isStaff) {
    subject = await subjectFor(address, salt);
    const { data: bucket } = await db.from("rate_limit_buckets")
      .select("hits").eq("scope", SCOPE).eq("subject", subject).eq("window_start", bucketStart)
      .maybeSingle();
    callerHits = Number(bucket?.hits ?? 0);
  }
  /*
   * An unidentifiable caller is not rate-limited per caller — the address is
   * missing or the salt is not provisioned — but the budget ceiling below
   * still bounds what that can cost. Failing open on identification while
   * failing closed on the budget is the right way round: the budget is what
   * protects everybody else.
   */

  /*
   * What Meta last told us about the hour, read from our own most recent
   * successful lookup rather than by making a call to find out.
   */
  const { data: lastUsage } = await db.from("instagram_handle_checks")
    .select("reason").eq("outcome", "rate_limited")
    .gte("last_checked_at", bucketStart).limit(1);
  const throttledThisWindow = (lastUsage ?? []).length > 0;

  const decision = decideIntake(
    throttledThisWindow ? { callCount: 100, totalTime: 100, totalCpuTime: 100, regainAccessMinutes: null } : null,
    callerHits,
    now,
  );
  if (!decision.allow) {
    return json({ ok: false, stage: "limit", outcome: decision.reason, reason: decision.message }, 200);
  }

  // Count the attempt before making it, so a crash cannot buy a free lookup.
  if (subject && !isStaff) {
    await db.from("rate_limit_buckets").upsert(
      { scope: SCOPE, subject, window_start: bucketStart, hits: callerHits + 1 },
      { onConflict: "scope,subject,window_start" },
    );
  }

  /*
   * ── 3. Ask Instagram ──────────────────────────────────────────────────
   */
  const result = await lookupInstagramBusiness(handle);
  const usage = usageFromHeaders(result.ok ? result.usage : (result as { usage?: Record<string, string> }).usage);

  // Record the attempt against the handle either way; see instagramHandleChecks.
  const recordCheck = async (outcome: string, reason: string | null) => {
    await db.from("instagram_handle_checks").upsert({
      handle,
      outcome,
      reason: reason?.slice(0, 500) ?? null,
      last_checked_at: new Date().toISOString(),
      list_source: "public intake",
    }, { onConflict: "handle" });
  };

  if (!result.ok) {
    if (result.reason === "rate_limited") {
      await recordCheck("rate_limited", "public intake hit Meta's limit");
      return json({
        ok: false, stage: "limit", outcome: "budget",
        reason: "Instagram look-ups are busy just now. Please try again shortly — or add your business directly, which works straight away.",
      }, 200);
    }
    if (result.reason === "not_found") {
      await recordCheck("not_business", result.message);
      return json({
        ok: false, stage: "lookup", outcome: "not_business",
        /*
         * The true reason, in the visitor's terms. Meta's API can only read
         * public Business and Creator accounts, so this is a fact about the
         * account type and not about the business.
         */
        reason: `@${handle} is not a public Instagram Business or Creator account, so we cannot read it. `
          + "You can switch it in Instagram settings, or add your business directly.",
      }, 200);
    }
    await recordCheck("error", result.message);
    return json({
      ok: false, stage: "lookup", outcome: "error",
      reason: "We could not reach Instagram just now. Please add your business directly.",
    }, 200);
  }

  /*
   * ── 4. File it, as a candidate ────────────────────────────────────────
   *
   * Facts from Instagram only. The candidate carries its provenance and goes
   * to the review queue; nothing is published by this request.
   */
  const p = result.profile;
  const name = (p.name ?? "").trim();
  if (!name) {
    await recordCheck("no_name", "no business name on the profile");
    return json({
      ok: false, stage: "lookup", outcome: "no_name",
      reason: "That account has no business name set, so there is nothing to file yet.",
    }, 200);
  }

  /*
   * ── Is this a business we already hold under another name? ────────────
   *
   * The handle check above only finds a listing that already RECORDS this
   * handle, and most do not: the directory was built largely from Wikidata
   * and CSV imports, which carry a name and no Instagram at all. So a shop
   * can be on NowOpen already and still look new here — and filing it again
   * gives one real business two pages, splitting its reviews, its claim and
   * its search ranking.
   *
   * Matched on the name Instagram returned, against listings sharing a
   * significant word. It FLAGS via `duplicate_of`, which the review queue
   * already renders as "Looks like a business already on NowOpen"; it never
   * writes to the live listing. That restraint is a security property: the
   * name being compared comes from an account the caller controls, and
   * anyone can name an Instagram account "Jumia Nigeria".
   */
  let duplicateOf: string | null = null;
  let duplicateName: string | null = null;
  const nameTokens = tokens(name);
  if (nameTokens.length >= 2) {
    /*
     * Candidates fetched by the rarest-looking word rather than by scanning
     * 4,108 rows: an `ilike` on one token is indexed work, and the matcher
     * then decides properly.
     */
    const probe = nameTokens.reduce((a, b) => (b.length > a.length ? b : a));
    const { data: similar } = await db.from("businesses")
      .select("id,name")
      .eq("is_listable", true)
      .eq("profile_state", "published")
      .ilike("name", `%${probe}%`)
      .limit(200);
    const hit = probableDuplicate(name, (similar ?? []) as { id: string; name: string | null }[]);
    if (hit) {
      duplicateOf = hit.listing.id;
      duplicateName = hit.listing.name;
    }
  }

  /*
   * Stage what Instagram actually returned.
   *
   * MEASURED 2026-10-12: this wrote `profile: { instagram: profileUrl }` and
   * nothing else, so the twelve posts and the account metrics that the lookup
   * had ALREADY FETCHED — spending Meta quota to do it — were thrown away. A
   * reviewer then saw a name, a bio and a link, and had no way to judge the
   * account without opening Instagram themselves.
   *
   * `instagram_recent_posts` is the key the publish trigger
   * (20261019010000) turns into business_gallery rows, and it expects an
   * ARRAY OF PERMALINK STRINGS. Permalinks, never media_url: Meta's media
   * addresses are signed, expire within days, and may not be re-hosted under
   * the Platform Terms. A permalink keeps pointing at the post where it
   * lives.
   */
  const recentPosts = (p.media ?? [])
    .map((m) => (m.permalink ?? "").trim())
    .filter((link) => link.length > 0)
    .slice(0, 12);

  /*
   * What is deliberately NOT staged here, and why:
   *
   * - logo_url / cover: `profile_picture_url` is a Meta CDN address. The
   *   registry records image_reuse_allowed = 'prohibited' for this source,
   *   and the admin path refuses CDN URLs for the same reason. It is kept
   *   under its own key for the reviewer to look at, where the publish
   *   whitelist cannot reach it.
   * - about / services / products: the admin extractor stages those only
   *   when an operator has ticked a box confirming the business authored
   *   them. This endpoint is anonymous; nobody has confirmed anything, so
   *   staging them would put unconfirmed words on a stranger's listing.
   * - phone / address / opening hours: business_discovery does not return
   *   them. They are not missing here, they do not exist in the response.
   */
  const staged: Record<string, unknown> = { instagram: profileUrl };
  if (recentPosts.length) staged.instagram_recent_posts = recentPosts;
  if (p.username) staged.instagram_username = p.username;
  if (typeof p.followersCount === "number") staged.instagram_followers = p.followersCount;
  if (typeof p.mediaCount === "number") staged.instagram_media_count = p.mediaCount;
  if (p.profilePictureUrl) staged.instagram_profile_picture_url = p.profilePictureUrl;
  staged.retrieved_at = p.retrievedAt;

  /*
   * Category from the account's own words — the same reader the scheduled
   * sweep uses, which returns nothing when two trades tie or none matches.
   * Leaving this null put every Instagram submission into the reviewer's lap
   * uncategorised when the bio often says plainly what the business does.
   */
  const readCategory = categoryFromSelfDescription(p.biography ?? null, name);

  const { error: insErr } = await db.from("radar_candidates").insert({
    duplicate_of: duplicateOf,
    source_key: "public_instagram",
    source_record_id: profileUrl,
    source_url: profileUrl,
    name: name.slice(0, 200),
    description: (p.biography ?? "").trim() || null,
    website: (p.website ?? "").trim() || null,
    status: "pending",
    category: readCategory?.category ?? null,
    profile: staged,
    decision_reason:
      `Submitted from the public Instagram page by an anonymous visitor on ${new Date().toISOString().slice(0, 10)}. `
      + "Fields are as Instagram returned them for a public Business/Creator account; nothing was inferred."
      + (duplicateName ? ` Name matches an existing listing, "${duplicateName}" — check before publishing.` : ""),
  });

  if (insErr) {
    await recordCheck("error", insErr.message);
    return json({ ok: false, stage: "file", outcome: "error", reason: insErr.message }, 200);
  }

  await recordCheck("extracted", null);
  return json({
    ok: true,
    outcome: "filed",
    handle,
    name,
    /*
     * Stated plainly. The visitor has not created a live listing and should
     * not be told they have.
     */
    reason: duplicateName
      ? `Sent for review. This looks like it may already be on NowOpen as "${duplicateName}", so a person will check before anything is published.`
      : "Sent for review. A person checks every submission before it appears on NowOpen.",
    possibleDuplicateOf: duplicateName,
    quotaKnown: usage.callCount !== null || usage.totalTime !== null,
    perCallerRemaining: Math.max(0, PER_CALLER_MAX - (callerHits + 1)),
  });
});
