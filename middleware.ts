// Serve crawlers the rendered business profile, and people the app.
//
// WHY THIS EXISTS
//
// nowopenafrica.com is a client-rendered SPA. Every business profile returned
// one sentence to anything that does not execute JavaScript:
//
//   "NowOpen Africa needs JavaScript enabled to run."
//
// while the sitemap listed all of those URLs. For a directory that is fatal —
// discovery is the product.
//
// The profile URL people share is /:username, so that is the URL that has to
// work. This rewrites a crawler's request for it to api/business/[slug], which
// renders the same profile as real HTML with LocalBusiness structured data.
// Everyone else falls through untouched and gets the app.
//
// IS THIS CLOAKING? No. The content served to a crawler is the same profile a
// person sees — same name, category, hours, products, services, reviews, same
// canonical URL — only rendered ahead of time instead of in the browser. Google
// documents this as dynamic rendering. The rule that matters is that the two
// must not diverge, so if the profile page gains a section, this one should
// gain it too.
//
// The long-term answer is real SSR for the whole app; this is the fix that can
// ship today without rebuilding the render pipeline.

import { next, rewrite } from '@vercel/edge';
import { marketingPageFor } from './src/lib/marketingPageRender.js';

export const config = {
  // Only the bare one-segment paths can be usernames. Everything with a known
  // prefix, a file extension, or more than one segment is skipped, so the
  // middleware does no work on the vast majority of requests.
  matcher: ['/((?!api/|assets/|fonts/|_vercel|.*\\..*).*)'],
};

/**
 * Reserved first segments — app routes that are NOT usernames.
 *
 * A username colliding with one of these would be unreachable anyway, but the
 * list matters here for a different reason: without it, a crawler asking for
 * /businesses would be sent to look up a business called "businesses", get a
 * 404, and the directory's own index page would drop out of the search results.
 */
const RESERVED = new Set([
  '', 'businesses', 'discover', 'platform', 'promote', 'create', 'studio',
  'dashboard', 'admin', 'admin-creator', 'login', 'register', 'profile',
  'security', 'settings', 'about', 'contact', 'pricing', 'plans', 'terms',
  'privacy', 'founder', 'media', 'blog', 'help', 'support', 'search',
  'digital-forms', 'reset-password', 'forgot-password', 'live', 'r', 'sitemap.xml',
  // /install is the page that tells people how to add the app to their home
  // screen. Unreserved, a crawler asking for it is rewritten to the business
  // profile renderer and served a 404 for a business nobody has.
  'install',
  // The NowOpen Credits wallet (signed-in page).
  'wallet',
  // Consumer surfaces. Without these a crawler asking for /keeps is rewritten
  // to the business-profile renderer and served a 404 profile instead of a page.
  'keeps', 'nearby', 'open-now', 'offers', 'waitlist', 'os', 'forms', 'adverts', 'advertise', 'unsubscribe',
  // Campaign surfaces. /join and /founding-1000 are the short URLs meant for
  // posters, QR codes and videos, which makes them exactly the ones that must
  // not be mistaken for a business slug — and a 404 here also kills the
  // WhatsApp link preview, the channel this campaign mostly lives in.
  'campaign', 'founding', 'founding-1000', 'join',
  // NowOpen Your Business. Same reason as the campaign slugs above, and more
  // so: this is the link the whole acquisition push points at, and a 404 here
  // also kills the WhatsApp preview.
  'send-business', 'send-your-business', 'yourbusiness', 'nominate',
  'add-business', 'join',
  // Industry page examples. Reserved so a crawler asking for /example is not
  // handed the business-profile renderer.
  'example',
  // Create order tracking. A reference is a bearer token, so this must never be
  // handed to the profile renderer and must never be indexed.
  'order',
  // NOWOPEN | INSTAGRAM, the handle-entry door. Reserved for the usual reason
  // and one more: a crawler handed this to the profile renderer would be served
  // a 404 for a business called "instagram", losing the page that exists to be
  // found by businesses searching for exactly that word.
  'instagram',
  // Project stories. /work/:slug is a public page with its own shareable URL,
  // so it must be reserved AND rendered, not mistaken for a business profile.
  'work',
]);

/**
 * Search engines and the SEO tools that behave like them.
 *
 * Matched on the user agent, which is spoofable — and that is fine. The worst a
 * spoofer gets is the same public profile in plainer HTML.
 */
const SEARCH_CRAWLER =
  /(googlebot|bingbot|yandex|duckduckbot|baiduspider|applebot|slurp|google-inspectiontool|petalbot|ia_archiver|semrushbot|ahrefsbot|screaming frog|lighthouse|chrome-lighthouse|w3c_validator)/i;

