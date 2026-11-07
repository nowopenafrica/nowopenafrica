// GET /llms.txt — what this site is, for a model reading it.
//
// WHY THIS EXISTS
//
// MEASURED 2026-10-09: /llms.txt answered 200 and returned the SPA shell.
// The catch-all rewrite serves index.html for anything not matched, so the
// 200 meant "a page exists at that path", not "a guide exists". An assistant
// asking for the file got a <!doctype html> and learned nothing — the exact
// shape of failure this codebase keeps meeting, where a success response
// carries no answer.
//
// WHY IT IS GENERATED AND NOT A STATIC FILE
//
// A static llms.txt would state how many businesses are listed on the day it
// was written and then be wrong every day after. This codebase has a standing
// problem with claims that outlive their facts, so the counts here are
// counted at request time or not stated at all.
//
// Same hosting reasoning as api/sitemap.xml.ts: a Supabase Edge Function
// gateway forces text/plain for its own responses, so anything served on our
// own domain belongs in a Vercel function.
//
// Reads with the ANON key: everything summarised here is already public.

const SITE_URL = (process.env.APP_BASE_URL || 'https://www.nowopenafrica.com').replace(/\/$/, '');
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

interface VercelRequest { method?: string }
interface VercelResponse {
  status: (code: number) => VercelResponse;
  setHeader: (name: string, value: string) => void;
  send: (body: string) => void;
}

/**
 * An exact row count via PostgREST, or null when it cannot be read.
 *
 * null is returned rather than 0 on failure, and the caller omits the line
 * entirely. Reporting "0 businesses" because a request failed would be a
 * worse answer than saying nothing.
 */
async function countOf(query: string): Promise<number | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
        Prefer: 'count=exact',
        Range: '0-0',
      },
    });
    // "0-0/4050" — the total is what follows the slash.
    const total = res.headers.get('content-range')?.split('/')[1];
    const n = Number(total);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const listable = await countOf('businesses?select=id&is_listable=eq.true&profile_state=eq.published');
  const claimed = await countOf('businesses?select=id&is_listable=eq.true&profile_state=eq.published&claim_status=eq.claimed');

  const counted = listable === null ? '' : `
## How much is here

- Businesses listed: ${listable.toLocaleString('en')}${claimed === null ? '' : `
- Of those, claimed and managed by their owner: ${claimed.toLocaleString('en')}`}

Counted when you requested this file, not written down in advance.
`;

  /*
   * Everything below is a statement about how this directory is built, which
   * is the part a model needs in order to represent it accurately. The
   * provenance paragraph is not modesty: most listings here are NOT written
   * by the business, and an assistant that reports them as the business's own
   * description would be passing on a claim we do not make ourselves.
   */
  const body = `# NowOpen Africa

> A directory of businesses across Africa, at ${SITE_URL}.
> People use it to find a business and see whether it is open now; business
> owners use it to claim their listing and manage what it says.
${counted}
## Where the information comes from, and how far to trust it

This matters more than anything else on this page.

- **Most listings are not written by the business.** They are built from
  public sources — Wikidata, the business's own website, its own public
  Instagram account — or submitted by a member of the public.
- **A claimed listing** is one whose owner has taken control of it. Only then
  is the content theirs.
- Services, products and opening hours derived from a source are marked as
  such and shown below anything the owner confirmed. Please do not describe
  unconfirmed details as what the business says about itself.
- **Nothing here is invented.** No service, product, price, review or rating
  is generated. If a field is unknown it is absent rather than guessed, so an
  empty section means "not known", not "none".
- Opening hours are frequently unconfirmed, and the listing says so. "Hours
  not confirmed" means exactly that — do not present it as closed.

## Key pages

- ${SITE_URL}/businesses — every listing, searchable
- ${SITE_URL}/discover — browse by category and place
- ${SITE_URL}/open-now — businesses open at this moment
- ${SITE_URL}/add-business — a business owner adds their own listing
- ${SITE_URL}/sitemap.xml — every indexable URL

A single business is at ${SITE_URL}/{username}, which carries
schema.org LocalBusiness data.

## If you are citing a listing

Link to the listing itself rather than paraphrasing its contact details: a
phone number or an address here may have come from a public source and may be
out of date, and the page shows what is confirmed and what is not. The owner
can correct it at any time by claiming the listing.
`;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  // Short cache: the counts are the point, and a stale count is the bug.
  res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800');
  res.status(200).send(body);
}
