/**
 * Replace a stock cover with the business's own picture, where one exists.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * MEASURED ON PRODUCTION, 2026-09-16:
 *
 *   unclaimed businesses with a cover image        3,050
 *   whose cover is a Pexels stock photograph       3,049
 *   whose cover is the business's own picture          1
 *
 * Three thousand real, named African businesses — clinics, schools, hotels —
 * were showing a photograph of somewhere else, with nothing saying so. 848 of
 * them publish a website of their own, which means 848 of those pictures can be
 * replaced with the real thing rather than merely labelled.
 *
 * Real first, stock only as a fallback, and the fallback says what it is. That
 * order is the whole point: a directory that shows a business's own shopfront
 * is worth more than one that shows a stock shopfront, and a stock shopfront
 * presented as theirs is worth less than nothing.
 *
 * ── THE SAME LIMITS AS THE MANUAL EXTRACTOR, FOR THE SAME REASONS ─────────
 *
 * This reads other people's websites, so it runs behind every guard the manual
 * tool runs behind, in the same order:
 *
 *   1. SSRF — assertSafeToFetch, and the redirect target re-checked after.
 *   2. Platform terms — Instagram, Facebook, TikTok, X and LinkedIn refused
 *      BEFORE a connection is opened.
 *   3. robots.txt — a Disallow is a refusal, and an unreadable robots.txt is
 *      ALSO a refusal, because the site's wishes are then unknown.
 *   4. Size, time and a one-page-per-business ceiling. No crawling, no link
 *      following: the homepage the business itself published, and nothing else.
 *
 * It is a batch, not a crawl. `limit` businesses per invocation, one request
 * each, with a pause between them — a directory backfill has no deadline, and
 * hammering several hundred small African hosting accounts to finish sooner
 * would be the rudest possible way to do this.
 *
 * ── WHAT IT WRITES, AND WHAT IT WILL NOT TOUCH ───────────────────────────
 *
 * Only `image_url` / `logo_url` and their provenance columns, and only on
 * UNCLAIMED businesses. A claimed profile belongs to the person who claimed it
 * — guard_claimed_profile_edits refuses the write anyway, and this does not go
 * near them.
 *
 * `image_checked_at` is stamped whatever the outcome, including failure, so a
 * site that publishes no picture is not re-read on every run for ever.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { assertSafeToFetch, checkFetchUrl } from "../_shared/discovery/safeUrl.ts";
import { robotsAllowUrl } from "../_shared/discovery/robots.ts";
import {
  parseWebsitePage, WEBSITE_USER_AGENT, WEBSITE_FETCH_TIMEOUT_MS,
  WEBSITE_ROBOTS_TIMEOUT_MS, WEBSITE_MAX_BYTES,
} from "../_shared/discovery/officialWebsite.ts";
import { termsRefusedBy } from "../_shared/discovery/platformTerms.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const automationSecret = Deno.env.get("AUTOMATION_SECRET") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-application-name, x-automation-key",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

/** Courtesy gap between two different hosts. */
const PAUSE_MS = 900;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Re-read a business at most this often, so nothing is hammered. */
const RECHECK_DAYS = 30;

async function fetchText(url: string, timeoutMs: number, maxBytes: number): Promise<
  { ok: true; body: string; finalUrl: string } | { ok: false; reason: string }
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
     * `.safe`, not `.ok`. The manual extractor shipped `!verdict.ok` once —
     * undefined on that type — so every fetch looked like a refused redirect.
     * Following a redirect is how a safe-looking URL reaches somewhere the
     * guard already refused, so this check has to actually run.
     */
    const after = checkFetchUrl(res.url || url);
    if (!after.safe) return { ok: false, reason: `redirected to a refused address: ${after.detail}` };
    if (!res.ok) return { ok: false, reason: `site answered ${res.status}` };

    /*
     * text/plain BELONGS HERE, and leaving it out was a real bug — caught on
     * the very first batch run.
     *
     * A correctly served robots.txt is text/plain. Without it, every site that
     * configures its robots.txt properly was reported as "robots.txt
     * unreadable (not a web page (text/plain))" and then refused by the
     * fail-closed rule — so the better-run a site was, the more certainly this
     * skipped it. extract-page has always allowed text/plain; this copy dropped
     * it.
     */
    const type = res.headers.get("content-type") ?? "";
    if (type && !/text\/html|application\/xhtml|text\/plain/i.test(type)) {
      return { ok: false, reason: `not a web page (${type.split(";")[0]})` };
    }

    const body = (await res.text()).slice(0, maxBytes);
    return { ok: true, body, finalUrl: res.url || url };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "fetch failed" };
  } finally {
    clearTimeout(timer);
  }
}

