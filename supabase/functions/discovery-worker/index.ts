/**
 * The discovery executor — Phase 2's campaign ingestor.
 *
 * Called by cron (and runnable manually with ?limit=N&dry=1). It claims due
 * campaigns from business_discovery_campaigns via claim_due_discovery_campaign,
 * asks the campaign's active sources for fresh candidates, normalises and
 * scores them exactly as the existing engine does, and stages them into the
 * review queue as radar_candidates with `campaign_id` set.
 *
 * THE SAFETY BOUNDARY, restated from the scheduler migration:
 *
 *   WHAT IT MAY WRITE: radar_candidates rows in status `review`, and its own
 *   run row (through finish_discovery_run). NOTHING ELSE. It cannot publish —
 *   a candidate reaches the directory only through radar_publish_candidate
 *   after a person (or the engine's own gate) approves it, and the campaign's
 *   threshold checks already mirror radar_config.
 *
 *   WHAT IT MAY NOT DO: decide duplicates or publication. Duplicate detection
 *   and the publish gate are ONE policy (publishGate in radar/confidence.ts);
 *   the worker scores candidates with the shared quality engine and leaves
 *   every disposition to the review queue. `records_published` will be 0 for
 *   a long time; the ledger says so rather than pretending.
 *
 *   SHUTOFFS: dry-run by default (?dry=1); the business_discovery_engine
 *   feature flag is re-checked here (belt and braces on the claim function);
 *   only sources that are ACTIVE in radar_sources are ever asked — the schema
 *   CHECK (radar_sources_active_requires_rights) guarantees an active source
 *   holds every right, so the worker filters on `active` without re-deriving
 *   the rights gate.
 *
 * ONLY THE TWO AUTHORISED, ACTIVE SOURCES ARE FETCHED TODAY: Wikidata (CC0)
 * and OpenStreetMap/Overpass (ODbL), the two rows radar_sources holds with all
 * four rights permitted. A campaign naming any other active source is
 * reported as `partially_succeeded` with the unsupported keys named, so
 * nothing silently disappears. Each run stages candidates with their per-field
 * evidence and closes by reporting how each source did (finish_discovery_run's
 * p_source_health), which is what keeps the registry's health honest.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  WIKIDATA_SPARQL, WIKIDATA_USER_AGENT,
  buildDiscoveryQuery, readSparqlJson, foldBindings,
  type WikidataCandidate,
} from "../_shared/discovery/wikidata.ts";
import {
  OVERPASS_ENDPOINT, AFRICA_BBOX,
  buildOverpassQuery, foldOsmElements,
  type OsmCandidate, type OsmElement,
} from "../_shared/discovery/osm.ts";
import { scoreCandidate } from "../_shared/discovery/quality.ts";
import { candidateKeys } from "../_shared/discovery/normalize.ts";
import { buildPlan, recordMatchesFilters, type CampaignPlan } from "../_shared/discovery/plan.ts";
import { evidenceFor } from "../_shared/discovery/evidence.ts";
import type { DiscoveryCandidate, SourceHealth } from "../_shared/discovery/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-automation-key",
};

const AUTOMATION_SECRET = Deno.env.get("AUTOMATION_SECRET") ?? "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Wikidata's query service is a shared public resource; be a small client, not
 * a brittle one. SPARQL LIMIT counts ROWS, and one business arrives as several
 * — the fold is what turns rows back into businesses, so ask for more rows
 * than campaigns want, in pages, and keep the run's own time budget as the
 * real ceiling.
 */
const TIMEOUT_MS = 100_000;
const MAX_BYTES = 8 * 1024 * 1024;
const ROWS_PER_BUSINESS = 5;
const PAGE_ROWS = 5000;
const MAX_PAGES = 20;

/** Source fetchers the worker knows. Extending this adds a live source. */
const SUPPORTED_SOURCES = new Set(['wikidata', 'openstreetmap']);

/** One fetch target: a place the campaign matched, or the country fallback. */
interface Scope {
  placeQid: string | null;
  placeName: string | null;
  countryQid: string;
  countryName: string;
}

