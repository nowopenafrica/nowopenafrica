// The server half of the admin's Instagram manual extraction.
//
// ── WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT ────────────────────────
//
// An operator pastes ONE handle and this looks that account up through Meta's
// official business_discovery endpoint. That is the whole capability, and it
// is the whole capability Meta offers: verified against their documentation
// on 2026-10-06, business_discovery takes a USERNAME and returns that
// account's public profile. There is no authorised endpoint that searches
// Instagram by location, category or keyword.
//
// So this is a lookup tool for a handle a person already has — typed from a
// business card, a shopfront sign, a website footer. It is not a discovery
// source, and the registry records it that way (radar_sources.instagram_graph,
// bulk_extraction = 'prohibited'). Anything that appears to search Instagram
// is scraping an unofficial endpoint, which this platform does not do.
//
// ── IT MIRRORS extract-page ──────────────────────────────────────────────
//
// Same auth (a staff JWT, not the automation secret), same `{ ok, reason }`
// shape, same destination: the parsed fields go back to the admin tab, which
// stages them into radar_candidates for the Review queue. No second staging
// path, no second business-creation path.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  lookupInstagramBusiness, normalizeHandle, evidenceFrom,
} from "../_shared/discovery/instagram.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/*
 * Copied from extract-page rather than written afresh.
 *
 * supabase-js sends `x-application-name`, and an allow-list missing it fails
 * the CORS preflight — the request never leaves the browser, so the server
 * logs nothing and the screen simply does nothing. Measured here: the first
 * version omitted it and the button appeared dead.
 */
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