interface Row {
  id: string;
  name: string;
  website: string | null;
  image_source: string;
  logo_source: string;
}

/** One business: read its own homepage, take what it publishes. */
async function imagesFor(site: string): Promise<
  { ok: true; logo: string | null; cover: string | null; gallery: string[]; from: string }
  | { ok: false; reason: string }
> {
  /*
   * A stored website is often just "dowencollege.org.ng" — no scheme, because
   * that is how a person writes their own address. assertSafeToFetch cannot
   * parse it and refused 50 businesses with "not a URL the server can parse",
   * which is a data-entry convention being read as a hostile input.
   *
   * Assumed https rather than http: every one of these is a public site in
   * 2026, and starting in cleartext to be redirected is both slower and worse.
   * The SSRF guard still runs on the result — this only supplies the scheme the
   * typist left out, it does not vouch for the address.
   */
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(site) ? site : `https://${site}`;

  let safeUrl: string;
  try {
    safeUrl = assertSafeToFetch(withScheme);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "unsafe address" };
  }

  const host = new URL(safeUrl).hostname;

  // Before any connection is opened.
  const refused = termsRefusedBy(host);
  if (refused) return { ok: false, reason: `${refused} prohibits automated access` };

  const robots = await fetchText(
    new URL("/robots.txt", safeUrl).toString(), WEBSITE_ROBOTS_TIMEOUT_MS, 512_000,
  );
  /*
   * FAIL CLOSED. A robots.txt that cannot be read leaves the site's wishes
   * unknown, and unknown is a refusal everywhere else in this system. A 404 is
   * different — that is the site answering, and it means no rules — but
   * fetchText reports a 404 as not-ok, so the reason is inspected rather than
   * the flag alone.
   */
  const missing = !robots.ok && /answered 404/.test(robots.reason);
  if (!robots.ok && !missing) {
    return { ok: false, reason: `robots.txt unreadable (${robots.reason})` };
  }

  const verdict = robotsAllowUrl(robots.ok ? robots.body : "", safeUrl, WEBSITE_USER_AGENT);
  if (!verdict.allow) return { ok: false, reason: `robots.txt disallows it (${verdict.matchedRule})` };

  const page = await fetchText(safeUrl, WEBSITE_FETCH_TIMEOUT_MS, WEBSITE_MAX_BYTES);
  if (!page.ok) return { ok: false, reason: page.reason };

  const parsed = parseWebsitePage(page.body, page.finalUrl);
  return {
    ok: true,
    logo: parsed.details.owned.logoUrl,
    cover: parsed.details.owned.coverImageUrl,
    gallery: parsed.details.owned.galleryUrls,
    from: page.finalUrl,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  /*
   * FAIL CLOSED on the secret. An automation endpoint that runs when its secret
   * is unset is an open endpoint, and this one writes to business profiles.
   */
  if (!automationSecret) return json({ ok: false, reason: "AUTOMATION_SECRET is not set." }, 503);
  /*
   * `x-automation-key`, matching discovery-worker and enrich-business. The
   * first version of this line invented `x-automation-secret`, which would have
   * meant one endpoint in the set that the scheduler could not call and nobody
   * would notice until a cron job silently 403'd for ever.
   */
  const offered = req.headers.get("x-automation-key") ?? "";
  if (offered !== automationSecret) return json({ ok: false, reason: "Not authorised." }, 403);

  const body = await req.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(50, Number(body?.limit ?? 20)));

  const db = createClient(supabaseUrl, serviceKey);
  const cutoff = new Date(Date.now() - RECHECK_DAYS * 864e5).toISOString();

  /*
   * The queue: unclaimed, still on a stock or absent cover, publishes a site,
   * and either never looked at or not looked at recently.
   */
  const { data, error } = await db
    .from("businesses")
    .select("id,name,website,image_source,logo_source")
    .neq("claim_status", "claimed")
    .in("image_source", ["stock", "unknown"])
    .not("website", "is", null)
    .or(`image_checked_at.is.null,image_checked_at.lt.${cutoff}`)
    .order("id", { ascending: true })
    .limit(limit);

  if (error) return json({ ok: false, reason: error.message }, 500);

  const rows = (data ?? []) as Row[];
  const outcome = { looked: 0, replaced: 0, logos: 0, gallery: 0, nothingPublished: 0, refused: 0 };
  const notes: string[] = [];

  for (const [i, b] of rows.entries()) {
    if (i > 0) await sleep(PAUSE_MS);
    if (!b.website?.trim()) continue;
    outcome.looked += 1;

    const got = await imagesFor(b.website.trim());
    const patch: Record<string, unknown> = { image_checked_at: new Date().toISOString() };

    if (!got.ok) {
      outcome.refused += 1;
      if (notes.length < 12) notes.push(`${b.name}: ${got.reason}`);
    } else {
      /*
       * Only ever an upgrade. A business already showing its own picture is not
       * overwritten by a later read, and nothing is ever replaced BY stock —
       * this function's whole job is the other direction.
       */
      if (got.cover && b.image_source !== "business") {
        patch.image_url = got.cover;
        patch.image_source = "business";
        patch.image_source_url = got.from;
        outcome.replaced += 1;
      }
      if (got.logo && b.logo_source !== "business") {
        patch.logo_url = got.logo;
        patch.logo_source = "business";
        patch.logo_source_url = got.from;
        outcome.logos += 1;
      }
      if (!got.cover && !got.logo) outcome.nothingPublished += 1;

      /*
       * ── GALLERY ──────────────────────────────────────────────────────────
       *
       * MEASURED 2026-09-17: not one of the 3,139 unclaimed businesses has a
       * single gallery row. Zero.
       *
       * The tempting fix is to fill galleries with the stock photographs the
       * covers already use. That is the one thing this platform has ruled out
       * in writing — a gallery is read as "pictures of this place", and four
       * stock interiors under a real business name is the strongest form of
       * the misleading-gallery failure, not a weaker one. A stock COVER is a
       * card illustration; a stock GALLERY is a claim about the premises.
       *
       * So the only source here is `galleryUrls`: images the business itself
       * declared as pictures of itself, in schema.org `image` / og:image. Most
       * sites declare one, which becomes the cover and leaves the gallery
       * empty — and an empty gallery is the correct, honest answer for them.
       *
       * `source_derived`, never `owner_confirmed`: the business published
       * these, but nobody asked it whether they belong on NowOpen, and the
       * day someone claims the profile their own uploads replace these.
       */
      if (got.gallery.length) {
        const { data: already } = await db
          .from("business_gallery").select("image_url").eq("business_id", b.id);
        const have = new Set((already ?? []).map((r) => (r as { image_url: string }).image_url));

        const fresh = got.gallery.filter((u) => !have.has(u));
        if (fresh.length) {
          const { error: gErr } = await db.from("business_gallery").insert(
            fresh.map((url) => ({
              business_id: b.id,
              image_url: url,
              caption: null,
              content_status: "source_derived",
              source_type: "official_website",
              source_name: new URL(got.from).hostname,
              source_url: got.from,
              requires_confirmation: true,
              published: true,
              generated_at: new Date().toISOString(),
            })),
          );
          // Reported, not thrown: a gallery write failing must not cost the
          // business the cover image this run already found for it.
          if (gErr) { if (notes.length < 12) notes.push(`${b.name}: gallery — ${gErr.message}`); }
          else outcome.gallery += fresh.length;
        }
      }
    }

    await db.from("businesses").update(patch).eq("id", b.id);
  }

  return json({ ok: true, considered: rows.length, ...outcome, notes });
});
