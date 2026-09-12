// GET /api/acquire/openstreetmap — ask the Overpass API what OpenStreetMap has.
//
// WHY THIS IS A SERVER FUNCTION
//
// The Overpass API rate-limits by IP. A server function keeps the request
// under NowOpen's own IP, and the response is processed server-side before
// reaching the admin console — so nothing unvalidated from OSM's JSON ends
// up on the page.
//
// LICENCE
//
// OpenStreetMap data is licensed under the Open Database Licence (ODbL).
// Automated access, bulk extraction and redistribution are permitted under
// the ODbL as long as attribution is maintained. The attribution string is
// returned with the response and must travel with any published candidate.
//
// NOTHING HERE PUBLISHES. Candidates are proposals staged by the admin
// console's own session. `radar_publish_candidate` re-checks rights.

import {
  buildOverpassQuery,
  foldOsmElements,
  OVERPASS_ENDPOINT,
  OSM_ATTRIBUTION,
  AFRICA_BBOX,
} from '../../src/lib/acquire/openstreetmap.js';

interface VercelRequest {
  method?: string;
  query: Record<string, string | string[] | undefined>;
}
interface VercelResponse {
  status: (code: number) => VercelResponse;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
}

const MAX_LIMIT = 500;
const TIMEOUT_MS = 95_000;
const MAX_BYTES = 16 * 1024 * 1024;

const one = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v) ?? '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'GET only' });
    return;
  }

  const place = one(req.query.place);
  const country = one(req.query.country);
  const category = one(req.query.category) || undefined;
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(one(req.query.limit)) || 50));
  const requireContact = one(req.query.contact) === '1';
  const exclude = one(req.query.exclude)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^N\d+$/.test(s));

  // Resolve the bounding box. City names need a specific bbox; countries use
  // the stored lookup. A bare bbox string is passed through.
  let bbox = '';
  if (place && AFRICA_BBOX[place]) {
    bbox = AFRICA_BBOX[place];
  } else if (country && AFRICA_BBOX[country]) {
    bbox = AFRICA_BBOX[country];
  } else if (place && /^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*\s*,\s*-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/.test(place)) {
    bbox = place;
  } else {
    // Default: Nigeria.
    bbox = AFRICA_BBOX['Nigeria'];
  }

  if (!bbox) {
    res.status(400).json({
      error: 'Could not resolve a bounding box. Specify a country or city name from the supported list, or a comma-separated bbox (south,west,north,east).',
    });
    return;
  }

  const query = buildOverpassQuery({
    bbox,
    category,
    limit,
    excludeIds: exclude.length ? exclude : undefined,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const form = new URLSearchParams({ data: query, out: 'json' });
    const upstream = await fetch(OVERPASS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      res.status(502).json({
        error: `OpenStreetMap Overpass answered ${upstream.status}`,
        hint: upstream.status === 429
          ? 'Rate limited by the Overpass API. Wait a minute and try a smaller limit.'
          : 'The Overpass API may be busy. A smaller limit or different area usually succeeds.',
      });
      return;
    }

    const text = await upstream.text();
    if (text.length > MAX_BYTES) {
      res.status(502).json({ error: 'Response too large; ask for fewer results.' });
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      res.status(502).json({ error: 'OpenStreetMap returned something that is not JSON.' });
      return;
    }

    const elements = Array.isArray((payload as { elements?: unknown[] })?.elements)
      ? ((payload as { elements: OsmElement[] }).elements)
      : [];

    const collected = foldOsmElements(elements, limit);

    // Filter to contacts only if requested.
    const results = requireContact
      ? collected.filter((c) => c.phone)
      : collected;

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json({
      source: 'openstreetmap',
      licence: 'ODbL 1.0 (OpenStreetMap)',
      attribution: OSM_ATTRIBUTION,
      query: { place: place || null, country: country || null, category: category || null, bbox, limit },
      count: results.length,
      candidates: results,
    });
  } catch (err) {
    const aborted = (err as { name?: string })?.name === 'AbortError';
    res.status(aborted ? 504 : 502).json({
      error: aborted ? 'OpenStreetMap Overpass took too long to answer.' : 'Could not reach the OpenStreetMap Overpass API.',
    });
  } finally {
    clearTimeout(timer);
  }
}

/** A narrowed element shape for type safety within this handler. */
interface OsmElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
}