/** Roles allowed to extract. Mirrors extract-page rather than inventing one. */
const STAFF = new Set(["admin", "editor", "business_curator"]);

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

  const body = await req.json().catch(() => null) as { handle?: string } | null;
  const raw = body?.handle;
  if (!raw) return json({ ok: false, reason: "Send { handle }." }, 400);

  /*
   * Normalised before anything else, and the normaliser is also the injection
   * guard: the handle is interpolated into a Graph FIELD EXPRESSION —
   * business_discovery.username(X){...} — where URL-encoding does not help,
   * so the [A-Za-z0-9._]{1,30} character set is the defence.
   */
  const handle = normalizeHandle(raw);
  if (!handle) {
    return json({
      ok: false, stage: "handle",
      reason: `"${String(raw).slice(0, 60)}" is not an Instagram handle. Paste @name, name, or the profile URL.`,
    }, 200);
  }

  const result = await lookupInstagramBusiness(handle);

  if (!result.ok) {
    /*
     * Every failure is reported as its own kind, because they need different
     * things from the operator: a missing credential is a setup task, a rate
     * limit is "try later", and a personal account is simply not extractable
     * and never will be.
     */
    if (result.reason === "not_configured") {
      return json({
        ok: false, stage: "provider", reason: result.message,
        missing: result.missing,
        // Named so the UI can show setup guidance rather than a dead end.
        providerConfigured: false,
      }, 200);
    }
    if (result.reason === "not_found") {
      return json({
        ok: false, stage: "lookup",
        reason: `@${handle} is not a public Instagram Business or Creator account. `
          + 'Personal accounts cannot be read through the official API.',
      }, 200);
    }
    if (result.reason === "rate_limited") {
      return json({
        ok: false, stage: "lookup",
        reason: "Instagram's rate limit is reached.",
        /*
         * Carried because this refusal is the one that says WHEN to come
         * back: X-Business-Use-Case-Usage holds
         * estimated_time_to_regain_access, in minutes.
         */
        usage: result.usage ?? {},
      }, 200);
    }
    if (result.reason === "permission") {
      /*
       * Distinct from a bad token: the credentials are fine and the grant is
       * missing.
       *
       * This used to say "it needs App Review", which was true of the end
       * state and wrong about the NEXT step — it pointed at a process of weeks
       * when the usual cause is a token generated without two boxes ticked.
       * Measured 2026-10-08: the token held instagram_basic and reached a
       * linked Business account; instagram_manage_insights and
       * pages_read_engagement were simply absent from its scope list.
       *
       * Meta grants those to an app's own admins, developers and testers
       * without review (Standard Access). App Review is what later turns that
       * into Advanced Access — acting for people with no role on the app.
       */
      return json({
        ok: false, stage: "provider", providerConfigured: true,
        reason: "Meta has not granted this app permission for business_discovery. The credentials are fine — "
          + "the token is missing instagram_manage_insights and pages_read_engagement. Regenerate it with those "
          + "two scopes ticked; Meta grants them to the app's own admins without App Review, which is only "
          + "needed later to act on behalf of people outside the app.",
      }, 200);
    }
    if (result.reason === "auth") {
      return json({ ok: false, stage: "provider", reason: "The Instagram access token needs attention — it was rejected." }, 200);
    }
    /*
     * The catch-all, which must not pretend to know the cause.
     *
     * Measured: three of four test handles landed here reading "Instagram
     * could not be reached", when nothing was wrong with the connection — a
     * directory looks up personal accounts constantly, and reporting that as
     * a network fault would have operators debugging the wrong thing. Meta's
     * own sentence is carried through so the real reason is visible.
     */
    return json({
      ok: false, stage: "lookup",
      reason: result.message || "Instagram could not be reached just now.",
      providerMessage: result.message ?? null,
    }, 200);
  }

  const p = result.profile;

  /*
   * Is there already a listing for this account?
   *
   * Checked here rather than client-side so the answer cannot be skipped, and
   * returned as a HINT rather than a refusal — the operator decides. Matching
   * on the handle inside social_links is the only signal this endpoint holds;
   * the staging path downstream does the fuller duplicate check.
   */
  /*
   * `social_links->>instagram`, not `social_links`.
   *
   * This used to ILIKE the whole jsonb column, which Postgres answers with
   * "operator does not exist: jsonb ~~* unknown" — and the error was thrown
   * away, because only `data` was destructured. So `existing` was always
   * undefined and the duplicate hint NEVER fired: an operator could file a
   * business already on the directory and be told nothing.
   *
   * `->>` yields text, which ILIKE can match. Matched on the handle rather
   * than a full URL, because a stored link may read
   * `https://www.instagram.com/x/`, `instagram.com/x` or `@x`.
   */
  const { data: existing, error: dupErr } = await admin
    .from("businesses")
    .select("id, name, claim_status")
    .ilike("social_links->>instagram", `%${handle}%`)
    .limit(1);

  const duplicate = (existing ?? [])[0] as { id: string; name: string; claim_status: string } | undefined;

  return json({
    ok: true,
    /*
     * Meta's quota headers, forwarded raw. The caller parses them
     * (src/lib/instagramQuota.ts) so a batch can slow down and pause INSIDE
     * the limit rather than running into it and calling that a failure.
     */
    usage: result.usage ?? {},
    handle,
    url: `https://www.instagram.com/${handle}/`,
    profile: {
      name: p.name,
      biography: p.biography,
      website: p.website,
      followersCount: p.followersCount,
      mediaCount: p.mediaCount,
      // Returned for display only. NOT copied onto a listing: the registry
      // records image_reuse_allowed = 'prohibited' for this source, the URL
      // expires, and it is Meta Platform Data.
      profilePictureUrl: p.profilePictureUrl,
      retrievedAt: p.retrievedAt,
      media: p.media ?? [],
    },
    /*
     * Field-level provenance, which is what makes this different from a
     * copy-paste. Every value carries where it came from and how strongly it
     * is held, so the Review queue can show it and a later correction knows
     * what it is overriding.
     */
    evidence: evidenceFrom(p).map((e) => ({
      ...e,
      source_id: "instagram_graph",
      source_url: `https://www.instagram.com/${handle}/`,
      source_type: "api",
      observed_at: p.retrievedAt,
    })),
    duplicate: duplicate
      ? { id: duplicate.id, name: duplicate.name, claimStatus: duplicate.claim_status }
      : null,
    /*
     * A FAILED check is not the same as "no duplicate", and conflating the two
     * is what kept this silent. When the lookup itself breaks, say so rather
     * than letting the absence of a warning imply there was nothing to warn
     * about.
     */
    duplicateCheckFailed: dupErr ? dupErr.message : null,
  });
});
