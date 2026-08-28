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
  // Consumer surfaces. Without these a crawler asking for /keeps is rewritten
  // to the business-profile renderer and served a 404 profile instead of a page.
  'keeps', 'nearby', 'open-now', 'offers', 'waitlist', 'os', 'forms', 'adverts',
]);

/**
 * Does this request come from something that will not run JavaScript?
 *
 * Matched on the user agent, which is spoofable — and that is fine. The worst a
 * spoofer gets is the same public profile in plainer HTML. The list covers the
 * search engines plus the preview crawlers behind every link anyone shares:
 * WhatsApp, Facebook, X, LinkedIn, Telegram, Slack, Discord, iMessage.
 */
const CRAWLER = /(googlebot|bingbot|yandex|duckduckbot|baiduspider|applebot|slurp|facebookexternalhit|facebookcatalog|twitterbot|linkedinbot|whatsapp|telegrambot|slackbot|discordbot|redditbot|pinterest|embedly|quora link preview|skypeuripreview|nuzzel|bitlybot|vkshare|w3c_validator|developers\.google\.com\/\+\/web\/snippet|google-inspectiontool|petalbot|ia_archiver|semrushbot|ahrefsbot|screaming frog|lighthouse|chrome-lighthouse)/i;

export const isCrawler = (userAgent: string | null): boolean =>
  !!userAgent && CRAWLER.test(userAgent);

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

  // /businesses/<uuid> is the other public profile URL.
  if (segments.length === 2 && segments[0] === 'businesses') return segments[1];

  // A bare /:username.
  if (segments.length !== 1) return null;
  const slug = segments[0];
  if (RESERVED.has(slug.toLowerCase())) return null;
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(slug)) return null;
  return slug;
}

export default function middleware(request: Request) {
  const url = new URL(request.url);
  const slug = shouldRenderProfile(url.pathname, request.headers.get('user-agent'));
  if (!slug) return next();
  return rewrite(new URL(`/api/business/${encodeURIComponent(slug)}`, request.url));
}
