// GET /api/marketing?path=/about — crawlable marketing pages.
//
// Reached the way the profile and discovery renderers are: middleware.ts
// rewrites a crawler's request for /, /about, /platform, /discover and
// /waitlist here, so the indexed URL stays the one people actually share.
// Also reachable directly, which is how to test it:
//
//   curl '/api/marketing?path=/about'
//
// Reads nothing. These pages have no database content — they are the same
// words for every visitor — so this is a pure render with no key, no query and
// nothing that can be slow or fail.
//
// Relative imports carry .js because this file is reachable from api/ and Node
// ESM will not resolve them otherwise. scripts/check-api-imports.mjs enforces it.

import { marketingPageFor, renderMarketingPage } from '../src/lib/marketingPageRender.js';

const SITE_URL = process.env.APP_BASE_URL || 'https://nowopenafrica.com';

interface VercelRequest {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  url?: string;
}

interface VercelResponse {
  status(code: number): VercelResponse;
  setHeader(name: string, value: string): void;
  send(body: string): void;
  end(): void;
}

const first = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v) ?? '';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).end();
    return;
  }

  const path = first(req.query?.path) || '/';
  const page = marketingPageFor(path);

  // Not one of ours. 404 rather than guessing — a wrong page served to a
  // crawler under a real URL is worse than no page.
  if (!page) {
    res.status(404).setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send('Not found');
    return;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Cached hard: this output changes only when the code does, and a crawler
  // hitting a cold function is a crawler that waits.
  res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=86400, stale-while-revalidate=604800');
  res.status(200).send(renderMarketingPage(page, SITE_URL));
}
