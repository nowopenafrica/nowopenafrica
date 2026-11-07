/**
 * Read ONE page, on purpose, because a person asked.
 *
 * WHAT THIS IS
 *
 * The server half of the admin's manual extraction tab. An operator pastes a
 * URL; this fetches that single page and returns the business details it
 * publishes about itself in structured form (JSON-LD, meta tags, title).
 *
 * WHAT IT IS NOT, AND WILL NOT BECOME
 *
 * It is not a crawler. One request, one page, no link following, no queue, no
 * schedule. Every safeguard below exists because the difference between "read
 * a page a person opened" and "harvest a site" is the entire legal and ethical
 * distinction, and that difference is made of limits, not intentions:
 *
 *   * ONE URL per call. `anchorsOf` is deliberately not used — the parser can
 *     find links and this function ignores them.
 *   * robots.txt is honoured. A Disallow is a refusal, and a robots.txt that
 *     cannot be read is ALSO a refusal, because the site's wishes are unknown.
 *   * The SSRF guard runs first, so no internal address, cloud-metadata
 *     endpoint or private range can be reached through it.
 *   * Size and time are capped, and the response is truncated rather than
 *     streamed on.
 *   * Staff only, and every call is written to the audit log with the URL and
 *     who asked.
 *
 * SOCIAL PLATFORMS ARE REFUSED BY NAME. Instagram, Facebook, TikTok, X and
 * LinkedIn prohibit automated access in their terms, and their robots.txt says
 * so as well. Refusing them here — before any request is made — means the
 * answer does not depend on a robots file being fetched correctly, and the
 * operator gets a reason instead of a silent failure. A business's own social
 * links reach NowOpen when the owner adds them, which is the path that has
 * permission built in.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { assertSafeToFetch, checkFetchUrl } from "../_shared/discovery/safeUrl.ts";
import { robotsAllowUrl } from "../_shared/discovery/robots.ts";
import {
  parseWebsitePage, WEBSITE_USER_AGENT, WEBSITE_FETCH_TIMEOUT_MS,
  WEBSITE_ROBOTS_TIMEOUT_MS, WEBSITE_MAX_BYTES,
} from "../_shared/discovery/officialWebsite.ts";
import {
  termsRefusedBy, termsRefusalMessage, TERMS_REFUSAL_GUIDANCE,
} from "../_shared/discovery/platformTerms.ts";

/*
 * `x-application-name` is in the list because the app's own Supabase client
 * sets it globally (src/lib/supabase.ts). A header the browser sends but the
 * preflight does not allow fails as a CORS error with no useful message — the
 * request never reaches this function, so nothing here can report it.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-application-name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Resolve the JWT to a staff member, or null. */
async function currentStaff(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return null;
  const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  const { data: staff } = await client.rpc("is_staff");
  if (!staff) return null;
  return { id: data.user.id, email: data.user.email ?? null, client };
}

async function fetchText(url: string, timeoutMs: number, maxBytes: number): Promise<
  { ok: true; body: string; finalUrl: string; status: number }
  | { ok: false; reason: string; status: number }
> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      redirect: "follow",
      headers: { "User-Agent": WEBSITE_USER_AGENT, Accept: "text/html,application/xhtml+xml" },
    });

    /*
     * The redirect target is re-checked. Following a redirect is how an
     * innocent-looking URL reaches somewhere the guard refused at the start.
     */
    /*
     * `UrlVerdict.safe`, NOT `.ok` — an earlier version of this line read
     * `.ok`, which is undefined on that type, so `!undefined` made EVERY fetch
     * look like a refused redirect and the tool failed on every legitimate
     * site while still appearing to work on the ones refused before the fetch.
     */
    const after = checkFetchUrl(res.url || url);
    if (!after.safe) {
      return { ok: false, reason: `Redirected somewhere NowOpen will not read: ${after.detail}`, status: res.status };
    }

    if (!res.ok) return { ok: false, reason: `The site answered ${res.status}.`, status: res.status };

    const type = res.headers.get("content-type") ?? "";
    if (type && !/text\/html|application\/xhtml|text\/plain/i.test(type)) {
      return { ok: false, reason: `That is not a web page (${type.split(";")[0]}).`, status: res.status };
    }

    // Truncate rather than stream on: a page that big is not a business page.
    const raw = await res.text();
    return { ok: true, body: raw.slice(0, maxBytes), finalUrl: res.url || url, status: res.status };
  } catch (e) {
    const msg = (e as Error)?.name === "AbortError"
      ? `The site did not answer within ${Math.round(timeoutMs / 1000)}s.`
      : `Could not reach the site: ${(e as Error)?.message ?? "unknown error"}`;
    return { ok: false, reason: msg, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const staff = await currentStaff(req);
  if (!staff) return json({ ok: false, reason: "Staff only." }, 403);

  let target = "";
  try {
    const body = await req.json();
    target = String(body?.url ?? "").trim();
  } catch {
    return json({ ok: false, reason: "Send { url }." }, 400);
  }
  if (!target) return json({ ok: false, reason: "No URL given." }, 400);
  if (!/^https?:\/\//i.test(target)) target = `https://${target}`;

  // ── 1. Is this address safe to reach at all? ───────────────────────────
  let safeUrl: string;
  try {
    safeUrl = assertSafeToFetch(target);
  } catch (e) {
    return json({ ok: false, stage: "address", reason: (e as Error).message }, 200);
  }

  const host = new URL(safeUrl).hostname;

  // ── 2. Is it a platform that forbids this outright? ────────────────────
  const refusedBy = termsRefusedBy(host);
  if (refusedBy) {
    return json({
      ok: false,
      stage: "terms",
      reason: termsRefusalMessage(refusedBy),
      guidance: TERMS_REFUSAL_GUIDANCE,
    }, 200);
  }

  // ── 3. Does the site allow it? ─────────────────────────────────────────
  const robotsUrl = new URL("/robots.txt", safeUrl).toString();
  const robots = await fetchText(robotsUrl, WEBSITE_ROBOTS_TIMEOUT_MS, 512_000);
  if (!robots.ok && robots.status !== 404) {
    /*
     * FAIL CLOSED. A robots.txt that cannot be read leaves the site's wishes
     * unknown, and "unknown" is a refusal everywhere else in this system.
     * A 404 is different: it is the site answering, and it means no rules.
     */
    return json({
      ok: false, stage: "robots",
      reason: `Could not read ${host}/robots.txt, so its rules are unknown. ${robots.reason}`,
    }, 200);
  }

  /*
   * TWO BUGS LIVED IN THESE THREE LINES, AND EITHER ALONE DISABLED THE GATE.
   * Found 2026-09-15 by testing the deployed function against a disallowed URL.
   *
   *   const groups = parseRobots(robots.ok ? robots.body : "");
   *   if (!robotsAllowUrl(groups, safeUrl, WEBSITE_USER_AGENT)) {
   *
   *   1. robotsAllowUrl takes the RAW robots.txt and parses it itself. It was
   *      handed the already-parsed groups, so internally it ran
   *      String(RobotsGroup[]) -> "[object Object],[object Object]", parsed
   *      that into nothing, and found no rules to apply.
   *   2. It returns a RobotsVerdict OBJECT, not a boolean. `!someObject` is
   *      always false, so the refusal branch could never be reached even if
   *      the verdict had been correct.
   *
   * Same shape as the `verdict.ok` vs `verdict.safe` fault in the SSRF check
   * earlier in this file's history: a guard that reads as if it works, reports
   * success on every legitimate input, and refuses nothing.
   *
   * Neither was caught by `npm run verify` because tsconfig.server.json
   * includes only `api` and `middleware.ts` — supabase/functions is typechecked
   * by nothing, so passing RobotsGroup[] where a string is declared raised no
   * error anywhere.
   */
  const verdict = robotsAllowUrl(robots.ok ? robots.body : "", safeUrl, WEBSITE_USER_AGENT);
  if (!verdict.allow) {
    return json({
      ok: false, stage: "robots",
      reason: `${host}/robots.txt disallows this path for automated readers`
        + `${verdict.matchedRule ? ` (${verdict.matchedRule})` : ""}.`,
      guidance: "This is the site asking not to be read this way. Enter what you need by hand instead.",
    }, 200);
  }

  // ── 4. Read the one page. ──────────────────────────────────────────────
  const page = await fetchText(safeUrl, WEBSITE_FETCH_TIMEOUT_MS, WEBSITE_MAX_BYTES);
  if (!page.ok) return json({ ok: false, stage: "fetch", reason: page.reason }, 200);

  const parsed = parseWebsitePage(page.body, page.finalUrl);

  /*
   * Recorded whether or not the operator goes on to import anything. The
   * question "who read that site, and when?" must be answerable from the
   * platform's own records rather than from somebody's memory.
   */
  await staff.client.from("audit_log").insert({
    actor_id: staff.id,
    actor_email: staff.email,
    action: "manual_page_extracted",
    entity_type: "url",
    entity_id: page.finalUrl.slice(0, 400),
    detail: { host, fields: parsed.extracted.length },
  });

  return json({
    ok: true,
    url: page.finalUrl,
    host,
    robots: robots.status === 404 ? "no robots.txt — no rules published" : "allowed by robots.txt",
    /** The business details the page publishes about itself, or null. */
    candidate: parsed.candidate,
    /** Which fields were actually found — an honest list, not a promise. */
    extracted: parsed.extracted,
    /** Why there is nothing, when there is nothing. */
    note: parsed.note,
    /*
     * Everything beyond the radar_candidates columns, split into `facts` and
     * `owned`.
     *
     * The split is legal rather than cosmetic, and the UI renders it as two
     * separate groups for that reason. Facts — hours, coordinates, a
     * WhatsApp number, social handles — are not copyrightable and a
     * directory recording them is the ordinary business of directories.
     * `owned` is authored work and marks: the About paragraph somebody wrote,
     * the logo, the photograph. Those are shown so an operator knows they
     * exist, and go no further without a separate decision.
     */
    details: parsed.details,
    /*
     * Said explicitly so the UI never has to imply otherwise: reading a page
     * is not permission to republish what it says.
     */
    rights: "This page was readable. That is not a licence — decide before publishing anything from it.",
  });
});
