// GET /api/acquire/google — ask Google Places (New) what it knows.
//
// WHY THIS IS A SERVER FUNCTION, LIKE /api/acquire/wikidata
//
// The API key lives server-side and is never compiled into the browser bundle.
// Until GOOGLE_PLACES_API_KEY is set the endpoint says so plainly (503) and
// the console keeps saying the same thing: Discovery will not pretend an
// unconfigured source works. The moment the secret exists, this endpoint
// becomes live with no code change — the key is the switch.
//
// GOOGLE'S OWN RULES, HONOURED:
//   • The request goes through the official Places API with the key in the
//     X-Goog-Api-Key header, never scraped from maps.google.com.
//   • The X-Goog-FieldMask whitelists exactly the fields we store, which is
//     also the cheaper (per-field) billing.
//   • Attribution is carried with every candidate: googleMapsUri is kept as
//     the candidate's sourceUrl and shown to the reviewer, and the radar
//     registry row records that redistribution needs attribution.
//
// WHAT IT DOES NOT DO
//
// It does not write (the console stages under its own session and RLS, like
// the Wikidata endpoint), and it cannot store more than Google's caching
// rules permit: candidates are proposals, not copies of Google.

import {
  GOOGLE_TEXT_SEARCH,
  placeToCandidate,
  type GoogleCandidate,
} from '../../src/lib/acquire/google.js';

interface VercelRequest {
  method?: string;
  query: Record<string, string | string[] | undefined>;
}
interface VercelResponse {
  status: (code: number) => VercelResponse;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
}

const MAX_LIMIT = 100;
const PAGE_SIZE = 20;
/** Text Search (New) caps a page at 20 places; we take at most MAX_LIMIT. */
const MAX_PAGES = Math.ceil(MAX_LIMIT / PAGE_SIZE);

/** Per-page budget. Places is fast; a hung page is not worth waiting on. */
const PAGE_TIMEOUT_MS = 20_000;

const one = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v) ?? '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'GET only' });
    return;
  }

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    res.status(503).json({
      error: 'Google Places API key is not configured.',
      hint: 'Set GOOGLE_PLACES_API_KEY as a server-side secret (Vercel env for this function, and .env for local dev). Discovery enables this source automatically once the key is present.',
    });
    return;
  }

  // A `place` is the region label from the console's Where control ("Lagos",
  // "Ghana", …). The "All of …" wrapper options send just the country name.
  const place = one(req.query.place).replace(/^All of\s+/i, '').trim() || 'Nigeria';
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(one(req.query.limit)) || 20));
  const requireContact = one(req.query.contact) === '1';

  const fieldMask = [
    'places.displayName.text',
    'places.formattedAddress',
    'places.addressComponents',
    'places.nationalPhoneNumber',
    'places.websiteUri',
    'places.types',
    'places.location.latitude',
    'places.location.longitude',
    'places.plusPlaceId',
    'places.googleMapsUri',
    'nextPageToken',
  ].join(',');

  const collected: GoogleCandidate[] = [];
  const seenIds = new Set<string>();
  let pageToken: string | undefined;
  let pages = 0;
  let rowsRead = 0;

  try {
    while (collected.length < limit && pages < MAX_PAGES) {
      pages += 1;
      const body: Record<string, unknown> = { textQuery: place, pageSize: PAGE_SIZE };
      if (pageToken) body.pageToken = pageToken;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
      let upstream: Response;
      try {
        upstream = await fetch(GOOGLE_TEXT_SEARCH, {
          method: 'POST',
          headers: {
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask': fieldMask,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!upstream.ok) {
        res.status(502).json({
          error: `Google Places answered ${upstream.status}`,
          hint: 'The Places API may be rate-limited or the query may be expensive. A smaller limit usually succeeds.',
        });
        return;
      }

      let payload: {
        places?: unknown;
        nextPageToken?: string;
      };
      try {
        payload = await upstream.json() as { places?: unknown; nextPageToken?: string };
      } catch {
        res.status(502).json({ error: 'Google Places returned something that is not JSON.' });
        return;
      }

      const rawPlaces = Array.isArray(payload.places) ? payload.places as Parameters<typeof placeToCandidate>[0][] : [];
      rowsRead += rawPlaces.length;
      for (const raw of rawPlaces) {
        const candidate = placeToCandidate(raw);
        if (!candidate) continue;
        if (requireContact && !candidate.phone) continue;
        if (seenIds.has(candidate.sourceRecordId)) continue;
        seenIds.add(candidate.sourceRecordId);
        collected.push(candidate);
      }

      pageToken = payload.nextPageToken;
      if (!pageToken) break;
    }
  } catch (err) {
    const aborted = (err as { name?: string })?.name === 'AbortError';
    res.status(aborted ? 504 : 502).json({
      error: aborted ? 'Google Places took too long to answer.' : 'Could not reach Google Places.',
    });
    return;
  }

  // Discovery results are not private, but they are also not the point of a
  // cache — an operator running a second search wants the current answer.
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    source: 'google',
    licence: 'Google Maps content — attribution required; see the radar_sources row for the record',
    query: { place, limit, requireContact },
    rowsRead,
    count: collected.length,
    candidates: collected.slice(0, limit),
  });
}