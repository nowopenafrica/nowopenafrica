// GET /api/acquire/wikidata — ask an authorised source what it has.
//
// WHY THIS IS A SERVER FUNCTION AND NOT A FETCH FROM THE ADMIN CONSOLE
//
// Wikimedia asks every automated client for a User-Agent that says who it is
// and how to reach its operator. A browser will not let a page set one — it
// sends the browser's. Honouring a source's stated conditions is the whole
// basis on which this source is authorised at all, so the request is made
// where the header can be set.
//
// It also keeps the query itself server-side: the endpoint is a constant, the
// query is built by a validated builder, and nothing a caller sends becomes
// SPARQL. A query engine on somebody else's servers is not somewhere to pass
// user input through.
//
// WHAT IT DOES NOT DO
//
// It does not write. Everything it returns is a proposal that the admin
// console stages as a `radar_candidate` with status `review`, under the
// admin's own session and RLS. Nothing here can put a business in the
// directory — `radar_publish_candidate` does that, and it re-checks the
// source's rights at that moment.

import {
  WIKIDATA_SPARQL, WIKIDATA_USER_AGENT,
  buildDiscoveryQuery, readSparqlJson, foldBindings,
  type WikidataCandidate,
} from '../../src/lib/acquire/wikidata.js';

interface VercelRequest {
  method?: string;
  query: Record<string, string | string[] | undefined>;
}
interface VercelResponse {
  status: (code: number) => VercelResponse;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
}

/**
 * Wikidata's query service is a shared public resource. Be a small client,
 * but not a brittle one: these broad queries take 15-20s even for a handful of
 * rows, so a 55s cap killed every serious run. Vercel still bounds the server
 * function with its own timeout, so this only widens the window a slow
 * upstream is allowed before the run is abandoned.
 */
const TIMEOUT_MS = 110_000;
const MAX_BYTES = 8 * 1024 * 1024;
/**
 * The capacity of one run. Discovery feeds a review queue, and the queue
 * decides truth, so a run may ask for a lot; the run's TIMEOUT_MS window is
 * still the real ceiling on what a single request can bring back.
 */
const MAX_LIMIT = 50_000;

const one = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v) ?? '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'GET only' });
    return;
  }

  const place = one(req.query.place);
  const country = one(req.query.country);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(one(req.query.limit)) || 50));
  const offset = Math.max(0, Number(one(req.query.offset)) || 0);
  const requireContact = one(req.query.contact) === '1';
  /*
   * QIDs the caller has already been offered, so the source is asked for
   * something it has not shown them before. Nothing unvalidated survives: each
   * entry has to be a well-formed QID or it is dropped, never interpolated.
   */
  const exclude = one(req.query.exclude).split(',').map((s) => s.trim()).filter((s) => /^Q\d{1,12}$/.test(s));

  /*
   * ASK FOR MORE ROWS THAN BUSINESSES WANTED.
   *
   * SPARQL's LIMIT counts ROWS, and one business arrives as several — one per
   * combination of type, phone and website. Measured against the live
   * endpoint: 40 rows folded down to 7 businesses, and 60 rows to 25. An
   * operator who asks for 40 and is handed 7 concludes the source is empty,
   * when in fact the request was for a fortieth of a page.
   *
   * A large request is fetched in pages: each asks for PAGE_ROWS rows at its
   * own offset, folds them to businesses we have not already collected, and
   * keeps going until `limit` businesses are in hand, a page returns nothing
   * new, or the run's TIMEOUT_MS budget runs out. The first page is sized to
   * the request (as before) so a modest run stays a modest, fast query.
   */
  const ROWS_PER_BUSINESS = 5;
  const PAGE_ROWS = 5000;
  const MAX_PAGES = 50;
  const firstPageRows = Math.max(ROWS_PER_BUSINESS, Math.min(PAGE_ROWS, limit * ROWS_PER_BUSINESS));

  // POST, not GET: the exclusion list (every QID already offered) can grow past
  // Wikidata's URL-length ceiling, and a 414 "URI Too Long" from a source we
  // have asked to trust us is a defeat invented by our own transport. The
  // query goes in the body, where no server has a relevant limit.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const collected: WikidataCandidate[] = [];
  const seenQids = new Set<string>();
  let pageOffset = offset;
  let pages = 0;
  let rowsRead = 0;

  try {
    while (collected.length < limit && pages < MAX_PAGES) {
      pages += 1;
      const pageRows = pages === 1 ? firstPageRows : PAGE_ROWS;
      const query = buildDiscoveryQuery({
        placeQid: place || undefined,
        countryQid: country || undefined,
        exclude: exclude.length ? exclude : undefined,
        limit: pageRows,
        offset: pages === 1 ? 0 : pageOffset,
        requireContact,
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
        /*
         * Reported, not swallowed. A 429 or a 504 from the source is a fact an
         * operator needs — an empty result would read as "there is nothing
         * there", which is the wrong lesson to draw about a source we have just
         * been given permission to use.
         */
        res.status(502).json({
          error: `Wikidata answered ${upstream.status}`,
          hint: upstream.status === 429
            ? 'Rate limited. Wait a minute and ask for fewer rows.'
            : 'The query service may be busy. A smaller limit usually succeeds.',
        });
        return;
      }

      const text = await upstream.text();
      if (text.length > MAX_BYTES) {
        res.status(502).json({ error: 'Response too large; ask for fewer rows.' });
        return;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        res.status(502).json({ error: 'Wikidata returned something that is not JSON.' });
        return;
      }

      const bindings = readSparqlJson(payload);
      rowsRead += bindings.length;
      // Fold a page down to businesses we have not already collected.
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
      pageOffset += pageRows;
    }

    // Discovery results are not private, but they are also not the point of a
    // cache — an operator running a second search wants the current answer.
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      source: 'wikidata',
      licence: 'CC0 1.0 (public domain)',
      query: { place: place || null, country: country || 'Q1033', limit, offset, requireContact },
      // Both numbers, because "40 rows became 7 businesses" is the single most
      // confusing thing about querying this source.
      rowsRead,
      count: collected.length,
      candidates: collected,
    });
  } catch (err) {
    const aborted = (err as { name?: string })?.name === 'AbortError';
    res.status(aborted ? 504 : 502).json({
      error: aborted ? 'Wikidata took too long to answer.' : 'Could not reach Wikidata.',
    });
  } finally {
    clearTimeout(timer);
  }
}
