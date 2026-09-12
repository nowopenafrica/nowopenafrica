// GET /api/acquire/businesslist — scrape BusinessList.com.ng for businesses.
//
// RIGHTS WARNING
//
// BusinessList.com.ng's terms of service explicitly prohibit automated access,
// crawling, scraping and bulk extraction. This endpoint is built because the
// data is valuable, but the `businesslist_ng` source in `radar_sources` is
// `active: false` with all rights set to `prohibited`. The source gate in
// adapter.ts will refuse any operation — including this endpoint — until a
// signed agreement with BusinessList changes that record.
//
// robots.txt permitting crawling is a bot-traffic rule, not a content licence.
//
// WHAT IT DOES
//
// Fetches a search or category page from BusinessList.com.ng, parses the HTML
// to extract business listings, and returns candidates for the admin review
// queue. Each candidate carries a sourceUrl pointing at the original
// BusinessList page so a reviewer can verify the data.
//
// NOTHING HERE PUBLISHES. Candidates are proposals staged by the admin
// console's own session.

import {
  buildBusinessListUrl,
  parseBusinessListHtml,
  BUSINESSLIST_SOURCE_KEY,
  BUSINESSLIST_CATEGORIES,
} from '../../src/lib/acquire/businesslist.js';
import { sourcePermits } from '../../src/lib/acquire/adapter.js';

interface VercelRequest {
  method?: string;
  query: Record<string, string | string[] | undefined>;
}
interface VercelResponse {
  status: (code: number) => VercelResponse;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
}

const MAX_LIMIT = 200;
const TIMEOUT_MS = 30_000;
const MAX_BYTES = 4 * 1024 * 1024;
const USER_AGENT =
  'NowOpenAfrica/1.0 (https://nowopenafrica.com; tech@nowopenafrica.com) AutoAcquire/BusinessList';

const one = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v) ?? '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'GET only' });
    return;
  }

  /*
   * HARD GATE — the rights check.
   *
   * `radar_sources` has `businesslist_ng` as `active: false` with all rights
   * `prohibited`. `sourcePermits` will refuse because the source is not
   * active, and because automated_access is prohibited. This check is
   * deliberately placed BEFORE any network call: there is no reason to fetch
   * a page from a source we have not been authorised to use.
   *
   * To enable this source: update `radar_sources` with a signed agreement,
   * set `active: true` and all four rights to `permitted`, and set
   * `authorised_by` and `licence`.
   */
  const policy = {
    key: BUSINESSLIST_SOURCE_KEY,
    name: 'BusinessList.com.ng',
    active: false,
    automatedAccess: 'prohibited',
    bulkExtraction: 'prohibited',
    redistribution: 'prohibited',
    competingDataset: 'prohibited',
    licence: null as string | null,
    authorisedBy: null as string | null,
  };

  const verdict = sourcePermits(policy, 'discover');
  if (!verdict.permitted) {
    res.status(403).json({
      error: verdict.reason,
      hint: 'BusinessList.com.ng\'s terms prohibit automated access. To enable this source, update radar_sources with a signed agreement.',
    });
    return;
  }

  const query = one(req.query.q);
  const category = one(req.query.category) || undefined;
  const location = one(req.query.location) || undefined;
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(one(req.query.limit)) || 50));

  const url = buildBusinessListUrl({ query, category, location });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-NG,en;q=0.9',
      },
      signal: controller.signal,
    });

    if (!upstream.ok) {
      res.status(502).json({
        error: `BusinessList answered ${upstream.status}`,
        hint: 'The site may be blocking automated requests.',
      });
      return;
    }

    const text = await upstream.text();
    if (text.length > MAX_BYTES) {
      res.status(502).json({ error: 'Response too large.' });
      return;
    }

    const categoryHint = category
      ? BUSINESSLIST_CATEGORIES[category.toLowerCase().replace(/\s+/g, '_')] ?? 'Other'
      : 'Other';

    const collected = parseBusinessListHtml(text, categoryHint);

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      source: 'businesslist_ng',
      licence: 'BusinessList.com.ng — terms prohibit automated access',
      query: { q: query || null, category: category || null, location: location || null, limit },
      count: collected.length,
      candidates: collected.slice(0, limit),
    });
  } catch (err) {
    const aborted = (err as { name?: string })?.name === 'AbortError';
    res.status(aborted ? 504 : 502).json({
      error: aborted ? 'BusinessList took too long to answer.' : 'Could not reach BusinessList.com.ng.',
    });
  } finally {
    clearTimeout(timer);
  }
}