/**
 * The preview crawlers behind every link anyone shares — WhatsApp, Facebook, X,
 * LinkedIn, Telegram, Slack, Discord, iMessage.
 *
 * These matter more here than anywhere else in Africa: WhatsApp is where a
 * business link actually travels, and a shared profile with no preview card
 * looks broken before anybody clicks it.
 */
const PREVIEW_CRAWLER =
  /(facebookexternalhit|facebookcatalog|twitterbot|linkedinbot|whatsapp|telegrambot|slackbot|discordbot|redditbot|pinterest|embedly|quora link preview|skypeuripreview|nuzzel|bitlybot|vkshare|developers\.google\.com\/\+\/web\/snippet)/i;

/**
 * The AI assistants and their retrieval crawlers.
 *
 * MEASURED ON PRODUCTION, 2026-09-14, before this list existed:
 *
 *   Googlebot     → /businesses/in/lagos  38,715 bytes, <h1>Businesses in Lagos</h1>
 *   GPTBot        → the same URL           7,495 bytes, no <h1>, home page title
 *   OAI-SearchBot → the same URL           7,495 bytes, no <h1>, home page title
 *   ClaudeBot     → the same URL           7,495 bytes, no <h1>, home page title
 *   PerplexityBot → the same URL           7,495 bytes, no <h1>, home page title
 *
 * 7,495 bytes is the JavaScript shell. Every one of these crawlers was reaching
 * the site — robots.txt allows them all under `User-agent: *` — reading the
 * sentence "NowOpen Africa needs JavaScript enabled to run", and leaving. The
 * pipeline that renders profiles and city pages had simply never been pointed
 * at them.
 *
 * WHAT THIS DOES AND DOES NOT BUY
 *
 * It makes the content readable. That is a precondition for an assistant being
 * able to describe a business accurately, and nothing more than a precondition:
 * no entry on this list causes NowOpen to be cited, recommended or ranked by
 * anyone, and no claim of the sort should be made anywhere in the product.
 * What can honestly be said is the narrow thing — before, these crawlers could
 * not read the directory at all; now they can.
 *
 * Kept as its own constant rather than folded into the search list because the
 * two are governed differently. If NowOpen ever chooses to restrict AI training
 * use, that is a decision about THIS list, and it should be one edit in one
 * place rather than a hunt through a sixty-term regex.
 */
const AI_CRAWLER =
  /(gptbot|oai-searchbot|chatgpt-user|claudebot|claude-web|claude-searchbot|claude-user|anthropic-ai|perplexitybot|perplexity-user|ccbot|amazonbot|bytespider|meta-externalagent|meta-externalfetcher|cohere-ai|cohere-training-data-crawler|youbot|duckassistbot|mistralai-user|google-cloudvertexbot|timpibot|diffbot|omgili|webzio-extended)/i;

export const isSearchCrawler = (userAgent: string | null): boolean =>
  !!userAgent && SEARCH_CRAWLER.test(userAgent);

export const isAiCrawler = (userAgent: string | null): boolean =>
  !!userAgent && AI_CRAWLER.test(userAgent);

/**
 * Does this request come from something that will not run JavaScript?
 *
 * All three families get identical HTML. Serving an AI crawler something a
 * person cannot see would be cloaking, and it would also be the fastest way to
 * put a wrong fact about a real business into an assistant's answer.
 */
export const isCrawler = (userAgent: string | null): boolean =>
  isSearchCrawler(userAgent) || isAiCrawler(userAgent)
  || (!!userAgent && PREVIEW_CRAWLER.test(userAgent));

/** The first path segment, or '' for the root. */
export function firstSegment(pathname: string): string {
  return pathname.replace(/^\/+/, '').split('/')[0] || '';
}

/**
 * Should this request be answered with the rendered profile?
 *
 * Exported so the decision is unit-testable — middleware itself is awkward to
 * exercise, and this is the part with the edge cases.
 */