/** Fetch one scope (place or country) and fold it to candidates. */
async function fetchWikidataScope(plan: Pick<CampaignPlan, 'countryQid' | 'requireContact'>, placeQid: string | null, limit: number): Promise<{ candidates: WikidataCandidate[]; rowsRead: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const collected: WikidataCandidate[] = [];
  const seenQids = new Set<string>();
  let pageOffset = 0;
  let pages = 0;
  let rowsRead = 0;

  try {
    const firstPageRows = Math.max(ROWS_PER_BUSINESS, Math.min(PAGE_ROWS, limit * ROWS_PER_BUSINESS));
    while (collected.length < limit && pages < MAX_PAGES) {
      pages += 1;
      const query = buildDiscoveryQuery({
        placeQid: placeQid ?? undefined,
        countryQid: plan.countryQid,
        limit: pages === 1 ? firstPageRows : PAGE_ROWS,
        offset: pages === 1 ? 0 : pageOffset,
        requireContact: plan.requireContact,
      });
      const form = new URLSearchParams({ query, format: 'json' });

      const upstream = await fetch(WIKIDATA_SPARQL, {
        method: 'POST',
        headers: {
          'User-Agent': WIKIDATA_USER_AGENT,
          Accept: 'application/sparql-results+json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
        signal: controller.signal,
      });
      if (!upstream.ok) {
        throw new Error(`Wikidata answered ${upstream.status}${upstream.status === 429 ? ' (rate limited)' : ''}`);
      }
      const text = await upstream.text();
      if (text.length > MAX_BYTES) throw new Error('Wikidata response too large; reduce the campaign limit.');

      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error('Wikidata returned something that is not JSON.');
      }

      const bindings = readSparqlJson(payload);
      rowsRead += bindings.length;
      const folded = foldBindings(bindings);
      if (folded.length === 0) break;
      let added = 0;
      for (const c of folded) {
        if (seenQids.has(c.qid)) continue;
        seenQids.add(c.qid);
        collected.push(c);
        added += 1;
        if (collected.length >= limit) break;
      }
      if (added === 0) break;
      pageOffset += pages === 1 ? firstPageRows : PAGE_ROWS;
    }
  } finally {
    clearTimeout(timer);
  }

  return { candidates: collected, rowsRead };
}

/**
 * Fetch one OpenStreetMap scope and fold it to candidates.
 *
 * The Overpass community expects clients to be small and patient; one query
 * per scope (per matched city, or the country bbox when none matched) with the
 * same 100s ceiling as Wikidata is that. The browser adapter's geography rule
 * is mirrored: a city name with a known bbox wins, then the country, then the
 * Nigeria default — never "everything everywhere".
 */
async function fetchOsmScope(scope: Scope, limit: number): Promise<{ candidates: OsmCandidate[]; rowsRead: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const bboxKey = scope.placeName && AFRICA_BBOX[scope.placeName]
      ? scope.placeName
      : scope.countryName && AFRICA_BBOX[scope.countryName]
        ? scope.countryName
        : 'Nigeria';
    const query = buildOverpassQuery({
      bbox: AFRICA_BBOX[bboxKey],
      // Ask for more raw elements than the campaign wants: the fold keeps only
      // node/way elements that carry a name, so the count before folding is
      // the ceiling, exactly like the SPARQL ROWS_PER_BUSINESS multiplier.
      limit: limit * ROWS_PER_BUSINESS,
    });

    const body = new URLSearchParams({ data: query });
    const upstream = await fetch(OVERPASS_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      signal: controller.signal,
    });
    if (!upstream.ok) {
      throw new Error(`Overpass answered ${upstream.status}${upstream.status === 429 ? ' (rate limited)' : ''}`);
    }
    const text = await upstream.text();
    if (text.length > MAX_BYTES) throw new Error('Overpass response too large; reduce the campaign limit.');

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error('Overpass returned something that is not JSON.');
    }

    const elements = (payload as { elements?: OsmElement[] })?.elements ?? [];
    return { candidates: foldOsmElements(elements, limit), rowsRead: elements.length };
  } finally {
    clearTimeout(timer);
  }
}

/** Ask whichever source a share named, in the worker's own vocabulary. */
async function fetchSourceScope(plan: CampaignPlan, sourceKey: string, scope: Scope, limit: number): Promise<{ candidates: DiscoveryCandidate[]; rowsRead: number }> {
  switch (sourceKey) {
    case 'wikidata':
      return fetchWikidataScope(plan, scope.placeQid, limit);
    case 'openstreetmap':
      return fetchOsmScope(scope, limit);
    default:
      throw new Error(`unknown source ${sourceKey}`);
  }
}

interface CampaignRow {
  id: string;
  name: string;
  source_keys: string[] | null;
  cities: string[] | null;
  countries: string[] | null;
  regions: string[] | null;
  filters: Record<string, unknown> | null;
  max_records: number | null;
  daily_limit: number | null;
  records_discovered: number;
}

