/**
 * Does each discovery source actually answer?
 *
 * ── WHY ───────────────────────────────────────────────────────────────────
 *
 * MEASURED 2026-09-23: radar_sources has 18 rows. `health_status` is
 * 'unknown' on every one of them, `records_seen` is 0 on every one of them,
 * and `last_run_at` is null on every one of them — including the only active
 * automated source, wikidata.
 *
 * So the table describes eighteen sources and knows nothing about whether any
 * of them works. "We support OpenStreetMap" is a row in a table until
 * something has actually asked OpenStreetMap a question and got an answer.
 *
 * This asks. Each probe is the smallest real query that proves the endpoint
 * is reachable, understands the query language, and returns the shape the
 * adapter expects — not a HEAD request against the homepage, which would pass
 * for a service that has removed the API.
 *
 * ── IT IS A PROBE, NOT A HARVEST ─────────────────────────────────────────
 *
 * Every query is capped at a handful of records and nothing it fetches is
 * stored as a candidate. Verifying a source must not become a back door that
 * ingests data without going through the campaign path and its rights gates.
 *
 * Results are written to health_status / last_error, and last_successful_sync
 * moves only on a pass — so the table distinguishes "failing right now" from
 * "last worked three weeks ago".
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const automationSecret = Deno.env.get("AUTOMATION_SECRET") ?? "";

/*
 * Every source below asks us to identify ourselves, and Overpass and
 * Nominatim will refuse or throttle an anonymous agent. This is the same
 * token the discovery worker uses.
 */
const UA = "NowOpenDiscovery/1.0";
/*
 * Overpass answered HTTP 406 to a User-Agent containing a URL in parentheses —
 * several instances reject those outright. A bare token is what their own
 * documentation uses.
 */
const CONTACT = "https://www.nowopenafrica.com";
/*
 * 25s was not enough for Wikidata: its SPARQL endpoint aborted every time. The
 * query below is also far cheaper now, but WDQS is genuinely slow under load
 * and timing it out at 25s reported a working service as dead.
 */
const TIMEOUT_MS = 45_000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-automation-key",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

interface Probe {
  key: string;
  label: string;
  run: () => Promise<{ ok: boolean; detail: string; sample?: string }>;
}