export function shouldRenderProfile(pathname: string, userAgent: string | null): string | null {
  if (!isCrawler(userAgent)) return null;

  const segments = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);

  /*
   * The two-segment profile URLs.
   *
   * `/businesses/<uuid>` is the id-addressed form. `/business/<slug>` is the
   * legacy alias App.tsx still routes for backwards compatibility — and it was
   * the single worst SEO hole on the site, for two reasons at once:
   *
   *   1. All 45 curated demo profiles live at /business/<slug>. BusinessDetail
   *      sets robots: 'noindex, nofollow' for them, but that runs CLIENT-side,
   *      so a crawler never saw it. Measured on production: every demo profile
   *      returned `index, follow`. Forty-five fabricated businesses were
   *      indexable for a directory with two real ones.
   *   2. For a REAL business the same path served the home page's title and a
   *      canonical pointing at `/` — a duplicate-content signal against the
   *      profile it was aliasing.
   *
   * Sending it through the renderer fixes both: an unknown slug 404s with
   * `noindex` (so the demos leave the index rather than merely stopping being
   * crawled), and a real one renders properly with its canonical pointing at
   * the bare `/<username>` form.
   */
  if (segments.length === 2 && (segments[0] === 'businesses' || segments[0] === 'business')) {
    return segments[1];
  }

  // A bare /:username.
  if (segments.length !== 1) return null;
  const slug = segments[0];
  if (RESERVED.has(slug.toLowerCase())) return null;
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(slug)) return null;
  return slug;
}

/**
 * Should this request be answered with a rendered project story?
 *
 * `/work/:slug` is a public page whose whole point is to be shared and found.
 * Left to the SPA, a WhatsApp preview gets the generic home card and a search
 * engine gets the JavaScript shell — on the URL a business sends to a client.
 *
 * Exported for the same reason the other decisions are: this is the part with
 * the edge cases, and middleware itself is awkward to exercise.
 */
export function shouldRenderProject(pathname: string, userAgent: string | null): string | null {
  if (!isCrawler(userAgent)) return null;
  const segments = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  if (segments.length !== 2 || segments[0] !== 'work') return null;
  const slug = segments[1];
  // Long enough for a readable title slug plus the id fragment; short enough
  // that a pathological URL is not worth a database round trip.
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(slug)) return null;
  return slug;
}

/**
 * Should this request be answered with a rendered discovery page?
 *
 * The measured gap: /businesses/in/lagos and /businesses/restaurant/in/lagos
 * are the pages built to rank for "restaurants in Lagos", and both returned the
 * app shell with the same generic title as the home page — while the sitemap
 * submitted them. That is volunteering near-duplicate URLs on exactly the pages
 * meant to earn organic discovery.
 *
 * Returns the place and category to render, or null. Exported for the same
 * reason shouldRenderProfile is: this is the part with the edge cases.
 */
export function shouldRenderDiscovery(
  pathname: string,
  userAgent: string | null,
): { place: string; category: string } | null {
  if (!isCrawler(userAgent)) return null;

  const segments = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  if (segments[0] !== 'businesses') return null;

  const ok = (s: string) => /^[A-Za-z0-9-]{1,64}$/.test(s);

  // /businesses/in/:place
  if (segments.length === 3 && segments[1] === 'in' && ok(segments[2])) {
    return { place: segments[2], category: '' };
  }
  // /businesses/:category/in/:place
  if (segments.length === 4 && segments[2] === 'in' && ok(segments[1]) && ok(segments[3])) {
    return { place: segments[3], category: segments[1] };
  }
  return null;
}

/**
 * The static marketing pages, for a crawler.
 *
 * Measured on production before this existed: /, /about, /platform, /discover
 * and /waitlist all returned the same 6460-byte JavaScript shell with no <h1>,
 * while /yemzoarts and /businesses/in/lagos rendered properly. The pipeline
 * worked; it had never been pointed at these paths.
 */
export function shouldRenderMarketing(pathname: string, userAgent: string | null): string | null {
  if (!isCrawler(userAgent)) return null;
  const page = marketingPageFor(pathname);
  return page ? page.path : null;
}

export default function middleware(request: Request) {
  const url = new URL(request.url);
  const ua = request.headers.get('user-agent');

  const marketing = shouldRenderMarketing(url.pathname, ua);
  if (marketing) {
    const target = new URL('/api/marketing', request.url);
    target.searchParams.set('path', marketing);
    return rewrite(target);
  }

  const slug = shouldRenderProfile(url.pathname, ua);
  if (slug) return rewrite(new URL(`/api/business/${encodeURIComponent(slug)}`, request.url));

  const project = shouldRenderProject(url.pathname, ua);
  if (project) return rewrite(new URL(`/api/project/${encodeURIComponent(project)}`, request.url));

  const discovery = shouldRenderDiscovery(url.pathname, ua);
  if (discovery) {
    const target = new URL('/api/discovery', request.url);
    target.searchParams.set('place', discovery.place);
    if (discovery.category) target.searchParams.set('category', discovery.category);
    return rewrite(target);
  }

  return next();
}