interface RunRow {
  id: string;
  campaign_id: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  if (!AUTOMATION_SECRET) return json({ ok: false, message: "AUTOMATION_SECRET is not set — refusing to run unauthenticated." }, 500);
  if (req.headers.get("x-automation-key") !== AUTOMATION_SECRET) return json({ ok: false, message: "Unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, message: "Server not configured" }, 500);
  const db = createClient(url, key, { auth: { persistSession: false } });

  const params = new URL(req.url).searchParams;
  const dryRun = params.get("dry") === "1";
  const limit = Math.min(Number(params.get("limit") ?? 1), 5);

  // Belt and braces on the claim function's own gate: a misconfigured
  // deployment must not keep staging records with the engine switched off.
  const { data: flag } = await db
    .from("feature_flags")
    .select("enabled")
    .eq("key", "business_discovery_engine")
    .maybeSingle();
  if (!flag || flag.enabled !== true) {
    return json({ ok: true, message: "business_discovery_engine is off — nothing claimed.", drainage: "flag_off" });
  }

  const outcomes: Array<Record<string, unknown>> = [];
  const errors: string[] = [];

  for (let i = 0; i < limit; i++) {
    let run: RunRow | null = null;
    try {
      const { data: runId } = await db.rpc("claim_due_discovery_campaign");
      if (typeof runId !== "string") break; // nothing due

      const { data: runRow, error: runErr } = await db
        .from("business_discovery_runs")
        .select("id, campaign_id")
        .eq("id", runId)
        .maybeSingle();
      if (runErr) throw new Error(runErr.message);
      // claimed but gone — a manual cancel rounds this up.
      if (!runRow) continue;
      run = runRow as RunRow;

      const { data: campaign, error: campErr } = await db
        .from("business_discovery_campaigns")
        .select("id, name, source_keys, cities, countries, regions, filters, max_records, daily_limit, records_discovered")
        .eq("id", run.campaign_id)
        .maybeSingle();
      if (campErr) throw new Error(campErr.message);
      if (!campaign) {
        await db.rpc("finish_discovery_run", { p_run: run.id, p_status: "cancelled", p_records_discovered: 0, p_records_published: 0, p_error: "Campaign row missing." });
        continue;
      }
      const c = campaign as CampaignRow;

      // Only sources the registry says are ACTIVE may be asked. The schema
      // CHECK guarantees active ⇒ every right is recorded — no re-derivation.
      const requested = (c.source_keys ?? []).filter((k) => SUPPORTED_SOURCES.has(k));
      const { data: activeSources } = await db
        .from("radar_sources")
        .select("key, name")
        .in("key", requested.length ? requested : ['__none__'])
        .eq("active", true);
      const activeKeys = (activeSources ?? []).map((s: { key: string }) => s.key);
      const unsupported = (c.source_keys ?? []).filter((k) => !SUPPORTED_SOURCES.has(k));
      const inactive = (c.source_keys ?? []).filter((k) => SUPPORTED_SOURCES.has(k) && !activeKeys.includes(k));

      if (activeKeys.length === 0) {
        const why = [];
        if (unsupported.length) why.push(`unsupported sources: ${unsupported.join(', ')}`);
        if (inactive.length) why.push(`sources not active in the registry: ${inactive.join(', ')}`);
        await db.rpc("finish_discovery_run", {
          p_run: run.id, p_status: "blocked", p_records_discovered: 0, p_records_published: 0,
          p_error: `Campaign "${c.name}" has no runnable sources (${why.join('; ')}).`,
        });
        outcomes.push({ run: run.id, campaign: c.name, status: "blocked", reason: why.join('; ') });
        continue;
      }

      const plan = buildPlan({
        sourceKeys: activeKeys,
        cities: c.cities ?? [],
        regions: c.regions ?? [],
        countries: c.countries ?? [],
        categories: [],
        filters: c.filters ?? {},
        // Only the REMAINING budget is offered to this run, so a campaign never
        // overshoots max_records by more than one staged batch. max_records
        // null falls back to daily_limit, then to DEFAULT_RUN_BUDGET.
        maxRecords: c.max_records != null
          ? Math.max(0, c.max_records - (c.records_discovered ?? 0))
          : null,
        dailyLimit: c.daily_limit,
      });

      let staged = 0;
      let rowsRead = 0;
      const sourceErrors: string[] = [];
      const perSource: Record<string, { staged: number; error: string | null }> = {};

      // One fetch per matched place; the country scope when none matched.
      const scopes: Scope[] = plan.placeQids.length
        ? plan.placeQids.map((placeQid, idx) => ({
            placeQid,
            placeName: plan.placeNames[idx] ?? null,
            countryQid: plan.countryQid,
            countryName: plan.countryName,
          }))
        : [{ placeQid: null, placeName: null, countryQid: plan.countryQid, countryName: plan.countryName }];

      for (const share of plan.sourceShares) {
        const tracker = { staged: 0, error: null as string | null };
        perSource[share.sourceKey] = tracker;
        try {
          for (const scope of scopes) {
            const { candidates, rowsRead: rr } = await fetchSourceScope(plan, share.sourceKey, scope, share.limit);
            rowsRead += rr;
            for (const candidate of candidates) {
              if (!recordMatchesFilters(candidate, c.filters ?? {}).keep) continue;

              const keys = candidateKeys(candidate);
              const score = scoreCandidate({ candidate, sourceAccuracy: 0.8 });
              const profile = { ...candidate.profile };

              if (dryRun) {
                tracker.staged += 1;
                staged += 1;
                continue;
              }

              const { error: stageErr } = await db.rpc("stage_discovery_candidate", {
                p_c: {
                  source_key: share.sourceKey,
                  source_record_id: candidate.qid || candidate.sourceRecordId,
                  source_url: candidate.sourceUrl,
                  name: candidate.name,
                  category: candidate.category,
                  city: candidate.city,
                  address: candidate.address,
                  phone: candidate.phone,
                  whatsapp: null,
                  email: candidate.email,
                  website: candidate.website,
                  description: candidate.description,
                  latitude: candidate.latitude,
                  longitude: candidate.longitude,
                  name_key: keys.name_key,
                  city_key: keys.city_key,
                  phone_e164: keys.phone_e164,
                  domain: keys.domain,
                  confidence: score.score,
                  profile,
                  campaign_id: run.campaign_id,
                },
                p_evidence: evidenceFor(candidate as typeof candidate & Record<string, unknown>, share.sourceKey),
              });
              if (stageErr) throw new Error(`candidate stage failed: ${stageErr.message}`);
              tracker.staged += 1;
              staged += 1;
            }
          }
        } catch (e) {
          tracker.error = (e as Error)?.message ?? 'fetch failed';
          sourceErrors.push(`${share.sourceKey}: ${tracker.error}`);
        }
      }

      const ranSources = plan.sourceShares.map((s) => s.sourceKey);
      let status: string;
      if (staged > 0 && sourceErrors.length === 0) status = "succeeded";
      else if (staged > 0) status = "partially_succeeded";
      else if (unsupported.length || inactive.length) status = "blocked";
      else status = "failed";

      const errorText = staged === 0 && (unsupported.length || inactive.length)
        ? `No runnable sources (${[...unsupported, ...inactive].join(', ')}).`
        : sourceErrors.length
          ? `Partial source failures: ${sourceErrors.join('; ')}`
          : null;

      // What this run learned about each source it actually asked: a source
      // that errored is unhealthy (or degraded if some of its candidates
      // still got staged); a source that answered is healthy, even at zero
      // matches after filters. finish_discovery_run writes only these.
      const sourceHealth: SourceHealth[] = plan.sourceShares
        .map((s) => {
          const t = perSource[s.sourceKey];
          if (!t) return null;
          if (t.error && t.staged > 0) return { key: s.sourceKey, status: 'degraded', error: t.error };
          if (t.error) return { key: s.sourceKey, status: 'unhealthy', error: t.error };
          return { key: s.sourceKey, status: 'healthy', error: null };
        })
        .filter((h): h is SourceHealth => h !== null);

      await db.rpc("finish_discovery_run", {
        p_run: run.id,
        p_status: status,
        p_records_discovered: staged,
        p_records_published: 0,
        p_error: errorText,
        p_source_health: sourceHealth,
      });

      outcomes.push({
        run: run.id,
        campaign: c.name,
        status,
        staged,
        rowsRead,
        sources: ranSources,
        unused_sources: [...unsupported, ...inactive],
        applied_filters: plan.filtersApplied,
        deferred_filters: plan.filtersDeferred.map((d) => d.filter),
        source_health: sourceHealth,
        dry_run: dryRun,
      });
    } catch (e) {
      const reason = (e as Error)?.message ?? "unknown error";
      if (run) {
        await db.rpc("finish_discovery_run", { p_run: run.id, p_status: "failed", p_records_discovered: 0, p_records_published: 0, p_error: reason });
      }
      errors.push(`${run?.id ?? "?"}: ${reason}`);
    }
  }

  return json({ ok: errors.length === 0, ran: outcomes.length, outcomes, errors });
});