async function timed(url: string, init?: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Lagos, a small box. Big enough to contain businesses, small enough to be polite. */
const LAGOS_BBOX = "6.40,3.30,6.55,3.45";

const PROBES: Probe[] = [
  {
    key: "wikidata",
    label: "Wikidata SPARQL",
    run: async () => {
      // Businesses (Q4830453) located in Nigeria (Q1033). The real adapter's shape.
      /*
       * A DIRECT type match, not `wdt:P31/wdt:P279*`. The property path walks
       * every subclass of "business" — thousands of them — and WDQS aborted on
       * it every time. Restaurants (Q11707) in Nigeria (Q1033) is the same
       * question asked in a way the index can answer.
       */
      const q = `SELECT ?item ?itemLabel WHERE { ?item wdt:P31 wd:Q11707 ; wdt:P17 wd:Q1033 . SERVICE wikibase:label { bd:serviceParam wikibase:language "en" } } LIMIT 3`;
      const res = await timed("https://query.wikidata.org/sparql", {
        method: "POST",
        headers: {
          "User-Agent": UA,
          "Api-User-Agent": `NowOpenDiscovery/1.0 (${CONTACT})`,
          Accept: "application/sparql-results+json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ query: q }).toString(),
      });
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
      const body = await res.json();
      const rows = body?.results?.bindings ?? [];
      return {
        ok: Array.isArray(rows) && rows.length > 0,
        detail: `HTTP 200, ${rows.length} bindings`,
        sample: rows[0]?.itemLabel?.value,
      };
    },
  },
  {
    key: "overpass",
    label: "Overpass (OpenStreetMap)",
    run: async () => {
      /*
       * Three mirrors, tried in order. The main instance is frequently at
       * capacity and answering "busy" is not the same as being unusable — a
       * source marked dead because one mirror was loaded would be wrong.
       */
      const mirrors = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass.private.coffee/api/interpreter",
      ];
      const data = `[out:json][timeout:20];node["amenity"="restaurant"]["name"](${LAGOS_BBOX});out 3;`;
      const failures: string[] = [];
      for (const url of mirrors) {
        try {
          const res = await timed(url, {
            method: "POST",
            // text/plain with the raw query is the form Overpass documents;
            // the urlencoded `data=` form is what drew the 406.
            headers: { "User-Agent": UA, "Content-Type": "text/plain" },
            body: data,
          });
          if (!res.ok) {
            // The BODY, not just the code. Overpass explains its refusals in
            // the response text, and "HTTP 406" alone is not a diagnosis.
            const why = (await res.text().catch(() => "")).slice(0, 200).replace(/\s+/g, " ");
            failures.push(`${new URL(url).hostname}: HTTP ${res.status} ${why}`);
            continue;
          }
          const body = await res.json();
          const els = body?.elements ?? [];
          if (!Array.isArray(els) || els.length === 0) {
            failures.push(`${new URL(url).hostname}: no elements`);
            continue;
          }
          return {
            ok: true,
            detail: `${new URL(url).hostname}: ${els.length} elements`,
            sample: els[0]?.tags?.name,
          };
        } catch (e) {
          failures.push(`${new URL(url).hostname}: ${e instanceof Error ? e.message : "failed"}`);
        }
      }
      return { ok: false, detail: failures.join("; ") };
    },
  },
  {
    key: "wikidata_action",
    label: "Wikidata Action API (CC0)",
    run: async () => {
      /*
       * NOT query.wikidata.org.
       *
       * MEASURED: the SPARQL endpoint aborted every request from this runtime,
       * at 25s and again at 45s, while en.wikipedia.org answered instantly.
       * WDQS is a separately-hosted analytics service that throttles
       * datacenter traffic; the Action API is ordinary Wikimedia
       * infrastructure, which this runtime can plainly reach.
       *
       * Same CC0 data, an endpoint built for programmatic access, and no
       * SPARQL timeout to lose a harvest to.
       */
      const url = "https://www.wikidata.org/w/api.php?action=query&list=search"
        + "&srsearch=" + encodeURIComponent("haswbstatement:P17=Q1033 haswbstatement:P31=Q11707")
        + "&srlimit=3&format=json&origin=*";
      const res = await timed(url, {
        headers: { "User-Agent": UA, "Api-User-Agent": `NowOpenDiscovery/1.0 (${CONTACT})` },
      });
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
      const body = await res.json();
      const hits = body?.query?.search ?? [];
      return {
        ok: Array.isArray(hits) && hits.length > 0,
        detail: `HTTP 200, ${hits.length} entities`,
        sample: hits[0]?.title,
      };
    },
  },
  {
    key: "nominatim",
    label: "Nominatim (OpenStreetMap search)",
    run: async () => {
      const res = await timed(
        "https://nominatim.openstreetmap.org/search?q=restaurant+Lagos+Nigeria&format=jsonv2&limit=3&addressdetails=1",
        { headers: { "User-Agent": UA } },
      );
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
      const body = await res.json();
      return {
        ok: Array.isArray(body) && body.length > 0,
        detail: `HTTP 200, ${Array.isArray(body) ? body.length : 0} results`,
        sample: Array.isArray(body) ? body[0]?.name ?? body[0]?.display_name : undefined,
      };
    },
  },
  {
    key: "healthsites",
    label: "Healthsites.io (ODbL, from OSM)",
    run: async () => {
      /*
       * Healthsites requires an API key for its own endpoints. Without one it
       * cannot be verified, and an unverifiable source must not be reported as
       * healthy — that is precisely the claim this function exists to stop.
       */
      const key = Deno.env.get("HEALTHSITES_API_KEY");
      if (!key) return { ok: false, detail: "no HEALTHSITES_API_KEY configured — cannot verify" };
      const res = await timed(
        `https://healthsites.io/api/v3/facilities/?api-key=${encodeURIComponent(key)}&country=Nigeria&page=1`,
        { headers: { "User-Agent": UA } },
      );
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
      const body = await res.json();
      return { ok: Array.isArray(body) && body.length > 0, detail: `HTTP 200, ${Array.isArray(body) ? body.length : 0} facilities` };
    },
  },
  {
    key: "wikipedia",
    label: "Wikipedia REST",
    run: async () => {
      const res = await timed(
        "https://en.wikipedia.org/api/rest_v1/page/summary/Lagos",
        { headers: { "User-Agent": UA } },
      );
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
      const body = await res.json();
      return { ok: typeof body?.extract === "string", detail: "HTTP 200", sample: body?.title };
    },
  },
  {
    key: "geonames",
    label: "GeoNames",
    run: async () => {
      // GeoNames requires a registered username. Unverifiable without one.
      const user = Deno.env.get("GEONAMES_USERNAME");
      if (!user) return { ok: false, detail: "no GEONAMES_USERNAME configured — cannot verify" };
      const res = await timed(
        `https://secure.geonames.org/searchJSON?q=Lagos&country=NG&maxRows=3&username=${encodeURIComponent(user)}`,
        { headers: { "User-Agent": UA } },
      );
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
      const body = await res.json();
      const rows = body?.geonames ?? [];
      return { ok: Array.isArray(rows) && rows.length > 0, detail: `HTTP 200, ${rows.length} places` };
    },
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!automationSecret) return json({ ok: false, reason: "AUTOMATION_SECRET is not set." }, 503);
  if ((req.headers.get("x-automation-key") ?? "") !== automationSecret) {
    return json({ ok: false, reason: "Not authorised." }, 403);
  }

  const db = createClient(supabaseUrl, serviceKey);
  const results: Array<Record<string, unknown>> = [];

  for (const probe of PROBES) {
    let outcome: { ok: boolean; detail: string; sample?: string };
    try {
      outcome = await probe.run();
    } catch (e) {
      outcome = { ok: false, detail: e instanceof Error ? e.message : "probe threw" };
    }

    /*
     * Recorded whichever way it went. A source that fails must say so in the
     * table, not merely in this response — the point is that the next person
     * to look can see the answer without re-running anything.
     */
    /*
     * `last_successful_sync` only moves on a PASS. The distinction matters:
     * "checked five minutes ago and failing" and "last worked three weeks ago"
     * are different facts, and a single last-checked timestamp would collapse
     * them into one that reads as health.
     */
    /*
     * 'healthy' / 'unhealthy', NOT 'ok' / 'failing'.
     *
     * radar_sources has a CHECK constraint allowing only
     * healthy|degraded|unhealthy|unknown|disabled. The first version of this
     * wrote 'ok' and 'failing', every update was rejected, and because the
     * error was never inspected the function reported six probes as recorded
     * while the table still said 'unknown' for all of them. supabase-js
     * RESOLVES with { error } — it does not throw — so the only way to notice
     * was to look, which is what `writeError` below now forces.
     */
    const patch: Record<string, unknown> = {
      health_status: outcome.ok ? "healthy" : "unhealthy",
      last_error: outcome.ok ? null : outcome.detail.slice(0, 500),
    };
    if (outcome.ok) patch.last_successful_sync = new Date().toISOString();
    const { error: writeError } = await db.from("radar_sources").update(patch).eq("key", probe.key);

    results.push({
      key: probe.key,
      label: probe.label,
      ...outcome,
      // Surfaced, not swallowed. A probe whose RESULT could not be stored has
      // not been recorded, however healthy the source itself is.
      recorded: !writeError,
      ...(writeError ? { recordError: writeError.message } : {}),
    });
    // Courtesy gap: these are free public services run by volunteers.
    await new Promise((r) => setTimeout(r, 700));
  }

  const working = results.filter((r) => r.ok).map((r) => r.key);
  return json({
    ok: true,
    checkedAt: new Date().toISOString(),
    working,
    failing: results.filter((r) => !r.ok).map((r) => r.key),
    results,
  });
});
