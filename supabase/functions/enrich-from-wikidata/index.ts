/**
 * Real images and real websites for businesses that have neither.
 *
 * ── THE ARITHMETIC THIS EXISTS TO CHANGE ─────────────────────────────────
 *
 * MEASURED ON PRODUCTION, 2026-09-23:
 *
 *   unclaimed businesses                        3,167
 *   showing the business's own photograph         242   (7.6%)
 *   showing a stock photograph                  2,851   (90%)
 *   with a website we could read                  937
 *   linked to a Wikidata entity                 2,911
 *   of those, with NO website recorded          2,111
 *
 * The existing website backfill can only ever reach the 937 with a website. It
 * is the better source — a picture the business publishes of itself — but it
 * runs out of businesses long before it runs out of work.
 *
 * Wikidata knows things we do not. In a random sample of 40 linked entities:
 *
 *   P856 official website      8  (20%)
 *   P18  image                 1  (2.5%)
 *   P154 logo                  0
 *
 * So the big lever is NOT taking images from Wikidata — it is recovering the
 * OFFICIAL WEBSITE for businesses whose website we never stored, which then
 * feeds the website backfill and its own picture. Roughly 420 businesses,
 * against ~73 direct images.
 *
 * ── WHAT IT WILL NOT DO ──────────────────────────────────────────────────
 *
 * It does not search the wider internet for pictures. Image search at scale
 * means Google or Bing, whose terms prohibit it, or scraping image sites,
 * which is the same thing wearing a different hat. A photograph of the wrong
 * clinic is worse than an honest placeholder, and a photograph taken in breach
 * of somebody's terms is worse than both.
 *
 * ── ATTRIBUTION IS NOT OPTIONAL ──────────────────────────────────────────
 *
 * Commons images are free, not unowned. Most carry CC BY-SA or CC BY, which
 * require the author and licence to travel with the image. This fetches both
 * and refuses to store an image whose licence it could not read — an
 * unattributable image is one we are not licensed to display.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const automationSecret = Deno.env.get("AUTOMATION_SECRET") ?? "";

const UA = "NowOpenDiscovery/1.0";
const API_UA = "NowOpenDiscovery/1.0 (https://www.nowopenafrica.com)";
const TIMEOUT_MS = 30_000;
/** Wikidata accepts 50 entity ids per request; stay under it. */
const BATCH = 40;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-automation-key",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function timed(url: string): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { headers: { "User-Agent": UA, "Api-User-Agent": API_UA }, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Is this a website, or an email address somebody typed into the wrong field?
 *
 * MEASURED in the sample: Wikidata held `https://info@dedahospital.com` as an
 * official website. Stored unchecked it would reach the image backfill, which
 * would try to open it, fail, and stamp the business as checked — quietly
 * removing it from the queue for thirty days.
 */
function usableWebsite(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v) return null;
  if (v.includes("@")) return null;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  // A hostname with no dot is not a public site.
  if (!u.hostname.includes(".")) return null;
  return u.toString();
}

interface CommonsImage {
  url: string;
  licence: string | null;
  attribution: string | null;
}

/** Strip the HTML Commons puts in its Artist field, without pulling in a parser. */
function plain(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolve a Commons filename to a URL we may actually display.
 *
 * Returns null when the licence cannot be read. That is deliberate: a free
 * licence with unknown terms is not a free licence, and storing the image
 * anyway would mean displaying somebody's work on terms we never checked.
 */
async function commonsImage(filename: string): Promise<CommonsImage | null> {
  const api = "https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo"
    + "&iiprop=url|extmetadata&format=json&titles=" + encodeURIComponent(`File:${filename}`);
  const res = await timed(api);
  if (!res.ok) return null;
  const body = await res.json();
  const pages = body?.query?.pages ?? {};
  const page = Object.values(pages)[0] as Record<string, unknown> | undefined;
  const info = (page?.imageinfo as Array<Record<string, unknown>> | undefined)?.[0];
  if (!info?.url) return null;

  const meta = (info.extmetadata ?? {}) as Record<string, { value?: string }>;
  const licence = meta.LicenseShortName?.value ? plain(meta.LicenseShortName.value) : null;
  if (!licence) return null;   // unreadable terms — see the note above.

  const artist = meta.Artist?.value ? plain(meta.Artist.value) : null;
  const attribution = artist ? `${artist} · ${licence} · via Wikimedia Commons`
                             : `${licence} · via Wikimedia Commons`;
  return { url: String(info.url), licence, attribution };
}

interface Row { id: string; qid: string; website: string | null; image_source: string; logo_source: string; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!automationSecret) return json({ ok: false, reason: "AUTOMATION_SECRET is not set." }, 503);
  if ((req.headers.get("x-automation-key") ?? "") !== automationSecret) {
    return json({ ok: false, reason: "Not authorised." }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(200, Number(body?.limit ?? BATCH)));

  const db = createClient(supabaseUrl, serviceKey);

  /*
   * The queue: unclaimed, linked to a Wikidata entity, and still missing
   * either a website or a real picture. `wikidata_checked_at` keeps a business
   * from being re-asked every run — Wikidata changes slowly and these are
   * volunteers' servers.
   */
  const { data, error } = await db
    .from("radar_candidates")
    .select("source_record_id, businesses!radar_candidates_published_business_id_fkey!inner(id, website, image_source, logo_source, claim_status, wikidata_checked_at)")
    .eq("source_key", "wikidata")
    .not("published_business_id", "is", null)
    /*
     * FILTERED ON THE EMBEDDED ROW, NOT IN THIS PROCESS.
     *
     * MEASURED: the first version filtered `wikidata_checked_at` in
     * JavaScript, after fetching. PostgREST returns the same first N rows
     * every call, so once those were marked checked the function reported
     * "nothing left to ask Wikidata about" — having examined 173 of 2,911.
     * The queue was not draining; it was re-reading its own head.
     */
    .is("businesses.wikidata_checked_at", null)
    .limit(limit * 3);

  if (error) return json({ ok: false, reason: error.message }, 500);

  const rows: Row[] = [];
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const b = r.businesses as Record<string, unknown> | null;
    if (!b || b.claim_status === "claimed") continue;
    if (b.wikidata_checked_at) continue;
    const needsSite = !String(b.website ?? "").trim();
    const needsImage = b.image_source !== "business" || b.logo_source !== "business";
    if (!needsSite && !needsImage) continue;
    rows.push({
      id: String(b.id),
      qid: String(r.source_record_id),
      website: (b.website as string) ?? null,
      image_source: String(b.image_source),
      logo_source: String(b.logo_source),
    });
    if (rows.length >= limit) break;
  }

  if (rows.length === 0) return json({ ok: true, considered: 0, note: "Nothing left to ask Wikidata about." });

  const out = { considered: rows.length, websites: 0, images: 0, logos: 0, noLicence: 0, nothing: 0 };
  const notes: string[] = [];

  /*
   * CHUNKED AT 40, BECAUSE WIKIDATA REFUSES 50+.
   *
   * MEASURED: `limit` accepts up to 200, and a run of 80 sent 80 ids in one
   * wbgetentities call. Wikidata's documented maximum is 50, so it returned an
   * error — and `?? {}` turned that error into an empty entity set, so every
   * row reported "nothing found". 800 businesses were examined, 0 results were
   * produced, and all 800 were stamped as CHECKED, removing them from the
   * queue permanently. A failure that marks its own work complete is the worst
   * shape a batch job can take.
   *
   * The API error is now inspected rather than coalesced away.
   */
  const entities: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < rows.length; i += BATCH) {
    const ids = rows.slice(i, i + BATCH).map((r) => r.qid).join("|");
    const entRes = await timed(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids}&props=claims&format=json`,
    );
    if (!entRes.ok) return json({ ok: false, reason: `Wikidata answered ${entRes.status}` }, 502);
    const payload = await entRes.json();
    if (payload?.error) {
      // Do NOT continue: continuing marks these rows checked having learnt
      // nothing about them.
      return json({ ok: false, reason: `Wikidata: ${payload.error.info ?? payload.error.code}` }, 502);
    }
    Object.assign(entities, payload?.entities ?? {});
    if (i + BATCH < rows.length) await new Promise((r) => setTimeout(r, 400));
  }

  /*
   * If the API gave us nothing at all, stop before writing. Otherwise a bad
   * response silently converts into "checked, nothing found" for the whole
   * batch — which is exactly how 800 businesses were lost from the queue.
   */
  if (Object.keys(entities).length === 0) {
    return json({ ok: false, reason: "Wikidata returned no entities for this batch; nothing marked checked." }, 502);
  }

  const claimValue = (ent: Record<string, unknown>, prop: string): unknown => {
    const claims = (ent?.claims ?? {}) as Record<string, Array<Record<string, unknown>>>;
    const snak = claims[prop]?.[0]?.mainsnak as Record<string, unknown> | undefined;
    return (snak?.datavalue as Record<string, unknown> | undefined)?.value;
  };

  for (const row of rows) {
    const ent = entities[row.qid];
    const patch: Record<string, unknown> = { wikidata_checked_at: new Date().toISOString() };
    let did = false;

    if (ent) {
      // ── The official website, which is the bigger prize ────────────────
      if (!String(row.website ?? "").trim()) {
        const site = usableWebsite(claimValue(ent, "P856"));
        if (site) {
          patch.website = site;
          /*
           * image_checked_at cleared so the website backfill picks this up on
           * its next pass rather than treating an old "nothing found" as
           * settled — the business had no website when it last looked.
           */
          patch.image_checked_at = null;
          out.websites += 1;
          did = true;
        }
      }

      // ── A photograph, where one exists and we may display it ──────────
      if (row.image_source !== "business") {
        const file = claimValue(ent, "P18");
        if (typeof file === "string") {
          const img = await commonsImage(file);
          if (img) {
            patch.image_url = img.url;
            patch.image_source = "business";
            patch.image_source_url = `https://www.wikidata.org/wiki/${row.qid}`;
            patch.image_attribution = img.attribution;
            patch.image_licence = img.licence;
            out.images += 1;
            did = true;
          } else {
            out.noLicence += 1;
          }
        }
      }

      if (row.logo_source !== "business") {
        const file = claimValue(ent, "P154");
        if (typeof file === "string") {
          const img = await commonsImage(file);
          if (img) {
            patch.logo_url = img.url;
            patch.logo_source = "business";
            patch.logo_source_url = `https://www.wikidata.org/wiki/${row.qid}`;
            patch.logo_attribution = img.attribution;
            patch.logo_licence = img.licence;
            out.logos += 1;
            did = true;
          } else {
            out.noLicence += 1;
          }
        }
      }
    }

    if (!did) out.nothing += 1;

    // `error` inspected, not assumed: supabase-js resolves with { error }.
    const { error: wErr } = await db.from("businesses").update(patch).eq("id", row.id);
    if (wErr && notes.length < 10) notes.push(`${row.qid}: ${wErr.message}`);
  }

  return json({ ok: true, ...out, notes });
});
